import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, Search, X, Loader2, Car, ChevronRight, Phone, MessageCircle, Share2, AlertTriangle, Star, Navigation } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';
import TaxiCategoryCard from '@/components/taxi/TaxiCategoryCard';

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
        <div className="text-xs">Водитель {d.driver_id?.slice(0, 6)}</div>
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

export default function TaxiPassenger() {
  const { user } = useCurrentUser();
  const [fromText, setFromText] = useState('');
  const [fromCoord, setFromCoord] = useState(null);
  const [toText, setToText] = useState('');
  const [toCoord, setToCoord] = useState(null);
  const [category, setCategory] = useState('economy');
  const [orderState, setOrderState] = useState('idle');
  const [orderId, setOrderId] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pickTarget, setPickTarget] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [rideRating, setRideRating] = useState(0);
  const searchTimer = useRef(null);

  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '&copy; OpenStreetMap contributors';

  useEffect(() => {
    if (!user?.id) return;
    const sub = supabase.channel('taxi-passenger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxi_orders', filter: `passenger_id=eq.${user.id}` }, (payload) => {
        if (payload.new) {
          setOrderState(payload.new.status);
          if (payload.new.driver_id) {
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
      const { data: driver } = await supabase.from('taxi_drivers').select('full_name, phone, photo_url, rating').eq('user_id', driverInfo.driverId).single();
      const { data: vehicle } = await supabase.from('taxi_vehicles').select('make, model, color, plate_number, category').eq('driver_id', driverInfo.driverId).single();
      if (driver || vehicle) {
        setDriverInfo(prev => ({
          ...prev,
          name: driver?.full_name || 'Водитель',
          rating: driver?.rating?.toFixed(1) || '5.0',
          photo: driver?.photo_url,
          phone: driver?.phone,
          car: vehicle ? `${vehicle.make} ${vehicle.model}` : null,
          plate: vehicle?.plate_number,
          color: vehicle?.color,
        }));
      }
    };
    if (driverInfo?.driverId) fetchDriverInfo();
  }, [driverInfo?.driverId]);

  useEffect(() => {
    if (orderState === 'searching' || orderState === 'found') {
      const interval = setInterval(async () => {
        const { data } = await supabase
          .from('taxi_driver_locations')
          .select('driver_id, lat, lng, heading')
          .eq('status', 'free')
          .order('updated_at', { ascending: false })
          .limit(20);
        if (data) setNearbyDrivers(data);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [orderState]);

  useEffect(() => {
    if (orderState === 'found' || orderState === 'en_route' || orderState === 'riding') {
      if (!driverInfo?.driverId) return;
      const sub = supabase.channel('taxi-driver-track')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'taxi_driver_locations',
          filter: `driver_id=eq.${driverInfo.driverId}`,
        }, (payload) => {
          if (payload.new) setDriverPosition([payload.new.lat, payload.new.lng]);
        })
        .subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [orderState, driverInfo?.driverId]);

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

  const handleSelectSearch = useCallback((item) => {
    if (pickTarget === 'from') { setFromText(item.name); setFromCoord([item.lat, item.lng]); }
    else { setToText(item.name); setToCoord([item.lat, item.lng]); }
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [pickTarget]);

  const handleMapClick = useCallback((latlng) => {
    if (!pickTarget) return;
    geocodeLatLng(latlng.lat, latlng.lng, pickTarget);
    setPickTarget(null);
  }, [pickTarget, geocodeLatLng]);

  const handleOrder = useCallback(async () => {
    if (!fromText) { toast.error('Укажите откуда'); return; }
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
      }).select().single();
      if (error) throw error;
      setOrderId(data.id);
      toast.success('Ищем ближайшего водителя...');
    } catch {
      toast.error('Ошибка при создании заказа');
      setOrderState('idle');
    }
  }, [fromText, fromCoord, toText, toCoord, category, user?.id]);

  const handleCancel = useCallback(async () => {
    if (!orderId) return;
    await supabase.from('taxi_orders').update({ status: 'cancelled', cancelled_by: 'passenger' }).eq('id', orderId);
    setOrderState('idle');
    setOrderId(null);
    setDriverInfo(null);
    setDriverPosition(null);
    toast.info('Заказ отменён');
  }, [orderId]);

  const renderOrderFlow = () => {
    switch (orderState) {
      case 'searching':
        return (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Loader2 size={20} className="animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Поиск водителя...</p>
                <p className="text-[11px] text-blue-600/70">Пожалуйста, подождите</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-2">Рядом {nearbyDrivers.length} водителей</p>
              <div className="flex justify-center gap-1">
                {nearbyDrivers.slice(0, 5).map((d, i) => (
                  <div key={d.driver_id || i} className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
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
                <p className="text-[10px] text-slate-400">{driverInfo?.plate || '-----'}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-600">{driverInfo?.eta || '3'} мин</p>
                <p className="text-[10px] text-slate-400">{driverInfo?.distance || '1.2'} км</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 transition-colors">
                <Phone size={14} /> Позвонить
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 transition-colors">
                <MessageCircle size={14} /> Чат
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
                <p className="text-xs text-slate-500">В пути</p>
                <p className="text-lg font-bold text-indigo-600">~{driverInfo?.eta || '12'} мин</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Осталось</p>
                <p className="text-lg font-bold">{driverInfo?.remaining || '5.2'} км</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-bold">
                <AlertTriangle size={14} /> SOS
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                <Share2 size={14} /> Поделиться
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                <MessageCircle size={14} /> Чат
              </button>
            </div>
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
              <p className="text-xs text-slate-500 mt-1">Спасибо, что выбрали Karta.AD Taxi!</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Откуда</span><span className="font-medium">{fromText}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Куда</span><span className="font-medium">{toText}</span></div>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-600 mb-2">Оцените поездку</p>
              <div className="flex justify-center gap-1 mb-3">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => {
                    setRideRating(s);
                    if (driverInfo?.driverId && orderId) {
                      supabase.from('taxi_orders').update({ rating: s }).eq('id', orderId);
                      const newCount = (parseInt(driverInfo.ratingCount || '0') + 1);
                      const newAvg = ((parseFloat(driverInfo.rating || '5.0') * (newCount - 1)) + s) / newCount;
                      supabase.from('taxi_drivers').update({ rating: newAvg, rating_count: newCount }).eq('user_id', driverInfo.driverId);
                    }
                    toast.success(`Оценка: ${s} из 5`);
                  }} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${rideRating >= s ? 'bg-amber-100 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 hover:text-amber-500'}`}>
                    <Star size={18} fill={rideRating >= s ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <button onClick={() => setOrderState('idle')} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
                На главную
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
          {fromCoord && <Marker position={fromCoord} icon={pickupIcon} />}
          {toCoord && <Marker position={toCoord} icon={dropoffIcon} />}
          {driverPosition && <Marker position={driverPosition} icon={carIcon} />}
          {userPosition && <Marker position={userPosition} icon={userIcon} />}
        </MapContainer>
      </div>

      {/* Pick mode hint */}
      {pickTarget && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2">
          <MapPin size={14} />
          Выберите точку на карте
        </div>
      )}

      {showSearch ? (
        <div className="absolute inset-0 z-50 bg-white dark:bg-slate-950">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="text-slate-500">
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
            </div>
          </div>
          <button onClick={() => setShowSearch(false)} className="w-full flex items-center gap-3 px-4 py-3 text-blue-600 font-bold text-xs border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <Navigation size={16} />
            Выбрать на карте
          </button>
          <div className="overflow-y-auto">
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
        <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col max-h-[55vh]">
          {orderState === 'idle' && !pickTarget && (
            <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <Car size={18} className="text-blue-600" />
                  <h2 className="text-sm font-bold">Karta.AD Taxi</h2>
                </div>
              </div>
              <div className="px-4 pb-2 space-y-1.5">
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
              <div className="px-4 pb-3">
                <TaxiCategoryCard selected={category} onSelect={setCategory} compact />
              </div>
              <div className="px-4 pb-4">
                <button
                  onClick={handleOrder}
                  disabled={!fromText}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
                    fromText
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    Заказать
                    <ChevronRight size={16} />
                  </span>
                </button>
              </div>
            </div>
          )}
          {['searching', 'found', 'en_route', 'riding', 'completed'].includes(orderState) && !pickTarget && (
            <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-800/60">
              {renderOrderFlow()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
