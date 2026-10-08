/**
 * siteBuilder.js — структурированный AI Website Builder.
 * AI возвращает JSON { site: { name, description, theme, pages[] } },
 * compileSite() детерминированно собирает однофайловый HTML для preview.
 * Чистые функции compileSite/validateStructure покрыты тестами.
 */

import { cartoRaster, CARTO_ATTRIBUTION } from './tiles';

export const SECTION_TYPES = [
  'hero', 'features', 'products', 'services', 'about',
  'gallery', 'reviews', 'map', 'contact', 'delivery', 'taxi', 'footer',
];

const DEFAULT_THEME = { primary: '#7c3aed', dark: true };

// ─── escape ───────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ─── validation ───────────────────────────────────────────────

/** Нормализовать структуру от AI: выкинуть мусор, подставить дефолты. */
export function validateStructure(raw) {
  const fallback = { site: { name: 'Сайт', description: '', theme: { ...DEFAULT_THEME }, pages: [{ name: 'Home', sections: [] }] } };
  if (!raw || typeof raw !== 'object') return fallback;
  const site = raw.site && typeof raw.site === 'object' ? raw.site : {};
  const theme = site.theme && typeof site.theme === 'object' ? site.theme : {};
  const primary = /^#[0-9a-fA-F]{6}$/.test(theme.primary || '') ? theme.primary : DEFAULT_THEME.primary;
  let pages = Array.isArray(site.pages) ? site.pages : [];
  pages = pages.slice(0, 5).map((p) => ({
    name: String(p?.name || 'Home').slice(0, 60),
    sections: Array.isArray(p?.sections)
      ? p.sections.slice(0, 20).map((s) => ({
        type: SECTION_TYPES.includes(s?.type) ? s.type : 'about',
        title: String(s?.title || '').slice(0, 200),
        description: String(s?.description || '').slice(0, 1000),
        buttons: Array.isArray(s?.buttons) ? s.buttons.slice(0, 3).map((b) => String(b).slice(0, 60)) : [],
        items: Array.isArray(s?.items) ? s.items.slice(0, 12).map((it) => String(it).slice(0, 200)) : [],
        image: String(s?.image || '').slice(0, 500),
        background: String(s?.background || '').slice(0, 100),
      }))
      : [],
  }));
  if (!pages.length) pages = fallback.site.pages;
  return {
    site: {
      name: String(site.name || 'Сайт').slice(0, 80),
      description: String(site.description || '').slice(0, 300),
      theme: { primary, dark: theme.dark !== false },
      pages,
      // Признак импортированного сайта: ручной редактор полей отключён,
      // правки — только через AI или модули (иначе компиляция затёрла бы HTML)
      ...(site.imported ? { imported: true } : {}),
    },
  };
}

/**
 * Поднять/опустить секцию страницы 0: вернуть НОВУЮ структуру,
 * где секция idx меняется местами с соседом (dir: -1 вверх, +1 вниз).
 * За границами списка или dir=0 — исходная ссылка: вызывающий
 * не создаёт «пустую» версию проекта.
 */
export function swapSections(structure, idx, dir) {
  const base = validateStructure(structure);
  const list = base.site.pages[0].sections;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return structure;
  const target = idx + dir;
  if (!Number.isInteger(target) || target < 0 || target >= list.length || target === idx) return structure;
  const tmp = list[idx];
  list[idx] = list[target];
  list[target] = tmp;
  return base;
}

/** Модули Karta-AD, которые подключаются к каждому сайту автоматически. */
export const KARTA_MODULE_SECTIONS = [
  { type: 'products', title: 'Каталог' },
  { type: 'delivery', title: 'Доставка Karta-AD' },
  { type: 'taxi', title: 'Такси Karta-AD' },
  { type: 'contact', title: 'Контакты' },
  { type: 'map', title: 'Как нас найти' },
];

const MAX_SECTIONS = 20;

/**
 * Дописать недостающие модули Karta-AD в первый пейдж структуры.
 * AI о них может не знать, а бизнесу они нужны сразу: доставка, такси,
 * контакты и карта. Уже добавленные секции не трогаем, импортированный
 * сайт (ручной HTML) не меняем.
 */
