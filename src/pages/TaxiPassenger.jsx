import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { useLocation } from 'react-router-dom';
import {
  MapPin, Search, X, Loader2, ChevronRight, ChevronDown, Phone, Share2,
  AlertTriangle, Star, Navigation, Banknote, CreditCard, QrCode, Heart,
  Home, Briefcase, GraduationCap, Mic, MessageCircle, Wallet, LocateFixed, SlidersHorizontal,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import { snapToRoad, snapPositions } from '@/lib/osrm';
import TaxiCategoryCard from '@/components/taxi/TaxiCategoryCard';
import TaxiChat from '@/components/taxi/TaxiChat';
import ShareMenu from '@/components/taxi/ShareMenu';
import TaxiTariffPanel, { priceSurcharge } from '@/components/taxi/TaxiTariffPanel';
import {
  estimateRide, calcPrice, formatTJS, demandLabel, pickupEtaMin,
  PASSENGER_TARIFFS, haversineKm, isNight,
} from '@/lib/taxi';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const carIcon = L.divIcon({
  className: '',
  html: '<div style="background:#3b82f6;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">🚕</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const pickupIcon = L.divIcon({
  className: '',
  html: '<div style="background:#22c55e;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(34,197,94,0.4);border:2px solid white;font-weight:bold;">A</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const dropoffIcon = L.divIcon({
  className: '',
  html: '<div style="background:#ef4444;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(239,68,68,0.4);border:2px solid white;font-weight:bold;">B</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const userIcon = L.divIcon({
  className: '',
  html: '<div style="background:#3b82f6;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 0 3px rgba(59,130,246,0.3);border:2px solid white;">📍</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const previewIcon = L.divIcon({
  className: '',
  html: '<div style="background:#f59e0b;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 15px rgba(245,158,11,0.5);border:3px solid white;animation:bounce 1s infinite;">⭐</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Наличные', icon: Banknote, gradient: 'from-green-500 to-emerald-600' },
  { id: 'card', label: 'Карта', icon: CreditCard, gradient: 'from-blue-500 to-indigo-600' },
  { id: 'qr', label: 'QR · Alif', icon: QrCode, gradient: 'from-violet-500 to-purple-600' },
  { id: 'wallet', label: 'Кошелёк', icon: Wallet, gradient: 'from-amber-500 to-orange-600' },
];

const FAVORITE_PLACES = [
  { key: 'home', label: 'Дом', icon: Home },
  { key: 'work', label: 'Работа', icon: Briefcase },
  { key: 'university', label: 'Университет', icon: GraduationCap },
];

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function LocationMarker({ userPosition, setUserPosition, recenterNonce }) {
  const map = useMap();

  useEffect(() => {
    if (!userPosition) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserPosition([latitude, longitude]);
          map.setView([latitude, longitude], 14);
        },
        () => setUserPosition([38.5358, 68.7791]),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [map, userPosition, setUserPosition]);

  useEffect(() => {
    if (recenterNonce && userPosition) map.flyTo(userPosition, 15, { duration: 0.5 });
  }, [recenterNonce, userPosition, map]);

  return null;
}

function CenterOnPreview({ place }) {
  const map = useMap();
  useEffect(() => {
    if (place) map.setView([place.lat, place.lng], 16, { animate: true });
  }, [place, map]);
  return null;
}

function NearbyDrivers({ drivers }) {
  return drivers.map((d, i) => (
    <Marker key={d.driver_id || i} position={[d.lat, d.lng]} icon={carIcon}>
      <Popup>
        <div className="text-xs">Свободный водитель</div>
      </Popup>
    </Marker>
  ));
}

function LocationField({ value, placeholder, onPick, onClear, variant = 'from' }) {
  const isFrom = variant === 'from';
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full min-w-0 items-center gap-3 px-1 py-2 text-left"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isFrom ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${value ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
        {value || placeholder}
      </span>
      {value && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClear(); } }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400"
          aria-label="Очистить"
        >
          <X size={14} />
        </span>
      )}
    </button>
  );
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng);
    },
  });
  return null;
}

