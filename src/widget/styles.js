/**
 * styles — CSS виджета, внедряется в каждый Shadow Root.
 * Изолировано от стилей чужой страницы.
 */
export const WIDGET_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.kw-root { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #0f172a; line-height: 1.45; }
.kw-btn { cursor: pointer; border: none; border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 13px; background: #2563eb; color: #fff; transition: filter .15s, transform .05s; }
.kw-btn:hover { filter: brightness(1.08); }
.kw-btn:active { transform: scale(.97); }
.kw-btn:disabled { opacity: .55; cursor: default; }
.kw-btn.ghost { background: transparent; color: #475569; border: 1px solid #e2e8f0; }
.kw-btn.danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.kw-fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; box-shadow: 0 8px 24px rgba(37,99,235,.4); }
.kw-panel { position: fixed; right: 16px; bottom: 72px; width: min(380px, calc(100vw - 32px)); max-height: min(70vh, 640px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 16px 48px rgba(15,23,42,.28); z-index: 2147483001; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.kw-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kw-head b { font-size: 15px; }
.kw-sub { color: #64748b; font-size: 12px; }
.kw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.kw-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 6px; background: #f8fafc; }
.kw-card .kw-name { font-weight: 700; font-size: 13px; word-break: break-word; }
.kw-card .kw-price { color: #2563eb; font-weight: 800; }
.kw-card img { width: 100%; height: 74px; object-fit: cover; border-radius: 8px; }
.kw-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 0; border-bottom: 1px solid #f1f5f9; }
.kw-row:last-child { border-bottom: none; }
.kw-qty { display: flex; align-items: center; gap: 6px; }
.kw-qty button { width: 24px; height: 24px; border-radius: 7px; border: 1px solid #e2e8f0; background: #fff; font-weight: 800; cursor: pointer; }
.kw-total { display: flex; justify-content: space-between; font-weight: 800; padding-top: 6px; }
.kw-form { display: flex; flex-direction: column; gap: 8px; }
.kw-form input, .kw-form select, .kw-form textarea { width: 100%; padding: 9px 10px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13px; font-family: inherit; background: #fff; }
.kw-form input:focus, .kw-form textarea:focus { outline: 2px solid #93c5fd; border-color: #2563eb; }
.kw-seg { display: flex; gap: 6px; }
.kw-seg button { flex: 1; padding: 8px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; font-weight: 700; cursor: pointer; font-size: 12px; }
.kw-seg button[aria-pressed="true"] { background: #2563eb; color: #fff; border-color: #2563eb; }
.kw-err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; padding: 7px 9px; font-size: 12px; }
.kw-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px; text-align: center; }
.kw-map { height: 200px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin-top: 4px; }
.kw-badge { display: inline-block; background: #eff6ff; color: #2563eb; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
.kw-muted { color: #94a3b8; font-size: 12px; }
`;
