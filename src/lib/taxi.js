import {
  Car, Sparkles, Wind, Truck, Ban, Bike, Package, Route, Zap, Boxes, Crown,
} from 'lucide-react';

// ─── ТАРИФЫ ──────────────────────────────────────────────────────────────────
// Единый источник правды для UI. Цены зеркалят RPC calculate_taxi_price в БД.
export const TARIFFS = [
  { id: 'economy',     icon: Car,     label: 'Эконом',      short: 'Эконом',  color: 'bg-amber-500',  gradient: 'from-amber-400 to-orange-500', seats: 4, desc: '1-4 чел. · бюджетно' },
  { id: 'comfort',     icon: Sparkles,label: 'Комфорт',     short: 'Комфорт', color: 'bg-blue-500',   gradient: 'from-blue-400 to-blue-600',   seats: 4, desc: '1-4 чел. · иномарка' },
  { id: 'comfort_plus',icon: Wind,    label: 'Комфорт+',    short: 'Комфорт+',color: 'bg-indigo-500', gradient: 'from-indigo-400 to-indigo-600', seats: 4, desc: '1-4 чел. · новое авто' },
  { id: 'business',    icon: Crown,   label: 'Бизнес',      short: 'Бизнес',  color: 'bg-slate-800',  gradient: 'from-slate-600 to-slate-900', seats: 3, desc: '1-3 чел. · премиум' },
  { id: 'minivan',     icon: Truck,   label: 'Минивэн',     short: 'Минивэн', color: 'bg-orange-500', gradient: 'from-orange-400 to-orange-600', seats: 7, desc: 'до 7 чел.' },
  { id: 'electric',    icon: Zap,     label: 'Электро',     short: 'Электро', color: 'bg-lime-500',   gradient: 'from-lime-400 to-lime-600',   seats: 4, desc: '1-4 чел. · эко' },
  { id: 'women',       icon: Ban,     label: 'Для женщин',  short: 'Женщинам',color: 'bg-pink-500',   gradient: 'from-pink-400 to-pink-600',   seats: 4, desc: 'Женщина-водитель' },
  { id: 'cargo',       icon: Boxes,   label: 'Грузовой',    short: 'Груз',    color: 'bg-slate-500',  gradient: 'from-slate-500 to-slate-700', seats: 2, desc: 'Грузоперевозки' },
  { id: 'delivery',    icon: Package, label: 'Доставка',    short: 'Доставка',color: 'bg-emerald-500',gradient: 'from-emerald-400 to-emerald-600', seats: 0, desc: 'Посылки до 5 кг' },
  { id: 'courier',     icon: Bike,    label: 'Курьер',      short: 'Курьер',  color: 'bg-teal-500',   gradient: 'from-teal-400 to-teal-600',   seats: 0, desc: 'Быстрая доставка' },
  { id: 'intercity',   icon: Route,   label: 'Межгород',    short: 'Межгород',color: 'bg-purple-500', gradient: 'from-purple-400 to-purple-600', seats: 4, desc: 'Между городами' },
];

// Основные тарифы показываются пассажиру (без служебных women/cargo)
export const PASSENGER_TARIFFS = TARIFFS.filter(t =>
  ['economy', 'comfort', 'comfort_plus', 'business', 'minivan', 'delivery', 'courier', 'intercity'].includes(t.id)
);

export const CATEGORY_LABELS = Object.fromEntries(TARIFFS.map(t => [t.id, t.label]));

export const TAXI_COMMISSION = 0.2;

// Тарифные коэффициенты (зеркало RPC calculate_taxi_price)
const RATES = {
  economy:     { base: 5,  perKm: 1.5,  perMin: 0.3, min: 7  },
  comfort:     { base: 8,  perKm: 2.0,  perMin: 0.3, min: 10 },
  comfort_plus:{ base: 12, perKm: 2.5,  perMin: 0.3, min: 15 },
  minivan:     { base: 15, perKm: 2.8,  perMin: 0.3, min: 18 },
  business:    { base: 20, perKm: 3.5,  perMin: 0.3, min: 25 },
  electric:    { base: 7,  perKm: 1.6,  perMin: 0.3, min: 8  },
  women:       { base: 6,  perKm: 1.8,  perMin: 0.3, min: 8  },
  cargo:       { base: 18, perKm: 3.0,  perMin: 0.3, min: 20 },
  delivery:    { base: 4,  perKm: 1.8,  perMin: 0.3, min: 6  },
  courier:     { base: 5,  perKm: 2.0,  perMin: 0.3, min: 7  },
  intercity:   { base: 40, perKm: 2.2,  perMin: 0.5, min: 50 },
};

export const CITY_SPEED_KMH = 22; // средняя скорость по городу для оценки времени
export const DRIVER_MATCH_RADIUS_KM = 12; // радиус рассылки заказов водителям

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function estimateRide(aLat, aLng, bLat, bLng) {
  const km = haversineKm(aLat, aLng, bLat, bLng);
  if (km == null) return null;
  return {
    distanceKm: km,
    durationMin: Math.max(2, Math.round((km / CITY_SPEED_KMH) * 60 + 3)),
  };
}

export function isNight(hour = new Date().getHours()) {
  return hour >= 23 || hour < 6;
}

// Клиентское зеркало calculate_taxi_price (округление вверх до 0.5)
export function calcPrice({ distanceKm, durationMin, category = 'economy', demandCoef = 1, night = false }) {
  const r = RATES[category] || RATES.economy;
  const raw = (r.base + r.perKm * distanceKm + r.perMin * durationMin) * (night ? 1.5 : 1) * demandCoef;
  const total = Math.max(raw, r.min * demandCoef);
  return Math.ceil(total * 2) / 2;
}

export function formatTJS(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function demandLabel(coef) {
  const c = Number(coef) || 1;
  if (c >= 2) return { label: 'Очень высокий спрос', tone: 'text-red-500 bg-red-50 dark:bg-red-900/20', badge: '🔥' };
  if (c >= 1.5) return { label: 'Высокий спрос', tone: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20', badge: '⚡' };
  if (c > 1) return { label: 'Повышенный спрос', tone: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20', badge: '📈' };
  return { label: 'Обычный спрос', tone: 'text-slate-500 bg-slate-50 dark:bg-slate-800/50', badge: '·' };
}

export function tariffById(id) {
  return TARIFFS.find(t => t.id === id) || TARIFFS[0];
}

// ETA подачи: мин из расстояния до ближайшей машины
export function pickupEtaMin(nearestKm) {
  if (nearestKm == null) return null;
  return Math.max(1, Math.round((nearestKm / 30) * 60 + 2));
}

// Статусы водителя
export const DRIVER_STATUS_CONFIG = {
  offline: { label: 'Не в сети', dot: 'bg-slate-400', text: 'text-slate-500' },
  online: { label: 'На линии', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  free: { label: 'Свободен', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  assigned: { label: 'Еду к клиенту', dot: 'bg-amber-400', text: 'text-amber-600' },
  en_route: { label: 'Еду к клиенту', dot: 'bg-amber-400', text: 'text-amber-600' },
  arrived: { label: 'Клиент в машине', dot: 'bg-blue-500', text: 'text-blue-600' },
  riding: { label: 'Выполняю заказ', dot: 'bg-indigo-500', text: 'text-indigo-600' },
  waiting: { label: 'Ожидание', dot: 'bg-blue-400', text: 'text-blue-500' },
};

// Порядок шагов заказа для водителя
export const ORDER_STEPS = ['found', 'arrived', 'riding', 'completed', 'payment', 'rated'];