function RouteSummary({ routeInfo, price, demand }) {
  const d = demandLabel(demand);
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
      <p className="text-[12px] font-medium text-slate-500">
        {routeInfo.distanceKm.toFixed(1)} км · ~{routeInfo.durationMin} мин
      </p>
      <div className="flex items-center gap-2">
        {(Number(demand) || 1) > 1 && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.tone}`}>{d.badge}</span>
        )}
        <p className="text-[15px] font-black text-slate-900 dark:text-white">
          {price != null ? `${formatTJS(price)} TJS` : '—'}
        </p>
      </div>
    </div>
  );
}

export default function TaxiPassenger() {
  const { user } = useCurrentUser();
  const location = useLocation();
  const [fromText, setFromText] = useState('');
  const [fromCoord, setFromCoord] = useState(null);
  const [toText, setToText] = useState('');
  const [toCoord, setToCoord] = useState(null);
  const [category, setCategory] = useState('economy');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const DEFAULT_EXTRAS = useMemo(() => ({
    economy: { passengers: 1, luggage: false, childSeat: false, pets: false, has_ac: true, comment: '' },
    comfort: { passengers: 1, luggage: false, childSeat: false, pets: false, has_ac: true, comment: '' },
    comfort_plus: { passengers: 1, luggage: false, childSeat: false, pets: false, has_ac: true, comment: '' },
    business: { passengers: 1, luggage: false, childSeat: false, pets: false, has_ac: true, comment: '' },
    minivan: { passengers: 1, luggage: false, childSeats: 0, pets: false, comment: '' },
    delivery: { parcelType: 'box', weight: 1, receiverName: '', receiverPhone: '', fragile: false, express: false, comment: '' },
    courier: { urgent: false, itemDesc: '', weight: 0.5, signature: false, photoProof: false, comment: '' },
    intercity: { passengers: 1, luggage: false, childSeat: false, returnTrip: false, scheduledAt: '', comment: '' },
    electric: { passengers: 1, luggage: false, childSeat: false, pets: false, comment: '' },
  }), []);
  const [tariffExtras, setTariffExtras] = useState(DEFAULT_EXTRAS);
  const [orderState, setOrderState] = useState('idle');
  const [orderId, setOrderId] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [nearbyCars, setNearbyCars] = useState({});
  const [demandCoef, setDemandCoef] = useState(1);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pickTarget, setPickTarget] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [rideRating, setRideRating] = useState(0);
  const [rideTip, setRideTip] = useState('');
  const [rideComment, setRideComment] = useState('');
  const [isFavoriteDriver, setIsFavoriteDriver] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [favorites, setFavorites] = useState(() => loadJSON('kartaad_favs', {}));
  const [recents, setRecents] = useState(() => loadJSON('kartaad_recents', []));
  const [popularPlaces, setPopularPlaces] = useState(() => {
    const raw = loadJSON('kartaad_popular', {});
    return Object.values(raw).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5);
  });
  const [saveTarget, setSaveTarget] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [previewPlace, setPreviewPlace] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const searchTimer = useRef(null);

  // Восстановление активного заказа после перезагрузки страницы
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('taxi_orders')
        .select('id, status, category, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_id, price, payment_method')
        .eq('passenger_id', user.id)
        .in('status', ['searching', 'found', 'en_route', 'arrived', 'riding'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data || !alive) return;
      setOrderId(data.id);
      setOrderState(data.status);
      if (data.category) setCategory(data.category);
      if (data.pickup_address) setFromText(data.pickup_address);
      if (data.dropoff_address) setToText(data.dropoff_address);
      if (data.pickup_lat != null && data.pickup_lng != null) setFromCoord([data.pickup_lat, data.pickup_lng]);
      if (data.dropoff_lat != null && data.dropoff_lng != null) setToCoord([data.dropoff_lat, data.dropoff_lng]);
      if (data.driver_id) setDriverInfo({ driverId: data.driver_id });
      if (data.payment_method) setPaymentMethod(data.payment_method);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Предзаполнение из «Повторить поездку» (TaxiHistory)
  useEffect(() => {
    const trip = location.state?.trip;
    if (!trip) return;
    if (trip.from?.name) {
      setFromText(trip.from.name);
      if (trip.from.lat != null && trip.from.lng != null) setFromCoord([trip.from.lat, trip.from.lng]);
    }
    if (trip.to?.name) {
      setToText(trip.to.name);
      if (trip.to.lat != null && trip.to.lng != null) setToCoord([trip.to.lat, trip.to.lng]);
    }
    if (trip.category) setCategory(trip.category);
  }, [location.state]);

  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '&copy; OpenStreetMap contributors';

  const routeInfo = useMemo(() => {
    if (!fromCoord || !toCoord) return null;
    return estimateRide(fromCoord[0], fromCoord[1], toCoord[0], toCoord[1]);
  }, [fromCoord, toCoord]);

  const priceInfo = useMemo(() => {
    if (!routeInfo) return null;
    const night = isNight();
    const out = {};
    for (const t of PASSENGER_TARIFFS) {
      const nearby = nearbyCars[t.id];
      const base = calcPrice({ distanceKm: routeInfo.distanceKm, durationMin: routeInfo.durationMin, category: t.id, demandCoef, night });
      const extra = priceSurcharge(t.id, tariffExtras[t.id] || {}, routeInfo.distanceKm);
      out[t.id] = {
        price: Math.round((base + extra) * 2) / 2,
        eta: pickupEtaMin(nearby?.nearestKm ?? null),
        cars: nearby?.cars ?? 0,
      };
    }
    return out;
  }, [routeInfo, demandCoef, nearbyCars, tariffExtras]);

  const selectedPrice = priceInfo?.[category]?.price ?? null;

  useEffect(() => {
    if (!user?.id) return;
    const sub = supabase.channel('taxi-passenger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxi_orders', filter: `passenger_id=eq.${user.id}` }, (payload) => {
        if (payload.new) {
          const s = payload.new.status;
          setOrderState(s);
          if (s === 'found') {
            toast.success('Водитель принял заказ!', { duration: 5000 });
            try { navigator.vibrate?.([100, 50, 100, 50, 100]); } catch {}
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKIeGBGPoChoZ+LdmhRR4KXoZ6KdWxYTYiOn52Jc25cU42QnJuIc3BjWZCVmJeGc3FqYJeWlJJ/dnNvZ5qXlJF8dHNzap2XlI95c3V3b56Xk455cnV3cJ+Xkok=');
              audio.volume = 0.8;
              audio.play().catch(() => {});
            } catch {}
          }
          if (s === 'cancelled') {
            setOrderId(null);
            setDriverInfo(null);
            setDriverPosition(null);
            setChatOpen(false);
            toast.info('Заказ отменён', { duration: 3000 });
          }
          if (s === 'arrived') {
            toast.success('Водитель прибыл!', { duration: 5000 });
            try { navigator.vibrate?.([200, 100, 200]); } catch {}
          }
          if (s === 'completed') {
            toast.success('Поездка завершена! Оцените водителя.', { duration: 5000 });
          }
          if (payload.new.driver_id && !['cancelled', 'completed'].includes(s)) {
            setDriverInfo(prev => prev ? { ...prev, driverId: payload.new.driver_id } : { driverId: payload.new.driver_id });
          }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [user?.id]);

  useEffect(() => {
    const fetchDriverInfo = async () => {
      if (!driverInfo?.driverId) return;
      const { data: driver } = await supabase.from('taxi_drivers').select('full_name, phone, photo_url, rating, rides_count').eq('user_id', driverInfo.driverId).maybeSingle();
      const { data: vehicle } = await supabase.from('taxi_vehicles').select('make, model, color, plate_number, category, photo_url, body_type').eq('driver_id', driverInfo.driverId).maybeSingle();
      if (driver || vehicle) {
        setDriverInfo(prev => ({
          ...prev,
          name: driver?.full_name || 'Водитель',
          rating: driver?.rating?.toFixed(1) || '5.0',
          photo: driver?.photo_url,
          phone: driver?.phone,
          rides: driver?.rides_count || 0,
          car: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
          plate: vehicle?.plate_number,
          color: vehicle?.color,
          carPhoto: vehicle?.photo_url,
          category: vehicle?.category,
          bodyType: vehicle?.body_type,
        }));
      }
    };
    if (driverInfo?.driverId) fetchDriverInfo();
  }, [driverInfo?.driverId]);

  useEffect(() => {
    if (!driverInfo?.driverId || !user?.id) return;
    supabase.from('taxi_favorite_drivers')
      .select('id').eq('passenger_id', user.id).eq('driver_id', driverInfo.driverId).maybeSingle()
      .then(({ data }) => setIsFavoriteDriver(!!data))
      .catch(() => {});
  }, [driverInfo?.driverId, user?.id]);

  // Новые сообщения в чате активного заказа
  useEffect(() => {
    if (!orderId || !user?.id) return;
    const sub = supabase.channel('taxi-passenger-chat-' + orderId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        const row = payload.new;
        if (!row || row.sender_id === user.id) return;
        setUnreadChat(prev => prev + 1);
        if (!chatOpen) {
          toast.info(`Водитель: ${row.message}`, { duration: 4000 });
          try { navigator.vibrate?.([80, 40, 80]); } catch {}
        }
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [orderId, user?.id, chatOpen]);

  // Спрос + машины рядом по тарифам
  useEffect(() => {
    if (!fromCoord || !user?.id) return;
    let alive = true;
    const load = async () => {
      if (!navigator.onLine) return;
      try {
        const [{ data: coef }, { data: summary }] = await Promise.all([
          supabase.rpc('taxi_demand_coefficient', { p_lat: fromCoord[0], p_lng: fromCoord[1], p_radius_km: 3 }),
          supabase.rpc('taxi_nearby_summary', { p_lat: fromCoord[0], p_lng: fromCoord[1], p_radius_km: 5 }),
        ]);
        if (!alive) return;
        if (coef != null) setDemandCoef(Number(coef));
        const carsMap = {};
        (summary || []).forEach(r => {
          carsMap[r.category] = { cars: Number(r.cars) || 0, nearestKm: r.nearest_km != null ? Number(r.nearest_km) : null };
        });
        setNearbyCars(carsMap);
      } catch {}
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [fromCoord, user?.id]);

  useEffect(() => {
    if (orderState === 'searching' || orderState === 'found') {
      let alive = true;
      const refresh = async () => {
        if (!navigator.onLine) return;
        try {
          const { data } = await supabase
            .from('taxi_driver_locations')
            .select('driver_id, lat, lng, heading')
            .eq('status', 'free')
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(12);
          if (!data || !alive) return;
          const snapped = await snapPositions(data.map(d => [d.lat, d.lng]));
          if (!alive) return;
          setNearbyDrivers(data.map((d, i) => ({ ...d, lat: snapped[i][0], lng: snapped[i][1] })));
        } catch {}
      };
      refresh();
      const interval = setInterval(refresh, 3000);
      return () => { alive = false; clearInterval(interval); };
    } else {
      setNearbyDrivers([]);
    }
  }, [orderState]);

  useEffect(() => {
    if (orderState === 'found' || orderState === 'en_route' || orderState === 'riding') {
      if (!driverInfo?.driverId) return;
      let alive = true;

      const applyPosition = async (lat, lng) => {
        const snapped = await snapToRoad(lat, lng);
        if (alive) setDriverPosition(snapped);
      };

      // Initial fetch — get current position right away
      (async () => {
        const { data } = await supabase
          .from('taxi_driver_locations')
          .select('lat, lng')
          .eq('driver_id', driverInfo.driverId)
          .maybeSingle();
        if (data?.lat != null && data?.lng != null && alive) await applyPosition(data.lat, data.lng);
      })();

      // Subscribe to future changes
      const sub = supabase.channel('taxi-driver-track')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'taxi_driver_locations',
          filter: `driver_id=eq.${driverInfo.driverId}`,
        }, async (payload) => {
          if (!payload.new) return;
          await applyPosition(payload.new.lat, payload.new.lng);
        })
        .subscribe();
      return () => { alive = false; supabase.removeChannel(sub); };
    }
  }, [orderState, driverInfo?.driverId]);

  // Загрузка маршрута OSRM
  useEffect(() => {
    if (!fromCoord || !toCoord) { setRouteGeometry([]); return; }
    let alive = true;
    (async () => {
      try {
        const coords = `${fromCoord[1]},${fromCoord[0]};${toCoord[1]},${toCoord[0]}`;
        const resp = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok || !alive) return;
        const data = await resp.json();
        const geom = data.routes?.[0]?.geometry?.coordinates;
        if (geom && alive) setRouteGeometry(geom.map(([lng, lat]) => [lat, lng]));
      } catch {}
    })();
    return () => { alive = false; };
  }, [fromCoord, toCoord]);

  const driverEta = useMemo(() => {
    if (!driverPosition || !fromCoord) return null;
    const km = haversineKm(driverPosition[0], driverPosition[1], fromCoord[0], fromCoord[1]);
    return km == null ? null : Math.max(1, Math.round((km / 30) * 60));
  }, [driverPosition, fromCoord]);

  const rideRemaining = useMemo(() => {
    if (!driverPosition || !toCoord) return null;
    const km = haversineKm(driverPosition[0], driverPosition[1], toCoord[0], toCoord[1]);
    if (km == null) return null;
    return { km, min: Math.max(1, Math.round((km / 22) * 60)) };
  }, [driverPosition, toCoord]);

  const geocodeLatLng = useCallback(async (lat, lng, target) => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`,
        { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        const addr = data.display_name?.split(',').slice(0, 3).join(',') || 'Выбранная точка';
        if (target === 'from') { setFromText(addr); setFromCoord([lat, lng]); }
        else { setToText(addr); setToCoord([lat, lng]); }
        return addr;
      }
    } catch {}
    return null;
  }, []);

  const handleSearch = useCallback((val) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&accept-language=ru`,
          { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(3000) }
        );
        if (resp.ok) {
          const data = await resp.json();
          setSearchResults(data.map(i => ({
            id: i.place_id, name: i.display_name.split(',').slice(0, 3).join(','),
            lat: parseFloat(i.lat), lng: parseFloat(i.lon), type: i.type,
          })));
        }
      } catch {}
    }, 400);
  }, []);

  const pushRecent = useCallback((item) => {
    setRecents(prev => {
      const next = [item, ...(prev || []).filter(r => !(r.lat === item.lat && r.lng === item.lng))].slice(0, 4);
      saveJSON('kartaad_recents', next);
      return next;
    });
  }, []);

  const applyAddress = useCallback((item) => {
    pushRecent(item);
    const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`;
    const all = loadJSON('kartaad_popular', {});
    all[key] = { name: item.name, lat: item.lat, lng: item.lng, count: ((all[key]?.count) || 0) + 1 };
    saveJSON('kartaad_popular', all);
    setPopularPlaces(Object.values(all).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5));
    if (pickTarget === 'from') { setFromText(item.name); setFromCoord([item.lat, item.lng]); }
    else { setToText(item.name); setToCoord([item.lat, item.lng]); }
    setPickTarget(null);
    if (saveTarget) {
      setFavorites(prev => {
        const next = { ...prev, [saveTarget]: { name: item.name, lat: item.lat, lng: item.lng } };
        saveJSON('kartaad_favs', next);
        return next;
      });
      setSaveTarget(null);
      toast.success(`Адрес сохранён как «${FAVORITE_PLACES.find(f => f.key === saveTarget)?.label}»`);
    }
  }, [pickTarget, pushRecent, saveTarget]);

  const handleSelectSearch = useCallback((item) => {
    applyAddress(item);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [applyAddress]);

  const handleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Голосовой поиск не поддерживается этим браузером'); return; }
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const q = e.results?.[0]?.[0]?.transcript || '';
      if (q) { setSearchQuery(q); handleSearch(q); }
    };
    rec.onerror = () => toast.error('Не удалось распознать речь');
    rec.start();
  }, [handleSearch]);

  const handleMapClick = useCallback(async (latlng) => {
    if (!pickTarget) return;
    const target = pickTarget;
    const currentSave = saveTarget;
    setPickTarget(null);
    const addr = await geocodeLatLng(latlng.lat, latlng.lng, target);
    if (currentSave && addr) {
      const item = { name: addr, lat: latlng.lat, lng: latlng.lng };
      setFavorites(prev => {
        const next = { ...prev, [currentSave]: item };
        saveJSON('kartaad_favs', next);
        return next;
      });
      setSaveTarget(null);
      toast.success(`Адрес сохранён как «${FAVORITE_PLACES.find(f => f.key === currentSave)?.label}»`);
    } else {
      setSaveTarget(null);
    }
  }, [pickTarget, saveTarget, geocodeLatLng]);

  const handleOrder = useCallback(async () => {
    if (!fromText) { toast.error('Укажите откуда'); return; }
    if (!routeInfo || selectedPrice == null) { toast.error('Рассчитываем цену...'); return; }
    if (paymentMethod === 'wallet' && (user?.balance || 0) < selectedPrice) {
      toast.error('Недостаточно средств в кошельке. Пополните баланс в профиле.');
      return;
    }
    const extras = tariffExtras[category] || {};
    // тариф-специфичная валидация
    if (category === 'delivery') {
      if (!toText) { toast.error('Для доставки укажите адрес получателя'); return; }
      if (!extras.receiverPhone) { toast.error('Укажите телефон получателя'); return; }
    }
    if (category === 'courier' && !extras.itemDesc) { toast.error('Опишите, что доставить'); return; }
    if (category === 'intercity' && !toText) { toast.error('Для межгорода укажите пункт назначения'); return; }
    // собрать комментарий из тарифа + пользовательский
    const detailLines = [];
    if (['economy','comfort','comfort_plus','business','minivan','intercity'].includes(category)) {
      detailLines.push(`Пассажиров: ${extras.passengers ?? 1}`);
      if (extras.luggage) detailLines.push('Багаж');
      if (extras.childSeat || extras.childSeats) detailLines.push(`Дет. кресло${extras.childSeats ? ' x'+extras.childSeats : ''}`);
      if (extras.pets) detailLines.push('С питомцем');
    }
    if (category === 'minivan' && extras.childSeats) detailLines.push(`Кресел: ${extras.childSeats}`);
    if (category === 'delivery') detailLines.push(`Тип: ${extras.parcelType || 'box'}, ${extras.weight || 1}кг${extras.fragile ? ', хрупкое' : ''}${extras.express ? ', экспресс' : ''}`, `Получатель: ${extras.receiverName || '—'} ${extras.receiverPhone || ''}`);
    if (category === 'courier') detailLines.push(`${extras.itemDesc || 'Посылка'} · ${extras.weight || 0.5}кг${extras.urgent ? ' · срочно' : ''}${extras.signature ? ' · под подпись' : ''}`);
    if (category === 'intercity') detailLines.push(`Запланировано: ${extras.scheduledAt ? new Date(extras.scheduledAt).toLocaleString('ru') : 'сейчас'}${extras.returnTrip ? ' · обратно' : ''}`);
    if (extras.comment) detailLines.push(extras.comment);
    const tariffComment = detailLines.filter(Boolean).join(' | ') || undefined;

    setOrderState('searching');
    try {
      const { data, error } = await supabase.from('taxi_orders').insert({
        passenger_id: user.id,
        pickup_address: fromText,
        pickup_lat: fromCoord?.[0],
        pickup_lng: fromCoord?.[1],
        dropoff_address: toText || undefined,
        dropoff_lat: toCoord?.[0],
        dropoff_lng: toCoord?.[1],
        category,
        status: 'searching',
        price: selectedPrice,
        distance_km: Math.round(routeInfo.distanceKm * 10) / 10,
        duration_min: routeInfo.durationMin,
        demand_coef: demandCoef,
        payment_method: paymentMethod,
        comment: tariffComment,
        passengers_count: extras.passengers ?? extras.childSeats ?? 1,
        has_luggage: !!extras.luggage,
        child_seat: !!(extras.childSeat || extras.childSeats),
        pets_allowed: !!extras.pets,
        has_ac: extras.has_ac ?? true,
      }).select().single();
      if (error) throw error;
      setOrderId(data.id);
      toast.success(`Ищем водителя · ${formatTJS(selectedPrice)} TJS${paymentMethod !== 'cash' ? '' : ' · наличные'}`);
    } catch (e) {
      toast.error(navigator.onLine ? 'Ошибка при создании заказа' : 'Нет интернета. Проверьте подключение');
      setOrderState('idle');
    }
  }, [fromText, fromCoord, toText, toCoord, category, paymentMethod, routeInfo, selectedPrice, demandCoef, user?.id, tariffExtras]);

  const handleCancel = useCallback(async () => {
    if (!orderId) return;
    try {
      const { error } = await supabase.from('taxi_orders').update({ status: 'cancelled', cancelled_by: 'passenger' }).eq('id', orderId);
      if (error) throw new Error(error.message);
      setOrderState('idle');
      setOrderId(null);
      setDriverInfo(null);
      setDriverPosition(null);
      setChatOpen(false);
      setRideRating(0);
      setRideTip('');
      setRideComment('');
      toast.info('Заказ отменён');
    } catch (err) {
      toast.error(err.message || 'Ошибка отмены заказа');
    }
  }, [orderId]);

  const shareText = useMemo(() =>
    `Поездка Karta.AD Taxi\nОткуда: ${fromText || '—'}\nКуда: ${toText || '—'}\nВодитель: ${driverInfo?.name || ''} ${driverInfo?.car || ''} ${driverInfo?.plate || ''}`,
  [fromText, toText, driverInfo]);

  const handleSos = useCallback(() => {
    const report = (lat, lng) => {
      supabase.from('taxi_emergencies').insert({
        order_id: orderId,
        user_id: user.id,
        role: 'passenger',
        lat,
        lng,
        message: `SOS от пассажира. Водитель: ${driverInfo?.name || '—'} ${driverInfo?.plate || ''}`,
      }).then(({ error }) => {
        if (error) toast.error('Ошибка отправки SOS в систему');
      });
      const coords = `https://maps.google.com/?q=${lat},${lng}`;
      const msg = `SOS! Поездка Karta.AD. Мои координаты: ${coords}. Водитель: ${driverInfo?.name || '—'} ${driverInfo?.plate || ''}`;
      try { if (navigator.share) navigator.share({ title: 'SOS', text: msg }); else toast.info(msg); } catch {}
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => report(pos.coords.latitude, pos.coords.longitude),
        () => { report(userPosition?.[0] || null, userPosition?.[1] || null); toast.info('SOS: используются последние координаты'); },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      report(userPosition?.[0] || null, userPosition?.[1] || null);
    }
    toast.warning('SOS отправлен. Сообщите в полицию 112');
  }, [driverInfo, orderId, user?.id, userPosition]);

  const handleRateDriver = useCallback(async () => {
    if (!orderId || !rideRating) { toast.error('Поставьте оценку поездке'); return; }

    // Оплата через кошелёк
    if (paymentMethod === 'wallet') {
      const { data: payResult } = await supabase.rpc('taxi_pay_wallet', {
        p_passenger_id: user.id,
        p_driver_id: driverInfo?.driverId,
        p_amount: selectedPrice || 0,
        p_order_id: orderId,
      });
      if (payResult === false) {
        toast.error('Ошибка: недостаточно средств в кошельке');
        return;
      }
      // Уведомление водителю: последние 4 цифры + сумма
      const { data: passengerProfile } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
      const last4 = (passengerProfile?.phone || '').slice(-4);
      const amount = formatTJS(selectedPrice || 0);
      supabase.from('notifications').insert({
        user_id: driverInfo?.driverId,
        title: `Оплата ${amount} TJS`,
        body: `Кошелёк · ****${last4}`,
        type: 'taxi_wallet_payment',
      }).then(({ error }) => { if (error) console.error('[TaxiPassenger] notification failed:', error); }).catch(() => {});
    }

    const tip = parseFloat(rideTip) || 0;
    const { error } = await supabase.from('taxi_ratings').insert({
      order_id: orderId,
      from_id: user.id,
      to_id: driverInfo?.driverId,
      rating: rideRating,
      comment: rideComment || null,
      tip: tip || null,
    });
    if (error) { console.error(error); toast.error('Не удалось сохранить оценку'); return; }
    await supabase.rpc('taxi_recompute_driver_rating', { p_driver_id: driverInfo?.driverId });
    toast.success('Спасибо за оценку!');
    setOrderState('idle');
    setOrderId(null);
    setDriverInfo(null);
    setDriverPosition(null);
  }, [orderId, rideRating, rideTip, rideComment, driverInfo, user?.id, paymentMethod, selectedPrice]);

  const toggleFavorite = useCallback(async () => {
    if (!driverInfo?.driverId || !user?.id) return;
    if (isFavoriteDriver) {
      await supabase.from('taxi_favorite_drivers').delete().eq('passenger_id', user.id).eq('driver_id', driverInfo.driverId);
      setIsFavoriteDriver(false);
      toast.info('Водитель удалён из избранного');
    } else {
      await supabase.from('taxi_favorite_drivers').insert({ passenger_id: user.id, driver_id: driverInfo.driverId });
      setIsFavoriteDriver(true);
      toast.success('Водитель добавлен в избранное ❤');
    }
  }, [driverInfo, isFavoriteDriver, user?.id]);

  const renderOrderFlow = () => {
    switch (orderState) {
      case 'searching':
        return (
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 size={22} className="shrink-0 animate-spin text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Ищем машину</p>
                <p className="text-[12px] text-slate-500">
                  {selectedPrice != null ? `${formatTJS(selectedPrice)} TJS` : 'Расчёт цены...'}
                  {(nearbyCars[category]?.cars ?? nearbyDrivers.length) > 0
                    ? ` · рядом ${nearbyCars[category]?.cars ?? nearbyDrivers.length}`
                    : ''}
                </p>
              </div>
            </div>
            <button type="button" onClick={handleCancel} className="h-11 w-full rounded-2xl bg-slate-100 text-sm font-semibold text-red-500 dark:bg-slate-800">
              Отменить
            </button>
          </div>
        );
      case 'found':
      case 'en_route':
        return (
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200/50 dark:border-emerald-800/30">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                {driverInfo?.photo ? <img src={driverInfo.photo} alt="Водитель" className="h-full w-full object-cover" /> : <span className="text-lg font-black text-slate-600">{(driverInfo?.name?.[0] || '?')}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{driverInfo?.name || 'Водитель'}</p>
                <p className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <Star size={11} className="text-amber-500 fill-amber-500" /> {driverInfo?.rating || '5.0'} <span className="text-slate-300">·</span> {driverInfo?.rides || 0} поездок
                </p>
                <p className="truncate text-[11px] text-slate-500">{driverInfo?.car || 'Автомобиль'} {driverInfo?.color ? `· ${driverInfo.color}` : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xl font-black leading-none text-emerald-600">{driverEta ?? '—'}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">до подачи</p>
                <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-1">{formatTJS(selectedPrice)} TJS</p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              {driverInfo?.carPhoto ? (
                <img src={driverInfo.carPhoto} alt="Авто" className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-28 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex flex-col items-center justify-center gap-1.5">
                  <Car size={28} className="text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Фото авто не загружено</span>
                </div>
              )}
              <div className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black truncate">{driverInfo?.car || 'Автомобиль не указан'}</p>
                  <p className="text-xs font-bold text-slate-500 truncate">{driverInfo?.color ? `${driverInfo.color} · ` : ''}Госномер {driverInfo?.plate || '—'} {driverInfo?.category ? `· ${driverInfo.category}` : ''}</p>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs tracking-wider flex-shrink-0">
                  {driverInfo?.plate || '—'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => { setUnreadChat(0); setChatOpen(true); }} className="relative flex h-11 items-center justify-center gap-1 rounded-2xl bg-slate-100 text-xs font-bold dark:bg-slate-800">
                <MessageCircle size={14} /> Чат
                {unreadChat > 0 && <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-red-500 text-[9px] text-white">{unreadChat}</span>}
              </button>
              <a href={`tel:${driverInfo?.phone || ''}`} className="flex h-11 items-center justify-center gap-1 rounded-2xl bg-slate-100 text-xs font-bold dark:bg-slate-800">
                <Phone size={14} /> Звонок
              </a>
              <button type="button" onClick={() => setShareOpen(true)} className="flex h-11 items-center justify-center gap-1 rounded-2xl bg-slate-100 text-xs font-bold dark:bg-slate-800">
                <Share2 size={14} />
              </button>
            </div>
            <button type="button" onClick={handleCancel} className="w-full py-1 text-xs font-semibold text-red-500">Отменить</button>
          </div>
        );
      case 'riding':
        return (
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-400">Осталось</p>
                <p className="text-base font-black">~{rideRemaining?.min ?? '—'} мин · {(rideRemaining?.km ?? routeInfo?.distanceKm ?? 0).toFixed(1)} км</p>
              </div>
              <p className="text-lg font-black">{formatTJS(selectedPrice)} TJS</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => { setUnreadChat(0); setChatOpen(true); }} className="relative flex h-11 flex-col items-center justify-center rounded-2xl bg-slate-100 text-[10px] font-bold dark:bg-slate-800">
                <MessageCircle size={14} /> Чат
                {unreadChat > 0 && <span className="absolute right-1 top-1 h-3.5 min-w-3.5 rounded-full bg-red-500 text-[8px] text-white">{unreadChat}</span>}
              </button>
              <button type="button" onClick={handleSos} className="flex h-11 flex-col items-center justify-center rounded-2xl bg-red-50 text-[10px] font-bold text-red-600 dark:bg-red-900/20">
                <AlertTriangle size={14} /> SOS
              </button>
              <button type="button" onClick={() => setShareOpen(true)} className="flex h-11 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                <Share2 size={14} />
              </button>
              <a href={`tel:${driverInfo?.phone || ''}`} className="flex h-11 flex-col items-center justify-center rounded-2xl bg-slate-100 text-[10px] font-bold dark:bg-slate-800">
                <Phone size={14} /> Звонок
              </a>
            </div>
          </div>
        );
      case 'completed':
        return (
          <div className="space-y-3 px-4 py-3">
            <div className="text-center">
              <p className="text-base font-bold">Поездка завершена</p>
              <p className="mt-0.5 text-xs text-slate-500">{formatTJS(selectedPrice)} TJS · {driverInfo?.name || ''}</p>
            </div>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRideRating(s)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${rideRating >= s ? 'text-amber-500' : 'text-slate-300'}`}
                >
                  <Star size={20} fill={rideRating >= s ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={rideTip}
                onChange={(e) => setRideTip(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Чаевые"
                inputMode="decimal"
                className="h-11 flex-1 rounded-2xl bg-slate-100 px-3 text-xs outline-none dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={toggleFavorite}
                className={`flex h-11 items-center gap-1 rounded-2xl px-3 text-xs font-bold ${isFavoriteDriver ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                <Heart size={14} fill={isFavoriteDriver ? 'currentColor' : 'none'} />
              </button>
            </div>
            <textarea
              value={rideComment}
              onChange={(e) => setRideComment(e.target.value)}
              placeholder="Комментарий"
              rows={2}
              className="w-full resize-none rounded-2xl bg-slate-100 px-3 py-2 text-xs outline-none dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={handleRateDriver}
              disabled={!rideRating}
              className={`h-12 w-full rounded-2xl text-sm font-bold ${rideRating ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-700'}`}
            >
              Готово
            </button>
            <button type="button" onClick={() => setOrderState('idle')} className="w-full py-1 text-xs font-semibold text-blue-600">
              Повторить поездку
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Map Layer */}
      <div className="absolute inset-0 z-0" style={{ bottom: 0 }}>
        <MapContainer
          center={[38.5358, 68.7791]}
          zoom={13}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={TILE_URL} attribution={ATTR} />
          <LocationMarker userPosition={userPosition} setUserPosition={setUserPosition} recenterNonce={recenterNonce} />
          <CenterOnPreview place={previewPlace} />
          <MapClickHandler onMapClick={handleMapClick} />
          {nearbyDrivers.length > 0 && <NearbyDrivers drivers={nearbyDrivers} />}
          {fromCoord && (
            <Marker
              position={fromCoord}
              icon={pickupIcon}
              draggable={!orderId}
              eventHandlers={{
                dragend: (e) => { const p = e.target.getLatLng(); geocodeLatLng(p.lat, p.lng, 'from'); },
              }}
            />
          )}
          {toCoord && (
            <Marker
              position={toCoord}
              icon={dropoffIcon}
              draggable={!orderId}
              eventHandlers={{
                dragend: (e) => { const p = e.target.getLatLng(); geocodeLatLng(p.lat, p.lng, 'to'); },
              }}
            />
          )}
          {driverPosition && <Marker position={driverPosition} icon={carIcon} />}
          {userPosition && <Marker position={userPosition} icon={userIcon} />}
          {previewPlace && <Marker position={[previewPlace.lat, previewPlace.lng]} icon={previewIcon} />}
          {routeGeometry.length > 1 && (
            <Polyline positions={routeGeometry} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.7 }} />
          )}
        </MapContainer>
      </div>

      {pickTarget && !previewPlace && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
            <MapPin size={14} />
            Точка на карте
          </div>
        </div>
      )}

      {userPosition && !showSearch && (
        <button
          type="button"
          onClick={() => setRecenterNonce((n) => n + 1)}
          className="glass-pill absolute right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 dark:text-slate-200"
          style={{ bottom: 'min(42vh, 340px)' }}
          aria-label="Моё местоположение"
        >
          <LocateFixed size={18} />
        </button>
      )}

      {previewPlace && (
        <div className="absolute inset-x-0 bottom-0 z-50 px-3 pb-3 md:mx-auto md:max-w-md">
          <div className="space-y-3 rounded-[28px] border border-slate-200/70 bg-white/95 p-4 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Star size={16} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{previewPlace.name}</p>
                <p className="text-[10px] text-slate-400">Проверьте место на карте</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setPreviewPlace(null); setShowSearch(true); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => { applyAddress(previewPlace); setPreviewPlace(null); setShowSearch(false); }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-colors"
              >
                Выбрать
              </button>
            </div>
          </div>
        </div>
      )}

      <TaxiChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        orderId={orderId}
        meId={user?.id}
        otherName={driverInfo?.name || 'Водитель'}
      />

      <ShareMenu open={shareOpen} onClose={() => setShareOpen(false)} text={shareText} />

      {showSearch ? (
        <div className="absolute inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setSaveTarget(null); }} className="text-slate-500">
              <X size={20} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Поиск адреса..."
                autoFocus
                className="flex-1 bg-transparent outline-none text-sm"
              />
              <button onClick={handleVoice} className="text-slate-400 hover:text-blue-600 transition-colors" title="Голосовой поиск">
                <Mic size={16} />
              </button>
            </div>
          </div>

          {saveTarget && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-bold flex items-center gap-2 flex-shrink-0">
              <Star size={12} />
              Выберите адрес — он сохранится как «{FAVORITE_PLACES.find(f => f.key === saveTarget)?.label}»
            </div>
          )}

          {!searchQuery && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Избранное</p>
              <div className="flex gap-2">
                {FAVORITE_PLACES.map(f => {
                  const saved = favorites[f.key];
                  const Icon = f.icon;
                  return (
                    <div key={f.key} className={`flex-1 relative rounded-xl border-2 text-[11px] font-bold transition-all ${
                      saveTarget === f.key
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600'
                    }`}>
                      {saved && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setFavorites(prev => { const next = { ...prev }; delete next[f.key]; saveJSON('kartaad_favs', next); return next; }); toast.info(`${f.label} удалён`); }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center z-10 hover:bg-red-600 transition-colors"
                        >
                          <X size={8} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (saved) { setPreviewPlace({ name: saved.name, lat: saved.lat, lng: saved.lng, target: pickTarget || 'from' }); setShowSearch(false); }
                          else { setSaveTarget(f.key); setPickTarget('from'); }
                        }}
                        className="w-full flex items-center gap-1.5 px-3 py-2.5"
                      >
                        <Icon size={13} />
                        <span className="flex flex-col items-start leading-tight">
                          <span>{f.label}</span>
                          <span className={`text-[9px] font-medium max-w-[60px] truncate ${saved ? 'text-slate-400' : 'text-blue-500'}`}>
                            {saved ? saved.name : '+ адрес'}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {recents.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Недавние</p>
                  <div className="space-y-1">
                    {recents.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => { setPreviewPlace({ name: r.name, lat: r.lat, lng: r.lng, target: pickTarget || 'from' }); setShowSearch(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate text-left flex-1">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {popularPlaces.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Часто посещаемые</p>
                  <div className="space-y-1">
                    {popularPlaces.map((p, i) => (
                      <button
                        key={`${p.lat}-${p.lng}-${i}`}
                        onClick={() => { setPreviewPlace({ name: p.name, lat: p.lat, lng: p.lng, target: pickTarget || 'from' }); setShowSearch(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-black text-blue-600">{p.count}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate text-left flex-1">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button onClick={() => setShowSearch(false)} className="w-full flex items-center gap-3 px-4 py-3 text-blue-600 font-bold text-xs border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex-shrink-0">
            <Navigation size={16} />
            Выбрать на карте
          </button>
          <div className="overflow-y-auto flex-1">
            {searchResults.map(item => (
              <button
                key={item.id}
                onClick={() => handleSelectSearch(item)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100/50 dark:border-slate-800/50"
              >
                <MapPin size={16} className="text-slate-400" />
                <div className="text-left">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-400">{item.type}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-2 md:left-4 md:right-auto md:w-[380px] md:max-w-[calc(100vw-2rem)] md:px-0">
          {['idle', 'cancelled'].includes(orderState) && !pickTarget && !previewPlace && (
            <div className="pointer-events-auto flex max-h-[52vh] flex-col overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/94 shadow-[0_8px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/94">
              <div className="flex justify-center pt-2">
                <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
              <div className="divide-y divide-slate-100 px-4 dark:divide-slate-800">
                <LocationField
                  variant="from"
                  value={fromText}
                  placeholder="Откуда"
                  onPick={() => { setPickTarget('from'); setShowSearch(true); }}
                  onClear={() => { setFromText(''); setFromCoord(null); }}
                />
                <LocationField
                  variant="to"
                  value={toText}
                  placeholder="Куда"
                  onPick={() => { setPickTarget('to'); setShowSearch(true); }}
                  onClear={() => { setToText(''); setToCoord(null); }}
                />
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-2">
                {routeInfo && (
                  <div className="mb-2">
                    <RouteSummary routeInfo={routeInfo} price={selectedPrice} demand={demandCoef} />
                  </div>
                )}
                <TaxiCategoryCard selected={category} onSelect={setCategory} priceInfo={priceInfo} compact demandCoef={demandCoef} />

                <button
                  type="button"
                  onClick={() => setShowOptions((v) => !v)}
                  className="mt-2 flex h-10 w-full items-center justify-between rounded-2xl bg-slate-50 px-3 text-[12px] font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal size={14} />
                    Опции · {PASSENGER_TARIFFS.find((t) => t.id === category)?.label || category}
                  </span>
                  <ChevronDown size={16} className={showOptions ? 'rotate-180' : ''} />
                </button>
                {showOptions && (
                  <div className="mt-2">
                    <TaxiTariffPanel
                      category={category}
                      extras={tariffExtras[category] || {}}
                      setExtras={(patch) => setTariffExtras((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }))}
                      routeInfo={routeInfo}
                    />
                  </div>
                )}

                <div className="mt-2 grid grid-cols-4 gap-1.5 pb-2">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon;
                    const isActive = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-[10px] font-bold ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-slate-200 text-slate-500 dark:border-slate-700'
                        }`}
                      >
                        <Icon size={14} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                {paymentMethod === 'wallet' && (
                  <p className={`mb-2 text-center text-[11px] font-semibold ${(user?.balance || 0) >= (selectedPrice || 0) ? 'text-amber-600' : 'text-red-500'}`}>
                    Баланс {formatTJS(user?.balance || 0)} TJS
                  </p>
                )}
              </div>

              <div className="px-4 pb-3 pt-1">
                <button
                  type="button"
                  onClick={handleOrder}
                  disabled={!fromText || selectedPrice == null}
                  className={`flex h-12 w-full items-center justify-center gap-1 rounded-2xl text-sm font-bold ${
                    fromText && selectedPrice != null
                      ? 'bg-blue-600 text-white active:scale-[0.98]'
                      : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  Заказать{selectedPrice != null ? ` · ${formatTJS(selectedPrice)} TJS` : ''}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
          {['searching', 'found', 'en_route', 'riding', 'completed'].includes(orderState) && !pickTarget && (
            <div className="pointer-events-auto overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/95 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/95">
              {renderOrderFlow()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
