/**
 * Кэш последней GPS-позиции пользователя (localStorage).
 *
 * Зачем: при каждом открытии приложение не ждёт свежий GPS-фикс —
 * метка «я на карте», автогород и «моя точка» показываются мгновенно из кэша,
 * а watchPosition карты тихо обновляет его в фоне.
 */

const LOCATION_KEY = 'karta_last_location_v1';

/** Свежесть кэша для стартовых сценариев (город, метка при открытии). */
export const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Минимальный интервал записи во время активного watchPosition (троттлинг). */
export const LOCATION_WRITE_MIN_MS = 10 * 1000;

/** Событие «новая позиция пользователя» — метка на карте слушает его
 *  и рисует синюю точку сразу после любого GPS-фикса (кнопка «моё
 *  местоположение», маршрут, поиск рядом), не дожидаясь watchPosition. */
export const MY_LOCATION_EVENT = 'karta_my_location';

/** Записать последний GPS-фикс. Невалидные координаты → false, ничего не пишем. */
export function saveLastLocation({ lat, lng, accuracy } = {}) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  try {
    localStorage.setItem(
      LOCATION_KEY,
      JSON.stringify({
        lat: la,
        lng: lo,
        accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
        ts: Date.now(),
      }),
    );
    // трансляция — отдельный try, чтобы сбой слушателей не помешал записи
    try {
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(MY_LOCATION_EVENT, {
          detail: { lat: la, lng: lo, accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null },
        }));
      }
    } catch { /* слушателей нет (SSR/тесты) — не критично */ }
    return true;
  } catch {
    return false; // quota/private mode — не критично
  }
}

/** Последний фикс не старше maxAgeMs, иначе null. Битые данные → null. */
export function getCachedLastLocation(maxAgeMs = LOCATION_TTL_MS) {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Number.isFinite(d?.lat) || !Number.isFinite(d?.lng) || !Number.isFinite(d?.ts)) return null;
    if (Date.now() - d.ts > maxAgeMs) return null;
    return { lat: d.lat, lng: d.lng, accuracy: d.accuracy ?? null, ts: d.ts };
  } catch {
    return null;
  }
}
