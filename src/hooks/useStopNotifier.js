import { useEffect, useRef } from 'react';
import i18n from '@/lib/i18n';
import { haversineM } from '@/lib/geo';
import {
  notificationStep,
  gpsFreshness,
  estimateArrivalMinutes,
} from '@/lib/trackingLogic';

const DELAY_THRESHOLD_SEC = 120;    // 2 мин без обновления — задержка
const DELAY_REARM_SEC = 60;         // вернулись данные — можно снова уведомить

function sendNotification(title, body, tag) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    // tag — ОС-уровневая дедупликация: повторное уведомление того же события
    // заменяет предыдущее, а не плодит стопку
    new Notification(title, { body, icon: '/logo.png', ...(tag ? { tag } : {}) });
  }
}

function t(key, params) {
  return i18n.t(key, params);
}

/**
 * Уведомления пассажиру о выбранной остановке (п. 7 ТЗ):
 *   - пороги 1 км / 500 м / «совсем рядом» + «прибыл» + «примерно 5 минут»;
 *   - антидубли: событие только на пересечении порога, перезарядка после
 *     реального отъезда (notificationStep);
 *   - устаревший GPS или завершённый рейс не уведомляют;
 *   - уведомление о задержке — с собственной перезарядкой.
 * Состояние хранится отдельно для каждой пары «транспорт × остановка».
 */
export function useStopNotifier({ vehicles, watchedStop, route, onNotification }) {
  const statesRef = useRef(new Map());
  const delayStateRef = useRef(new Map());

  useEffect(() => {
    if (!watchedStop || !vehicles?.length) return undefined;

    const now = Date.now();
    const routeLabel = (v) => `#${v.route_number || route?.number || '?'}`;

    vehicles.forEach((v) => {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return;
      if (v.lat === 0 && v.lng === 0) return;

      const distM = haversineM(v.lat, v.lng, watchedStop.lat, watchedStop.lng);
      const freshness = gpsFreshness(v.last_updated, now);
      const fresh = freshness === 'fresh' || freshness === 'aging';
      const active = v.is_active !== false;
      const etaMinutes = estimateArrivalMinutes({
        distanceM: distM,
        speedKmh: v.speed,
        lastUpdated: v.last_updated,
        now,
      });

      // Координаты в ключе: две разные остановки с одинаковым названием
      // не должны делить состояние уведомлений.
      const stateKey = `${v.id}:${Number(watchedStop.lat).toFixed(5)},${Number(watchedStop.lng).toFixed(5)}`;
      const step = notificationStep(statesRef.current.get(stateKey), {
        distM,
        now,
        fresh,
        active,
        etaMinutes,
      });
      statesRef.current.set(stateKey, step.state);

      step.events.forEach((event) => {
        let title;
        let body;
        if (event.type === 'arrived') {
          title = t('notify.arrivedTitle', { route: routeLabel(v) });
          body = t('notify.arrivedBody', { stop: watchedStop.name || '' });
        } else if (event.type === 'eta') {
          title = t('notify.etaTitle', { route: routeLabel(v) });
          body = t('notify.etaBody', {
            minutes: event.minutes,
            stop: watchedStop.name || '',
          });
        } else {
          title = t(`notify.approach${event.thresholdM}Title`, { route: routeLabel(v) });
          body = t(`notify.approach${event.thresholdM}Body`, {
            distance: Math.round(distM),
            stop: watchedStop.name || '',
          });
        }
        sendNotification(title, body, `${stateKey}-${event.type}-${event.thresholdM || 0}`);
        onNotification?.({ id: `${stateKey}-${event.type}-${event.thresholdM || 0}`, type: event.type, title, body });
      });

      // --- Уведомление: задержка (нет свежих координат) ---
      const delayKey = `delay-${v.id}`;
      if (!active || freshness === 'fresh') {
        delayStateRef.current.delete(delayKey);
      } else {
        const updatedAt = v.last_updated ? new Date(v.last_updated).getTime() : null;
        const secondsSince = updatedAt ? (now - updatedAt) / 1000 : null;
        if (secondsSince !== null && secondsSince > DELAY_THRESHOLD_SEC && !delayStateRef.current.has(delayKey)) {
          delayStateRef.current.set(delayKey, now);
          const title = t('notify.delayTitle', { route: routeLabel(v) });
          const body = t('notify.delayBody', { minutes: Math.round(secondsSince / 60) });
          sendNotification(title, body, delayKey);
          onNotification?.({ id: `${delayKey}-${updatedAt}`, type: 'delay', title, body });
        } else if (
          delayStateRef.current.has(delayKey)
          && secondsSince !== null
          && secondsSince < DELAY_REARM_SEC
        ) {
          delayStateRef.current.delete(delayKey);
        }
      }
    });

    return undefined;
  }, [vehicles, watchedStop, route, onNotification]);
}
