/**
 * app — состояние и рендер виджета в Shadow DOM.
 * Каждая строка данных попадает в DOM только через textContent (XSS).
 */
import { h, btn, clear } from './dom';
import { WIDGET_CSS } from './styles';
import { t } from './i18n';
import { findAnchors } from '@/lib/widgetConfig';
import { addToCart, setQty, cartCount, cartTotal } from '@/lib/widgetCart';
import { validateCheckout, buildOrderPayload } from '@/lib/widgetCheckout';
import { mountMap } from './mapPicker';

const DEFAULT_CENTER = [38.5581, 68.7738];
const price = (v) => `${Number(v || 0)} сом`;

export function createWidget({ doc = document, cfg, api }) {
  if (!cfg) return { ready: Promise.resolve(null) };

  const S = t(cfg.lang);
  const anchors = findAnchors(doc);
  const floatMode = !anchors.catalog && !anchors.cart && !anchors.checkout;

  // защита от двойного монтирования: по факту наличия корня
  if (floatMode && doc.getElementById('karta-widget-root')) return { ready: Promise.resolve(null) };
  if (!floatMode) {
    const targets = [anchors.catalog, anchors.cart, anchors.checkout].filter(Boolean);
    if (targets.some((el) => el.shadowRoot)) return { ready: Promise.resolve(null) };
  }

  const state = {
    biz: null, loading: true, error: '',
    cart: {}, open: false, view: 'form', orderNo: null,
    submitting: false, formErr: [],
    mapOpen: false,
    form: {
      name: '', phone: '', deliveryType: 'delivery',
      address: '', lat: '', lng: '',
      paymentMethod: 'cash', notes: '',
    },
  };

  const roots = {};
  const attach = (key, hostEl) => {
    const shadow = hostEl.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = WIDGET_CSS;
    shadow.appendChild(style);
    const wrap = h('div', { className: 'kw-root' });
    shadow.appendChild(wrap);
    roots[key] = { shadow, wrap };
    wrap.addEventListener('click', (e) => onAction(e));
  };

  if (floatMode) {
    const host = h('div', { id: 'karta-widget-root' });
    (doc.body || doc.documentElement).appendChild(host);
    attach('panel', host);
  } else {
    if (anchors.catalog) attach('catalog', anchors.catalog);
    if (anchors.cart) attach('cart', anchors.cart);
    if (anchors.checkout) attach('checkout', anchors.checkout);
    if (!roots.checkout && roots.cart) roots.checkout = roots.cart; // форма живёт в секции корзины
  }

  const products = () => state.biz?.products || [];
  const findProduct = (id) => products().find((p) => p.id === id);
  const mapCenter = () => (
    Number.isFinite(Number(state.biz?.lat)) && Number.isFinite(Number(state.biz?.lng))
      ? [Number(state.biz.lat), Number(state.biz.lng)]
      : DEFAULT_CENTER
  );

  // ─── секции ───────────────────────────────────────────────
  function catalogSection() {
    const s = h('div');
    s.append(h('b', { text: S.catalog }));
    if (state.loading) { s.append(h('p', { className: 'kw-muted', text: '…' })); return s; }
    if (state.error) {
      s.append(h('div', { className: 'kw-err', text: state.error }));
      s.append(btn('retry', S.retry, { className: 'ghost' }));
      return s;
    }
    const list = products();
    if (!list.length) { s.append(h('p', { className: 'kw-muted', text: S.empty })); return s; }
    const grid = h('div', { className: 'kw-grid' });
    for (const p of list) {
      grid.append(h('div', { className: 'kw-card' }, [
        p.image_url ? h('img', { src: p.image_url, alt: '', loading: 'lazy' }) : null,
        h('span', { className: 'kw-name', text: p.name }),
        h('span', { className: 'kw-price', text: price(p.price) }),
        btn('add', `+ ${S.addToCart}`, { data: { id: p.id } }),
      ]));
    }
    s.append(grid);
    return s;
  }

  function cartSection() {
    const s = h('div');
    const n = cartCount(state.cart);
    s.append(h('b', { text: `${S.cart} · ${n}` }));
    if (!n) { s.append(h('p', { className: 'kw-muted', text: S.emptyCart })); return s; }
    for (const [id, qty] of Object.entries(state.cart)) {
      const p = findProduct(id);
      s.append(h('div', { className: 'kw-row' }, [
        h('span', { text: p ? p.name : id }),
        h('span', { className: 'kw-qty' }, [
          btn('dec', '−', { data: { id }, className: 'ghost' }),
          h('span', { text: String(qty) }),
          btn('inc', '+', { data: { id }, className: 'ghost' }),
        ]),
        h('b', { text: price(Number(p?.price || 0) * qty) }),
      ]));
    }
    s.append(h('div', { className: 'kw-total' }, [
      h('span', { text: S.total }),
      h('span', { text: price(cartTotal(state.cart, products())) }),
    ]));
    s.append(btn('toform', S.checkout));
    return s;
  }

  function formSection() {
    const f = state.form;
    const s = h('div', { className: 'kw-form' });
    s.append(h('b', { text: S.checkout }));

    if (state.formErr.length) {
      s.append(h('div', { className: 'kw-err', text: state.formErr.join(' · ') }));
    }

    s.append(h('input', { placeholder: S.name, value: f.name, dataset: { field: 'name' }, oninput: (e) => { f.name = e.target.value; } }));
    s.append(h('input', { placeholder: S.phone, type: 'tel', value: f.phone, dataset: { field: 'phone' }, oninput: (e) => { f.phone = e.target.value; } }));

    s.append(h('div', { className: 'kw-seg' }, [
      h('button', { type: 'button', 'aria-pressed': String(f.deliveryType === 'delivery'), text: `🚚 ${S.delivery}`, onclick: () => { f.deliveryType = 'delivery'; render(); } }),
      h('button', { type: 'button', 'aria-pressed': String(f.deliveryType === 'pickup'), text: `🏬 ${S.pickup}`, onclick: () => { f.deliveryType = 'pickup'; render(); } }),
    ]));

    if (f.deliveryType !== 'pickup') {
      s.append(h('input', { placeholder: S.address, value: f.address, dataset: { field: 'address' }, oninput: (e) => { f.address = e.target.value; } }));
      if (cfg.mapEnabled) {
        s.append(state.mapOpen
          ? h('div', { className: 'kw-map', dataset: { map: '1' } })
          : btn('openmap', S.pin, { className: 'ghost' }));
      }
    }

    s.append(h('div', { className: 'kw-seg' }, [
      h('button', { type: 'button', 'aria-pressed': String(f.paymentMethod === 'cash'), text: `💵 ${S.cash}`, onclick: () => { f.paymentMethod = 'cash'; render(); } }),
      h('button', { type: 'button', disabled: true, title: S.cardSoon, 'aria-pressed': 'false', text: `💳 ${S.card} · ${S.cardSoon}` }),
    ]));

    s.append(h('textarea', { placeholder: S.notes, rows: '2', dataset: { field: 'notes' }, oninput: (e) => { f.notes = e.target.value; } }, [f.notes]));
    s.append(h('div', { className: 'kw-total' }, [
      h('span', { text: S.total }),
      h('span', { text: price(cartTotal(state.cart, products())) }),
    ]));
    s.append(btn('submit', state.submitting ? S.sending : S.submit, { disabled: state.submitting }));
    return s;
  }

  function doneSection() {
    return h('div', { className: 'kw-ok' }, [
      h('b', { text: `✅ ${S.success}` }),
      h('p', { className: 'kw-sub', text: `${S.successId}: ${state.orderNo || ''}` }),
      btn('again', S.catalog, { className: 'ghost' }),
    ]);
  }

  // ─── рендер ───────────────────────────────────────────────
  function mountMapInto(root, mountPoint) {
    const old = mountPoint.querySelector('[data-map="1"]');
    const container = old || h('div', { className: 'kw-map', dataset: { map: '1' } });
    if (!old) mountPoint.append(container);
    container.textContent = '';
    mountMap({
      shadow: root.shadow, container, center: mapCenter(), doc,
      onPick: ({ lat, lng, address }) => {
        state.form.lat = lat;
        state.form.lng = lng;
        if (address) {
          state.form.address = address;
          const input = mountPoint.querySelector('[data-field="address"]');
          if (input) input.value = address;
        }
      },
      onFail: () => { container.textContent = S.mapFallback; },
    });
  }

  function renderPanel() {
    const { wrap } = roots.panel;
    clear(wrap);
    wrap.append(btn('toggle', state.open ? S.close : S.open, { className: 'kw-fab' }));
    const panel = h('div', { className: 'kw-panel' });
    if (!state.open) panel.style.display = 'none';
    panel.append(h('div', { className: 'kw-head' }, [
      h('b', { text: state.biz?.name || 'Karta-AD' }),
      h('span', { className: 'kw-badge', text: S.by }),
    ]));
    if (state.view === 'done') panel.append(doneSection());
    else {
      panel.append(catalogSection());
      panel.append(cartSection());
      panel.append(formSection());
    }
    wrap.append(panel);
    if (state.mapOpen) mountMapInto(roots.panel, panel);
  }

  function renderAnchors() {
    if (roots.catalog) {
      clear(roots.catalog.wrap);
      roots.catalog.wrap.append(catalogSection());
    }
    if (roots.cart) {
      clear(roots.cart.wrap);
      roots.cart.wrap.append(cartSection());
      if (roots.checkout === roots.cart) {
        roots.cart.wrap.append(state.view === 'done' ? doneSection() : formSection());
        if (state.mapOpen) mountMapInto(roots.cart, roots.cart.wrap);
      } else if (state.view === 'done') {
        roots.cart.wrap.append(doneSection());
      }
    }
    if (roots.checkout && roots.checkout !== roots.cart) {
      clear(roots.checkout.wrap);
      roots.checkout.wrap.append(state.view === 'done' ? doneSection() : formSection());
      if (state.mapOpen) mountMapInto(roots.checkout, roots.checkout.wrap);
    }
  }

  function render() {
    if (floatMode) renderPanel();
    else renderAnchors();
  }

  // ─── действия ─────────────────────────────────────────────
  function onAction(e) {
    const el = e.target?.closest?.('[data-action]');
    if (!el) return;
    const id = el.dataset.id;

    switch (el.dataset.action) {
      case 'toggle': state.open = !state.open; render(); break;
      case 'retry': load(); break;
      case 'add':
      case 'inc': state.cart = addToCart(state.cart, id, 1); render(); break;
      case 'dec': state.cart = setQty(state.cart, id, (state.cart[id] || 1) - 1); render(); break;
      case 'toform': state.open = true; render(); break;
      case 'openmap': state.mapOpen = true; render(); break;
      case 'submit': submit(); break;
      case 'again': state.view = 'form'; state.orderNo = null; render(); break;
      default: break;
    }
  }

  async function submit() {
    const res = validateCheckout(state.form, state.cart);
    if (!res.ok) { state.formErr = res.errors; render(); return; }
    state.formErr = [];
    state.submitting = true;
    render();
    try {
      const { order, rows } = buildOrderPayload({
        businessId: cfg.businessId, form: state.form, cart: state.cart, items: products(),
      });
      const created = await api.createOrder(cfg, { order, rows });
      state.orderNo = created?.id ? String(created.id).slice(0, 8) : '';
      state.cart = {};
      state.view = 'done';
    } catch (err) {
      state.formErr = [err.message || 'Не удалось отправить заказ'];
    } finally {
      state.submitting = false;
      render();
    }
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const biz = await api.fetchBusiness(cfg);
      state.biz = biz || null;
      if (!biz) state.error = S.loadError;
    } catch {
      state.error = S.loadError;
    } finally {
      state.loading = false;
      render();
    }
  }

  const ready = load();
  render();
  return { ready, state };
}
