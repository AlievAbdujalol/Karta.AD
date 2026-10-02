import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { resolveEntry, buildPreviewDoc } from '@/lib/projectFiles';

/** Публичная страница AI-сайта: /s/:id (только опубликованные). */
export default function SiteView() {
  const { id } = useParams();
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoke = null;
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
            // Мультифайл: собираем preview из снапшота версии
            const entry = resolveEntry(snap);
            if (entry && snap[entry]) {
              const built = buildPreviewDoc(snap, entry);
              revoke = built.revoke;
              setHtml(built.doc);
              return;
            }
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
    return () => {
      try {
        revoke?.();
      } catch {}
    };
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
      title="Сайт"
      srcDoc={html}
      sandbox="allow-scripts"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}
