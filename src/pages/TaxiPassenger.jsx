import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { useLocation } from 'react-router-dom';
import {
  MapPin, Search, X, Loader2, Car, ChevronRight, Phone, Share2,
  AlertTriangle, Star, Navigation, Banknote, CreditCard, QrCode, Heart, Route,
  Home, Briefcase, GraduationCap, Mic, MessageCircle, Wallet,
} from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import { snapToRoad, snapPositions } from '@/lib/osrm';
import TaxiCategoryCard from '@/components/taxi/TaxiCategoryCard';
import TaxiChat from '@/components/taxi/TaxiChat';
import ShareMenu from '@/components/taxi/ShareMenu';
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

function LocationMarker({ userPosition, setUserPosition }) {
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

function LocationField({ value, placeholder, onPick, onClear }) {
  return (
    <div onClick={onPick} className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-all text-left cursor-pointer">
      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <MapPin size={14} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${value ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
          {value || placeholder}
        </p>
      </div>
      {value && (
        <span onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
          <X size={14} />
        </span>
      )}
    </div>
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
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-slate-500"><Route size={13} /> {routeInfo.distanceKm.toFixed(1)} км</span>
          <span className="flex items-center gap-1 text-slate-500"><Navigation size={13} /> ~{routeInfo.durationMin} мин</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${d.tone}`}>
          {d.badge} {d.label}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Итоговая цена</p>
        <p className="text-lg font-black text-blue-600">{price != null ? `${formatTJS(price)} TJS` : '—'}</p>
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
  const [saveTarget, setSaveTarget] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
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
        .in('status', ['searching', 'found', 'en_route', 'riding'])
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
      out[t.id] = {
        price: calcPrice({ distanceKm: routeInfo.distanceKm, durationMin: routeInfo.durationMin, category: t.id, demandCoef, night }),
        eta: pickupEtaMin(nearby?.nearestKm ?? null),
        cars: nearby?.cars ?? 0,
      };
    }
    return out;
  }, [routeInfo, demandCoef, nearbyCars]);

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
      const { data: driver } = await supabase.from('taxi_drivers').select('full_name, phone, photo_url, rating, rides_count').eq('user_id', driverInfo.driverId).single();
      const { data: vehicle } = await supabase.from('taxi_vehicles').select('make, model, color, plate_number, category').eq('driver_id', driverInfo.driverId).single();
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
        }));
      }
    };
    if (driverInfo?.driverId) fetchDriverInfo();
  }, [driverInfo?.driverId]);

  useEffect(() => {
    if (!driverInfo?.driverId || !user?.id) return;
    supabase.from('taxi_favorite_drivers')
      .select('id').eq('passenger_id', user.id).eq('driver_id', driverInfo.driverId).maybeSingle()
      .then(({ data }) => setIsFavoriteDriver(!!data));
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
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [fromCoord, user?.id]);

  useEffect(() => {
    if (orderState === 'searching' || orderState === 'found') {
      let alive = true;
      const refresh = async () => {
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
      }
    } catch {}
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
    if (pickTarget === 'from') { setFromText(item.name); setFromCoord([item.lat, item.lng]); }
    else { setToText(item.name); setToCoord([item.lat, item.lng]); }
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

  const handleMapClick = useCallback((latlng) => {
    if (!pickTarget) return;
    geocodeLatLng(latlng.lat, latlng.lng, pickTarget);
    setPickTarget(null);
    setSaveTarget(null);
  }, [pickTarget, geocodeLatLng]);

  const handleOrder = useCallback(async () => {
    if (!fromText) { toast.error('Укажите откуда'); return; }
    if (!routeInfo || selectedPrice == null) { toast.error('Рассчитываем цену...'); return; }
    if (paymentMethod === 'wallet' && (user?.balance || 0) < selectedPrice) {
      toast.error('Недостаточно средств в кошельке. Пополните баланс в профиле.');
      return;
    }
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
        comment: undefined,
      }).select().single();
      if (error) throw error;
      setOrderId(data.id);
      toast.success(`Ищем водителя · ${formatTJS(selectedPrice)} TJS`);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка при создании заказа');
      setOrderState('idle');
    }
  }, [fromText, fromCoord, toText, toCoord, category, paymentMethod, routeInfo, selectedPrice, demandCoef, user?.id]);

  const handleCancel = useCallback(async () => {
    if (!orderId) return;
    await supabase.from('taxi_orders').update({ status: 'cancelled', cancelled_by: 'passenger' }).eq('id', orderId);
    setOrderState('idle');
    setOrderId(null);
    setDriverInfo(null);
    setDriverPosition(null);
    setChatOpen(false);
    setRideRating(0);
    setRideTip('');
    setRideComment('');
    toast.info('Заказ отменён');
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
      }).then().catch(() => {});
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
      const { data: passengerProfile } = await supabase.from('profiles').select('phone').eq('id', user.id).single();
      const last4 = (passengerProfile?.phone || '').slice(-4);
      const amount = formatTJS(selectedPrice || 0);
      supabase.from('notifications').insert({
        user_id: driverInfo?.driverId,
        title: `Оплата ${amount} TJS`,
        body: `Кошелёк · ****${last4}`,
        type: 'taxi_wallet_payment',
      }).then().catch(() => {});
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
    const { data: all } = await supabase.from('taxi_ratings').select('rating').eq('to_id', driverInfo?.driverId);
    const list = all || [];
    const avg = list.length ? list.reduce((s, r) => s + Number(r.rating), 0) / list.length : rideRating;
    await supabase.from('taxi_drivers').update({ rating: Math.round(avg * 10) / 10, rating_count: list.length }).eq('user_id', driverInfo?.driverId);
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
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Loader2 size={20} className="animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Поиск водителя...</p>
                <p className="text-[11px] text-blue-600/70">{selectedPrice != null ? `${formatTJS(selectedPrice)} TJS · ${demandLabel(demandCoef).label}` : 'Пожалуйста, подождите'}</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">Рядом {nearbyCars[category]?.cars ?? nearbyDrivers.length} машин этого тарифа</p>
              <div className="flex justify-center gap-1">
                {(nearbyDrivers.length ? nearbyDrivers : [{ id: 1 }]).slice(0, 5).map((d, i) => (
                  <div key={d.driver_id || d.id || i} className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Car size={14} className="text-blue-600" />
                  </div>
                ))}
              </div>
            </div>
            <button onClick={handleCancel} className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors">
              Отменить заказ
            </button>
          </div>
        );
      case 'found':
      case 'en_route':
        return (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                {driverInfo?.photo ? <img src={driverInfo.photo} alt="" className="w-full h-full object-cover" /> : (driverInfo?.name?.[0] || '?')}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">{driverInfo?.name || 'Водитель'}</p>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Star size={10} className="text-amber-500" /> {driverInfo?.rating || '5.0'}
                  <span className="mx-1">·</span>
                  <Car size={10} /> {driverInfo?.car || 'Автомобиль'}
                </div>
                <p className="text-[10px] text-slate-400">
                  {driverInfo?.color ? `${driverInfo.color} · ` : ''}{driverInfo?.plate || '-----'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-600">{driverEta ?? '—'} мин</p>
                <p className="text-[10px] text-slate-400">до подачи</p>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">{formatTJS(selectedPrice)} TJS</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setUnreadChat(0); setChatOpen(true); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-xs font-bold hover:bg-blue-100 transition-colors relative">
                <MessageCircle size={14} /> Чат
                {unreadChat > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
              <a href={`tel:${driverInfo?.phone || ''}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 transition-colors">
                <Phone size={14} /> Позвонить
              </a>
              <button onClick={() => setShareOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 transition-colors">
                <Share2 size={14} /> Поделиться
              </button>
            </div>
            <button onClick={handleCancel} className="w-full py-2.5 rounded-xl text-red-500 text-xs font-bold hover:bg-red-50 transition-colors">
              Отменить заказ
            </button>
          </div>
        );
      case 'riding':
        return (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <div>
                <p className="text-xs text-slate-500">Осталось времени</p>
                <p className="text-lg font-bold text-indigo-600">~{rideRemaining?.min ?? '—'} мин</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Осталось</p>
                <p className="text-lg font-bold">{(rideRemaining?.km ?? routeInfo?.distanceKm ?? 0).toFixed(1)} км</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Стоимость</p>
                <p className="text-lg font-black text-emerald-600">{formatTJS(selectedPrice)} TJS</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { setUnreadChat(0); setChatOpen(true); }} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[10px] font-bold relative">
                <MessageCircle size={14} /> Чат
                {unreadChat > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
              <button onClick={handleSos} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 text-[10px] font-bold">
                <AlertTriangle size={14} /> SOS
              </button>
              <button onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                <Share2 size={14} />
              </button>
              <a href={`tel:${driverInfo?.phone || ''}`} className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                <Phone size={14} /> Звонок
              </a>
            </div>
            <button onClick={handleCancel} className="w-full py-2.5 rounded-xl text-red-500 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              Отменить заказ
            </button>
          </div>
        );
      case 'completed':
        return (
          <div className="p-4 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <Car size={28} className="text-emerald-600" />
              </div>
              <p className="text-lg font-bold">Поездка завершена</p>
              <p className="text-xs text-slate-500 mt-1">{formatTJS(selectedPrice)} TJS · {driverInfo?.name || ''}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Откуда</span><span className="font-medium truncate pl-2">{fromText}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Куда</span><span className="font-medium truncate pl-2">{toText}</span></div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2 text-center">Оцените водителя</p>
              <div className="flex justify-center gap-1 mb-2">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setRideRating(s)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${rideRating >= s ? 'bg-amber-100 text-amber-500 scale-110' : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-500'}`}>
                    <Star size={18} fill={rideRating >= s ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={rideTip}
                  onChange={(e) => setRideTip(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="Чаевые, TJS"
                  inputMode="decimal"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={toggleFavorite}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${isFavoriteDriver ? 'bg-rose-100 text-rose-500 dark:bg-rose-900/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-rose-50'}`}
                >
                  <Heart size={14} fill={isFavoriteDriver ? 'currentColor' : 'none'} />
                  {isFavoriteDriver ? 'В избранном' : 'В избранное'}
                </button>
              </div>
              <textarea
                value={rideComment}
                onChange={(e) => setRideComment(e.target.value)}
                placeholder="Комментарий или жалоба (необязательно)"
                rows={2}
                className="w-full mt-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
              <button
                onClick={handleRateDriver}
                disabled={!rideRating}
                className={`w-full mt-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  rideRating ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                Завершить и оценить
              </button>
              <button
                onClick={() => setOrderState('idle')}
                className="w-full py-2 text-blue-600 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
              >
                Повторить поездку с теми же адресами
              </button>
            </div>
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
          <LocationMarker userPosition={userPosition} setUserPosition={setUserPosition} />
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
          {routeGeometry.length > 1 && (
            <Polyline positions={routeGeometry} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.7 }} />
          )}
        </MapContainer>
      </div>

      {/* Pick mode hint */}
      {pickTarget && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2">
          <MapPin size={14} />
          Выберите точку на карте
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
                    <button
                      key={f.key}
                      onClick={() => {
                        if (saved) { applyAddress({ name: saved.name, lat: saved.lat, lng: saved.lng }); setShowSearch(false); }
                        else { setSaveTarget(f.key); }
                      }}
                      className={`flex-1 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${
                        saveTarget === f.key
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      <Icon size={13} />
                      <span className="flex flex-col items-start leading-tight">
                        <span>{f.label}</span>
                        <span className={`text-[9px] font-medium max-w-[60px] truncate ${saved ? 'text-slate-400' : 'text-blue-500'}`}>
                          {saved ? saved.name : '+ адрес'}
                        </span>
                      </span>
                    </button>
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
                        onClick={() => { applyAddress(r); setShowSearch(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate text-left flex-1">{r.name}</span>
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
        <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col max-h-[65vh]">
          {['idle', 'cancelled'].includes(orderState) && !pickTarget && (
            <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col max-h-[65vh]">
              <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Car size={18} className="text-blue-600" />
                  <h2 className="text-sm font-bold">Karta.AD Taxi</h2>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{demandLabel(demandCoef).label}</span>
              </div>
              <div className="px-4 pb-2 space-y-1.5 flex-shrink-0">
                <LocationField
                  value={fromText} placeholder="Откуда"
                  onPick={() => { setPickTarget('from'); setShowSearch(true); }}
                  onClear={() => { setFromText(''); setFromCoord(null); }}
                />
                <LocationField
                  value={toText} placeholder="Куда"
                  onPick={() => { setPickTarget('to'); setShowSearch(true); }}
                  onClear={() => { setToText(''); setToCoord(null); }}
                />
              </div>

              {routeInfo && (
                <div className="px-4 pb-2 flex-shrink-0">
                  <RouteSummary routeInfo={routeInfo} price={selectedPrice} demand={demandCoef} />
                </div>
              )}

              <div className="overflow-y-auto flex-1 min-h-0 px-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Тариф</p>
                <TaxiCategoryCard selected={category} onSelect={setCategory} priceInfo={priceInfo} compact demandCoef={demandCoef} />

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 mt-3">Оплата</p>
                <div className="flex gap-2 pb-3">
                  {PAYMENT_METHODS.map(m => {
                    const Icon = m.icon;
                    const isActive = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border-2 min-w-[80px] transition-all duration-200 ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/10'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-md`}>
                          <Icon size={14} className="text-white" />
                        </div>
                        <p className={`font-bold text-[10px] ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {m.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {paymentMethod === 'wallet' && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs mb-1 ${
                    (user?.balance || 0) >= (selectedPrice || 0)
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}>
                    <span className="font-medium">Баланс кошелька</span>
                    <span className="font-black">{formatTJS(user?.balance || 0)} TJS</span>
                  </div>
                )}
              </div>

              <div className="px-4 pb-4 flex-shrink-0">
                <button
                  onClick={handleOrder}
                  disabled={!fromText || selectedPrice == null}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
                    fromText && selectedPrice != null
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    Заказать {selectedPrice != null ? `· ${formatTJS(selectedPrice)} TJS` : ''}
                    <ChevronRight size={16} />
                  </span>
                </button>
              </div>
            </div>
          )}
          {['searching', 'found', 'en_route', 'riding', 'completed'].includes(orderState) && !pickTarget && (
            <div className="relative z-10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-800/60 flex-1 min-h-0 overflow-y-auto custom-scrollbar pointer-events-auto">
              {renderOrderFlow()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