export function withKartaModules(structure, { products = [] } = {}) {
  const clean = validateStructure(structure);
  if (clean.site.imported) return clean;

  const pages = clean.site.pages.map((p, idx) => {
    if (idx !== 0) return p; // компилируется только первый пейдж
    const present = new Set(p.sections.map((s) => s.type));
    const needed = KARTA_MODULE_SECTIONS.filter((m) => {
      if (m.type === 'products' && !(products?.length)) return false;
      return !present.has(m.type);
    });
    if (!needed.length) return p;
    const room = Math.max(0, MAX_SECTIONS - p.sections.length);
    const added = needed.slice(0, room).map((m) => ({
      type: m.type,
      title: m.title,
      description: '',
      buttons: [],
      items: [],
      image: '',
      background: '',
    }));
    return { ...p, sections: [...p.sections, ...added] };
  });

  return { site: { ...clean.site, pages } };
}

/** Извлечь { site } из ответа модели (JSON в fences или голый). */
export function extractSiteJson(raw) {
  if (!raw) return null;
  const s = String(raw);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fence ? fence[1] : s).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    const withSite = parsed?.site ? parsed : { site: parsed };
    return validateStructure(withSite);
  } catch {
    return null;
  }
}

// ─── compile: structure → single HTML ─────────────────────────

