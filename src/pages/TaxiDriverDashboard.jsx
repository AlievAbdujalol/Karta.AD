import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { Car, History, DollarSign, Star, Clock, ChevronUp, FileCheck2 } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useNotificationCount } from '@/lib/NotificationContext';
import TaxiTopBar from '@/components/taxi/TaxiTopBar';
import TaxiStatsBar from '@/components/taxi/TaxiStatsBar';
import TaxiNewOrderCard from '@/components/taxi/TaxiNewOrderCard';
import TaxiOrderCard from '@/components/taxi/TaxiOrderCard';
import TaxiBottomSheet from '@/components/taxi/TaxiBottomSheet';
import TaxiChat from '@/components/taxi/TaxiChat';
import ShareMenu from '@/components/taxi/ShareMenu';
import { haversineKm, DRIVER_MATCH_RADIUS_KM, formatTJS, TAXI_COMMISSION } from '@/lib/taxi';
import { snapToRoad } from '@/lib/osrm';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const driverIcon = L.divIcon({
  className: '',
  html: '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(37,99,235,0.4);border:3px solid white;font-size:18px;">🚕</div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const pickupIcon = L.divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(34,197,94,0.4);border:3px solid white;font-size:12px;font-weight:bold;color:white;">A</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const dropoffIcon = L.divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(239,68,68,0.4);border:3px solid white;font-size:12px;font-weight:bold;color:white;">B</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function DriverMapMarker({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 15, { animate: true });
  }, [position, map]);
  return position ? <Marker position={position} icon={driverIcon} /> : null;
}

