import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

// Настройки навигатора и курсоры — единый источник для страницы
// «Кастомизация навигатора» (/settings/navigator) и карты.
// Раньше cursor_style только сохранялся: карта его не читала, строка
// «Классический курсор» вообще нельзя было выбрать обратно, а upsert
// падал целиком из-за несуществующей колонки voice_uri.

export const AVAILABLE = [
  { id: 'kamaz', label: 'KAMAZ', icon: '🚚' },
  { id: 'love_car', label: 'Машина любви', icon: '❤️' },
  { id: 'blin', label: 'Блин', icon: '🥞' },
  { id: 'kabrik', label: 'Кабрик с Патриков', icon: '🌈', rainbow: true },
  { id: 'vezdehod', label: 'Вездеход', icon: '🚙', rainbow: true, hasIcon: true },
  { id: 'sportcar', label: 'Спорткар', icon: '🏎️', rainbow: true },
  { id: 'ghost', label: 'Привидение', icon: '👻' },
  { id: 'monster', label: 'Монстр-трак', icon: '🚜' },
];

export const DEFAULT_NAV_SETTINGS = {
  voice_enabled: true,
  voice_language: 'ru',
  voice_volume: 0.9,
  cursor_style: 'classic',
  night_mode: 'auto',
  pip_enabled: false,
  auto_scale: true,
  show_traffic: true,
  speed_alert: true,
};

// Колонки public.navigation_settings (кроме user_id/updated_at — их ставим сами).
// PostgREST отклоняет upsert ПОЦЕЛОМ, если payload содержит несуществующую
// колонку (PGRST204) — поэтому шлём только известное схеме.
const NAV_SETTING_COLUMNS = [
  'voice_enabled', 'voice_language', 'voice_uri', 'voice_volume',
  'avoid_tolls', 'avoid_highways', 'avoid_ferries', 'avoid_unpaved',
  'map_style', 'units', 'speed_alert', 'auto_reroute', 'auto_scale',
  'cursor_style', 'show_traffic', 'night_mode', 'pip_enabled',
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function readNavSettings() {
  try {
    return { ...DEFAULT_NAV_SETTINGS, ...JSON.parse(localStorage.getItem('karta_nav_settings') || '{}') };
  } catch {
    return { ...DEFAULT_NAV_SETTINGS };
  }
}

/** Оставить только колонки navigation_settings (без user_id/updated_at). */
export function pickNavSettings(ns = {}) {
  const out = {};
  for (const k of NAV_SETTING_COLUMNS) if (ns[k] !== undefined) out[k] = ns[k];
  return out;
}

/** Эмодзи доступного курсора; для классики и legacy-значений ('car') — null. */
export function cursorIconFor(style) {
  return AVAILABLE.find(c => c.id === style)?.icon || null;
}

/**
 * Сохранить патч настроек: всегда localStorage (+ отметка времени), затем
 * событие karta_navsettings (карта обновит курсор сразу) и сервер по возможности.
 */
export async function persistNavSettings(patch, { silent = false } = {}) {
  const ns = { ...readNavSettings(), ...patch };
  try {
    localStorage.setItem('karta_nav_settings', JSON.stringify(ns));
    localStorage.setItem('karta_nav_settings_at', String(Date.now()));
  } catch { /* приватный режим */ }
  try { window.dispatchEvent(new CustomEvent('karta_navsettings')); } catch { /* нет window */ }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ns;
    const { error } = await supabase
      .from('navigation_settings')
      .upsert({ ...pickNavSettings(ns), user_id: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) toast.error(error.message);
    else if (!silent) toast.success('Сохранено');
  } catch { /* офлайн — локальная копия уже сохранена */ }
  return ns;
}

/**
 * HTML кастомного курсора для L.divIcon: кружок с эмодзи/аватаркой +
 * стрелка-указатель направления. Контейнер поворачивается за курсом,
 * содержимое кружка контр-поворачивается, чтобы фото/эмодзи оставались
 * вертикальными. Для классики возвращает null — рисуется штатная стрелка.
 */
export function customCursorHtml({ style, photoUrl = '', rot = 0, color = '#2563EB', showPointer = true }) {
  const icon = cursorIconFor(style);
  const usePhoto = style === 'photo';
  if (!usePhoto && !icon) return null;

  const r = Number(rot) || 0;
  const inner = usePhoto
    ? (photoUrl
      ? `<img src="${esc(photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<span style="font-size:20px;line-height:1;">👤</span>`)
    : `<span style="font-size:20px;line-height:1;">${icon}</span>`;

  const pointer = showPointer
    ? `<div style="position:absolute;top:-11px;left:50%;margin-left:-7px;width:14px;height:14px;">
        <svg width="14" height="14" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));">
          <path d="M12 2 L20 20 L12 15.5 L4 20 Z" fill="${esc(color)}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>
      </div>`
    : '';

  return {
    size: 46,
    html: `<div style="position:relative;width:46px;height:46px;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${r}deg);transition:transform 0.15s linear;">
        <div style="position:relative;width:34px;height:34px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#fff;border:2px solid ${esc(color)};box-shadow:0 2px 10px rgba(37,99,235,0.45);overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <span style="display:block;transform:rotate(${-r}deg);">${inner}</span>
          </div>
          ${pointer}
        </div>
      </div>
      <div style="position:absolute;inset:-6px;border-radius:50%;background:radial-gradient(circle, rgba(37,99,235,0.25) 0%, rgba(37,99,235,0) 70%);"></div>
    </div>`,
  };
}

/**
 * Текущий курсор: стиль из настроек + фото профиля для cursor_style='photo'.
 * Обновляется при монтировании и по событию karta_navsettings
 * (настройки сохранились — карта сразу перерисовывает курсор).
 */
export function useNavCursor() {
  const [state, setState] = useState(() => ({ style: readNavSettings().cursor_style || 'classic', photo: '' }));

  useEffect(() => {
    let alive = true;
    const load = () => {
      const style = readNavSettings().cursor_style || 'classic';
      if (style !== 'photo') { setState({ style, photo: '' }); return; }
      setState((c) => ({ ...c, style }));
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user || !alive) return;
        supabase.from('profiles').select('photo_url').eq('id', user.id).maybeSingle()
          .then(({ data }) => { if (alive) setState({ style, photo: data?.photo_url || '' }); })
          .catch(() => { /* без фото — на карте будет 👤 */ });
      }).catch(() => { /* не авторизован */ });
    };
    load();
    window.addEventListener('karta_navsettings', load);
    return () => { alive = false; window.removeEventListener('karta_navsettings', load); };
  }, []);

  return state;
}

/** Ночной режим: on/off/system — через next-themes, auto — по часам (18–06). */
export function applyNightMode(value, setTheme) {
  try {
    if (value === 'on') setTheme?.('dark');
    else if (value === 'off') setTheme?.('light');
    else if (value === 'system') setTheme?.('system');
    else if (value === 'auto') {
      const h = new Date().getHours();
      document.documentElement.classList.toggle('dark', h >= 18 || h < 6);
    }
  } catch { /* нет DOM */ }
}
