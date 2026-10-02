import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { Store, Users, MapPin, LocateFixed } from 'lucide-react';
import MapLocationPicker from '@/components/admin/MapLocationPicker';
import BusinessSubHeader from '@/components/BusinessSubHeader';

const BUSINESS_TYPES = [
  { value: 'shop', ru: 'Магазин', tg: 'Мағоза', en: 'Shop' },
  { value: 'restaurant', ru: 'Ресторан', tg: 'Ресторан', en: 'Restaurant' },
  { value: 'pharmacy', ru: 'Аптека', tg: 'Дорухона', en: 'Pharmacy' },
  { value: 'services', ru: 'Услуги', tg: 'Хизматҳо', en: 'Services' },
  { value: 'other', ru: 'Другое', tg: 'Дигар', en: 'Other' },
];

const ROLE_LABELS = {
  owner: { ru: 'Владелец', tg: 'Соҳиб', en: 'Owner' },
  manager: { ru: 'Менеджер', tg: 'Мудир', en: 'Manager' },
  employee: { ru: 'Сотрудник', tg: 'Корманд', en: 'Employee' },
  courier: { ru: 'Курьер', tg: 'Курьер', en: 'Courier' },
};

const MANAGEABLE_ROLES = ['manager', 'employee', 'courier'];

export default function BusinessSettings() {
  const { user } = useCurrentUser();
  const { t, lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [form, setForm] = useState({ name: '', type: '', city: '', address: '', phone: '', lat: null, lng: null });
  const [locating, setLocating] = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyBusiness = (b) => {
    setSelectedBusiness(b);
    setForm({
      name: b.name || '',
      type: b.type || '',
      city: b.city || '',
      address: b.address || '',
      phone: b.phone || '',
      lat: b.lat ?? null,
      lng: b.lng ?? null,
    });
  };

  const loadBusinesses = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_businesses');
    setLoading(false);
    if (error) {
      toast.error(t('business.loadError'));
      return;
    }
    setBusinesses(data || []);
    if (data && data.length > 0) applyBusiness(data[0]);
  };

  const loadMembers = async (businessId) => {
    if (!businessId) return;
    const { data, error } = await supabase
      .from('business_members')
      .select('id, user_id, role, created_at')
      .eq('business_id', businessId)
      .order('created_at');
    if (!error) setMembers(data || []);
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) loadMembers(selectedBusiness.id);
  }, [selectedBusiness?.id]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('business.nameRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type || null,
      city: form.city || null,
      address: form.address || null,
      phone: form.phone || null,
      lat: form.lat ?? null,
      lng: form.lng ?? null,
    };
    const { error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', selectedBusiness.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || t('business.createError'));
      return;
    }
    toast.success('Сохранено');
    setBusinesses((prev) => prev.map((b) => (b.id === selectedBusiness.id ? { ...b, ...payload } : b)));
    setSelectedBusiness((prev) => (prev ? { ...prev, ...payload } : prev));
  };

  const fillMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Геолокация не поддерживается');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setForm((f) => ({
          ...f,
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
        }));
        toast.success('Точка поставлена по GPS');
      },
      () => {
        setLocating(false);
        toast.error('Не удалось получить местоположение');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const handleRoleChange = async (memberId, role) => {
    const { error } = await supabase
      .from('business_members')
      .update({ role })
      .eq('id', memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Роль обновлена');
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Убрать участника из бизнеса?')) return;
    const { error } = await supabase.from('business_members').delete().eq('id', memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Участник убран');
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const roleLabel = (role) => ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.ru || role;
  const myRole = selectedBusiness?.role;
  const canManage = myRole === 'owner' || myRole === 'manager';

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <BusinessSubHeader
          title="Настройки"
          icon={Store}
          iconClassName="text-blue-500 flex items-center"
          right={<span className="text-xs text-slate-400">{selectedBusiness?.name || ''}</span>}
        />

        {businesses.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {businesses.map((b) => (
              <button key={b.id} onClick={() => applyBusiness(b)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold ${selectedBusiness?.id === b.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600'}`}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Business Form */}
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : selectedBusiness ? (
          <form onSubmit={handleUpdate} className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('business.name')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('business.type')}</option>
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt[lang]}</option>
                ))}
              </select>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder={t('business.city')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t('business.address')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('business.phone')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Точка на карте */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <MapPin size={14} className="text-blue-500" />
                  Адрес на карте
                </p>
                <button
                  type="button"
                  onClick={fillMyLocation}
                  disabled={locating}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold disabled:opacity-50"
                >
                  <LocateFixed size={12} />
                  {locating ? 'Ищем…' : 'Я здесь'}
                </button>
              </div>
              <MapLocationPicker
                value={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null}
                onChange={(c) => setForm((f) => ({ ...f, lat: c.lat === '' ? null : c.lat, lng: c.lng === '' ? null : c.lng }))}
                center={form.lat != null && form.lng != null ? [form.lat, form.lng] : [38.559, 68.773]}
                zoom={form.lat != null ? 15 : 12}
                height="240px"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Точку увидят все пользователи на общей карте.
              </p>
            </div>
            <button
              type="submit"
              disabled={saving || !canManage}
              className="w-full md:w-auto md:px-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
            >
              {saving ? t('loading') : 'Сохранить'}
            </button>
            {!canManage && (
              <p className="text-xs text-slate-400">Изменять настройки могут владелец и менеджер.</p>
            )}
          </form>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-4xl">🏪</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">{t('business.empty')}</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">{t('business.emptyHint')}</p>
          </div>
        )}

        {/* Members */}
        {selectedBusiness && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Users size={15} /> Участники · {members.length}
            </h2>
            <p className="text-xs text-slate-400 mb-3">Ваша роль: {roleLabel(myRole)}</p>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {m.user_id === user?.id ? 'Вы' : m.user_id.slice(0, 8)}
                  </span>
                  {canManage && m.user_id !== user?.id && m.role !== 'owner' ? (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs text-slate-700 dark:text-slate-200"
                      >
                        {MANAGEABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                      <button onClick={() => handleRemoveMember(m.id)} className="text-xs text-red-500 hover:underline px-1">
                        Убрать
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {roleLabel(m.role)}
                    </span>
                  )}
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-xs text-slate-400">Нет данных об участниках</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
