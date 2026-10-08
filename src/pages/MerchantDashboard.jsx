import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft, KeyRound, Package, Truck, Map as MapIcon, Users,
  BarChart3, Webhook, Settings, RefreshCw, LogOut, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '@/api/supabase';
import { cartoRaster, CARTO_ATTRIBUTION } from '@/lib/tiles';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_MAP = {
  pending: { label: 'Ожидает', cls: 'bg-slate-100 text-slate-700' },
  confirmed: { label: 'Подтверждён', cls: 'bg-sky-100 text-sky-700' },
  searching_courier: { label: 'Ищем курьера', cls: 'bg-amber-100 text-amber-700' },
  courier_assigned: { label: 'Курьер назначен', cls: 'bg-indigo-100 text-indigo-700' },
  courier_to_pickup: { label: 'Едет за заказом', cls: 'bg-indigo-100 text-indigo-700' },
  arrived_pickup: { label: 'Прибыл за заказом', cls: 'bg-cyan-100 text-cyan-700' },
  picked_up: { label: 'Забрал заказ', cls: 'bg-violet-100 text-violet-700' },
  courier_to_customer: { label: 'Везёт клиенту', cls: 'bg-blue-100 text-blue-700' },
  arrived_customer: { label: 'У клиента', cls: 'bg-teal-100 text-teal-700' },
  delivered: { label: 'Доставлен', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Отменён', cls: 'bg-rose-100 text-rose-700' },
  failed: { label: 'Ошибка', cls: 'bg-red-100 text-red-700' },
  searching: { label: 'Ищем курьера', cls: 'bg-amber-100 text-amber-700' },
  assigned: { label: 'Курьер назначен', cls: 'bg-indigo-100 text-indigo-700' },
};

const TABS = [
  { id: 'orders', label: 'Заказы', icon: Package },
  { id: 'deliveries', label: 'Доставки', icon: Truck },
  { id: 'map', label: 'Карта', icon: MapIcon },
  { id: 'couriers', label: 'Курьеры', icon: Users },
  { id: 'stats', label: 'Статистика', icon: BarChart3 },
  { id: 'api', label: 'API', icon: KeyRound },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

const STORE_KEY = 'karta_merchant_api_key';

const STATUS_COLORS = {
  online: '#16a34a',
  busy: '#eab308',
  offline: '#dc2626',
};

const courierIcon = (status) => L.divIcon({
  html: `<div style="width:16px;height:16px;background:${STATUS_COLORS[status] || '#94a3b8'};border:3px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  className: '',
  iconAnchor: [8, 8],
});

const orderPinIcon = L.divIcon({
  html: `<div style="background:#1565C0;color:white;padding:3px 7px;border-radius:8px;font-weight:600;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">📦</div>`,
  className: '',
  iconAnchor: [14, 14],
});

const maskKey = (key) => {
  if (!key || key.length < 12) return key || '';
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
};

function Badge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function KeyGate({ onUnlock }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_merchant_dashboard', {
        p_api_key: key,
      });
      if (rpcError) throw rpcError;
      if (!data?.found) {
        setError('Неверный или неактивный API-ключ');
        return;
      }
      sessionStorage.setItem(STORE_KEY, key);
      onUnlock(key, data);
    } catch (err) {
      setError(err?.message || 'Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Кабинет магазина</h1>
            <p className="text-sm text-slate-500">Введите API-ключ (dk_…)</p>
          </div>
        </div>
        <div className="relative">
          <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="dk_…"
            autoFocus
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          />
        </div>
        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Проверка…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

function StatsPanel({ stats }) {
  if (!stats) return null;
  const cards = [
    { label: 'Всего заказов', value: stats.total ?? 0 },
    { label: 'Активные', value: stats.active ?? 0 },
    { label: 'Доставлено', value: stats.delivered ?? 0 },
    { label: 'Отменено', value: stats.cancelled ?? 0 },
    { label: 'Сегодня', value: stats.today ?? 0 },
    { label: 'Выручка', value: `${Number(stats.revenue ?? 0).toFixed(2)} TJS` },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{c.value}</div>
          </div>
        ))}
      </div>
      {stats.by_status && Object.keys(stats.by_status).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">По статусам</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_status).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <Badge status={status} />
                <span className="text-sm font-semibold text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersTable({ orders, activeOnly = false, title }) {
  const list = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    if (!activeOnly) return orders;
    return orders.filter(
      (o) => !['delivered', 'cancelled', 'failed'].includes(o.status)
    );
  }, [orders, activeOnly]);

  if (list.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        {title ? `${title}: ` : ''}нет заказов
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5">№</th>
              <th className="px-3 py-2.5">Статус</th>
              <th className="px-3 py-2.5">Откуда</th>
              <th className="px-3 py-2.5">Куда</th>
              <th className="px-3 py-2.5">Получатель</th>
              <th className="px-3 py-2.5">Сумма</th>
              <th className="px-3 py-2.5">Курьер</th>
              <th className="px-3 py-2.5">Создан</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                  {o.public_id || o.order_number}
                </td>
                <td className="px-3 py-2.5"><Badge status={o.status} /></td>
                <td className="px-3 py-2.5 max-w-[160px] truncate text-slate-700">
                  {o.pickup_address || '—'}
                </td>
                <td className="px-3 py-2.5 max-w-[160px] truncate text-slate-700">
                  {o.dropoff_address || '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {o.recipient_name || '—'}
                  {o.recipient_phone && (
                    <div className="text-xs text-slate-400">{o.recipient_phone}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-900">
                  {Number(o.price ?? o.total ?? 0).toFixed(2)} {o.currency || 'TJS'}
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {o.courier?.first_name || '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourierMap({ couriers, orders }) {
  const orderPins = useMemo(
    () =>
      (Array.isArray(orders) ? orders : [])
        .filter(
          (o) =>
            ['pending', 'searching_courier', 'courier_assigned', 'courier_to_pickup',
             'picked_up', 'courier_to_customer', 'arrived_pickup', 'arrived_customer',
             'confirmed'].includes(o.status)
            && o.dropoff_lat != null
            && o.dropoff_lng != null
        )
        .slice(0, 50),
    [orders]
  );

  const withPos = useMemo(
    () => (Array.isArray(couriers) ? couriers : []).filter((c) => c.lat != null && c.lng != null),
    [couriers]
  );

  if (withPos.length === 0 && orderPins.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        Нет данных для карты
      </div>
    );
  }

  const center = withPos.length > 0
    ? [withPos[0].lat, withPos[0].lng]
    : [orderPins[0].dropoff_lat, orderPins[0].dropoff_lng];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS.online }} />
          Онлайн
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS.busy }} />
          Занят
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS.offline }} />
          Оффлайн
        </span>
      </div>
      <div className="h-[420px] rounded-xl overflow-hidden border border-slate-200">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution={CARTO_ATTRIBUTION}
            url={cartoRaster('rastertiles/voyager')}
          />
          {withPos.map((c) => (
            <Marker
              key={c.user_id}
              position={[c.lat, c.lng]}
              icon={courierIcon(c.status || 'offline')}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{c.first_name}</div>
                  <div>Статус: {c.status || 'offline'}</div>
                  {c.rating != null && <div>Рейтинг: {Number(c.rating).toFixed(1)}</div>}
                </div>
              </Popup>
            </Marker>
          ))}
          {orderPins.map((o) => (
            <Marker
              key={o.id}
              position={[o.dropoff_lat, o.dropoff_lng]}
              icon={orderPinIcon}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-mono text-xs text-slate-500">{o.public_id || o.order_number}</div>
                  <div className="mt-1"><Badge status={o.status} /></div>
                  <div className="mt-1 text-slate-700">{o.dropoff_address}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function CouriersList({ couriers }) {
  if (!Array.isArray(couriers) || couriers.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        Курьеры не назначались
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {couriers.map((c) => (
        <div key={c.user_id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <span
            className="mt-1 inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: STATUS_COLORS[c.status] || STATUS_COLORS.offline }}
          />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{c.first_name}</div>
            <div className="text-xs text-slate-500">
              {c.status === 'online' ? 'Онлайн' : c.status === 'busy' ? 'Занят' : 'Оффлайн'}
              {c.rating != null && ` · ★ ${Number(c.rating).toFixed(1)}`}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Доставок: {c.deliveries_count ?? 0}
              {c.is_verified ? ' · подтверждён' : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhooksPanel({ webhooks, events }) {
  return (
    <div className="space-y-4">
      {!Array.isArray(webhooks) || webhooks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Webhook не настроены
        </div>
      ) : (
        webhooks.map((w) => (
          <div key={w.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-xs break-all text-slate-700">{w.url}</div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  w.is_active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {w.is_active ? 'active' : 'inactive'}
              </span>
            </div>
            <div className="text-xs text-slate-500 break-all">
              secret: <code className="font-mono">{w.secret}</code>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(w.events || []).map((ev) => (
                <span key={ev} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {ev}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
      {Array.isArray(events) && events.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-200">
            Последние события
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Событие</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="text-left px-3 py-2">HTTP</th>
                <th className="text-left px-3 py-2">Попытки</th>
                <th className="text-left px-3 py-2">Время</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-mono text-xs">{e.event}</td>
                  <td className="px-3 py-2">{e.status}</td>
                  <td className="px-3 py-2">{e.http_code ?? '—'}</td>
                  <td className="px-3 py-2">{e.attempts ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {e.created_at ? new Date(e.created_at).toLocaleString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ApiPanel({ shop, apiLogs }) {
  const [showKey, setShowKey] = useState(false);
  const storedKey = sessionStorage.getItem(STORE_KEY) || '';

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-700">API-ключ</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
            {showKey ? storedKey : maskKey(storedKey)}
          </code>
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label={showKey ? 'Скрыть ключ' : 'Показать ключ'}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
          <div>Запросов: <strong>{shop?.requests_count ?? 0}</strong></div>
          <div>Песочница: <strong>{shop?.is_sandbox ? 'да' : 'нет'}</strong></div>
          <div className="col-span-2 text-xs text-slate-400">
            Последний запрос:{' '}
            {shop?.last_request_at
              ? new Date(shop.last_request_at).toLocaleString('ru-RU')
              : '—'}
          </div>
        </div>
      </div>
      {!Array.isArray(apiLogs) || apiLogs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Журнал API пуст
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Метод</th>
                <th className="text-left px-3 py-2">Путь</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="text-left px-3 py-2">ms</th>
                <th className="text-left px-3 py-2">Время</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiLogs.slice(0, 30).map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-mono text-xs">{l.method}</td>
                  <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]">{l.path}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        l.status >= 400
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{l.ms}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {l.created_at ? new Date(l.created_at).toLocaleString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ shop, onLogout }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 max-w-lg">
      <div>
        <div className="text-xs text-slate-400">Магазин</div>
        <div className="font-semibold text-slate-900">{shop?.shop_name || '—'}</div>
      </div>
      <div>
        <div className="text-xs text-slate-400">Контактное лицо</div>
        <div className="text-slate-700">{shop?.contact_name || '—'}</div>
        {shop?.contact_phone && (
          <div className="text-sm text-slate-500">{shop.contact_phone}</div>
        )}
        {shop?.contact_email && (
          <div className="text-sm text-slate-500">{shop.contact_email}</div>
        )}
      </div>
      <div>
        <div className="text-xs text-slate-400">Webhook URL</div>
        <div className="font-mono text-xs break-all text-slate-600">
          {shop?.webhook_url || '—'}
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-400">С нами с</div>
        <div className="text-sm text-slate-600">
          {shop?.created_at ? new Date(shop.created_at).toLocaleDateString('ru-RU') : '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium"
      >
        <LogOut size={16} />
        Выйти из кабинета
      </button>
    </div>
  );
}

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(STORE_KEY) || '');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('orders');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadedRef = useRef(false);

  const load = useCallback(async (key) => {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        'get_merchant_dashboard',
        { p_api_key: key }
      );
      if (rpcError) throw rpcError;
      if (!result?.found) {
        sessionStorage.removeItem(STORE_KEY);
        setApiKey('');
        setData(null);
        setError('API-ключ недействителен');
        return;
      }
      setData(result);
    } catch (err) {
      setError(err?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (apiKey && !loadedRef.current) {
      load(apiKey);
    }
  }, [apiKey, load]);

  const onUnlock = (key, result) => {
    setApiKey(key);
    setData(result);
    loadedRef.current = true;
    setError('');
  };

  const logout = () => {
    sessionStorage.removeItem(STORE_KEY);
    setApiKey('');
    setData(null);
    loadedRef.current = false;
  };

  if (!apiKey || !data?.found) {
    return <KeyGate onUnlock={onUnlock} />;
  }

  const orders = Array.isArray(data.orders) ? data.orders : [];
  const stats = data.stats;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              aria-label="На главную"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">
                {data.shop?.shop_name || 'Кабинет магазина'}
              </div>
              <div className="text-xs text-slate-400 font-mono truncate">
                {maskKey(sessionStorage.getItem(STORE_KEY) || '')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.online }} />
              {stats?.active ?? 0} активных
            </div>
            <button
              type="button"
              onClick={() => load(apiKey)}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-50"
              aria-label="Обновить"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
                  tab === id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {loading && !data && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          </div>
        )}

        {tab === 'orders' && <OrdersTable orders={orders} title="Заказы" />}
        {tab === 'deliveries' && (
          <OrdersTable orders={orders} activeOnly title="Доставки" />
        )}
        {tab === 'map' && (
          <CourierMap couriers={data.couriers} orders={orders} />
        )}
        {tab === 'couriers' && <CouriersList couriers={data.couriers} />}
        {tab === 'stats' && <StatsPanel stats={stats} />}
        {tab === 'api' && (
          <ApiPanel shop={data.shop} apiLogs={data.api_logs} />
        )}
        {tab === 'webhooks' && (
          <WebhooksPanel webhooks={data.webhooks} events={data.webhook_events} />
        )}
        {tab === 'settings' && (
          <SettingsPanel shop={data.shop} onLogout={logout} />
        )}
      </main>
    </div>
  );
}
