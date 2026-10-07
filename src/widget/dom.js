/**
 * dom — крошечные хелперы построения DOM без innerHTML.
 * Данные с сервера кладутся только через textContent (защита от XSS).
 */

export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'className') el.className = v;
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Кнопка действия — data-action попадает в dataset для делегирования. */
export function btn(action, label, opts = {}) {
  return h('button', {
    type: 'button',
    className: `kw-btn ${opts.className || ''}`.trim(),
    dataset: { action, ...(opts.data || {}) },
    ...(opts.disabled ? { disabled: true } : {}),
    text: label,
  });
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}
