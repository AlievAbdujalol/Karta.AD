import { useState } from 'react';
import { MapPin, Save, X, Loader2 } from 'lucide-react';
import MapLocationPicker from '@/components/admin/MapLocationPicker';
import { reverseGeocodeUrl, pickAddressText } from '@/lib/geo';

const inputCls = 'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100';

/**
 * Инлайн-форма редактирования заказа в админ-панели.
 * Props:
 *  - order: объект заказа (get_business_orders)
 *  - onSave(patch) → Promise<boolean> — патч camelCase для updateOrder()
 *  - onCancel()
 *  - saving: boolean
 */
export default function OrderEditForm({ order, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    customer_name: order.customer_name || '',
    customer_phone: order.customer_phone || '',
    delivery_type: order.delivery_type || 'delivery',
    delivery_address: order.delivery_address || '',
    notes: order.notes || '',
    payment_method: order.payment_method || 'cash',
    total: order.total ?? '',
  });
  const [geo, setGeo] = useState({
    lat: order.delivery_lat ?? '',
    lng: order.delivery_lng ?? '',
  });
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const needsAddress = form.delivery_type !== 'pickup';

  /** Пин на карте → координаты + попытка подставить текст адреса. */
  const handlePick = async (coords) => {
    setGeo(coords);
    const url = reverseGeocodeUrl(coords.lat, coords.lng);
    if (!url) return;
    setGeocoding(true);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = await res.json();
      const text = pickAddressText(json, form.delivery_address);
      if (text) setForm((f) => ({ ...f, delivery_address: text }));
    } catch {
      // Nominatim недоступен — адрес остаётся введённым вручную
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = async () => {
    const total = form.total === '' ? undefined : Number(form.total);
    if (total !== undefined && (!Number.isFinite(total) || total < 0)) {
      setError('Сумма должна быть числом не меньше 0');
      return;
    }
    setError('');
    const patch = {
      customerName: form.customer_name,
      customerPhone: form.customer_phone,
      notes: form.notes,
      paymentMethod: form.payment_method === 'card' ? 'card' : 'cash',
      ...(total !== undefined ? { total } : {}),
      ...(needsAddress
        ? {
            deliveryAddress: form.delivery_address,
            ...(Number.isFinite(Number(geo.lat)) && geo.lat !== ''
              ? { deliveryLat: Number(geo.lat), deliveryLng: Number(geo.lng) }
              : {}),
          }
        : {}),
    };
    await onSave(patch);
  };

  return (
    <div className="space-y-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50/40 dark:bg-blue-500/5 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={form.customer_name} onChange={set('customer_name')} placeholder="Имя клиента" className={inputCls} />
        <input value={form.customer_phone} onChange={set('customer_phone')} placeholder="Телефон" type="tel" className={inputCls} />
        <select value={form.delivery_type} onChange={set('delivery_type')} className={inputCls}>
          <option value="delivery">Доставка</option>
          <option value="pickup">Самовывоз</option>
          <option value="courier">Курьер Karta-AD</option>
        </select>
        <div className="flex gap-2">
          <select value={form.payment_method} onChange={set('payment_method')} className={`${inputCls} flex-1`} title="Способ оплаты">
            <option value="cash">Наличные</option>
            <option value="card">Карта</option>
          </select>
          <input
            value={form.total}
            onChange={set('total')}
            placeholder="Сумма"
            type="number"
            min="0"
            step="0.01"
            className={`${inputCls} w-28`}
          />
        </div>
      </div>

      {needsAddress && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-slate-400 shrink-0" />
            <input
              value={form.delivery_address}
              onChange={set('delivery_address')}
              placeholder="Адрес доставки"
              className={`${inputCls} flex-1`}
            />
            {geocoding && <Loader2 size={14} className="animate-spin text-blue-500" />}
          </div>
          <MapLocationPicker
            value={Number.isFinite(Number(geo.lat)) && geo.lat !== '' ? { lat: Number(geo.lat), lng: Number(geo.lng) } : null}
            onChange={handlePick}
            height="220px"
          />
        </div>
      )}

      <textarea
        value={form.notes}
        onChange={set('notes')}
        placeholder="Примечание"
        rows={2}
        className={`w-full ${inputCls}`}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
        >
          <X size={13} /> Отмена
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Сохранить
        </button>
      </div>
    </div>
  );
}
