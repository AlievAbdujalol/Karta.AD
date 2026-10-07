import { Monitor, Tablet, Smartphone, Globe, GlobeLock, Download, Copy, Check, RefreshCw } from 'lucide-react';

const WIDTHS = { desktop: '100%', tablet: 768, mobile: 390 };

/**
 * Правая панель: live preview + девайсы + Publish/Export.
 */
export default function BuilderPreview({
  html, versionKey, previewMode, setPreviewMode,
  isPublished, onPublish, publicUrl, copied, onCopyLink, onExport,
  onRefreshData, refreshingData, empty,
}) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 md:rounded-2xl border-0 md:border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 mr-1">Preview</span>
        {[
          { id: 'desktop', icon: Monitor, label: 'Desktop' },
          { id: 'tablet', icon: Tablet, label: 'Tablet' },
          { id: 'mobile', icon: Smartphone, label: 'Mobile' },
        ].map((d) => (
          <button
            key={d.id}
            onClick={() => setPreviewMode(d.id)}
            title={d.label}
            className={`p-1.5 rounded-lg ${previewMode === d.id ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <d.icon size={15} />
          </button>
        ))}
        <span className="flex-1" />
        {html && (
          <>
            <button onClick={onRefreshData} title="Обновить товары и контакты с бизнеса"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200">
              <RefreshCw size={12} className={refreshingData ? 'animate-spin' : ''} />
              Данные
            </button>
            <button onClick={onExport} title="Скачать HTML"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200">
              <Download size={12} /> Export
            </button>
            <button onClick={onPublish}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold ${isPublished ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>
              {isPublished ? <Globe size={12} /> : <GlobeLock size={12} />}
              {isPublished ? 'Опубликован' : 'Publish'}
            </button>
            {isPublished && publicUrl && (
              <button onClick={onCopyLink} title="Скопировать ссылку"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex-1 overflow-auto scrollbar-ui bg-slate-100 dark:bg-slate-950 p-3 flex justify-center min-h-[280px]">
        {!html ? (
          empty
        ) : (
          <iframe
            key={versionKey}
            title="Website preview"
            srcDoc={html}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            style={{
              width: previewMode === 'desktop' ? '100%' : Math.min(WIDTHS[previewMode], 900),
              maxWidth: '100%',
              height: '100%',
              minHeight: 420,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.3)',
              background: '#fff',
              flexShrink: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}