function sectionHtml(sec, biz, theme, cfg, appOrigin = '') {
  const t = sec.title ? `<h2>${esc(sec.title)}</h2>` : '';
  const d = sec.description ? `<p class="muted">${esc(sec.description)}</p>` : '';
  const btns = (sec.buttons || []).map((b) => `<a class="btn" href="#contact">${esc(b)}</a>`).join('');
  const items = (sec.items || []).map((it) => `<li>${esc(it)}</li>`).join('');
  const bg = sec.background ? ` style="background:${esc(sec.background)}"` : '';
  const wrap = (inner, cls = '') => `<section class="block ${cls}"${bg}>${inner}</section>`;
  const pic = sec.image ? `<img class="pic" src="${esc(sec.image)}" alt="" loading="lazy">` : '';

  switch (sec.type) {
    case 'hero':
      return `<header class="hero"${bg}>${pic}<h1>${esc(sec.title || biz.name)}</h1>${d}<div class="row">${btns || `<a class="btn" href="#contact">Связаться</a>`}</div></header>`;
    case 'features':
      return wrap(`${t}${d}${items ? `<ul class="grid">${items}</ul>` : ''}`);
    case 'products': {
      const list = (biz.products?.length ? biz.products : (sec.items || []).map((name) => ({ name }))).slice(0, 12);
      const hasShop = !!cfg;
      const cards = list
        .map((p, i) => `<div class="card"><b>${esc(p.name)}</b>${p.price != null ? `<span>${esc(p.price)} сом</span>` : ''}${hasShop ? `<button class="addbtn" data-i="${i}">+ В корзину</button>` : ''}</div>`)
        .join('');
      const cart = hasShop ? `<div id="cartbar" style="display:none"><span id="cartinfo"></span><button id="checkoutbtn">Оформить</button></div>
<div id="checkout" style="display:none">
<h3>Оформление заказа</h3>
<input id="co_name" placeholder="Имя" autocomplete="name">
<input id="co_phone" placeholder="Телефон" inputmode="tel" autocomplete="tel">
<input id="co_addr" placeholder="Адрес доставки">
<button type="button" id="co_mapbtn" style="background:transparent;border:2px dashed currentColor;padding:9px;color:inherit">📍 Указать адрес на карте</button>
<div id="co_map" style="display:none;height:220px;border-radius:12px;overflow:hidden"></div>
<div class="row"><label><input type="radio" name="dtype" value="delivery" checked> Доставка</label><label><input type="radio" name="dtype" value="pickup"> Самовывоз</label></div>
<div class="row"><label><input type="radio" name="pm" value="cash" checked> Оплата при получении</label><label><input type="radio" name="pm" value="card" disabled> Картой · скоро</label></div>
<button id="sendorder">Заказать</button>
<p id="ordermsg" class="muted"></p>
</div>` : '';
      return wrap(`${t || '<h2>Каталог</h2>'}${d}<div class="cards">${cards || '<p class="muted">Товары скоро появятся</p>'}</div>${cart}`);
    }
    case 'services':
      return wrap(`${t}${d}${items ? `<ul class="list">${items}</ul>` : ''}`);
    case 'about':
      return wrap(`${pic}${t}${d}`);
    case 'gallery':
      return wrap(`${t}${d}${pic || '<p class="muted">📷 Фото скоро появятся</p>'}`);
    case 'reviews':
      return wrap(`${t || '<h2>Отзывы</h2>'}${d || '<p class="muted">⭐ Оценки покупателей Karta-AD</p>'}`);
    case 'map':
      return wrap(`${t || '<h2>Как нас найти</h2>'}${biz.address ? `<p>📍 ${esc(biz.address)}</p>` : ''}${d}<p><a class="btn" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(biz.address || biz.name)}" target="_blank" rel="noreferrer">Открыть карту</a></p>`);
    case 'contact': {
      const wa = biz.phone ? biz.phone.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7') : '';
      return wrap(`<div id="contact">${t || '<h2>Контакты</h2>'}${biz.phone ? `<p>📞 <a href="tel:${esc(biz.phone)}">${esc(biz.phone)}</a></p>` : ''}${wa ? `<p><a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noreferrer">💬 WhatsApp</a></p>` : ''}${biz.address ? `<p>📍 ${esc(biz.address)}</p>` : ''}${d}${btns}</div>`);
    }
    case 'delivery': {
      // Автоматический модуль доставки должен быть рабочим: если есть корзина —
      // ведём в оформление, иначе звоним на телефон бизнеса
      const auto = !btns && cfg
        ? '<p><a class="btn" href="#checkout">Оформить доставку</a></p>'
        : (!btns && biz.phone ? `<p><a class="btn" href="tel:${esc(biz.phone)}">Заказать доставку</a></p>` : '');
      return wrap(`${t || '<h2>Доставка Karta-AD</h2>'}${d || '<p class="muted">🚚 Быстрая доставка по городу через Karta-AD Delivery</p>'}${auto}${btns}`);
    }
    case 'taxi': {
      // Ссылка только абсолютная и в новой вкладке: сайт показывается в
      // iframe с sandbox="allow-scripts", у него origin null — переход внутри
      // фрейма ломает превью (CORS на модулях приложения)
      const auto = !btns && appOrigin
        ? `<p><a class="btn" href="${esc(appOrigin)}/taxi" target="_blank" rel="noreferrer">Вызвать такси Karta-AD</a></p>`
        : (!btns ? '<p class="muted">🚕 Такси Karta-AD — во вкладке «Такси» приложения</p>' : '');
      return wrap(`${t || '<h2>Такси Karta-AD</h2>'}${d || '<p class="muted">🚕 Подача рядом, цена видна сразу — во вкладке «Такси» приложения Karta-AD</p>'}${auto}${btns}`);
    }
    case 'footer':
      return `<footer>${t || `<b>${esc(biz.name)}</b>`}${d}</footer>`;
    default:
      return wrap(`${t}${d}`);
  }
}

/** Собрать полный HTML из структуры + данных бизнеса. Чистая функция. */
export function compileSite(structured, biz = {}, opts = {}) {
  const { site } = validateStructure(structured);
  const theme = site.theme;
  const page = site.pages[0];
  const b = {
    name: biz.name || site.name,
    phone: biz.phone || '',
    address: [biz.city, biz.address].filter(Boolean).join(', '),
    products: biz.products || [],
  };
  // Магазин: корзина и заказ работают только с backend-конфигом
  const cfg = (opts.supabaseUrl && opts.anonKey && (biz.id || biz.business_id))
    ? {
        supabaseUrl: opts.supabaseUrl,
        anonKey: opts.anonKey,
        businessId: biz.id || biz.business_id,
        preview: !!opts.preview,
      }
    : null;
  const nav = page.sections
    .filter((s) => s.title)
    .slice(0, 6)
    .map((s, i) => `<a href="#s${i}">${esc(s.title)}</a>`)
    .join('');
  const body = page.sections
    .map((s, i) => `<div id="s${i}">${sectionHtml(s, b, theme, cfg, opts.appOrigin || '')}</div>`)
    .join('\n');
  const cartScript = cfg ? cartJs(cfg, b.products) : '';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(site.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.55;background:${theme.dark ? '#0f172a' : '#f8fafc'};color:${theme.dark ? '#e2e8f0' : '#0f172a'}}
nav{position:sticky;top:0;display:flex;gap:14px;align-items:center;padding:12px 16px;background:${theme.dark ? 'rgba(15,23,42,.92)' : 'rgba(255,255,255,.92)'};backdrop-filter:blur(8px);border-bottom:1px solid ${theme.dark ? '#1e293b' : '#e2e8f0'};overflow-x:auto}
nav b{color:${theme.primary};white-space:nowrap}
nav a{color:${theme.dark ? '#cbd5e1' : '#475569'};text-decoration:none;font-size:14px;white-space:nowrap}
.hero{padding:56px 20px;text-align:center;background:linear-gradient(135deg,${theme.primary},#4f46e5);color:#fff}
.hero h1{font-size:32px;margin-bottom:10px}
.hero p{opacity:.9;max-width:560px;margin:0 auto 18px}
.pic{width:100%;max-height:280px;object-fit:cover;border-radius:14px;margin-bottom:14px;display:block}
.block{padding:32px 20px;max-width:720px;margin:0 auto}
.block h2{font-size:22px;margin-bottom:8px}
.muted{color:${theme.dark ? '#94a3b8' : '#64748b'}}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-block;background:${theme.primary};color:#fff !important;padding:11px 22px;border-radius:12px;text-decoration:none;font-weight:700;margin-top:10px}
.grid{list-style:none;display:grid;gap:8px;margin-top:12px;padding:0}
.grid li{background:${theme.dark ? '#1e293b' : '#fff'};border:1px solid ${theme.dark ? '#334155' : '#e2e8f0'};border-radius:12px;padding:12px}
.list{margin:12px 0 0 18px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:12px}
.card{background:${theme.dark ? '#1e293b' : '#fff'};border:1px solid ${theme.dark ? '#334155' : '#e2e8f0'};border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px}
.card span{color:${theme.primary};font-weight:800}
.addbtn{margin-top:6px;background:${theme.primary};color:#fff;border:none;border-radius:10px;padding:8px;font-weight:700;cursor:pointer}
#cartbar{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 16px;background:${theme.dark ? '#1e293b' : '#fff'};border-top:2px solid ${theme.primary};font-weight:800}
#cartbar button{background:${theme.primary};color:#fff;border:none;border-radius:10px;padding:10px 18px;font-weight:800;cursor:pointer}
#checkout{padding:20px;max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
#checkout input{padding:11px;border-radius:10px;border:1px solid ${theme.dark ? '#334155' : '#cbd5e1'};background:${theme.dark ? '#0f172a' : '#fff'};color:inherit;font-size:15px}
#checkout button{background:${theme.primary};color:#fff;border:none;border-radius:12px;padding:12px;font-weight:800;cursor:pointer;font-size:15px}
footer{padding:24px 20px;text-align:center;color:${theme.dark ? '#64748b' : '#94a3b8'};font-size:13px;border-top:1px solid ${theme.dark ? '#1e293b' : '#e2e8f0'}}
</style>
</head>
<body>
<nav><b>${esc(site.name)}</b>${nav}</nav>
${body}
${cartScript}
</body>
</html>`;
}

/** JS корзины и оформления заказа (инлайн, без внешних зависимостей). */
function cartJs(cfg, products) {
  const items = (products || []).slice(0, 12).map((p) => ({
    id: p.id || null,
    name: String(p.name || ''),
    price: Number(p.price || 0),
  }));
  const dataJson = JSON.stringify({ items }).replace(/</g, '\\u003c');
  const cfgJson = JSON.stringify({
    url: cfg.supabaseUrl,
    key: cfg.anonKey,
    businessId: cfg.businessId,
    preview: cfg.preview,
  }).replace(/</g, '\\u003c');
  return `<script>
(function(){
var CFG = ${cfgJson};
var DATA = ${dataJson};
var cart = {};
var geo = { lat: null, lng: null };
function money(n){ return new Intl.NumberFormat('ru-RU').format(n) + ' сом'; }
function count(){ var n = 0; for (var k in cart) n += cart[k]; return n; }
function total(){ var s = 0; for (var k in cart) { var p = DATA.items[+k]; if (p) s += p.price * cart[k]; } return s; }
function openMap(){
  var box = document.getElementById('co_map');
  var trigger = document.getElementById('co_mapbtn');
  if (!box) return;
  box.style.display = 'block';
  if (trigger) trigger.style.display = 'none';
  function init(){
    var L = window.L;
    if (!L) { box.textContent = 'Карта не загрузилась — введи адрес текстом'; return; }
    var map = L.map(box).setView([38.5581, 68.7738], 13);
    L.tileLayer(${JSON.stringify(cartoRaster('rastertiles/voyager'))}, { maxZoom: 19, attribution: ${JSON.stringify(CARTO_ATTRIBUTION)} }).addTo(map);
    var mk = null;
    map.on('click', function(ev){
      geo.lat = Math.round(ev.latlng.lat * 1e6) / 1e6;
      geo.lng = Math.round(ev.latlng.lng * 1e6) / 1e6;
      if (mk) mk.setLatLng(ev.latlng); else mk = L.marker(ev.latlng).addTo(map);
      fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + geo.lat + '&lon=' + geo.lng + '&zoom=18&accept-language=ru')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ if (j && j.display_name) document.getElementById('co_addr').value = j.display_name; })
        .catch(function(){});
    });
  }
  if (window.L) { init(); return; }
  if (!document.getElementById('kwlfcss')) {
    var link = document.createElement('link');
    link.id = 'kwlfcss'; link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (!document.getElementById('kwlfjs')) {
    var sc = document.createElement('script');
    sc.id = 'kwlfjs'; sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    sc.onload = init;
    sc.onerror = function(){ box.textContent = 'Карта не загрузилась — введи адрес текстом'; };
    document.head.appendChild(sc);
  }
}
function render(){
  var bar = document.getElementById('cartbar');
  if (!bar) return;
  if (!count()) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('cartinfo').textContent = '🛒 ' + count() + ' · ' + money(total());
}
document.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('.addbtn') : null;
  if (b && b.dataset.i != null) {
    var i = +b.dataset.i;
    cart[i] = Math.min(99, (cart[i] || 0) + 1);
    render();
  }
  if (e.target && e.target.id === 'checkoutbtn') {
    var f = document.getElementById('checkout');
    f.style.display = f.style.display === 'none' ? 'flex' : 'none';
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (e.target && e.target.id === 'co_mapbtn') openMap();
});
document.addEventListener('click', function(e){
  if (!e.target || e.target.id !== 'sendorder') return;
  var msg = document.getElementById('ordermsg');
  var name = document.getElementById('co_name').value.trim();
  var phone = document.getElementById('co_phone').value.trim();
  var addr = document.getElementById('co_addr').value.trim();
  var dtype = 'delivery';
  try { dtype = document.querySelector('input[name="dtype"]:checked').value || 'delivery'; } catch (err) {}
  var pm = 'cash';
  try { pm = document.querySelector('input[name="pm"]:checked').value || 'cash'; } catch (err) {}
  if (!count()) { msg.textContent = 'Корзина пуста'; return; }
  if (CFG.preview) { msg.textContent = 'Демо-режим: заказы работают на опубликованном сайте'; return; }
  if (!name || !phone) { msg.textContent = 'Укажи имя и телефон'; return; }
  msg.textContent = 'Отправляю…';
  var isPickup = dtype === 'pickup';
  // Цены не отправляем: сервер (create_store_order) берёт их из каталога,
  // сам считает доставку, проверяет остатки, мин. сумму и rate-limit.
  var items = Object.keys(cart).map(function(k){
    return { product_id: DATA.items[+k].id, quantity: cart[k] };
  });
  var RU = {
    bad_items:'Корзина пуста или слишком велика', bad_phone:'Проверьте номер телефона',
    bad_quantity:'Недопустимое количество товара', bad_payment_method:'Способ оплаты не поддерживается',
    business_unavailable:'Магазин временно не принимает заказы',
    unknown_product:'Один из товаров больше не продаётся', out_of_stock:'Товар закончился',
    min_order_not_met:'Не достигнута минимальная сумма заказа',
    too_many_orders:'Слишком много заказов — попробуйте чуть позже'
  };
  var headers = { 'Content-Type': 'application/json', 'apikey': CFG.key, 'Authorization': 'Bearer ' + CFG.key };
  fetch(CFG.url + '/rest/v1/rpc/create_store_order', {
    method: 'POST', headers: headers,
    body: JSON.stringify({
      p_business_id: CFG.businessId,
      p_items: items,
      p_customer: { name: name, phone: phone, notes: '' },
      p_delivery: {
        type: isPickup ? 'pickup' : 'delivery',
        address: isPickup ? '' : (addr || ''),
        lat: (isPickup || geo.lat == null) ? null : geo.lat,
        lng: (isPickup || geo.lng == null) ? null : geo.lng
      },
      p_payment_method: pm === 'card' ? 'card' : 'cash'
    })
  }).then(function(r){
    if (!r.ok) return r.text().then(function(t){
      var m = t;
      try { m = JSON.parse(t).message || t; } catch (e2) {}
      var code = Object.keys(RU).filter(function(c){ return String(m).indexOf(c) >= 0; })[0];
      throw new Error(code ? RU[code] : 'Не удалось отправить заказ (HTTP ' + r.status + ')');
    });
    return r.json();
  }).then(function(res){
    cart = {}; render();
    document.getElementById('checkout').style.display = 'none';
    msg.textContent = '';
    alert('Заказ принят! Номер: ' + String(res.order_id).slice(0, 8) + ' · К оплате: ' + money(res.total));
  }).catch(function(err){
    msg.textContent = (err && err.message) || 'Не удалось отправить. Позвони нам напрямую.';
  });
});
render();
})();
</script>`;
}

// ─── AI prompts ───────────────────────────────────────────────

export const QUICK_TEMPLATES = [
  { icon: '🛒', label: 'Магазин', prompt: 'Создай интернет-магазин с каталогом товаров, корзиной-заглушкой, доставкой и контактами' },
  { icon: '🚕', label: 'Такси', prompt: 'Создай сайт службы такси: hero с вызовом, тарифы, как заказать через Karta-AD, контакты' },
  { icon: '🍔', label: 'Ресторан', prompt: 'Создай сайт ресторана: меню, about, галерея, отзывы, карта и контакты' },
  { icon: '🏢', label: 'Компания', prompt: 'Создай корпоративный сайт компании: hero, услуги, about, отзывы, контакты' },
  { icon: '💼', label: 'Услуги', prompt: 'Создай сайт услуг: список услуг с ценами, about, отзывы, контакты' },
  { icon: '🎓', label: 'Образование', prompt: 'Создай сайт учебного центра: курсы, about, отзывы, контакты' },
  { icon: '🏨', label: 'Отель', prompt: 'Создай сайт отеля: hero, номера-услуги, галерея, отзывы, карта и контакты' },
  { icon: '📱', label: 'IT Startup', prompt: 'Создай лендинг IT-стартапа: hero, features, about, контакты' },
];

const BIZ_LINE = (biz) => `Бизнес: «${biz.name || ''}», тип: ${biz.type || ''}, город: ${biz.city || ''}, адрес: ${biz.address || ''}, телефон: ${biz.phone || ''}.
Товары: ${(biz.products || []).slice(0, 12).map((p) => `${p.name} — ${p.price} сом`).join('; ') || 'нет'}.`;

export const STRUCTURE_SYSTEM = (biz) => `Ты — веб-архитектор. Проектируешь структуру сайта и возвращаешь СТРОГО JSON:
{"site":{"name":"","description":"","theme":{"primary":"#7c3aed","dark":true},"pages":[{"name":"Home","sections":[{"type":"","title":"","description":"","buttons":[],"items":[]}]}]}}
Типы sections: hero, features, products, services, about, gallery, reviews, map, contact, delivery, taxi, footer.
${BIZ_LINE(biz)}
Правила: 4-8 секций, hero первой, contact/footer в конце, products только если есть товары, delivery/taxi/map — только если просят или уместно. Только JSON, без объяснений и markdown.`;

export const STRUCTURE_EDIT_SYSTEM = `Ты — веб-архитектор. Дана ТЕКУЩАЯ структура сайта (JSON) и правка. Верни ПОЛНУЮ обновлённую структуру тем же JSON-форматом {"site":{...}}. Меняй только то, чего касается правка. Только JSON, без объяснений.`;

export function buildStructureMessages(biz, prompt, products) {
  return [
    { role: 'system', content: STRUCTURE_SYSTEM({ ...biz, products }) },
    { role: 'user', content: prompt },
  ];
}

export function buildStructureEditMessages(structure, prompt) {
  return [
    { role: 'system', content: STRUCTURE_EDIT_SYSTEM },
    { role: 'user', content: `ТЕКУЩАЯ СТРУКТУРА:\n${JSON.stringify(structure).slice(0, 12000)}\n\nПРАВКА: ${prompt}` },
  ];
}
