import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useAuth } from '@/lib/AuthContext';
import { User, Save, Heart, History, Camera, Loader2, LogOut, ChevronDown, Search, Wallet } from 'lucide-react';
import FavoriteRoutes from '@/components/profile/FavoriteRoutes';
import TripHistory from '@/components/profile/TripHistory';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';

const LANGS = [
  { code: 'ru', label: 'Русский' },
  { code: 'tg', label: 'Тоҷикӣ' },
  { code: 'en', label: 'English' },
];

const COUNTRY_CODES = [
  { code: '+992', flag: '🇹🇯', country: 'Таджикистан' },
  { code: '+998', flag: '🇺🇿', country: 'Узбекистан' },
  { code: '+7',   flag: '🇷🇺', country: 'Россия' },
  { code: '+77',  flag: '🇰🇿', country: 'Казахстан' },
  { code: '+996', flag: '🇰🇬', country: 'Кыргызстан' },
  { code: '+993', flag: '🇹🇲', country: 'Туркменистан' },
  { code: '+994', flag: '🇦🇿', country: 'Азербайджан' },
  { code: '+374', flag: '🇦🇲', country: 'Армения' },
  { code: '+995', flag: '🇬🇪', country: 'Грузия' },
  { code: '+380', flag: '🇺🇦', country: 'Украина' },
  { code: '+375', flag: '🇧🇾', country: 'Беларусь' },
  { code: '+373', flag: '🇲🇩', country: 'Молдова' },
  { code: '+90',  flag: '🇹🇷', country: 'Турция' },
  { code: '+98',  flag: '🇮🇷', country: 'Иран' },
  { code: '+93',  flag: '🇦🇫', country: 'Афганистан' },
  { code: '+92',  flag: '🇵🇰', country: 'Пакистан' },
  { code: '+91',  flag: '🇮🇳', country: 'Индия' },
  { code: '+86',  flag: '🇨🇳', country: 'Китай' },
  { code: '+82',  flag: '🇰🇷', country: 'Южная Корея' },
  { code: '+81',  flag: '🇯🇵', country: 'Япония' },
  { code: '+971',  flag: '🇦🇪', country: 'ОАЭ' },
  { code: '+966',  flag: '🇸🇦', country: 'Саудовская Аравия' },
  { code: '+49',  flag: '🇩🇪', country: 'Германия' },
  { code: '+33',  flag: '🇫🇷', country: 'Франция' },
  { code: '+44',  flag: '🇬🇧', country: 'Великобритания' },
  { code: '+39',  flag: '🇮🇹', country: 'Италия' },
  { code: '+34',  flag: '🇪🇸', country: 'Испания' },
  { code: '+1',   flag: '🇺🇸', country: 'США / Канада' },
];

