/**
 * projectFiles.js — мультифайловые проекты: дерево, entry, сборка preview,
 * применение AI-правок. Чистые функции покрыты тестами.
 */

export const TEXT_EXTS = ['html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg'];
export const MAX_FILES = 60;
export const MAX_FILE_SIZE = 500 * 1024;
export const MAX_TOTAL_SIZE = 3 * 1024 * 1024;

/** Нормализация пути: без ведущего ./, /, схлопнуть .. */
export function normalizePath(p) {
  const parts = String(p || '').replace(/\\/g, '/').split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/').slice(0, 200);
}

export function extOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path || '');
  return (m?.[1] || '').toLowerCase();
}

export function isTextFile(path) {
  return TEXT_EXTS.includes(extOf(path));
}

/** Дерево {name, path, children[]} из плоского списка путей. */
export function buildTree(paths) {
  const root = [];
  const dirs = {};
  const sorted = [...paths].sort();
  for (const p of sorted) {
    const parts = p.split('/');
    let level = root;
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      if (isLast) {
        level.push({ name: parts[i], path: prefix });
      } else {
        if (!dirs[prefix]) {
          const node = { name: parts[i], path: prefix, children: [] };
          dirs[prefix] = node;
          level.push(node);
        }
        level = dirs[prefix].children;
      }
    }
  }
  return root;
}

/** Точка входа: index.html в корне, иначе первый .html. */
export function resolveEntry(files) {
  const paths = Object.keys(files);
  const root = paths.filter((p) => /^index\.html?$/i.test(p));
  if (root.length) return root.sort()[0];
  const any = paths.filter((p) => /\.html?$/i.test(p)).sort();
  return any[0] || null;
}

/** Переписать относительные src/href на blob-URL из карты. */
export function rewriteRefs(html, blobByPath, entryPath) {
  const baseDir = entryPath.includes('/') ? entryPath.slice(0, entryPath.lastIndexOf('/')) : '';
  const resolve = (ref) => {
    if (!ref || /^(https?:|data:|blob:|#|mailto:|tel:)/i.test(ref)) return null;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return null;
    const joined = baseDir ? `${baseDir}/${clean}` : clean;
    return blobByPath[normalizePath(joined)] || null;
  };
  return String(html).replace(
    /((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi,
    (m, pre, ref, post) => {
      const url = resolve(ref.trim());
      return url ? `${pre}${url}${post}` : m;
    },
  );
}

/**
 * Собрать srcDoc для preview: entry + blob-URL остальных файлов.
 * Возвращает { doc, revoke } — revoke() чистит blob-URL.
 */
export function buildPreviewDoc(files, entryPath) {
  const urls = [];
  const blobByPath = {};
  for (const [path, content] of Object.entries(files)) {
    if (path === entryPath || typeof content !== 'string') continue;
    const mime = extOf(path) === 'css' ? 'text/css'
      : extOf(path) === 'svg' ? 'image/svg+xml'
      : extOf(path) === 'json' ? 'application/json'
      : 'text/javascript';
    try {
      const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
      urls.push(url);
      blobByPath[path] = url;
    } catch {
      // ignore
    }
  }
  const doc = rewriteRefs(files[entryPath] || '', blobByPath, entryPath);
  return { doc, revoke: () => urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} }) };
}

/**
 * Применить AI-правки [{op, path, ...}] к файлам. Возвращает { files, applied, skipped }.
 * Неизвестные op и пути мимо — в skipped, ничего не ломаем.
 */
export function applyFileEdits(files, edits) {
  const next = { ...files };
  const applied = [];
  const skipped = [];
  for (const e of Array.isArray(edits) ? edits : []) {
    if (!e || typeof e !== 'object') {
      skipped.push(e);
      continue;
    }
    if (e.op === 'create' || e.op === 'update') {
      const path = normalizePath(e.path);
      if (!path || typeof e.content !== 'string') {
        skipped.push(e);
        continue;
      }
      if (e.op === 'create' && (path in next || Object.keys(next).length >= MAX_FILES)) {
        skipped.push(e);
        continue;
      }
      next[path] = e.content.slice(0, MAX_FILE_SIZE);
      applied.push({ op: e.op, path });
    } else if (e.op === 'delete') {
      const path = normalizePath(e.path);
      if (!path || !(path in next)) {
        skipped.push(e);
        continue;
      }
      delete next[path];
      applied.push({ op: e.op, path });
    } else if (e.op === 'rename') {
      const from = normalizePath(e.path);
      const to = normalizePath(e.to);
      if (!from || !to || !(from in next) || to in next) {
        skipped.push(e);
        continue;
      }
      next[to] = next[from];
      delete next[from];
      applied.push({ op: e.op, path: `${from}→${to}` });
    } else {
      skipped.push(e);
    }
  }
  return { files: next, applied, skipped };
}

/** Извлечь JSON-правки из ответа модели. */
export function extractFileEdits(raw) {
  if (!raw) return null;
  const s = String(raw);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fence ? fence[1] : s).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    const edits = Array.isArray(parsed) ? parsed : parsed?.edits;
    if (!Array.isArray(edits)) return null;
    return edits.filter((e) => e && typeof e === 'object' && ['create', 'update', 'delete', 'rename'].includes(e.op));
  } catch {
    return null;
  }
}

/** Подготовить файлы проекта из File-листа (input/ZIP): {path: content}. */
export async function collectProjectFiles(fileList) {
  const out = {};
  let total = 0;
  const files = [...(fileList || [])];
  // Папки из input webkitdirectory дают webkitRelativePath — уважаем его
  for (const f of files) {
    const rawPath = f.webkitRelativePath || f.name;
    const path = normalizePath(rawPath.replace(/^[^/]+\//, ''));
    if (!path || !isTextFile(path)) continue;
    if (Object.keys(out).length >= MAX_FILES) break;
    if (f.size > MAX_FILE_SIZE || total + f.size > MAX_TOTAL_SIZE) continue;
    try {
      const text = await f.text();
      out[path] = text.slice(0, MAX_FILE_SIZE);
      total += f.size;
    } catch {
      // пропускаем нечитаемое
    }
  }
  return out;
}
