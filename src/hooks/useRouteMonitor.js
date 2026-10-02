import { useEffect } from 'react';
import { getFavoriteRoutes } from '@/lib/favorites';
import { buildOsrmRoute } from '@/lib/osrmClient';
import { toast } from 'sonner';

export function useRouteMonitor() {
  useEffect(() => {
    const checkRoutes = async () => {
      const favs = getFavoriteRoutes();
      if (favs.length === 0) return;

      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      for (const fav of favs) {
        const from = fav.stops[0];
        const to = fav.stops[fav.stops.length - 1];
        const waypoints = fav.stops.slice(1, -1);
        
        const currentRoute = await buildOsrmRoute(from, to, 'driving', { waypoints });
        
        if (currentRoute && currentRoute.duration > fav.duration * 1.2) {
          const delayMins = Math.round((currentRoute.duration - fav.duration) / 60);
          const msg = `Задержка на маршруте "${fav.stops[0].name} - ${fav.stops[fav.stops.length-1].name}": +${delayMins} мин.`;
          
          toast.warning(msg);
          if (Notification.permission === 'granted') {
            new Notification('Карта-АД: Изменение маршрута', { body: msg });
          }
        }
      }
    };

    const interval = setInterval(checkRoutes, 300000); // 5 min
    return () => clearInterval(interval);
  }, []);
}
