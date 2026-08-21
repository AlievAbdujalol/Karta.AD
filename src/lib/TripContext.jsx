import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { Vehicle } from '@/api/entities';
import { toast } from 'sonner';

const TripContext = createContext(null);

export function TripProvider({ children, user }) {
  const [isTracking, setIsTracking] = useState(false);
  const [gpsInfo, setGpsInfo] = useState({ speed: 0, lat: 0, lng: 0 });
  const [activeRoute, setActiveRoute] = useState(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const watchIdRef = useRef(null);
  const vehicleIdRef = useRef(null);
  const intervalRef = useRef(null);

  const updateLocation = useCallback(async (latitude, longitude, speedKmh) => {
    if (vehicleIdRef.current) {
      await Vehicle.update(vehicleIdRef.current, {
        lat: latitude,
        lng: longitude,
        speed: speedKmh,
        last_updated: new Date().toISOString(),
      }).catch(err => console.error('[TripContext] location update failed:', err));
    }
  }, []);

  const startGpsWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!navigator.geolocation) {
      toast.error('Геолокация недоступна');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed: spd } = pos.coords;
        const speedKmh = spd ? Math.round(spd * 3.6) : 0;
        setGpsInfo({ speed: speedKmh, lat: latitude, lng: longitude });
        updateLocation(latitude, longitude, speedKmh);
      },
      (err) => console.error('[TripContext] GPS error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    intervalRef.current = setInterval(() => {
      if (vehicleIdRef.current) {
        Vehicle.update(vehicleIdRef.current, { last_updated: new Date().toISOString() }).catch(err => console.error('[TripContext] heartbeat failed:', err));
      }
    }, 30000);
  }, [updateLocation]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('id, route_id, route_number, vehicle_number, type')
        .eq('driver_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!vehicle) return;
      vehicleIdRef.current = vehicle.id;
      setVehicleNumber(vehicle.vehicle_number || '');
      setIsTracking(true);
      if (vehicle.route_id) {
        const { data: route } = await supabase.from('routes').select('*').eq('id', vehicle.route_id).maybeSingle();
        if (route) setActiveRoute(route);
      }
      startGpsWatch();
    })();
  }, [user?.id]);

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTrip = useCallback(async ({ routeId, vNumber, driverRoutes, user: driverUser }) => {
    if (!routeId || !driverUser) return;
    const route = driverRoutes.find(r => r.id === routeId);

    const existingVehicles = await Vehicle.filter({ driver_id: driverUser.id });
    let vId;

    if (existingVehicles.length > 0) {
      vId = existingVehicles[0].id;
      await Vehicle.update(vId, {
        route_id: routeId,
        route_number: route?.number || '',
        is_active: true,
        type: route?.type || 'bus',
        driver_name: driverUser.full_name || driverUser.email,
        vehicle_number: vNumber || driverUser.vehicle_number || '',
      });
    } else {
      const v = await Vehicle.create({
        driver_id: driverUser.id,
        route_id: routeId,
        route_number: route?.number || '',
        is_active: true,
        type: route?.type || 'bus',
        driver_name: driverUser.full_name || driverUser.email,
        vehicle_number: vNumber || driverUser.vehicle_number || '',
        lat: 0,
        lng: 0,
      });
      vId = v.id;
    }

    vehicleIdRef.current = vId;
    setActiveRoute(route);
    setVehicleNumber(vNumber || driverUser.vehicle_number || '');
    setIsTracking(true);

    if (route?.created_by_id) {
      supabase.from('notifications').insert({
        user_id: route.created_by_id,
        title: 'Водитель вышел на маршрут',
        body: `${driverUser.full_name || driverUser.email} начал рейс на маршруте #${route.number}`,
        type: 'driver_trip_start',
      }).then(({ error }) => {
        if (error) console.error('[TripContext] notification failed:', error);
      }).catch(() => {});
    }

    startGpsWatch();
    toast.success('Рейс начат');
  }, [startGpsWatch]);

  const endTrip = useCallback(async () => {
    stopGpsWatch();
    if (vehicleIdRef.current) {
      try {
        await Vehicle.update(vehicleIdRef.current, { is_active: false });
      } catch (err) {
        console.error('[TripContext] endTrip failed:', err);
      }
      vehicleIdRef.current = null;
    }
    setIsTracking(false);
    setActiveRoute(null);
    setGpsInfo({ speed: 0, lat: 0, lng: 0 });
    toast.success('Рейс завершён');
  }, [stopGpsWatch]);

  useEffect(() => {
    return () => {
      stopGpsWatch();
    };
  }, [stopGpsWatch]);

  return (
    <TripContext.Provider value={{
      isTracking,
      gpsInfo,
      activeRoute,
      vehicleNumber,
      startTrip,
      endTrip,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
