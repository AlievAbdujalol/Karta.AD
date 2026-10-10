import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { resolveEntry, buildInlineDoc } from '@/lib/projectFiles';
import { normalizeWidgetUrls } from '@/lib/widgetSnippet';

/** Публичная страница AI-сайта: /s/:id (только опубликованные). */
export default function SiteView() {
  const { id } = useParams();
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(false);
  const [siteTitle, setSiteTitle] = useState('Сайт');

  // Вкладка браузера — имя магазина («AD Sneakers …»), а не заголовок обёртки SPA
  useEffect(() => {
    if (!html) return undefined;
    const prevTitle = document.title;
    try {
      const t = new DOMParser().parseFromString(html, 'text/html')
        .querySelector('title')?.textContent?.trim();
      if (t) {
        document.title = t;
        setSiteTitle(t);
      }
    } catch {
      // без заголовка — оставляем как есть
    }
    return () => { document.title = prevTitle; };
  }, [html]);

  useEffect(() => {
    if (!id) {
      setFailed(true);
      return;
    }
    // Сначала новые версии AI-проектов, затем legacy business_sites
    supabase
      .from('ai_project_versions')
      .select('html, files')
      .eq('id', id)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          const snap = data.files && Object.keys(data.files).length ? data.files : null;
          if (snap) {
            // Мультифайл: инлайн-сборка (без blob — они мертвы вне сессии)
            try {
              const entry = resolveEntry(snap);
              if (entry && snap[entry]) {
                setHtml(buildInlineDoc(snap, entry));
                return;
              }
            } catch {}
          }
          setHtml(data.html);
          return;
        }
        supabase
          .from('business_sites')
          .select('html')
          .eq('id', id)
          .eq('is_published', true)
          .maybeSingle()
          .then(({ data: legacy, error: legacyErr }) => {
            if (legacyErr || !legacy) setFailed(true);
            else setHtml(legacy.html);
          });
      });
  }, [id]);

  if (failed) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Страница не найдена или снята с публикации</p>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <iframe
      title={siteTitle}
      srcDoc={normalizeWidgetUrls(html)}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}
