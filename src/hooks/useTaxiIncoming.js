import { useEffect, useRef } from 'react';
import { supabase } from '@/api/supabase';
import { haversineKm, DRIVER_MATCH_RADIUS_KM } from '@/lib/taxi';
import { snapToRoad } from '@/lib/osrm';

const ORDER_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKIeGBGPoChoZ+LdmhRR4KXoZ6KdWxYTYiOn52Jc25cU42QnJuIc3BjWZCVmJeGc3FqYJeWlJJ/dnNvZ5qXlJF8dHNzap2XlI95c3V3b56Xk455cnV3cJ+Xkok=';

export function useTaxiIncoming(user) {
  const posRef = useRef(null);
  const catRef = useRef(null);
  const notifIdRef = useRef(new Set());

  useEffect(() => {
    if (!user?.id || user?.role !== 'taxi_driver') return;

    // Load vehicle category
    (async () => {
      const { data } = await supabase.from('taxi_vehicles').select('category').eq('driver_id', user.id).maybeSingle();
      if (data?.category) catRef.current = data.category;
    })();

    // GPS watch for position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { posRef.current = [pos.coords.latitude, pos.coords.longitude]; },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // Subscribe to new orders
    const sub = supabase.channel('taxi-global-incoming-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_orders', filter: 'status=eq.searching' }, async (payload) => {
        const row = payload.new;
        if (!row || row.driver_id) return;
        if (notifIdRef.current.has(row.id)) return;
        notifIdRef.current.add(row.id);

        // Category match
        if (catRef.current && row.category && row.category !== catRef.current) return;

        // Radius match
        const dist = haversineKm(posRef.current?.[0], posRef.current?.[1], row.pickup_lat, row.pickup_lng);
        if (dist != null && dist > DRIVER_MATCH_RADIUS_KM) return;

        // Snapped pickup for notification
        let pickupText = row.pickup_address || 'Не указан';
        if (row.pickup_lat && row.pickup_lng) {
          const snapped = await snapToRoad(row.pickup_lat, row.pickup_lng);
          pickupText = `${row.pickup_address || 'Точка'} (${snapped[0].toFixed(4)}, ${snapped[1].toFixed(4)})`;
        }

        // Play sound
        try {
          const audio = new Audio(ORDER_SOUND);
          audio.volume = 0.8;
          audio.play().catch(() => {});
        } catch {}

        // Vibrate
        try { navigator.vibrate?.([200, 100, 200]); } catch {}

        // Local notification
        const title = `Новый заказ · ${row.price || '?'} TJS`;
        const body = pickupText;
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, { body, icon: '/favicon.ico', tag: 'taxi-order-' + row.id, requireInteraction: true });
          } catch {}
        }

        // Toast via import (sonner)
        try {
          const { toast } = await import('sonner');
          toast.success(title, { description: body, duration: 8000, action: { label: 'Открыть', onClick: () => { window.location.href = '/taxi/driver'; } } });
        } catch {}
      })
      .subscribe();

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      navigator.geolocation.clearWatch(watchId);
      supabase.removeChannel(sub);
    };
  }, [user?.id, user?.role]);
}