export default function TaxiDriverDashboard() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const { addLocalNotification } = useNotificationCount();
  const [isOnline, setIsOnline] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [cardPhase, setCardPhase] = useState('active');
  const [incomingOrder, setIncomingOrder] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [driverPosition, setDriverPosition] = useState(null);
  const [passengerInfo, setPassengerInfo] = useState(null);
  const [stats, setStats] = useState({ today: 0, week: 0, month: 0, rides: 0, rating: 5.0, online_minutes: 0 });
  const [isVerified, setIsVerified] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [watchId, setWatchId] = useState(null);

  const driverCategoryRef = useRef(null);
  const currentOrderRef = useRef(null);
  const driverPosRef = useRef(null);
  const isVerifiedRef = useRef(true);

  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);
  useEffect(() => { driverPosRef.current = driverPosition; }, [driverPosition]);

  const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '&copy; OpenStreetMap contributors';

  const loadStats = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now); monthStart.setDate(1);
    const base = supabase.from('taxi_orders').select('price, created_at').eq('driver_id', user.id).eq('status', 'completed');
    const [today, week, month] = await Promise.all([
      base.gte('created_at', dayStart.toISOString()),
      base.gte('created_at', weekStart.toISOString()),
      base.gte('created_at', monthStart.toISOString()),
    ]);
    const sum = (list) => (list || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
    setStats(prev => ({ ...prev, today: sum(today.data), week: sum(week.data), month: sum(month.data) }));
  }, [user?.id]);

  useEffect(() => {
    const fetchDriver = async () => {
      if (!user?.id) return;
      const [{ data: driver }, { data: vehicle }] = await Promise.all([
        supabase.from('taxi_drivers').select('*').eq('user_id', user.id).single(),
        supabase.from('taxi_vehicles').select('category').eq('driver_id', user.id).single(),
      ]);
      if (driver) {
        isVerifiedRef.current = !!driver.is_verified;
        setIsVerified(!!driver.is_verified);
        setIsOnline(driver.status === 'online' || driver.status === 'free');
        setStats(prev => ({ ...prev, rating: driver.rating || 5.0, rides: driver.rides_count || 0 }));
      }
      if (vehicle?.category) driverCategoryRef.current = vehicle.category;
    };
    fetchDriver();
    loadStats();
  }, [user?.id, loadStats]);

  // Восстановление / сброс активного заказа при загрузке
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const [{ data: loc }, { data: order }] = await Promise.all([
        supabase.from('taxi_driver_locations').select('lat, lng').eq('driver_id', user.id).maybeSingle(),
        supabase
          .from('taxi_orders')
          .select('id, status')
          .eq('driver_id', user.id)
          .in('status', ['found', 'en_route', 'riding', 'arrived'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!alive) return;
      if (loc && loc.lat != null && loc.lng != null) setDriverPosition([loc.lat, loc.lng]);
      if (order) {
        const { data: full } = await supabase.from('taxi_orders').select('*').eq('id', order.id).single();
        if (full && alive) setCurrentOrder(full);
      } else {
        setCurrentOrder(null);
        setCardPhase('active');
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isOnline) {
      if (watchId) { navigator.geolocation.clearWatch(watchId); setWatchId(null); }
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setDriverPosition([lat, lng]);
        try {
          const busy = currentOrderRef.current && !['completed', 'cancelled'].includes(currentOrderRef.current.status);
          await supabase.from('taxi_driver_locations').upsert({
            driver_id: user.id, lat, lng,
            heading: pos.coords.heading, speed: pos.coords.speed || 0,
            status: busy ? 'en_route' : 'free',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'driver_id' });
          if (busy) {
            const snapped = await snapToRoad(lat, lng);
            if (currentOrderRef.current && !['completed', 'cancelled'].includes(currentOrderRef.current.status)) {
              setDriverPosition(snapped);
            }
          }
        } catch {}
      },
      () => {
        if (!driverPosition) setDriverPosition([38.5358, 68.7791]);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 5000 }
    );
    setWatchId(id);

    const sub = supabase.channel('taxi-driver-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxi_orders', filter: `driver_id=eq.${user.id}` }, (payload) => {
        if (payload.new.status === 'cancelled') {
          toast.info('Заказ отменён пассажиром');
          setCurrentOrder(null);
          setCardPhase('active');
          setChatOpen(false);
          supabase.from('taxi_drivers').update({ status: 'free' }).eq('user_id', user.id);
          supabase.from('taxi_driver_locations').update({ status: 'free' }).eq('driver_id', user.id);
          addLocalNotification({ title: 'Заказ отменён', body: 'Пассажир отменил заказ', type: 'taxi_cancelled' });
          try { navigator.vibrate?.([100, 50, 100]); } catch {}
        } else if (['found', 'en_route', 'riding', 'arrived'].includes(payload.new.status)) {
          setCurrentOrder(payload.new);
        } else if (payload.new.status === 'completed') {
          setCurrentOrder(prev => prev ? { ...prev, status: 'completed' } : null);
          setCardPhase('payment');
        } else {
          setCurrentOrder(null);
          setCardPhase('active');
        }
      })
      .subscribe();

    const incomingSub = supabase.channel('taxi-incoming-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_orders', filter: 'status=eq.searching' }, (payload) => {
        const row = payload.new;
        if (!row || row.driver_id || currentOrderRef.current || !driverCategoryRef.current) return;
        // Матчинг по тарифу: водитель получает только заказы своего класса
        if (row.category !== driverCategoryRef.current) return;
        // Матчинг по близости: только заказы в радиусе подачи
        const dist = haversineKm(driverPosRef.current?.[0], driverPosRef.current?.[1], row.pickup_lat, row.pickup_lng);
        if (dist == null || dist > DRIVER_MATCH_RADIUS_KM) return;
        setIncomingOrder(row);
        setShowNewOrder(true);
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoKIeGBGPoChoZ+LdmhRR4KXoZ6KdWxYTYiOn52Jc25cU42QnJuIc3BjWZCVmJeGc3FqYJeWlJJ/dnNvZ5qXlJF8dHNzap2XlI95c3V3b56Xk455cnV3cJ+Xkok=');
          audio.volume = 0.8;
          audio.play().catch(() => {});
        } catch {}
        try { navigator.vibrate?.([200, 100, 200]); } catch {}
        supabase.from('notifications').insert({
          user_id: user.id,
          title: `Новый заказ · ${formatTJS(row.price)} TJS`,
          body: `${row.pickup_address || 'Забор'} -> ${row.dropoff_address || ''}`,
          type: 'taxi_new_order',
        }).then().catch(() => {});
        addLocalNotification({
          title: `Новый заказ! ${formatTJS(row.price)} TJS`,
          body: `${row.pickup_address || 'Забор'} -> ${row.dropoff_address || ''}`,
          type: 'taxi_new_order',
        });
      })
      .subscribe();

    return () => {
      navigator.geolocation.clearWatch(id);
      supabase.removeChannel(sub);
      supabase.removeChannel(incomingSub);
    };
  }, [user?.id, isOnline, addLocalNotification]);

  useEffect(() => {
    if (currentOrder?.passenger_id) {
      supabase.from('profiles').select('full_name, phone, photo_url').eq('id', currentOrder.passenger_id).single()
        .then(({ data }) => { if (data) setPassengerInfo(data); });
    }
  }, [currentOrder?.passenger_id]);

  // Новые сообщения в чате активного заказа
  useEffect(() => {
    if (!currentOrder?.id || !user?.id) return;
    const sub = supabase.channel('taxi-driver-chat-' + currentOrder.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_messages', filter: `order_id=eq.${currentOrder.id}` }, (payload) => {
        const row = payload.new;
        if (!row || row.sender_id === user.id) return;
        setUnreadChat(prev => prev + 1);
        if (!chatOpen) {
          toast.info(`Сообщение: ${row.message}`, { duration: 4000 });
          try { navigator.vibrate?.([80, 40, 80]); } catch {}
        }
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [currentOrder?.id, user?.id, chatOpen, addLocalNotification]);

  const handleToggleOnline = useCallback(async () => {
    if (!isOnline && !isVerifiedRef.current) {
      toast.error('Ваши документы на проверке. Выход на линию станет доступен после одобрения администратором');
      return;
    }
    const hasActiveSub = user?.subscription_status === 'active' && new Date(user?.subscription_paid_until || 0) > new Date();
    if (!isOnline && !hasActiveSub) {
      toast.error('Активируйте подписку такси в профиле (25 TJS/мес)');
      return;
    }
    const newStatus = isOnline ? 'offline' : 'free';
    setIsOnline(!isOnline);
    const updates = { status: newStatus };
    if (!isOnline) updates.last_online_at = new Date().toISOString();
    await supabase.from('taxi_drivers').update(updates).eq('user_id', user.id);
    await supabase.from('taxi_driver_locations').upsert({
      driver_id: user.id, status: isOnline ? 'offline' : 'free', updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' });
    toast.success(isOnline ? 'Вы вышли с линии' : 'Вы на линии! Приступаем к поиску заказов');
  }, [isOnline, user?.id]);

  const handleAcceptOrder = useCallback(async (order) => {
    try {
      // Атомарный claim: только один водитель может принять заказ
      const { data, error } = await supabase.from('taxi_orders')
        .update({ status: 'found', driver_id: user.id, accepted_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'searching')
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Заказ уже принят другим водителем');
        setShowNewOrder(false);
        setIncomingOrder(null);
        return;
      }
      setCurrentOrder(data);
      setCardPhase('active');
      setShowNewOrder(false);
      setIncomingOrder(null);
      await supabase.from('taxi_drivers').update({ status: 'assigned' }).eq('user_id', user.id);
      await supabase.from('taxi_driver_locations').update({ status: 'en_route' }).eq('driver_id', user.id);
      await supabase.from('taxi_ride_events').insert({ order_id: order.id, status: 'found' });
      toast.success('Заказ принят! Едем к пассажиру');
    } catch (e) {
      console.error(e);
      toast.error('Не удалось принять заказ');
      setShowNewOrder(false);
      setIncomingOrder(null);
    }
  }, [user?.id]);

  const handleRejectOrder = useCallback(() => {
    setShowNewOrder(false);
    setIncomingOrder(null);
  }, []);

  const handleOrderAction = useCallback(async (newStatus) => {
    if (!currentOrder?.id) return;
    if (newStatus === 'cancelled') {
      await supabase.from('taxi_orders').update({ status: 'cancelled', cancelled_by: 'driver' }).eq('id', currentOrder.id);
      await supabase.from('taxi_drivers').update({ status: 'free' }).eq('user_id', user.id);
      await supabase.from('taxi_driver_locations').update({ status: 'free' }).eq('driver_id', user.id);
      setCurrentOrder(null);
      setCardPhase('active');
      setChatOpen(false);
      toast.info('Заказ отменён');
      return;
    }
    await supabase.from('taxi_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', currentOrder.id);
    await supabase.from('taxi_ride_events').insert({ order_id: currentOrder.id, status: newStatus });

    const driverMap = { arrived: 'arrived', riding: 'riding' };
    const locMap = { arrived: 'arrived', riding: 'riding' };
    if (driverMap[newStatus]) {
      await supabase.from('taxi_drivers').update({ status: driverMap[newStatus] }).eq('user_id', user.id);
      await supabase.from('taxi_driver_locations').update({ status: locMap[newStatus] }).eq('driver_id', user.id);
    }
    if (newStatus === 'completed') {
      await supabase.from('taxi_orders').update({ completed_at: new Date().toISOString() }).eq('id', currentOrder.id);
      setCurrentOrder(prev => prev ? { ...prev, status: 'completed' } : null);
      setCardPhase('payment');
      toast.success('Поездка завершена! Получите оплату');
      return;
    }
    setCurrentOrder(prev => prev ? { ...prev, status: newStatus } : null);
    if (newStatus === 'arrived') toast.info('Ожидаем пассажира...');
    if (newStatus === 'riding') toast.info('Поездка началась!');
  }, [currentOrder, user?.id]);

  const handlePaid = useCallback(async (method) => {
    if (!currentOrder?.id) return;
    const amount = Number(currentOrder.price) || 0;
    const commission = Math.round(amount * TAXI_COMMISSION * 100) / 100;
    const earnings = Math.round((amount - commission) * 100) / 100;
    await supabase.from('taxi_ride_payments').insert({
      order_id: currentOrder.id,
      amount,
      commission,
      driver_earnings: earnings,
      method,
      status: 'completed',
      paid_at: new Date().toISOString(),
    });
    await supabase.from('taxi_wallet_transactions').insert({
      driver_id: user.id,
      amount: earnings,
      type: 'earnings',
      order_id: currentOrder.id,
      description: `Оплата поездки (${method})`,
    });
    const { data: driver } = await supabase.from('taxi_drivers').select('rides_count, total_earnings').eq('user_id', user.id).single();
    await supabase.from('taxi_drivers').update({
      rides_count: (driver?.rides_count || 0) + 1,
      total_earnings: Math.round(((Number(driver?.total_earnings) || 0) + earnings) * 100) / 100,
      status: 'free',
    }).eq('user_id', user.id);
    await supabase.from('taxi_driver_locations').update({ status: 'free' }).eq('driver_id', user.id);
    setStats(prev => ({ ...prev, rides: (prev.rides || 0) + 1, today: Math.round((prev.today + earnings) * 100) / 100 }));
    setCardPhase('rate');
    toast.success(`Оплата получена: ${formatTJS(earnings)} TJS`);
  }, [currentOrder, user?.id]);

  const handleRated = useCallback(async (stars) => {
    if (!currentOrder?.id || !stars) return;
    await supabase.from('taxi_ratings').insert({
      order_id: currentOrder.id,
      from_id: user.id,
      to_id: currentOrder.passenger_id,
      rating: stars,
    });
    toast.success('Спасибо! Поездка завершена');
    setCurrentOrder(null);
    setCardPhase('active');
    setChatOpen(false);
    setPassengerInfo(null);
    loadStats();
  }, [currentOrder, user?.id, loadStats]);

  const handleSos = useCallback(() => {
    const report = (lat, lng) => {
      supabase.from('taxi_emergencies').insert({
        order_id: currentOrder?.id,
        user_id: user.id,
        role: 'driver',
        lat,
        lng,
        message: `SOS от водителя. Пассажир: ${passengerInfo?.full_name || '—'}`,
      }).then().catch(() => {});
      const coords = `https://maps.google.com/?q=${lat},${lng}`;
      const msg = `SOS! Водитель Karta.AD. Координаты: ${coords}. Пассажир: ${passengerInfo?.full_name || '—'}`;
      try { if (navigator.share) navigator.share({ title: 'SOS', text: msg }); else toast.info(msg); } catch {}
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => report(pos.coords.latitude, pos.coords.longitude),
        () => { report(driverPosition?.[0] || null, driverPosition?.[1] || null); toast.info('SOS: используются последние координаты'); },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      report(driverPosition?.[0] || null, driverPosition?.[1] || null);
    }
    toast.warning('SOS отправлен. Экстренный номер: 112');
  }, [passengerInfo, currentOrder, user?.id, driverPosition]);

  const shareText = useMemo(() => {
    if (!currentOrder) return '';
    return `Поездка Karta.AD Taxi\nОткуда: ${currentOrder.pickup_address || '—'}\nКуда: ${currentOrder.dropoff_address || '—'}\nПассажир: ${passengerInfo?.full_name || '—'}`;
  }, [currentOrder, passengerInfo]);

  const peekStats = [
    { label: 'Сегодня', value: `${formatTJS(stats.today)} TJS` },
    { label: 'Рейтинг', value: `★ ${(stats.rating || 5.0).toFixed(1)}` },
    { label: 'Поездки', value: stats.rides || 0 },
  ];

  if (!user || (user.role !== 'taxi_driver' && user.role !== 'admin')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-950">
        <Car size={48} className="text-slate-300 mb-4" />
        <p className="text-lg font-bold mb-2">Вы не водитель такси</p>
        <p className="text-sm text-slate-500 mb-6">Зарегистрируйтесь как водитель</p>
        <button onClick={() => navigate('/taxi/register')}
          className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25">
          Стать водителем
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-slate-100 dark:bg-slate-950 overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={driverPosition || [38.5358, 68.7791]}
          zoom={15}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={TILE_URL} attribution={ATTR} />
          <DriverMapMarker position={driverPosition} />
          {currentOrder?.pickup_lat && currentOrder?.pickup_lng && (
            <Marker position={[currentOrder.pickup_lat, currentOrder.pickup_lng]} icon={pickupIcon} />
          )}
          {currentOrder?.dropoff_lat && currentOrder?.dropoff_lng && (
            <Marker position={[currentOrder.dropoff_lat, currentOrder.dropoff_lng]} icon={dropoffIcon} />
          )}
        </MapContainer>
      </div>

      {/* Top bar - glassmorphism */}
      <TaxiTopBar
        isOnline={isOnline}
        onToggle={handleToggleOnline}
        userName={user?.full_name}
        userPhoto={user?.photo_url}
      />

      {/* Stats bar - below top bar */}
      {isOnline && !currentOrder && (
        <div className="absolute top-[120px] left-0 right-0 z-30">
          <TaxiStatsBar stats={stats} />
        </div>
      )}

      {/* New order card with timer */}
      {showNewOrder && incomingOrder && (
        <TaxiNewOrderCard
          order={incomingOrder}
          onAccept={handleAcceptOrder}
          onReject={handleRejectOrder}
        />
      )}

      {/* Active order card */}
      {currentOrder && !showNewOrder && (
        <TaxiOrderCard
          order={currentOrder}
          passengerInfo={passengerInfo}
          phase={cardPhase}
          onAction={handleOrderAction}
          onPaid={handlePaid}
          onRated={handleRated}
          onSos={handleSos}
          onChat={() => { setUnreadChat(0); setChatOpen(true); }}
          onShare={() => setShareOpen(true)}
          unread={unreadChat}
        />
      )}

      <TaxiChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        orderId={currentOrder?.id}
        meId={user?.id}
        otherName={passengerInfo?.full_name || 'Пассажир'}
      />

      <ShareMenu open={shareOpen} onClose={() => setShareOpen(false)} text={shareText} />

      {/* Bottom sheet - only when online and no active order */}
      {isOnline && !currentOrder && !showNewOrder && (
        <TaxiBottomSheet driverStats={peekStats} isOnline={isOnline}>
          <div className="space-y-4">
            {/* Today's earnings */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Сегодня</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 text-center">
                  <DollarSign size={18} className="text-emerald-500 mx-auto mb-1" />
                  <p className="text-xl font-black text-emerald-600">{formatTJS(stats.today)}</p>
                  <p className="text-[10px] text-emerald-500 font-medium">TJS доход</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-center">
                  <Car size={18} className="text-blue-500 mx-auto mb-1" />
                  <p className="text-xl font-black text-blue-600">{stats.rides || 0}</p>
                  <p className="text-[10px] text-blue-500 font-medium">поездок</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 text-center">
                  <Clock size={18} className="text-amber-500 mx-auto mb-1" />
                  <p className="text-xl font-black text-amber-600">{formatTJS(stats.week)}</p>
                  <p className="text-[10px] text-amber-500 font-medium">TJS неделя</p>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Быстрые действия</h3>
              <button
                onClick={() => navigate('/taxi/history')}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/40 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <History size={18} className="text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">История поездок</p>
                  <p className="text-[10px] text-slate-400">Все ваши поездки</p>
                </div>
                <ChevronUp size={16} className="text-slate-400 rotate-90" />
              </button>
              <button
                onClick={() => navigate('/taxi/finance')}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/40 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <DollarSign size={18} className="text-emerald-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Финансы</p>
                  <p className="text-[10px] text-slate-400">Доход, комиссия, вывод</p>
                </div>
                <ChevronUp size={16} className="text-slate-400 rotate-90" />
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/40 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Star size={18} className="text-purple-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Профиль</p>
                  <p className="text-[10px] text-slate-400">Данные, документы, авто</p>
                </div>
                <ChevronUp size={16} className="text-slate-400 rotate-90" />
              </button>
            </div>

            {/* GPS status */}
            {driverPosition && (
              <div className="bg-blue-50/80 dark:bg-blue-900/20 rounded-2xl p-3 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                  GPS активен · {driverPosition[0].toFixed(4)}, {driverPosition[1].toFixed(4)}
                </p>
              </div>
            )}
          </div>
        </TaxiBottomSheet>
      )}

      {/* Offline overlay */}
      {!isOnline && !currentOrder && (
        <div className="absolute bottom-16 left-0 right-0 z-40 px-4 pb-4">
          <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl rounded-3xl shadow-2xl p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
              {isVerified ? <Car size={28} className="text-slate-400" /> : <FileCheck2 size={28} className="text-amber-500" />}
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {isVerified ? 'Вы оффлайн' : 'Документы на проверке'}
            </p>
            <p className="text-xs text-slate-400">
              {isVerified
                ? 'Нажмите кнопку выше чтобы начать принимать заказы'
                : 'После одобрения администратором вы сможете выходить на линию'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
