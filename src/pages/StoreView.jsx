import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicStore } from '@/lib/api/website';
import { resolveEntry, buildInlineDoc } from '@/lib/projectFiles';
import { normalizeWidgetUrls } from '@/lib/widgetSnippet';

/**
 * Публичная витрина AI-сайта: /store/:slug (спецификация §8).
 * Данные — анонимный RPC get_public_store: только опубликованные версии
 * активных бизнесов. Мультифайловые проекты инлайнятся в один документ.
 */
export default function StoreView() {
  const { slug } = useParams();
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setFailed(true);
      return undefined;
    }
    getPublicStore(slug)
      .then((store) => {
        if (cancelled) return;
        if (!store) {
          setFailed(true);
          return;
        }
        const files = store.files && Object.keys(store.files).length ? store.files : null;
        if (files) {
          try {
            const entry = resolveEntry(files);
            if (entry && files[entry]) {
              setHtml(buildInlineDoc(files, entry));
              return;
            }
          } catch {
            // падаем на html ниже
          }
        }
        setHtml(store.html || '');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Витрина не найдена или снята с публикации</p>
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
  if (!html) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Витрина пока пуста</p>
      </div>
    );
  }
  return (
    <iframe
      title="Витрина"
      srcDoc={normalizeWidgetUrls(html)}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}
