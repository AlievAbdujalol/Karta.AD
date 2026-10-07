/**
 * wizardConfig.js — чистая логика визарда «Создать сайт с помощью AI» (7 шагов).
 * Никаких React/supabase: только данные, валидация, сборка промпта и payload
 * website_settings. Покрыто тестами (wizardConfig.test.js).
 */
import { SITE_THEMES, DEFAULT_THEME_ID, getTheme } from '@/lib/siteThemes';

// ─── шаги ─────────────────────────────────────────────────────
export const WIZARD_STEPS = [
  { id: 'type', title: 'Тип сайта', hint: 'Кто вы и что продаёте' },
  { id: 'style', title: 'Стиль оформления', hint: 'Выберите визуальный стиль' },
  { id: 'info', title: 'Информация о компании', hint: 'Название и чем занимаетесь' },
  { id: 'products', title: 'Товары', hint: 'Что показать в каталоге' },
  { id: 'delivery', title: 'Доставка', hint: 'Как отдаёте заказы' },
  { id: 'payment', title: 'Оплата', hint: 'Как принимаете деньги' },
  { id: 'prompt', title: 'Пожелания', hint: 'Финальные правки для AI' },
];

export const SITE_TYPES = [
  { id: 'shop', label: 'Интернет-магазин' },
  { id: 'restaurant', label: 'Ресторан / кафе' },
  { id: 'clothing', label: 'Одежда и обувь' },
  { id: 'electronics', label: 'Электроника' },
  { id: 'cosmetics', label: 'Косметика' },
  { id: 'grocery', label: 'Продукты' },
  { id: 'services', label: 'Услуги' },
  { id: 'other', label: 'Другое' },
];

export const DELIVERY_MODES = [
  { id: 'fixed', label: 'Фиксированная цена' },
  { id: 'free', label: 'Бесплатная' },
  { id: 'distance', label: 'По расстоянию' },
];

export const PAYMENT_PROVIDERS = [
  { id: 'cash', label: 'Наличными при получении' },
  { id: 'card', label: 'Картой при получении' },
  { id: 'alif', label: 'Alif Pay' },
  { id: 'eskhata', label: 'Эсхата Pay' },
  { id: 'dushanbe_city', label: 'Dushanbe City' },
];

// ─── дефолты ──────────────────────────────────────────────────
export function wizardDefaults(biz = {}) {
  return {
    siteType: 'shop',
    style: DEFAULT_THEME_ID,
    heroTitle: String(biz.name || '').slice(0, 80),
    heroDescription: String(biz.description || '').slice(0, 300),
    productIds: [], // пусто = все товары бизнеса
    delivery: { enabled: true, mode: 'fixed', price: 10, minOrder: 0, radiusKm: 10 },
    payment: { cod: true, online: false, providers: ['cash'] },
    prompt: '',
  };
}

// ─── валидация шагов ──────────────────────────────────────────
const errors = (list) => list.filter(Boolean);

/** Ошибки конкретного шага; пустой массив = шаг валиден. */
export function validateWizardStep(stepId, state) {
  switch (stepId) {
    case 'type':
      return errors([SITE_TYPES.some((t) => t.id === state.siteType) ? '' : 'Выберите тип сайта']);
    case 'style':
      return errors([SITE_THEMES.some((t) => t.id === state.style) ? '' : 'Выберите стиль оформления']);
    case 'info':
      return errors([
        state.heroTitle.trim() ? '' : 'Укажите название сайта',
        state.heroDescription.trim() ? '' : 'Кратко опишите, чем занимаетесь',
      ]);
    case 'products':
      return []; // пустой выбор = все товары
    case 'delivery':
      return validateDelivery(state.delivery);
    case 'payment':
      return validatePayment(state.payment);
    case 'prompt':
      return state.prompt.length > 1000 ? ['Пожелания — не длиннее 1000 символов'] : [];
    default:
      return [];
  }
}

function validateDelivery(d = {}) {
  if (!d.enabled) return [];
  if (!DELIVERY_MODES.some((m) => m.id === d.mode)) return ['Выберите способ расчёта доставки'];
  const price = Number(d.price);
  const minOrder = Number(d.minOrder);
  const radiusKm = Number(d.radiusKm);
  return errors([
    d.mode === 'distance' || (Number.isFinite(price) && price >= 0) ? '' : 'Стоимость доставки — неотрицательное число',
    Number.isFinite(minOrder) && minOrder >= 0 ? '' : 'Минимальная сумма заказа — неотрицательное число',
    Number.isFinite(radiusKm) && radiusKm > 0 && radiusKm <= 100 ? '' : 'Радиус доставки: 1–100 км' ,
  ]);
}

function validatePayment(p = {}) {
  const list = Array.isArray(p.providers) ? p.providers : [];
  if (!p.cod && !p.online) return ['Выберите хотя бы один способ оплаты'];
  if (!list.length) return ['Отметьте способы оплаты'];
  const bad = list.filter((id) => !PAYMENT_PROVIDERS.some((x) => x.id === id));
  return errors([bad.length ? `Неизвестные способы оплаты: ${bad.join(', ')}` : '']);
}

/** Валидация всех шагов: { stepId: errors[] } только с непустыми списками. */
export function validateWizard(state) {
  const out = {};
  for (const step of WIZARD_STEPS) {
    const list = validateWizardStep(step.id, state);
    if (list.length) out[step.id] = list;
  }
  return out;
}

export function isWizardValid(state) {
  return Object.keys(validateWizard(state)).length === 0;
}

// ─── payload website_settings ─────────────────────────────────
/** Состояние визарда → строка для upsert в website_settings. */
export function wizardToSettings(state, bizId) {
  const d = state.delivery;
  const p = state.payment;
  const online = !!p.online;
  return {
    business_id: bizId,
    site_type: state.siteType,
    style: state.style,
    font: getTheme(state.style).font,
    hero_title: state.heroTitle.trim().slice(0, 80),
    hero_description: state.heroDescription.trim().slice(0, 300),
    show_delivery: !!d.enabled,
    show_payment: p.cod || online,
    delivery: {
      enabled: !!d.enabled,
      mode: d.mode,
      price: Number(d.price) || 0,
      min_order: Number(d.minOrder) || 0,
      radius_km: Number(d.radiusKm) || 0,
    },
    payment: {
      cod: !!p.cod,
      online,
      providers: [...p.providers],
    },
    prompt: String(state.prompt || '').slice(0, 1000),
  };
}

// ─── промпт для генерации ─────────────────────────────────────
/**
 * Собрать промпт для AI из ответов визарда: тип, стиль, инфо,
 * пожелания. Товары/доставка/оплата идут в контекст бизнеса и
 * настройки сайта отдельно, в промпт не дублируются.
 */
export function buildWizardPrompt(state, biz = {}) {
  const typeLabel = SITE_TYPES.find((t) => t.id === state.siteType)?.label || 'Сайт';
  const theme = getTheme(state.style);
  const parts = [
    `Создай сайт: ${typeLabel.toLowerCase()} «${state.heroTitle.trim() || biz.name || 'Бизнес'}».`,
    state.heroDescription.trim() && `О бизнесе: ${state.heroDescription.trim()}`,
    `Оформление: ${theme.label} (${theme.description.toLowerCase()}).`,
    state.prompt.trim() && `Пожелания: ${state.prompt.trim()}`,
    'Нужны: каталог товаров с корзиной, форма заказа с доставкой, контакты.',
  ];
  return parts.filter(Boolean).join(' ');
}
