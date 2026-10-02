import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { toast } from 'sonner';
import {
  Plus, FolderOpen, Trash2, Undo2, Redo2, History,
  KeyRound, Globe, ArrowLeft, Upload, FolderArchive, Files,
} from 'lucide-react';
import { loadUserKeys, saveUserKey } from '@/lib/userKeys';
import {
  fetchFreeModels, fetchFreeModelsDirect, getSelectedModel, setSelectedModel,
  chatWithFallback, hasDirectFallback,
} from '@/lib/aiModels';
import {
  openRouterChat, OpenRouterError, buildEditMessages, extractHtml,
  buildFileEditMessages,
} from '@/lib/openrouter';
import {
  validateStructure, extractSiteJson, compileSite,
  buildStructureMessages, buildStructureEditMessages,
} from '@/lib/siteBuilder';
import BuilderChat from '@/components/aiBuilder/BuilderChat';
import BuilderPreview from '@/components/aiBuilder/BuilderPreview';
import SectionsPanel from '@/components/aiBuilder/SectionsPanel';
import FileExplorer from '@/components/aiBuilder/FileExplorer';
import FileEditor from '@/components/aiBuilder/FileEditor';
import {
  normalizePath, resolveEntry, buildPreviewDoc,
  applyFileEdits, extractFileEdits, isTextFile,
  MAX_FILES, MAX_FILE_SIZE, MAX_TOTAL_SIZE,
} from '@/lib/projectFiles';

function aiSummary(structure, version) {
  try {
    const secs = structure?.site?.pages?.[0]?.sections || [];
    const types = [...new Set(secs.map((s) => s.type))].slice(0, 5).join(', ');
    return `Готово: v${version} · секций: ${secs.length}${types ? ` (${types})` : ''}. Preview обновлён.`;
  } catch {
    return `Готово: v${version}. Preview обновлён.`;
  }
}

