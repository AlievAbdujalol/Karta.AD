import { useEffect, useRef } from 'react';
import { distanceKm } from '@/utils/eta';

const APPROACH_RADIUS_KM = 0.35;   // 350м — автобус приближается
const DELAY_THRESHOLD_SEC = 120;    // 2 мин без обновления — задержка

export function useStopNotifier({ vehicles, watchedStop, route, onNotification }) {
  const notifiedApproach = useRef(new Set());
  const notifiedDelay = useRef(new Set());

  useEffect(() => {
    if (!watchedStop || !vehicles.length) return;

    const now = Date.now();

    vehicles.forEach(v => {
      if (!v.lat || !v.lng) return;
      const dist = distanceKm(v.lat, v.lng, watchedStop.lat, watchedStop.lng);
      const routeLabel = `#${v.route_number || route?.number || '?'}`;
      const approachKey = `approach-${v.id}-${watchedStop.name}`;
      const delayKey = `delay-${v.id}`;

      // --- Уведомление: автобус приближается ---
      if (dist <= APPROACH_RADIUS_KM && !notifiedApproach.current.has(approachKey)) {
        notifiedApproach.current.add(approachKey);
        const title = `🚌 Автобус ${routeLabel} приближается`;
        const body = `До остановки «${watchedStop.name}» ~${Math.round(dist * 1000)} м`;
        sendNotification(title, body);
        onNotification?.({ id: Date.now(), type: 'approach', title, body });
      }

      // Сбросить при отдалении
      if (dist > APPROACH_RADIUS_KM * 3) {
        notifiedApproach.current.delete(approachKey);
      }

      // --- Уведомление: задержка ---
      if (v.last_updated) {
        const updatedAt = new Date(v.last_updated).getTime();
        const secondsSince = (now - updatedAt) / 1000;
        if (secondsSince > DELAY_THRESHOLD_SEC && !notifiedDelay.current.has(delayKey)) {
          notifiedDelay.current.add(delayKey);
          const title = `⚠️ Автобус ${routeLabel} задерживается`;
          const body = `Нет данных уже ${Math.round(secondsSince / 60)} мин. Возможна задержка.`;
          sendNotification(title, body);
          onNotification?.({ id: Date.now() + 1, type: 'delay', title, body });
        }
        if (secondsSince < DELAY_THRESHOLD_SEC) {
          notifiedDelay.current.delete(delayKey);
        }
      }
    });
  }, [vehicles, watchedStop, route]);
}

function sendNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}