// Кастомный дропдаун выбора кода страны с флагами
function CountryCodePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];
  const filtered = COUNTRY_CODES.filter(c =>
    c.country.toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search)
  );

  // Закрываем по клику вне
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 h-full min-w-[100px] justify-between"
      >
        <span className="text-xl leading-none">{selected.flag}</span>
        <span className="font-medium">{selected.code}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden">
          {/* Поиск */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск страны..."
                className="bg-transparent text-sm outline-none w-full dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </div>
          {/* Список */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">Не найдено</p>
            )}
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${
                  c.code === value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'
                }`}
              >
                <span className="text-xl leading-none">{c.flag}</span>
                <span className="flex-1">{c.country}</span>
                <span className="text-gray-400 dark:text-gray-500 text-xs font-mono">{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export default function Profile() {
  const { t, setLang } = useLanguage();
  const { user, refetch, update, patchUser } = useCurrentUser();
  const { logout } = useAuth();
  const [cities, setCities] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({
    role: 'passenger',
    language: 'ru',
    city_id: '',
    vehicle_number: '',
    phone: '',
    driver_status: 'pending',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bioForm, setBioForm] = useState('');
  const [profileTab, setProfileTab] = useState('settings');
  const [countryCode, setCountryCode] = useState('+992');

  useEffect(() => {
    if (user?.id) {
      const fetchTransactions = async () => {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            id,
            amount,
            status,
            created_at,
            sender_id,
            recipient_id,
            sender:profiles!transactions_sender_id_fkey(full_name, email),
            recipient:profiles!transactions_recipient_id_fkey(full_name, email)
          `)
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false });
        if (!error) {
          setTransactions(data || []);
        }
      };
      fetchTransactions();
    }
  }, [user?.id]);

  useEffect(() => {
    base44.entities.City.list().then(setCities);
    base44.entities.Vehicle.list().then(setVehicles);
  }, []);

  useEffect(() => {
    if (user) {
      // Нормализуем сохранённый номер: добавляем + если его нет
      const rawPhone = user.phone || '';
      const normalizedPhone = rawPhone && !rawPhone.startsWith('+') ? `+${rawPhone}` : rawPhone;

      // Ищем совпадение кода страны (сортируем по длине кода — длинные первыми, чтобы +77 не перебивал +7)
      const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
      const matched = sortedCodes.find(c => normalizedPhone.startsWith(c.code));
      const detectedCode = matched ? matched.code : '+992';
      const localNumber = matched
        ? normalizedPhone.slice(matched.code.length).trim()
        : normalizedPhone.replace(/^\+/, ''); // убираем + если код не найден

      setCountryCode(detectedCode);
      setForm({
        role: user.role || 'passenger',
        language: user.language || 'ru',
        city_id: user.city_id || '',
        vehicle_number: user.vehicle_number || '',
        phone: localNumber,
        driver_status: user.driver_status || 'pending',
      });
      setBioForm(user.bio || '');
    }
  }, [user]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.auth.updateMe({ photo_url: file_url });
      await update({ photo_url: file_url });
      toast.success('Фото обновлено');
    } catch (err) {
      console.error('[Profile] photo upload error:', err);
      toast.error('Не удалось загрузить фото');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fullPhone = form.phone ? `${countryCode}${form.phone}` : '';
      const data = { ...form, phone: fullPhone };

      if (bioForm?.trim()) {
        data.bio = bioForm.trim();
      }

      delete data.role;
      if (form.role !== 'driver') {
        delete data.driver_status;
        delete data.vehicle_number;
      }

      await update(data);
      setLang(data.language);
      toast.success(t('saveProfile'));
    } catch (err) {
      console.error('[Profile] save error:', err);
      toast.error('Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  // Смена роли с оплатой подписки
  const handleRoleChange = async (newRole) => {
    if (newRole === user?.role) return;

    const hasActiveSub = user?.subscription_status === 'active' && new Date(user?.subscription_paid_until || 0) > new Date();

    let fee = 0;
    if (!hasActiveSub) {
      if (newRole === 'driver') fee = 20;
      if (newRole === 'admin') fee = user?.admin_activated ? 25 : 100;
    }

    // Показываем подтверждение
    const confirmed = window.confirm(
      `Сменить роль на "${newRole === 'passenger' ? 'Пассажир' : newRole === 'driver' ? 'Водитель' : 'Администратор'}"?\n` +
      (fee > 0 ? `\nСтоимость: ${fee} TJS\nБаланс: ${Number(user?.balance || 0).toFixed(2)} TJS` : `\nУ вас уже активна подписка. Смена бесплатна.`)
    );
    if (!confirmed) return;

    try {
      if (fee > 0 && Number(user?.balance || 0) < fee) {
        throw new Error('Недостаточно средств на балансе. Пополните кошелек.');
      }

      /** @type {Record<string, any>} */
      const updates = { 
        role: newRole,
      };

      if (newRole === 'admin' && !user?.admin_activated) {
        updates.admin_activated = true;
      }

      /** @type {Record<string, any>} */
      const dbUpdates = { ...updates };
      delete dbUpdates.role;
      delete dbUpdates.admin_activated;

      if (fee > 0) {
        dbUpdates.balance = Math.max(0, Number(user?.balance || 0) - fee);
        dbUpdates.subscription_status = 'active';
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        dbUpdates.subscription_paid_until = nextMonth.toISOString();
      }
      
      if (newRole === 'driver') {
        dbUpdates.driver_status = 'pending';
      }

      await update(dbUpdates);
      
      localStorage.setItem(`demo_role_${user?.id}`, newRole);
      if (updates.admin_activated) {
        localStorage.setItem(`demo_admin_activated_${user?.id}`, 'true');
      }

      // Обновляем локальный стейт
      setForm(prev => ({ ...prev, role: newRole, driver_status: newRole === 'driver' ? 'pending' : prev.driver_status }));
      
      // Патчим контекст пользователя напрямую, так как мы удалили role из dbUpdates
      /** @type {Record<string, any>} */
      const patchData = { role: newRole };
      if (updates.admin_activated) patchData.admin_activated = true;
      if (newRole === 'driver') patchData.driver_status = 'pending';
      if (fee > 0) {
        patchData.balance = dbUpdates.balance;
        patchData.subscription_status = dbUpdates.subscription_status;
        patchData.subscription_paid_until = dbUpdates.subscription_paid_until;
      }
      patchUser(patchData);
      
      toast.success(
        newRole === 'passenger'
          ? '✅ Вы перешли на роль Пассажира!'
          : fee > 0
          ? `✅ Подписка активирована! Списано ${fee} TJS.`
          : `✅ Роль изменена. Подписка активна.`
      );
    } catch (err) {
      console.error('[Profile] role change error:', err);
      toast.error(err.message || 'Не удалось сменить роль');
    }
  };

  // Продление подписки
  const handleRenewSubscription = async () => {
    const fee = form.role === 'driver' ? 20 : 25;
    const confirmed = window.confirm(`Продлить подписку на 1 месяц?\nСтоимость: ${fee} TJS\nБаланс: ${Number(user?.balance || 0).toFixed(2)} TJS`);
    if (!confirmed) return;
    try {
      if (Number(user?.balance || 0) < fee) {
        throw new Error('Недостаточно средств на балансе. Пополните кошелек.');
      }

      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);

      await update({
        balance: Math.max(0, Number(user?.balance || 0) - fee),
        subscription_status: 'active',
        subscription_paid_until: nextMonth.toISOString()
      });
      // Убираем await refetch();
      toast.success(`✅ Подписка продлена на 1 месяц! Списано ${fee} TJS.`);
    } catch (err) {
      console.error('[Profile] renew error:', err);
      toast.error(err.message || 'Не удалось продлить подписку');
    }
  };

  const statusInfo = {
    pending: { emoji: '⏳', key: 'pending', cls: 'text-amber-700 bg-amber-50' },
    approved: { emoji: '✅', key: 'approved', cls: 'text-green-700 bg-green-50' },
    blocked: { emoji: '🚫', key: 'blocked', cls: 'text-red-700 bg-red-50' },
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-6">
        {/* Avatar card */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-6 text-white text-center">
          <div className="relative w-20 h-20 mx-auto mb-3">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt="Фото"
                className="w-20 h-20 rounded-full object-cover border-4 border-white/30 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
                <User size={32} className="text-white" />
              </div>
            )}
            {user?.role === 'driver' && (
              <label className="absolute bottom-0 right-0 w-7 h-7 bg-orange-400 rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-orange-500 transition-colors">
                {uploadingPhoto
                  ? <Loader2 size={13} className="text-white animate-spin" />
                  : <Camera size={13} className="text-white" />}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            )}
          </div>
          <p className="font-bold text-lg">{user?.full_name || user?.email || '...'}</p>
          <p className="text-blue-200 text-sm mt-0.5">{user?.email}</p>
          {user?.bio && user?.role === 'driver' && (
            <p className="text-blue-100 text-xs mt-2 px-4 leading-relaxed italic">"{user.bio}"</p>
          )}
          {user?.role && (
            <span className="mt-2 inline-block bg-white/20 text-white text-xs px-3 py-1 rounded-full font-medium">
              {t(user.role)}
            </span>
          )}
        </div>

        {/* Profile tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl p-1 shadow-sm border border-gray-100 dark:border-gray-700">
          {[
            { id: 'settings', label: 'Профиль', icon: User },
            { id: 'favorites', label: 'Избранное', icon: Heart },
            { id: 'wallet', label: 'Кошелек', icon: Wallet },
            { id: 'history', label: 'История', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setProfileTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                profileTab === id ? 'bg-blue-600 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {profileTab === 'favorites' && <FavoriteRoutes />}
        
        {profileTab === 'wallet' && (
          <div className="space-y-4">
            {/* Balance Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Баланс кошелька</p>
                <p className="text-3xl font-black text-gray-900 dark:text-gray-100">
                  {Number(user?.balance || 0).toFixed(2)} <span className="text-lg font-bold text-gray-500">TJS</span>
                </p>
              </div>
              <button
                onClick={async () => {
                  const amount = window.prompt("Введите сумму для пополнения (TJS):", "50");
                  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
                  try {
                    const { data, error } = await supabase.rpc('mock_top_up', { amount: Number(amount) });
                    if (error) throw new Error(error.message);
                    toast.success(`Баланс успешно пополнен на ${amount} TJS!`);
                    
                    // Refresh balance and transactions
                    await refetch();
                    const { data: txs } = await supabase
                      .from('transactions')
                      .select(`
                        id, amount, status, created_at, sender_id, recipient_id,
                        sender:profiles!transactions_sender_id_fkey(full_name, email),
                        recipient:profiles!transactions_recipient_id_fkey(full_name, email)
                      `)
                      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
                      .order('created_at', { ascending: false });
                    setTransactions(txs || []);
                  } catch (err) {
                    toast.error(err.message || "Ошибка при пополнении баланса");
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 shadow-md shadow-green-500/20"
              >
                ➕ Пополнить
              </button>
            </div>

            {/* Transactions List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-3">История транзакций</h3>
              {transactions.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">Нет транзакций</div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((t) => {
                    const isSender = t.sender_id === user.id;
                    const isTopUp = t.recipient_id === null;
                    const amountFormatted = `${isSender && !isTopUp ? '-' : '+'}${Number(t.amount).toFixed(2)} TJS`;
                    
                    let title = '';
                    let desc = '';
                    let colorClass = '';

                    if (isTopUp) {
                      title = 'Пополнение кошелька';
                      desc = 'Через платежную систему';
                      colorClass = 'text-green-600 dark:text-green-400 font-bold';
                    } else if (isSender) {
                      title = 'Оплата проезда';
                      desc = `Водителю ${t.recipient?.full_name || t.recipient?.email || '...'}`;
                      colorClass = 'text-red-500 dark:text-red-400 font-semibold';
                    } else {
                      title = 'Получена оплата';
                      desc = `От пассажира ${t.sender?.full_name || t.sender?.email || '...'}`;
                      colorClass = 'text-green-600 dark:text-green-400 font-bold';
                    }

                    return (
                      <div key={t.id} className="flex justify-between items-start border-b border-gray-50 dark:border-gray-700/50 pb-2.5 last:border-0 last:pb-0">
                        <div>
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                            t.status === 'completed' 
                              ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' 
                              : t.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                          }`}>
                            {t.status === 'completed' ? 'Успешно' : t.status === 'pending' ? 'Ожидает' : 'Отклонено'}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs ${colorClass}`}>{amountFormatted}</p>
                          <p className="text-[9px] text-gray-400 mt-1">
                            {new Date(t.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {profileTab === 'history' && <TripHistory user={user} />}

        {/* Form */}
        {profileTab === 'settings' && <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm space-y-5">
          {/* Role + Subscription */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 block">
              Роль и подписка
            </label>

            {/* Subscription Role Cards */}
            <div className="space-y-2">
              {/* Passenger */}
              <div
                onClick={() => {
                  if (form.role !== 'passenger') {
                    handleRoleChange('passenger');
                  }
                }}
                className={`relative rounded-xl border-2 p-3.5 cursor-pointer transition-all ${
                  form.role === 'passenger'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700 bg-gray-50 dark:bg-gray-700/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🧑‍💼</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Пассажир</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Бесплатно навсегда</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      БЕСПЛАТНО
                    </span>
                    {form.role === 'passenger' && (
                      <span className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    )}
                  </div>
                </div>
                {form.role === 'passenger' && (
                  <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700/40">
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">✅ Активна • Без ограничений по времени</p>
                  </div>
                )}
              </div>

              {/* Driver */}
              <div
                onClick={() => {
                  if (form.role !== 'driver') {
                    handleRoleChange('driver');
                  }
                }}
                className={`relative rounded-xl border-2 p-3.5 cursor-pointer transition-all ${
                  form.role === 'driver'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 bg-gray-50 dark:bg-gray-700/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🚌</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Водитель</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">20 TJS / месяц</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      20 TJS/мес
                    </span>
                    {form.role === 'driver' && (
                      <span className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    )}
                  </div>
                </div>
                {form.role === 'driver' && (
                  <div className="mt-2 pt-2 border-t border-orange-200 dark:border-orange-700/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className={`text-[11px] font-semibold ${
                        user?.subscription_status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                      }`}>
                        {user?.subscription_status === 'active' ? '✅ Подписка активна' : '❌ Подписка истекла'}
                      </p>
                      {user?.subscription_paid_until && (
                        <p className="text-[10px] text-gray-400">
                          до {new Date(user.subscription_paid_until).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </div>
                    {user?.subscription_status !== 'active' && (
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); await handleRenewSubscription(); }}
                        className="w-full text-center text-[11px] bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-1.5 font-semibold transition-all"
                      >
                        Продлить — 20 TJS
                      </button>
                    )}
                    <div className={`mt-1 rounded-lg p-2 text-xs font-medium flex items-center gap-2 ${
                      statusInfo[form.driver_status]?.cls || statusInfo.pending.cls
                    }`}>
                      <span>{statusInfo[form.driver_status]?.emoji || '⏳'}</span>
                      {t(form.driver_status || 'pending')}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin */}
              <div
                onClick={() => {
                  if (form.role !== 'admin') {
                    handleRoleChange('admin');
                  }
                }}
                className={`relative rounded-xl border-2 p-3.5 cursor-pointer transition-all ${
                  form.role === 'admin'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-100 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700 bg-gray-50 dark:bg-gray-700/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">🛡️</span>
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Администратор</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {user?.admin_activated ? '25 TJS / месяц' : '100 TJS активация + 25 TJS/мес'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      {user?.admin_activated ? '25 TJS/мес' : '100 TJS/мес'}
                    </span>
                    {form.role === 'admin' && (
                      <span className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    )}
                  </div>
                </div>
                {form.role === 'admin' && (
                  <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-700/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-[11px] font-semibold ${
                        user?.subscription_status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                      }`}>
                        {user?.subscription_status === 'active' ? '✅ Подписка активна' : '❌ Подписка истекла'}
                      </p>
                      {user?.subscription_paid_until && (
                        <p className="text-[10px] text-gray-400">
                          до {new Date(user.subscription_paid_until).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </div>
                    {user?.subscription_status !== 'active' && (
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); await handleRenewSubscription(); }}
                        className="w-full text-center text-[11px] bg-purple-500 hover:bg-purple-600 text-white rounded-lg py-1.5 font-semibold transition-all"
                      >
                        Продлить — 25 TJS
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 block">{t('language')}</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => setForm({ ...form, language: l.code })}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.language === l.code
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                      : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('city')}</label>
            <select
              value={form.city_id}
              onChange={e => setForm({ ...form, city_id: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">{t('selectCity')}</option>
              {cities.map(c => (
                <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
              ))}
            </select>
          </div>

          {/* Vehicle number (driver only) */}
          {form.role === 'driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('vehicleNumber')}</label>
              <select
                value={form.vehicle_number}
                onChange={e => setForm({ ...form, vehicle_number: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">— Выберите транспорт —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.vehicle_number}>
                    {v.vehicle_number} {v.route_number ? `· Маршрут ${v.route_number}` : ''} {v.type ? `(${v.type})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bio (driver only) */}
          {form.role === 'driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">О себе</label>
              <textarea
                value={bioForm}
                onChange={e => setBioForm(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm resize-none bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder="Краткая информация о вас, которую увидят пассажиры..."
              />
              <p className="text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{bioForm.length}/200</p>
            </div>
          )}

          {/* Phone */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('phone')}</label>
            <div className="flex gap-2">
              <CountryCodePicker value={countryCode} onChange={setCountryCode} />
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^\d\s\-]/g, '') })}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder="00 000 0000"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-95"
          >
            <Save size={18} />
            {saving ? t('loading') : t('saveProfile')}
          </button>

          <button
            onClick={() => logout()}
            className="w-full border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:border-red-800 dark:text-red-400 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <LogOut size={16} />
            Выйти из аккаунта
          </button>
        </div>}
      </div>
    </div>
  );
}