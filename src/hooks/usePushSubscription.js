import { useEffect } from 'react';
import { subscribeToPush, isPushSupported } from '@/lib/push';

/**
 * Авто-подписка на Web Push при первом входе (прод). В dev SW не
 * зарегистрирован (main.jsx вычищает его), поэтому подписка там не пытается —
 * иначе navigator.serviceWorker.getRegistration() вернул бы undefined.
 *
 * @param {{ id?: string } | null | undefined} user
 */
export function usePushSubscription(user) {
  useEffect(() => {
    if (!user?.id) return;
    // MODE, а не PROD: PROD зависит от NODE_ENV, который можно переопределить
    // (.env.local / Vercel) — подписка в проде молча отключилась бы.
    if (import.meta.env.MODE !== 'production') return;
    if (!isPushSupported()) return;

    // Разрешение запрашиваем один раз; если пользователь отказался — тихо
    // выходим (браузер больше не спросит, subscribeToPush вернёт null).
    subscribeToPush(user).catch(() => {});
  }, [user?.id]);
}