export default function BusinessAI() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [products, setProducts] = useState([]);

  // Проекты и версии
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showVersions, setShowVersions] = useState(false);

  // Чат и генерация
  const [chat, setChat] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [lastError, setLastError] = useState(null);

  // Модели
  const [model, setModel] = useState(() => getSelectedModel());
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [modelsUpdated, setModelsUpdated] = useState(null);
  const [proxyReady, setProxyReady] = useState(false);

  // Файлы проекта (мультифайл-режим)
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState(null);
  const [rightTab, setRightTab] = useState('preview');
  const [previewDoc, setPreviewDoc] = useState('');
  const zipInputRef = useRef(null);
  const multiInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const isMulti = Object.keys(files).length > 0;

  // Preview из файлов (blob-URL, живёт пока открыта страница)
  useEffect(() => {
    if (!isMulti) {
      setPreviewDoc('');
      return;
    }
    const entry = resolveEntry(files);
    if (!entry) {
      setPreviewDoc('');
      return;
    }
    const { doc, revoke } = buildPreviewDoc(files, entry);
    setPreviewDoc(doc);
    return revoke;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Preview
  const [previewMode, setPreviewMode] = useState('desktop');
  const [copied, setCopied] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);

  // Ключ
  const [keyInput, setKeyInput] = useState('');
  const [keySaving, setKeySaving] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const current = versions.find((v) => v.id === currentId) || null;
  // Черновик ручных правок: превью сразу, сохранение в версии — с дебаунсом
  const [draft, setDraft] = useState(null);
  const saveTimer = useRef(null);
  useEffect(() => {
    setDraft(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, [currentId]);
  const shownStructure = draft || (current ? validateStructure(current.structure) : null);
  // Shop-конфиг для корзины: публичный anon-ключ встраивается в HTML сайта
  const shopOpts = (preview) => ({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    preview,
  });
  const shownHtml = draft
    ? compileSite(draft, { ...(selectedBusiness || {}), products }, shopOpts(true))
    : (current?.html || '');
  const currentStructure = shownStructure;
  const currentHtml = shownHtml;
  const sections = shownStructure?.site?.pages?.[0]?.sections || [];

  // ─── загрузка ──────────────────────────────────────────────
  const loadBusinesses = async () => {
    const { data } = await supabase.rpc('get_my_businesses');
    if (data?.length) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
    }
  };

  const loadProjects = async () => {
    const { data } = await supabase
      .from('ai_projects')
      .select('id, name, description, business_id, created_at')
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const loadVersions = async (projectId) => {
    const { data } = await supabase
      .from('ai_project_versions')
      .select('id, version, title, prompt, structure, html, files, is_published, created_at')
      .eq('project_id', projectId)
      .order('version', { ascending: false });
    const list = data || [];
    setVersions(list);
    const first = list[0] || null;
    openVersion(first, projectId);
    setUndoStack([]);
    setRedoStack([]);
    // Чат из истории версий
    const msgs = [];
    [...list].reverse().forEach((v) => {
      if (v.prompt) msgs.push({ role: 'user', text: v.prompt });
      msgs.push({ role: 'assistant', text: aiSummary(validateStructure(v.structure), v.version) });
    });
    setChat(msgs);
  };

  const loadFiles = async (projectId) => {
    const { data } = await supabase
      .from('ai_project_files')
      .select('path, content')
      .eq('project_id', projectId);
    const map = {};
    (data || []).forEach((r) => { map[r.path] = r.content || ''; });
    return map;
  };

  /** Открыть версию: указатель + файлы (снапшот версии, иначе живые файлы проекта). */
  const openVersion = (version, projectId) => {
    const v = version || null;
    setCurrentId(v?.id || null);
    const snap = v?.files && Object.keys(v.files).length ? v.files : null;
    if (snap) {
      setFiles(snap);
      setActiveFile((prev) => (prev && snap[prev] != null ? prev : resolveEntry(snap)));
    } else if (projectId) {
      loadFiles(projectId).then((map) => {
        setFiles(map);
        setActiveFile((prev) => {
          const keys = Object.keys(map);
          if (!keys.length) return null;
          return prev && map[prev] != null ? prev : resolveEntry(map);
        });
      });
    } else {
      setFiles({});
      setActiveFile(null);
    }
  };

  const loadProducts = async (businessId) => {
    if (!businessId) return;
    const { data } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(12);
    if (data) setProducts(data);
  };

  useEffect(() => {
    if (user?.id) {
      loadBusinesses();
      loadProjects();
      loadUserKeys(user.id).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) loadProducts(selectedBusiness.id);
  }, [selectedBusiness?.id]);

  useEffect(() => {
    try {
      folderInputRef.current?.setAttribute('webkitdirectory', '');
    } catch {}
  }, []);

  // ─── файлы проекта: CRUD + persist ─────────────────────────
  const persistFile = async (projectId, path, content) => {
    const { error } = await supabase.from('ai_project_files').upsert(
      { project_id: projectId, path, content, size: content.length },
      { onConflict: 'project_id,path' },
    );
    if (error) throw error;
  };

  const handleCreateFile = async (name) => {
    const path = normalizePath(name);
    if (!path) {
      toast.error('Пустое имя');
      return;
    }
    if (!isTextFile(path)) {
      toast.error('Только текстовые файлы (html, css, js…)');
      return;
    }
    if (files[path] != null) {
      toast.error('Такой файл уже есть');
      setActiveFile(path);
      return;
    }
    if (Object.keys(files).length >= MAX_FILES) {
      toast.error(`Лимит: ${MAX_FILES} файлов`);
      return;
    }
    setFiles((prev) => ({ ...prev, [path]: '' }));
    setActiveFile(path);
    try {
      await persistFile(activeProjectId, path, '');
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить');
    }
  };

  const handleSaveFile = async (path, content) => {
    setFiles((prev) => ({ ...prev, [path]: content }));
    try {
      await persistFile(activeProjectId, path, content);
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить');
    }
  };

  const handleRenameFile = async (from, to) => {
    const target = normalizePath(to);
    if (!target || !isTextFile(target)) {
      toast.error('Некорректное имя');
      return;
    }
    if (target in files) {
      toast.error('Такое имя занято');
      return;
    }
    const next = { ...files };
    next[target] = next[from];
    delete next[from];
    setFiles(next);
    setActiveFile((prev) => (prev === from ? target : prev));
    try {
      await persistFile(activeProjectId, target, next[target]);
      await supabase.from('ai_project_files').delete().eq('project_id', activeProjectId).eq('path', from);
    } catch (e) {
      toast.error(e.message || 'Не удалось переименовать');
    }
  };

  const handleDeleteFile = async (path) => {
    if (!confirm(`Удалить ${path}?`)) return;
    const next = { ...files };
    delete next[path];
    setFiles(next);
    setActiveFile((prev) => {
      if (prev !== path) return prev;
      const keys = Object.keys(next);
      return keys.length ? resolveEntry(next) : null;
    });
    try {
      await supabase.from('ai_project_files').delete().eq('project_id', activeProjectId).eq('path', path);
    } catch (e) {
      toast.error(e.message || 'Не удалось удалить');
    }
  };

  // ─── импорт проекта: ZIP / файлы / папка ───────────────────
  const ingestMulti = async (map, sourceName) => {
    if (!Object.keys(map).length) {
      toast.error('Текстовых файлов не найдено');
      return;
    }
    setBusy(true);
    setStage('Импортирую файлы…');
    try {
      let pid = activeProjectId;
      if (!pid) {
        const { data, error } = await supabase
          .from('ai_projects')
          .insert({
            user_id: user.id,
            business_id: selectedBusiness?.id || null,
            name: sourceName.slice(0, 60) || 'Мой проект',
            description: 'Мультифайл-проект',
          })
          .select()
          .single();
        if (error) throw error;
        setProjects((prev) => [data, ...prev]);
        setActiveProjectId(data.id);
        setVersions([]);
        pid = data.id;
      }
      const merged = { ...files, ...map };
      for (const [p, c] of Object.entries(map)) {
        await persistFile(pid, p, c);
      }
      setFiles(merged);
      setActiveFile(resolveEntry(merged));
      await pushVersion({
        projectId: pid,
        title: `Импорт: ${sourceName}`.slice(0, 80),
        promptText: '',
        structure: importedSkeleton(sourceName),
        filesSnapshot: merged,
        htmlOverride: merged[resolveEntry(merged)] || '',
      });
      setChat((prev) => [...prev, {
        role: 'assistant',
        text: `Загрузил проект «${sourceName}»: файлов ${Object.keys(merged).length}. Правки — через чат («поменяй цвет кнопки в style.css»), файлы — во вкладке ниже.`,
      }]);
      toast.success('Проект импортирован');
    } catch (e) {
      toast.error(e.message || 'Не удалось импортировать');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const stripRoot = (paths) => {
    if (!paths.length) return paths;
    const first = paths.map((p) => p.split('/')[0]);
    if (new Set(first).size === 1 && paths.every((p) => p.includes('/'))) {
      return paths.map((p) => p.slice(p.indexOf('/') + 1)).filter(Boolean);
    }
    return paths;
  };

  const handleZipImport = async (file) => {
    if (!file) return;
    setBusy(true);
    setStage('Распаковываю ZIP…');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const rawNames = Object.keys(zip.files).filter(
        (p) => !zip.files[p].dir && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(p),
      );
      const stripped = stripRoot(rawNames);
      const out = {};
      let total = 0;
      for (let i = 0; i < rawNames.length; i++) {
        const rel = normalizePath(stripped[i]);
        if (!rel || !isTextFile(rel) || rel in out) continue;
        const entry = zip.files[rawNames[i]];
        const approx = entry._data?.uncompressedSize ?? 0;
        if (approx > MAX_FILE_SIZE) continue;
        if (Object.keys(out).length >= MAX_FILES || total > MAX_TOTAL_SIZE) break;
        try {
          const text = await entry.async('string');
          out[rel] = text.slice(0, MAX_FILE_SIZE);
          total += approx;
        } catch {
          // пропускаем нечитаемое
        }
      }
      await ingestMulti(out, file.name.replace(/\.zip$/i, ''));
    } catch (e) {
      toast.error(e.message || 'Не удалось распаковать ZIP');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const handleFilesInput = async (fileList) => {
    if (!fileList?.length) return;
    setBusy(true);
    setStage('Читаю файлы…');
    try {
      const { collectProjectFiles } = await import('@/lib/projectFiles');
      const map = await collectProjectFiles(fileList);
      await ingestMulti(map, 'Папка проекта');
    } catch (e) {
      toast.error(e.message || 'Не удалось прочитать файлы');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  // ─── модели ────────────────────────────────────────────────
  const refreshModels = async (force = false) => {
    setModelsLoading(true);
    setModelsError(null);
    const applyList = (list, updatedAt) => {
      setModels(list);
      setModelsUpdated(updatedAt);
      if (!getSelectedModel() && list.length) {
        setModel(list[0].id);
        setSelectedModel(list[0].id);
      } else if (getSelectedModel() && !list.some((m) => m.id === getSelectedModel())) {
        setModelsError({ code: 'stale_selection', message: 'Выбранная модель больше недоступна — выбери другую' });
      }
    };
    try {
      const { models: list, updatedAt } = await fetchFreeModels({ force });
      applyList(list, updatedAt);
      setProxyReady(true);
    } catch {
      try {
        const { models: list, updatedAt } = await fetchFreeModelsDirect();
        applyList(list, updatedAt);
        setProxyReady(false);
      } catch (e2) {
        setProxyReady(false);
        if (!hasDirectFallback()) {
          setModelsError({ code: e2.code || 'proxy_error', message: e2.message || 'Не удалось загрузить модели' });
        } else {
          setModelsError(null);
        }
      }
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    refreshModels(false);
    const timer = setInterval(() => refreshModels(true), 10 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── версии ────────────────────────────────────────────────
  const nextVersion = () => (versions.length ? Math.max(...versions.map((v) => v.version)) + 1 : 1);

  const bizContext = () => ({ ...(selectedBusiness || {}), products });

  const pushVersion = async ({ projectId, title, promptText, structure, bizOverride = null, htmlOverride = null, filesSnapshot = null }) => {
    const html = htmlOverride ?? compileSite(structure, bizOverride || bizContext(), shopOpts(false));
    const { data, error } = await supabase
      .from('ai_project_versions')
      .insert({
        project_id: projectId,
        version: nextVersion(),
        title: (title || promptText || 'Сайт').slice(0, 80),
        prompt: (promptText || '').slice(0, 500),
        structure,
        html,
        files: filesSnapshot || {},
        created_by: user?.id || null,
      })
      .select()
      .single();
    if (error) throw error;
    setVersions((prev) => [data, ...prev]);
    setUndoStack((prev) => (currentId ? [...prev, currentId] : prev));
    setRedoStack([]);
    setCurrentId(data.id);
    setChat((prev) => [
      ...prev,
      ...(promptText ? [{ role: 'user', text: promptText }] : []),
      { role: 'assistant', text: aiSummary(structure, data.version) },
    ]);
    return data;
  };

  const ensureProject = async (firstPrompt) => {
    if (activeProjectId) return activeProjectId;
    const { data, error } = await supabase
      .from('ai_projects')
      .insert({
        user_id: user.id,
        business_id: selectedBusiness?.id || null,
        name: firstPrompt.slice(0, 60) || 'Новый сайт',
        description: '',
      })
      .select()
      .single();
    if (error) throw error;
    setProjects((prev) => [data, ...prev]);
    setActiveProjectId(data.id);
    setVersions([]);
    return data.id;
  };

  // ─── генерация ─────────────────────────────────────────────
  const callModel = async (messages, temperature, useProxy) => {
    if (useProxy) {
      const res = await chatWithFallback(models, {
        model,
        messages,
        maxTokens: 8000,
        temperature,
        onFallback: ({ to }) => toast.info(`Модель временно недоступна. Переключились на ${to}`),
      });
      if (res.switched) setModel(res.model);
      return res.text;
    }
    // Прямой режим личным ключом
    toast.info('Backend недоступен — иду напрямую личным ключом');
    return openRouterChat(messages, { model, temperature, maxTokens: 8000, timeoutMs: 120000 });
  };

  const PROXY_FAIL_CODES = ['no_server_key', 'network', 'proxy_error', 'upstream_error', 'empty', 'ratelimit', 'rate_limited', 'internal'];

  const runGeneration = async (q, { editStructure = null, titlePrefix = '', forceDirect = false } = {}) => {
    const useProxy = proxyReady && !forceDirect;
    setBusy(true);
    setLastError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      let structure;
      let htmlOverride = null;
      const imported = !!editStructure?.site?.imported;
      if (editStructure && imported) {
        // Импортированный сайт: правим сырой HTML, структуру-пустышку не трогаем
        setStage('Analyzing request…');
        const raw = await callModel(buildEditMessages(current.html, q), 0.5, useProxy);
        setStage('Building preview…');
        htmlOverride = extractHtml(raw);
        if (!/<html/i.test(htmlOverride)) {
          toast.error('Модель вернула не сайт — переформулируй правку');
          return;
        }
        structure = validateStructure(editStructure);
      } else if (editStructure) {
        const raw = await callModel(buildStructureEditMessages(editStructure, q), 0.5, useProxy);
        setStage('Building preview…');
        const parsed = extractSiteJson(raw);
        if (!parsed) {
          toast.error('Модель вернула не структуру — переформулируй правку');
          return;
        }
        structure = parsed;
      } else {
        setStage('Analyzing request…');
        const raw = await callModel(buildStructureMessages(bizContext(), q), 0.7, useProxy);
        setStage('Creating structure…');
        const parsed = extractSiteJson(raw);
        if (!parsed?.site?.pages?.[0]?.sections?.length) {
          toast.error('Модель вернула пустую структуру — опиши подробнее');
          return;
        }
        structure = parsed;
      }
      setStage('Сохраняю версию…');
      const projectId = await ensureProject(q);
      await pushVersion({ projectId, title: `${titlePrefix}${q.slice(0, 50)}`, promptText: q, structure, htmlOverride });
      setDraft(null);
      setPrompt('');
      toast.success(editStructure ? 'Версия обновлена' : 'Сайт создан');
    } catch (e) {
      const code = e.code || (e instanceof OpenRouterError ? e.type : 'unknown');
      // Прокси упал, а личный ключ есть — одна попытка напрямую
      if (!forceDirect && proxyReady && hasDirectFallback() && PROXY_FAIL_CODES.includes(code)) {
        toast.info('Backend дал сбой — пробую напрямую личным ключом');
        setProxyReady(false);
        return runGeneration(q, { editStructure, titlePrefix, forceDirect: true });
      }
      const msg = e.message || 'Не удалось сгенерировать';
      setLastError({ type: code, message: msg });
      if (code === 'unknown_model') refreshModels(true);
      if (code === 'paid_model') {
        if (confirm('This model may incur charges.\n\nИспользовать платную модель за свой счёт?')) {
          toast.info('Платные модели пока только через backend — выбери бесплатную');
        }
        return;
      }
      if (code === 'credits') {
        const firstFree = models[0]?.id;
        toast.error('Нет кредитов OpenRouter', {
          description: 'Пополни баланс или сгенерируй бесплатно',
          duration: 10000,
          action: firstFree
            ? { label: 'Бесплатная модель', onClick: () => { setModel(firstFree); setSelectedModel(firstFree); } }
            : undefined,
        });
      } else {
        toast.error(friendlyError(code, msg));
      }
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const handleSend = () => {
    const q = prompt.trim();
    if (!q || busy) return;
    if (!selectedBusiness && !activeProject) {
      toast.error('Сначала выбери бизнес (данные подставятся сами)');
      return;
    }
    if (!model) {
      toast.error('Выбери бесплатную модель');
      return;
    }
    if (models.length > 0 && !models.some((m) => m.id === model)) {
      toast.error('❌ Модель не в списке бесплатных — выбери другую');
      return;
    }
    if (!proxyReady && !hasDirectFallback()) {
      toast.error('Нет связи с backend и нет личного ключа — добавь ключ в Профиле → Мои AI-ключи');
      return;
    }
    if (isMulti) {
      runFileEdit(q);
      return;
    }
    runGeneration(q, { editStructure: currentStructure, titlePrefix: currentStructure ? 'Правка: ' : '' });
  };

  // ─── AI-правки мультифайлового проекта (diff-JSON) ───────────
  const runFileEdit = async (q) => {
    if (!isMulti || busy) return;
    setBusy(true);
    setLastError(null);
    setStage('Analyzing request…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const tree = Object.keys(files).sort();
      const messages = buildFileEditMessages(tree, files, q);
      let text;
      if (proxyReady) {
        const res = await chatWithFallback(models, {
          model, messages, maxTokens: 8000, temperature: 0.3,
          onFallback: ({ to }) => toast.info(`Модель временно недоступна. Переключились на ${to}`),
        });
        if (res.switched) setModel(res.model);
        text = res.text;
      } else {
        toast.info('Backend недоступен — иду напрямую личным ключом');
        text = await openRouterChat(messages, { model, temperature: 0.3, maxTokens: 8000, timeoutMs: 120000 });
      }
      setStage('Применяю правки…');
      const edits = extractFileEdits(text);
      if (!edits?.length) {
        toast.error('Модель вернула не правки — переформулируй');
        return;
      }
      const { files: next, applied, skipped } = applyFileEdits(files, edits);
      if (!applied.length) {
        toast.error('Ничего не применено — проверь пути файлов');
        return;
      }
      setFiles(next);
      const entry = resolveEntry(next);
      for (const a of applied) {
        if (a.op === 'delete') {
          await supabase.from('ai_project_files').delete().eq('project_id', activeProjectId).eq('path', a.path);
        } else if (a.op === 'rename') {
          const [from, to] = a.path.split('→');
          await persistFile(activeProjectId, to, next[to]);
          await supabase.from('ai_project_files').delete().eq('project_id', activeProjectId).eq('path', from);
        } else {
          await persistFile(activeProjectId, a.path, next[a.path]);
        }
      }
      setStage('Сохраняю версию…');
      await pushVersion({
        projectId: activeProjectId,
        title: q.slice(0, 50),
        promptText: q,
        structure: currentStructure || importedSkeleton(activeProject?.name || 'Проект'),
        filesSnapshot: next,
        htmlOverride: (entry && next[entry]) || '',
      });
      if (skipped.length) toast.info(`Пропущено правок: ${skipped.length}`);
      toast.success(`Применил правок: ${applied.length}`);
    } catch (e) {
      const code = e.code || (e instanceof OpenRouterError ? e.type : 'unknown');
      setLastError({ type: code, message: e.message || 'Не удалось применить правки' });
      toast.error(friendlyError(code, e.message));
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const friendlyError = (code, msg) => {
    if (code === 'ratelimit') return 'Модель перегружена. Используем другую бесплатную модель.';
    if (code === 'auth' || code === 'unauthorized') return 'AI API не настроен.';
    if (code === 'timeout') return 'AI не ответил вовремя.';
    if (code === 'network' || code === 'upstream_error') return 'AI временно недоступен.';
    return msg;
  };

  // ─── undo/redo ─────────────────────────────────────────────
  const doUndo = () => {
    if (!undoStack.length) return;
    const prev = [...undoStack];
    const id = prev.pop();
    setUndoStack(prev);
    setRedoStack((r) => (currentId ? [currentId, ...r] : r));
    openVersion(versions.find((v) => v.id === id) || null, activeProjectId);
    toast.info('Undo — предыдущая версия');
  };

  const doRedo = () => {
    if (!redoStack.length) return;
    const [id, ...rest] = redoStack;
    setRedoStack(rest);
    setUndoStack((u) => (currentId ? [...u, currentId] : u));
    openVersion(versions.find((v) => v.id === id) || null, activeProjectId);
    toast.info('Redo — версия возвращена');
  };

  // ─── секции (черновик + дебаунс сохранения) ─────────────────
  const flushDraft = async (structure, title) => {
    setBusy(true);
    try {
      await pushVersion({ projectId: activeProjectId, title, promptText: '', structure });
      setDraft(null);
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const scheduleSave = (structure, title) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushDraft(structure, title), 1200);
  };

  const updateSection = (idx, patch, immediate = false) => {
    if (!shownStructure || busy) return;
    const base = validateStructure(shownStructure);
    base.site.pages[0].sections[idx] = { ...base.site.pages[0].sections[idx], ...patch };
    setDraft(base);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) flushDraft(base, 'Правка секции');
    else scheduleSave(base, 'Правка секции');
  };

  const deleteSection = async (idx) => {
    if (!shownStructure || busy) return;
    if (!confirm('Удалить этот блок?')) return;
    const base = validateStructure(shownStructure);
    base.site.pages[0].sections.splice(idx, 1);
    setDraft(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await flushDraft(base, 'Удалён блок');
    toast.success('Блок удалён');
  };

  const addSection = async (type) => {
    if (!shownStructure || busy) return;
    const base = validateStructure(shownStructure);
    base.site.pages[0].sections.push({ type, title: type, description: '', buttons: [], items: [] });
    setDraft(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await flushDraft(base, `+ ${type}`);
  };

  const askAiSection = (idx, text) => {
    if (!text?.trim() || !currentStructure) return;
    const sec = sections[idx];
    runGeneration(`Измени ТОЛЬКО секцию #${idx + 1} (type=${sec?.type}). Остальное не трогай. Правка: ${text.trim()}`, {
      editStructure: currentStructure,
      titlePrefix: 'Секция: ',
    });
  };

  // ─── проект ────────────────────────────────────────────────
  const openProject = (id) => {
    setActiveProjectId(id);
    setPrompt('');
    setLastError(null);
    loadVersions(id);
  };

  const newProject = () => {
    setActiveProjectId(null);
    setVersions([]);
    setCurrentId(null);
    setFiles({});
    setActiveFile(null);
    setUndoStack([]);
    setRedoStack([]);
    setChat([]);
    setPrompt('');
    setLastError(null);
  };

  const deleteProject = async (id) => {
    if (!confirm('Удалить проект со всеми версиями?')) return;
    const { error } = await supabase.from('ai_projects').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) newProject();
    toast.success('Проект удалён');
  };

  // ─── импорт своего сайта ───────────────────────────────────
  const fileInputRef = useRef(null);

  const importedSkeleton = (name) => validateStructure({
    site: {
      name: name || 'Импортированный сайт',
      description: 'Сайт загружен файлом. Правки — через AI и модули.',
      theme: { primary: '#7c3aed', dark: true },
      pages: [{ name: 'Home', sections: [{ type: 'about', title: 'Импорт', description: 'HTML загружен из файла.' }] }],
      imported: true,
    },
  });

  const handleImportFiles = async (files) => {
    const list = [...(files || [])].filter((f) => /\.html?$/i.test(f.name) && f.size <= 2 * 1024 * 1024);
    if (!list.length) {
      toast.error('Выбери .html файл до 2 МБ');
      return;
    }
    setBusy(true);
    setStage('Читаю файлы…');
    try {
      const texts = await Promise.all(list.map((f) => f.text()));
      const idx = texts.reduce((best, t, i) => (t.length > texts[best].length ? i : best), 0);
      const html = texts[idx].slice(0, 200000);
      if (!/<html/i.test(html)) {
        toast.error('В файле нет HTML-разметки');
        return;
      }
      const projectName = list[idx].name.replace(/\.html?$/i, '').slice(0, 60) || 'Мой сайт';
      const { data: proj, error: pErr } = await supabase
        .from('ai_projects')
        .insert({
          user_id: user.id,
          business_id: selectedBusiness?.id || null,
          name: projectName,
          description: `Импорт: ${list.map((f) => f.name).join(', ').slice(0, 200)}`,
        })
        .select()
        .single();
      if (pErr) throw pErr;
      setProjects((prev) => [proj, ...prev]);
      setActiveProjectId(proj.id);
      setVersions([]);
      await pushVersion({
        projectId: proj.id,
        title: `Импорт: ${list[idx].name}`.slice(0, 80),
        promptText: '',
        structure: importedSkeleton(projectName),
        htmlOverride: html,
      });
      setChat([
        { role: 'assistant', text: `Загрузил «${projectName}». Теперь подключи модули ниже: корзину, контакты, тему — или попроси AI изменить что-то.` },
      ]);
      toast.success('Сайт импортирован');
    } catch (e) {
      toast.error(e.message || 'Не удалось импортировать');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  // ─── подключение AI-модуля к импортированному сайту ──────────
  const runModule = async (moduleId) => {
    if (!current?.html || busy) return;
    setBusy(true);
    setLastError(null);
    setStage('Подключаю модуль…');
    try {
      const { buildModuleMessages } = await import('@/lib/openrouter');
      const b = selectedBusiness || {};
      const messages = buildModuleMessages(current.html, moduleId, {
        businessName: b.name || activeProject?.name || '',
        phone: b.phone || '',
        address: b.address || '',
        city: b.city || '',
        products,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        businessId: activeProject?.business_id || b.id || '',
      });
      const useProxy = proxyReady;
      let raw;
      if (useProxy) {
        const res = await chatWithFallback(models, { model, messages, maxTokens: 8000, temperature: 0.3 });
        if (res.switched) setModel(res.model);
        raw = res.text;
      } else {
        if (!hasDirectFallback()) {
          toast.error('Нет связи и нет личного ключа');
          return;
        }
        raw = await openRouterChat(messages, { model, temperature: 0.3, maxTokens: 8000, timeoutMs: 120000 });
      }
      const { extractHtml } = await import('@/lib/openrouter');
      const html = extractHtml(raw);
      if (!/<html/i.test(html)) {
        toast.error('Модель вернула не сайт — попробуй ещё раз');
        return;
      }
      await pushVersion({
        projectId: activeProjectId,
        title: `Модуль: ${moduleId}`,
        promptText: '',
        structure: validateStructure(currentStructure),
        htmlOverride: html,
      });
      setChat((prev) => [...prev, { role: 'assistant', text: `Готово: подключил модуль «${moduleId}». Проверь preview.` }]);
      toast.success('Модуль подключён');
    } catch (e) {
      const code = e.code || (e instanceof OpenRouterError ? e.type : 'unknown');
      setLastError({ type: code, message: e.message || 'Не удалось подключить' });
      toast.error(e.message || 'Не удалось подключить');
    } finally {
      setBusy(false);
      setStage('');
    }
  };
  // ─── publish/export ────────────────────────────────────
  const handleRefreshData = async () => {
    if (!current || !currentStructure || refreshingData) return;
    setRefreshingData(true);
    try {
      // Свежие данные бизнеса и товаров
      const { data: biz } = await supabase.rpc('get_my_businesses');
      const freshBiz = (biz || []).find((b) => b.id === (activeProject?.business_id || selectedBusiness?.id))
        || biz?.[0] || selectedBusiness;
      let freshProducts = products;
      if (freshBiz) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, price')
          .eq('business_id', freshBiz.id)
          .eq('is_active', true)
          .limit(12);
        if (prods) {
          freshProducts = prods;
          setProducts(prods);
        }
        setSelectedBusiness(freshBiz);
      }
      const structure = validateStructure(currentStructure);
      await pushVersion({
        projectId: activeProjectId,
        title: 'Обновление данных',
        promptText: '',
        structure,
        bizOverride: { ...(freshBiz || selectedBusiness || {}), products: freshProducts },
      });
      const hasProductsSection = structure.site.pages[0].sections.some((s) => s.type === 'products');
      if (!hasProductsSection && freshProducts.length) {
        toast.info('На сайте нет секции каталога — напиши «добавь каталог товаров»');
      } else {
        toast.success(`Данные обновлены · товаров: ${freshProducts.length}`);
      }
    } catch (e) {
      toast.error(e.message || 'Не удалось обновить данные');
    } finally {
      setRefreshingData(false);
    }
  };

  const handlePublish = async () => {
    if (!current) return;
    try {
      await supabase.from('ai_project_versions').update({ is_published: false }).eq('project_id', activeProjectId);
      const { error } = await supabase.from('ai_project_versions').update({ is_published: true }).eq('id', current.id);
      if (error) throw error;
      setVersions((prev) => prev.map((v) => ({ ...v, is_published: v.id === current.id })));
      toast.success('Опубликован');
    } catch (e) {
      toast.error(e.message || 'Не удалось опубликовать');
    }
  };

  const handleExport = async () => {
    if (isMulti) {
      if (!Object.keys(files).length) return;
      try {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        Object.entries(files).forEach(([p, c]) => zip.file(p, c));
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(activeProject?.name || 'site').replace(/[^\w\-а-яё]+/gi, '_')}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast.success('ZIP скачан');
      } catch (e) {
        toast.error(e.message || 'Не удалось собрать ZIP');
      }
      return;
    }
    if (!currentHtml) return;
    const blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(activeProject?.name || 'site').replace(/[^\w\-а-яё]+/gi, '_')}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success('HTML скачан');
  };

  const copyLink = () => {
    if (!current) return;
    const url = `${window.location.origin}/s/${current.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Ссылка скопирована');
    }).catch(() => toast.info(url));
  };

  const handleConnectKey = async () => {
    const k = keyInput.trim();
    if (!k) {
      toast.error('Вставь ключ');
      return;
    }
    if (!user?.id) {
      toast.error('Войди в аккаунт');
      return;
    }
    setKeySaving(true);
    try {
      const { validateOpenRouterKey } = await import('@/lib/openrouter');
      const check = await validateOpenRouterKey(k);
      if (!check.ok && check.reason !== 'network') {
        toast.error(check.reason);
        return;
      }
      await saveUserKey(user.id, 'openrouter', k);
      setKeyInput('');
      toast.success('OpenRouter подключён — можно генерировать');
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить ключ');
    } finally {
      setKeySaving(false);
    }
  };

  const [keyInputState, setKeyInputState] = [keyInput, setKeyInput];
  void keyInputState;

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden bg-[#0b1120] dark:bg-[#0b1120]">
      <div className="max-w-[1400px] mx-auto p-3 md:p-4 space-y-3 lg:h-full lg:flex lg:flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/business')}
            title="Назад в меню бизнеса"
            className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-all active:scale-95 shrink-0"
          >
            <ArrowLeft size={17} />
          </button>
          <h1 className="text-lg md:text-xl font-black text-white flex items-center gap-2 flex-1">
            <span>🤖</span> AI-конструктор сайта
          </h1>
          {businesses.length > 1 && (
            <select
              value={selectedBusiness?.id || ''}
              onChange={(e) => setSelectedBusiness(businesses.find((b) => b.id === e.target.value) || null)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-200"
            >
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <span className="text-[11px] text-slate-400">Project: {activeProject?.name || '—'}</span>
          <button onClick={doUndo} disabled={!undoStack.length || busy} title="Undo"
            className="p-2 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700">
            <Undo2 size={14} />
          </button>
          <button onClick={doRedo} disabled={!redoStack.length || busy} title="Redo"
            className="p-2 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700">
            <Redo2 size={14} />
          </button>
          <button onClick={() => setShowVersions((v) => !v)} title="History"
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1 text-[11px] font-bold">
            <History size={14} /> {versions.length}
          </button>
          <button onClick={newProject} title="New Project"
            className="p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 flex items-center gap-1 text-[11px] font-bold">
            <Plus size={14} /> New
          </button>
          <button onClick={() => fileInputRef.current?.click()} title="Загрузить свой .html"
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1 text-[11px] font-bold">
            <Upload size={14} /> HTML
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            multiple
            className="hidden"
            onChange={(e) => { handleImportFiles(e.target.files); e.target.value = ''; }}
          />
          <button onClick={() => zipInputRef.current?.click()} title="Загрузить ZIP проекта"
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1 text-[11px] font-bold">
            <FolderArchive size={14} /> ZIP
          </button>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => { handleZipImport(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button onClick={() => { multiInputRef.current?.click(); }} title="Выбрать файлы проекта"
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1 text-[11px] font-bold">
            <Files size={14} /> Файлы
          </button>
          <input
            ref={multiInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFilesInput(e.target.files); e.target.value = ''; }}
          />
          <button onClick={() => folderInputRef.current?.click()} title="Выбрать папку проекта"
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hidden sm:flex items-center gap-1 text-[11px] font-bold">
            <FolderOpen size={14} /> Папка
          </button>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFilesInput(e.target.files); e.target.value = ''; }}
          />
        </div>

        {proxyReady ? (
          <p className="text-[11px] text-emerald-400 font-bold px-1">OpenRouter подключён ✓ · Ключ не покидает backend</p>
        ) : (
          <p className="text-[11px] text-amber-400 font-bold px-1">Режим прямого ключа (backend недоступен)</p>
        )}

        {/* Проекты (mobile chips) */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1">
          {projects.map((p) => (
            <button key={p.id} onClick={() => openProject(p.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold ${p.id === activeProjectId ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              📁 {p.name}
            </button>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.25fr)] lg:flex-1 lg:min-h-0">
          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden min-h-0">
            <p className="px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-800">
              My Projects
            </p>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {projects.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-500">Проектов пока нет</p>
              )}
              {projects.map((p) => (
                <div key={p.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[13px] font-bold cursor-pointer ${p.id === activeProjectId ? 'bg-violet-600/20 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  onClick={() => openProject(p.id)}
                >
                  <FolderOpen size={14} className="shrink-0 text-violet-400" />
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-0.5"
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          {/* Chat */}
          <div className="min-h-[420px] lg:min-h-0 flex">
            <div className="flex-1 min-w-0">
              <BuilderChat
                messages={chat}
                busy={busy}
                stage={stage}
                prompt={prompt}
                setPrompt={setPrompt}
                onSend={handleSend}
                models={models}
                modelsLoading={modelsLoading}
                modelsError={models.length ? null : modelsError}
                modelsUpdated={modelsUpdated}
                model={model}
                onModelChange={(id) => { setModel(id); setSelectedModel(id); }}
                onRefreshModels={() => refreshModels(true)}
              />
            </div>
          </div>

          {/* Preview + sections + versions */}
          <div className="flex flex-col gap-3 min-h-0 lg:overflow-y-auto lg:pr-0.5">
            <div className="min-h-[480px] lg:min-h-[420px] lg:flex-1 flex">
              <div className="flex-1 min-w-0">
                <BuilderPreview
                  html={isMulti ? previewDoc : currentHtml}
                  versionKey={(currentId || 'empty') + (isMulti ? Object.keys(files).length : '')}
                  previewMode={previewMode}
                  setPreviewMode={setPreviewMode}
                  isPublished={!!current?.is_published}
                  onPublish={handlePublish}
                  publicUrl={current ? `${window.location.origin}/s/${current.id}` : ''}
                  copied={copied}
                  onCopyLink={copyLink}
                  onExport={handleExport}
                  onRefreshData={handleRefreshData}
                  refreshingData={refreshingData}
                  empty={(
                    <div className="text-center m-auto px-4">
                      <div className="text-4xl mb-2">🤖</div>
                      <p className="text-sm font-bold text-slate-400">Опиши сайт в чате — preview появится здесь</p>
                    </div>
                  )}
                />
              </div>
            </div>

            {current && !isMulti && (
              <SectionsPanel
                sections={sections}
                userId={user?.id}
                imported={!!shownStructure?.site?.imported}
                onModuleConnect={runModule}
                busy={busy}
                onUpdateSection={updateSection}
                onDeleteSection={deleteSection}
                onAddSection={addSection}
                onAskAi={askAiSection}
              />
            )}

            {isMulti && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden" style={{ height: 380 }}>
                <div className="flex h-full min-h-0">
                  <div className="w-44 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
                    <FileExplorer
                      files={files}
                      activePath={activeFile}
                      onOpen={setActiveFile}
                      onCreate={handleCreateFile}
                      onRename={handleRenameFile}
                      onDelete={handleDeleteFile}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {activeFile && files[activeFile] != null ? (
                      <FileEditor
                        path={activeFile}
                        content={files[activeFile]}
                        onSave={handleSaveFile}
                        busy={busy}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-xs text-slate-500">Выбери файл слева</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {showVersions && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <p className="px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-800">History</p>
                <div className="divide-y divide-slate-800 max-h-48 overflow-y-auto">
                  {versions.map((v) => (
                    <button key={v.id} onClick={() => { setRedoStack([]); openVersion(v, activeProjectId); }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 ${v.id === currentId ? 'bg-violet-600/15' : ''}`}>
                      <span className="text-[11px] font-black text-slate-500 w-8">v{v.version}</span>
                      <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-slate-200">{v.title || v.prompt || 'Версия'}</span>
                      {v.is_published && <Globe size={11} className="text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                  {versions.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">Пока пусто</p>}
                </div>
              </div>
            )}

            {lastError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                <p className="font-bold">Не получилось: {lastError.message}</p>
              </div>
            )}

            {!proxyReady && !hasDirectFallback() && modelsError && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-3">
                <div className="flex gap-3">
                  <KeyRound size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[13px] text-amber-200 flex-1">
                    <p className="font-bold">Подключи OpenRouter</p>
                    <p className="mt-0.5">Backend недоступен — вставь свой ключ. <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="font-bold underline">Взять ключ</a></p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConnectKey(); }}
                    placeholder="sk-or-v1-…"
                    autoComplete="off"
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-500 font-mono"
                  />
                  <button onClick={handleConnectKey} disabled={keySaving || !keyInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold">
                    {keySaving ? '…' : 'Подключить'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
