import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { Store, User, Shield, Settings, Users, Mail, Phone, Lock, LogOut, ExternalLink, Package, Truck, BarChart3, CreditCard, Calendar } from 'lucide-react';

const ROLE_LABELS = {
  owner: { ru: 'Владелец', tg: 'Соҳиб', en: 'Owner' },
  manager: { ru: 'Менеджер', tg: 'Мудир', en: 'Manager' },
  employee: { ru: 'Сотрудник', tg: 'Корманд', en: 'Employee' },
  courier: { ru: 'Курьер', tg: 'Курьер', en: 'Courier' },
};

export default function BusinessSettings() {
  const { user } = useCurrentUser();
  const { t, lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: '',
    city: '',
    address: '',
    phone: '',
  });
  const [roles, setRoles] = useState({ owner: true, manager: false, employee: false, courier: false });
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
      setForm({
        name: data[0].name || '',
        type: data[0].type || '',
        city: data[0].city || '',
        address: data[0].address || '',
        phone: data[0].phone || '',
      });
    }
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t('business.nameRequired'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.rpc('create_business', {
      p_name: form.name.trim(),
      p_type: form.type || null,
      p_city: form.city || null,
      p_address: form.address || null,
      p_phone: form.phone || null,
    });
    setLoading(false);
    if (error) {
      toast.error(t('business.createError'));
      return;
    }
    toast.success(t('business.createSuccess'));
    setEditing(false);
    loadBusinesses();
  };

  const roleLabel = (role) => ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.ru || role;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Store size={22} className="text-blue-500" />
            Настройки
          </h1>
          <span className="text-xs text-slate-400">{selectedBusiness?.name || ''}</span>
        </div>

        {/* Business Form */}
        {selectedBusiness ? (
          <form onSubmit={handleUpdate} className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('business.name')}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
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
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 md:flex-none md:px-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
              >
                {loading ? t('loading') : t('business.save')}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-3 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-4xl">🏪</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">{t('business.empty')}</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">{t('business.emptyHint')}</p>
          </div>
        )}

        {/* Roles Section */}
        {selectedBusiness && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">{t('business.role')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(roles).map((role) => (
                <div
                  key={role}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    roles[role]
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                  }`}
                  onClick={() => {
                    const newRoles = { ...roles };
                    newRoles[role] = !roles[role];
                    setRoles(newRoles);
                  }}
                >
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  {roleLabel(role)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Section */}
        {selectedBusiness && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">{t('business.apiKeys')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Управление API ключами для интеграций и автоматических процессов
            </p>
            <div className="space-y-2">
              {apiKeys.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  API ключей еще нет. Создайте новый ключ в разделе интеграций.
                </p>
              ) : (
                apiKeys.map((key, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{key.prefix || 'API Key'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View
                      </button>
                      <button
                        className="text-[10px] text-red-500 dark:text-red-400 hover:underline"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
            >
              {t('business.createApiKey')}
            </button>
          </div>
        )}

        {/* Recent Activity / Quick Stats */}
        {selectedBusiness && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Последние активности</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Здесь будут показаны последние действия</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Быстрые действия</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Настройка доставки, товаров и аналитики</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}