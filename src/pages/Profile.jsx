import { useState, useEffect, useRef } from 'react';
import { City, Vehicle } from '@/api/entities';
import { useLanguage, LANG_KEY } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Save, Heart, History, Camera, Loader2, LogOut, ChevronDown, Search, Wallet, Car } from 'lucide-react';
import FavoriteRoutes from '@/components/profile/FavoriteRoutes';
import TripHistory from '@/components/profile/TripHistory';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';
import { CATEGORY_LABELS as TAXI_CATEGORIES } from '@/lib/taxi';

const LANGS = [
  { code: 'ru', label: 'profile.langRu' },
  { code: 'tg', label: 'profile.langTg' },
  { code: 'en', label: 'profile.langEn' },
];

const COUNTRY_CODES = [
  { code: '+992', flag: '🇹🇯', country: 'profile.countryTajikistan' },
  { code: '+998', flag: '🇺🇿', country: 'profile.countryUzbekistan' },
  { code: '+7',   flag: '🇷🇺', country: 'profile.countryRussia' },
  { code: '+77',  flag: '🇰🇿', country: 'profile.countryKazakhstan' },
  { code: '+996', flag: '🇰🇬', country: 'profile.countryKyrgyzstan' },
  { code: '+374', flag: '🇦🇲', country: 'profile.countryArmenia' },
  { code: '+995', flag: '🇬🇪', country: 'profile.countryGeorgia' },
  { code: '+90',  flag: '🇹🇷', country: 'profile.countryTurkey' },
  { code: '+1',   flag: '🇺🇸', country: 'profile.countryUsaCanada' },
];

function CountryCodePicker({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];
  const filtered = COUNTRY_CODES.filter(c =>
    t(c.country).toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search)
  );

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
        className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-3 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="text-base">{selected.flag}</span>
        <span>{selected.code}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1.5 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-1.5">
              <Search size={13} className="text-slate-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('search')}
                className="bg-transparent text-xs outline-none w-full text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  c.code === value ? 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/50 dark:bg-emerald-500/10' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1 truncate">{t(c.country)}</span>
                <span className="text-slate-400 text-[10px] font-mono">{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const { user, refreshUser, update } = useCurrentUser();
  const { logout } = useAuth();
  const [cities, setCities] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({
    role: 'passenger',
    language: 'ru',
    city_id: '',
    vehicle_number: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bioForm, setBioForm] = useState('');
  const [profileTab, setProfileTab] = useState('settings');
  const [countryCode, setCountryCode] = useState('+992');
  const [taxiDriver, setTaxiDriver] = useState(null);
  const [taxiVehicle, setTaxiVehicle] = useState(null);
  const [taxiEdit, setTaxiEdit] = useState({});
  const [taxiSaving, setTaxiSaving] = useState(false);
  const [taxiTab, setTaxiTab] = useState('info');

  const CAR_TYPES = ['Седан', 'Хэтчбек', 'Универсал', 'Минивэн', 'Внедорожник', 'Купе', 'Пикап', 'Электромобиль'];

  useEffect(() => {
    if (user?.id) refreshUser();
  }, []);

  useEffect(() => {
    if (user?.id && user?.role === 'taxi_driver') {
      supabase.from('taxi_drivers').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setTaxiDriver(data);
          setTaxiEdit({
            full_name: data.full_name || '',
            phone: data.phone || '',
            city: data.city || '',
            email: data.email || '',
          });
        }
      }).catch((err) => console.error('[Profile] taxi_drivers load error:', err));
      supabase.from('taxi_vehicles').select('*').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        if (data) setTaxiVehicle(data);
      }).catch((err) => console.error('[Profile] taxi_vehicles load error:', err));
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.id) {
      const fetchTransactions = async () => {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('created_at', { ascending: false });
        if (!error && data) {
          setTransactions(data);
        }
      };
      fetchTransactions();
    }
  }, [user?.id]);

  useEffect(() => {
    City.list().then(setCities).catch((err) => console.error('[Profile] cities load error:', err));
    Vehicle.list().then(setVehicles).catch((err) => console.error('[Profile] vehicles load error:', err));
    supabase.from('routes').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setRoutes(data || [])).catch((err) => console.error('[Profile] routes load error:', err));
  }, []);

  useEffect(() => {
    if (user) {
      const rawPhone = user.phone || '';
      const normalizedPhone = rawPhone && !rawPhone.startsWith('+') ? `+${rawPhone}` : rawPhone;
      const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
      const matched = sortedCodes.find(c => normalizedPhone.startsWith(c.code));
      const detectedCode = matched ? matched.code : '+992';
      const localNumber = matched
        ? normalizedPhone.slice(matched.code.length).trim()
        : normalizedPhone.replace(/^\+/, '');

      setCountryCode(detectedCode);
      const roleFromDb = user.role || 'passenger';
      const normalizedRole = roleFromDb === 'user' ? 'passenger' : roleFromDb;
      setForm({
        role: normalizedRole,
        language: user.language || 'ru',
        city_id: user.city_id || '',
        vehicle_number: user.vehicle_number || '',
        phone: localNumber,
      });
      setBioForm(user.bio || '');
      setSelectedRouteId(user.route_id || '');
      if (user.language && !localStorage.getItem(LANG_KEY)) {
        setLang(user.language);
      }
    }
  }, [user?.id]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      setUploadingPhoto(true);
      const ext = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      await update({ photo_url: publicUrlData.publicUrl });
      if (refreshUser) await refreshUser();
      toast.success(t('profile.avatarUpdated'));
    } catch (err) {
      console.error('[Profile] photo upload error:', err);
      toast.error(t('profile.photoUploadError'));
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

      data.role = form.role === 'passenger' ? 'user' : form.role;
      delete data.driver_status;
      if (form.role !== 'driver') {
        delete data.vehicle_number;
      }

      if (form.role === 'driver' && selectedRouteId) {
        data.route_id = selectedRouteId;
      } else {
        data.route_id = null;
      }

      setLang(data.language);
      await update(data);

      // Notify the admin who created the selected route
      if (form.role === 'driver' && selectedRouteId) {
        const route = routes.find(r => r.id === selectedRouteId);
        if (route?.created_by_id) {
          supabase.from('notifications').insert({
            user_id: route.created_by_id,
            title: t('profile.notificationDriverSelectedRoute'),
            body: `${user.full_name || user.email} ${t('profile.notificationDriverSelectedRoute')} #${route.number} ${route.name || ''}`,
            type: 'driver_route_selected',
          }).then(({ error }) => { if (error) console.error('[Profile] notification failed:', error); }).catch(() => {});
        }
      }

      toast.success(t('saveProfile'));
    } catch (err) {
      console.error('[Profile] save error:', err);
      toast.error(t('profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (newRole) => {
    const dbRole = newRole === 'passenger' ? 'user' : newRole;
    if (dbRole === user?.role) return;

    const hasActiveSub = user?.subscription_status === 'active' && new Date(user?.subscription_paid_until || 0) > new Date();

    let fee = 0;
    if (!hasActiveSub) {
      if (newRole === 'driver') fee = 20;
      if (newRole === 'admin') fee = user?.admin_activated ? 25 : 100;
      if (newRole === 'taxi_driver') fee = 25;
    }

    const roleName = newRole === 'passenger' ? t('profile.rolePassenger') : newRole === 'driver' ? t('profile.roleDriver') : newRole === 'taxi_driver' ? 'Такси водитель' : t('profile.roleAdmin');
    const confirmed = window.confirm(
      `${t('profile.changeRoleConfirmTitle')} "${roleName}"?\n` +
      (fee > 0 ? `\n${t('profile.costLabel')} ${fee} TJS\n${t('profile.balanceLabel')} ${Number(user?.balance || 0).toFixed(2)} TJS` : `\n${t('profile.subscriptionActiveFree')}`)
    );
    if (!confirmed) return;

    try {
      if (fee > 0 && Number(user?.balance || 0) < fee) {
        throw new Error(t('profile.insufficientBalance'));
      }

      const updates = { role: newRole === 'passenger' ? 'user' : newRole };

      if (newRole === 'admin' && !user?.admin_activated) {
        updates.admin_activated = true;
      }

      const dbUpdates = { ...updates };

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
      if (newRole === 'taxi_driver') {
        dbUpdates.driver_status = 'approved';
      }

      await update(dbUpdates);

      setForm(prev => ({ ...prev, role: newRole, driver_status: newRole === 'driver' ? 'pending' : newRole === 'taxi_driver' ? 'approved' : prev.driver_status }));
      
      toast.success(
        newRole === 'passenger'
          ? t('profile.roleChangedToPassenger')
          : fee > 0
          ? `${t('profile.subscriptionActivated')} ${fee} TJS.`
          : t('profile.roleChangedSubscriptionActive')
      );

      if (newRole === 'taxi_driver') {
        navigate('/taxi/register');
      }
    } catch (err) {
      console.error('[Profile] role change error:', err);
      toast.error(err.message || t('profile.roleChangeError'));
    }
  };

  const handleRenewSubscription = async () => {
    const fee = form.role === 'driver' ? 20 : 25;
    const confirmed = window.confirm(`${t('profile.renewSubscriptionConfirm')}\n${t('profile.costLabel')} ${fee} TJS\n${t('profile.balanceLabel')} ${Number(user?.balance || 0).toFixed(2)} TJS`);
    if (!confirmed) return;
    try {
      if (Number(user?.balance || 0) < fee) {
        throw new Error(t('profile.insufficientBalanceRenew'));
      }

      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);

      await update({
        balance: Math.max(0, Number(user?.balance || 0) - fee),
        subscription_status: 'active',
        subscription_paid_until: nextMonth.toISOString()
      });
      toast.success(`${t('profile.subscriptionRenewed')} ${fee} TJS.`);
    } catch (err) {
      console.error('[Profile] renew error:', err);
      toast.error(err.message || t('profile.subscriptionRenewError'));
    }
  };

  const handleTaxiSave = async () => {
    setTaxiSaving(true);
    try {
      const updates = {
        full_name: taxiEdit.full_name,
        phone: taxiEdit.phone,
        city: taxiEdit.city,
        email: taxiEdit.email,
      };
      const { error } = await supabase.from('taxi_drivers').update(updates).eq('user_id', user.id);
      if (error) throw new Error(error.message);
      setTaxiDriver(prev => ({ ...prev, ...updates }));
      toast.success('Данные водителя обновлены');
    } catch (err) {
      toast.error(err.message || 'Ошибка сохранения');
    }
    setTaxiSaving(false);
  };

  const handleTaxiVehicleSave = async () => {
    if (!taxiVehicle?.id) return;
    setTaxiSaving(true);
    try {
      const { error } = await supabase.from('taxi_vehicles').update({
        make: taxiVehicle.make,
        model: taxiVehicle.model,
        year: parseInt(taxiVehicle.year) || null,
        color: taxiVehicle.color,
        plate_number: taxiVehicle.plate_number,
        body_type: taxiVehicle.body_type,
        seats: parseInt(taxiVehicle.seats) || 4,
        category: taxiVehicle.category,
        photo_url: taxiVehicle.photo_url || null,
      }).eq('id', taxiVehicle.id);
      if (error) throw new Error(error.message);
      toast.success('Данные автомобиля обновлены');
    } catch (err) {
      toast.error(err.message || 'Ошибка сохранения');
    }
    setTaxiSaving(false);
  };

  const handleVehiclePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !taxiVehicle?.id) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `cars/${taxiVehicle.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('taxi_docs').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('taxi_docs').getPublicUrl(path);
      setTaxiVehicle(prev => ({ ...prev, photo_url: data.publicUrl }));
      toast.success('Фото загружено — нажмите Сохранить');
    } catch (err) {
      toast.error('Ошибка загрузки фото');
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
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-6 text-white text-center">
          <div className="relative w-20 h-20 mx-auto mb-3">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt={t('profile.photoAlt')}
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
              {t(user.role === 'user' ? 'passenger' : user.role)}
            </span>
          )}
        </div>

        <div className="flex bg-white dark:bg-gray-800 rounded-2xl p-1 shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
          {[
            { id: 'settings', label: t('profile.tabSettings'), icon: User },
            { id: 'favorites', label: t('profile.tabFavorites'), icon: Heart },
            { id: 'wallet', label: t('profile.tabWallet'), icon: Wallet },
            { id: 'history', label: t('profile.tabHistory'), icon: History },
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('profile.walletBalance')}</p>
                <p className="text-3xl font-black text-gray-900 dark:text-gray-100">
                  {Number(user?.balance || 0).toFixed(2)} <span className="text-lg font-bold text-gray-500">TJS</span>
                </p>
              </div>
              <button
                onClick={() => toast.info('Пополнение кошелька временно недоступно. Платежная система еще не подключена.')}
                className="bg-slate-300 text-slate-500 text-xs font-bold px-4 py-2.5 rounded-xl cursor-not-allowed"
              >
                Пополнение недоступно
              </button>
            </div>
          </div>
        )}

        {profileTab === 'history' && <TripHistory user={user} />}

        {profileTab === 'settings' && <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm space-y-5">
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 block">
              {t('profile.roleAndSubscription')}
            </label>

            <div className="space-y-2">
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
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{t('profile.rolePassengerTitle')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.passengerFree')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      {t('profile.freeBadge')}
                    </span>
                    {form.role === 'passenger' && (
                      <span className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    )}
                  </div>
                </div>
                {form.role === 'passenger' && (
                  <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700/40">
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">{t('profile.passengerActiveStatus')}</p>
                  </div>
                )}
              </div>

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
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{t('profile.roleDriverTitle')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.driverPrice')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      {t('profile.driverPriceBadge')}
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
                        {user?.subscription_status === 'active' ? t('profile.subscriptionActive') : t('profile.subscriptionExpired')}
                      </p>
                      {user?.subscription_paid_until && (
                        <p className="text-[10px] text-gray-400">
                          {t('profile.until')} {new Date(user.subscription_paid_until).toLocaleDateString(lang === 'tg' ? 'tg-TJ' : lang)}
                        </p>
                      )}
                    </div>
                    {user?.subscription_status !== 'active' && (
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); await handleRenewSubscription(); }}
                        className="w-full text-center text-[11px] bg-orange-500 hover:bg-orange-600 text-white rounded-lg py-1.5 font-semibold transition-all"
                      >
                        {t('profile.renewDriverButton')}
                      </button>
                    )}
                    <div className={`mt-1 rounded-lg p-2 text-xs font-medium flex items-center gap-2 ${
                      statusInfo[user?.driver_status]?.cls || statusInfo.pending.cls
                    }`}>
                      <span>{statusInfo[user?.driver_status]?.emoji || '⏳'}</span>
                      {t(user?.driver_status || 'pending')}
                    </div>
                  </div>
                )}
              </div>

              {/* Taxi Driver Card */}
              {user?.role === 'taxi_driver' ? (
                <div
                  onClick={() => navigate('/taxi/driver')}
                  className="relative rounded-xl border-2 p-3.5 cursor-pointer transition-all border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">🚕</span>
                      <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Такси водитель</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Вы на линии</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                        Активно
                      </span>
                      <span className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700/40">
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Перейти к панели водителя</p>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (form.role !== 'taxi_driver') {
                      handleRoleChange('taxi_driver');
                    }
                  }}
                  className={`relative rounded-xl border-2 p-3.5 cursor-pointer transition-all ${
                    form.role === 'taxi_driver'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-700 bg-gray-50 dark:bg-gray-700/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">🚕</span>
                      <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Такси водитель</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">25 TJS/мес · Автоодобрение</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                        25 TJS
                      </span>
                      {form.role === 'taxi_driver' && (
                        <span className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                      )}
                    </div>
                  </div>
                  {form.role === 'taxi_driver' && (
                    <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className={`text-[11px] font-semibold ${
                          user?.subscription_status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        }`}>
                          {user?.subscription_status === 'active' ? 'Подписка активна' : 'Подписка неактивна'}
                        </p>
                        {user?.subscription_paid_until && (
                          <p className="text-[10px] text-gray-400">
                            до {new Date(user.subscription_paid_until).toLocaleDateString(lang === 'tg' ? 'tg-TJ' : lang)}
                          </p>
                        )}
                      </div>
                      {user?.subscription_status !== 'active' && (
                        <button
                          type="button"
                          onClick={async (e) => { e.stopPropagation(); await handleRenewSubscription(); }}
                          className="w-full text-center text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg py-1.5 font-semibold transition-all"
                        >
                          Продлить подписку
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate('/taxi/driver'); }}
                        className="w-full text-center text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg py-1.5 font-semibold transition-all"
                      >
                        Панель водителя
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Taxi Driver Editable Data — only when role is taxi_driver */}
              {form.role === 'taxi_driver' && taxiDriver && (
                <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 p-4 space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-1">
                    <Car size={16} className="text-emerald-600" />
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Данные водителя</p>
                  </div>

                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 gap-1">
                    {[
                      { id: 'info', label: 'Водитель' },
                      { id: 'car', label: 'Авто' },
                      { id: 'docs', label: 'Документы' },
                    ].map(({ id, label }) => (
                      <button key={id} onClick={() => setTaxiTab(id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${taxiTab === id ? 'bg-emerald-500 text-white shadow' : 'text-gray-500 hover:text-gray-800'}`}
                      >{label}</button>
                    ))}
                  </div>

                  {taxiTab === 'info' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">ФИО</label>
                        <input value={taxiEdit.full_name} onChange={e => setTaxiEdit({ ...taxiEdit, full_name: e.target.value })}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Телефон</label>
                        <input value={taxiEdit.phone} onChange={e => setTaxiEdit({ ...taxiEdit, phone: e.target.value })}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Город</label>
                        <input value={taxiEdit.city} onChange={e => setTaxiEdit({ ...taxiEdit, city: e.target.value })}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Email</label>
                        <input value={taxiEdit.email} onChange={e => setTaxiEdit({ ...taxiEdit, email: e.target.value })}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                      </div>
                      <button onClick={handleTaxiSave} disabled={taxiSaving}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-60">
                        {taxiSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {taxiSaving ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
                  )}

                  {taxiTab === 'car' && taxiVehicle && (
                    <div className="space-y-4">
                      {/* Фото авто */}
                      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {taxiVehicle.photo_url ? (
                          <img src={taxiVehicle.photo_url} alt="Авто" className="w-full h-40 object-cover" />
                        ) : (
                          <div className="w-full h-32 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex flex-col items-center justify-center gap-2">
                            <Car size={32} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Фото не загружено</span>
                          </div>
                        )}
                        <label className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer hover:bg-black transition-colors">
                          <input type="file" accept="image/*" className="hidden" onChange={handleVehiclePhotoUpload} />
                          📷 {taxiVehicle.photo_url ? 'Сменить фото' : 'Загрузить фото авто'}
                        </label>
                      </div>
                      {taxiVehicle.body_type === 'Электромобиль' && taxiVehicle.category !== 'electric' && (
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                          ⚡ У вас электромобиль — выберите категорию «Электро» ниже, чтобы в финансах считался заряд, а не топливо.
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Марка</label>
                          <input value={taxiVehicle.make || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, make: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Модель</label>
                          <input value={taxiVehicle.model || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, model: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Год</label>
                          <input value={taxiVehicle.year || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, year: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Цвет</label>
                          <input value={taxiVehicle.color || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, color: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Госномер</label>
                          <input value={taxiVehicle.plate_number || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, plate_number: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Мест</label>
                          <select value={taxiVehicle.seats || 4} onChange={e => setTaxiVehicle({ ...taxiVehicle, seats: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100">
                            {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Тип кузова</label>
                        <select value={taxiVehicle.body_type || ''} onChange={e => setTaxiVehicle({ ...taxiVehicle, body_type: e.target.value })}
                          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100">
                          <option value="">Не указан</option>
                          {CAR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Категория — тариф</label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(TAXI_CATEGORIES).map(([key, label]) => {
                            const emojis = { economy:'🚕', comfort:'✨', comfort_plus:'💎', business:'👑', minivan:'🚐', electric:'⚡', women:'👩', cargo:'📦', delivery:'📮', courier:'🚴', intercity:'🛣️' };
                            const isSel = taxiVehicle.category === key;
                            return (
                              <button key={key} onClick={() => setTaxiVehicle({ ...taxiVehicle, category: key })}
                                className={`px-2.5 py-2.5 rounded-2xl border-2 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${isSel ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-200'}`}>
                                <span>{emojis[key] || '•'}</span> {label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Категория определяет тариф пассажира и расчёт в «Финансах»</p>
                      </div>
                      <button onClick={handleTaxiVehicleSave} disabled={taxiSaving}
                        className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-60">
                        {taxiSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {taxiSaving ? 'Сохранение...' : 'Сохранить авто'}
                      </button>
                    </div>
                  )}

                  {taxiTab === 'docs' && (
                    <div className="space-y-2">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Водительское удостоверение</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">{taxiDriver.license_number || 'Не указан'}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Статус верификации</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${taxiDriver.is_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {taxiDriver.is_verified ? 'Верифицирован' : 'Ожидает проверки'}
                        </span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Рейтинг</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">★ {taxiDriver.rating?.toFixed(1) || '5.0'} · {taxiDriver.rating_count || 0} оценок · {taxiDriver.rides_count || 0} поездок</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Статус на линии</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${taxiDriver.status === 'online' || taxiDriver.status === 'free' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {taxiDriver.status === 'online' || taxiDriver.status === 'free' ? 'На линии' : 'Оффлайн'}
                        </span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Выплаты</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">{taxiDriver.bank_details?.details || 'Не указан'}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{t('profile.roleAdminTitle')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {user?.admin_activated ? t('profile.adminPricePerMonth') : t('profile.adminPriceActivation')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold px-2.5 py-1 rounded-full">
                      {user?.admin_activated ? t('profile.adminPriceMonthBadge') : t('profile.adminPriceActivationBadge')}
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
                        {user?.subscription_status === 'active' ? t('profile.adminSubscriptionActive') : t('profile.adminSubscriptionExpired')}
                      </p>
                      {user?.subscription_paid_until && (
                        <p className="text-[10px] text-gray-400">
                          {t('profile.until')} {new Date(user.subscription_paid_until).toLocaleDateString(lang === 'tg' ? 'tg-TJ' : lang)}
                        </p>
                      )}
                    </div>
                    {user?.subscription_status !== 'active' && (
                      <button
                        type="button"
                        onClick={async (e) => { e.stopPropagation(); await handleRenewSubscription(); }}
                        className="w-full text-center text-[11px] bg-purple-500 hover:bg-purple-600 text-white rounded-lg py-1.5 font-semibold transition-all"
                      >
                        {t('profile.renewAdminButton')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 block">{t('language')}</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => { setForm({ ...form, language: l.code }); setLang(l.code); }}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.language === l.code
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                      : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {t(l.label)}
                </button>
              ))}
            </div>
          </div>

          {form.role !== 'taxi_driver' && (
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
          )}

          {form.role === 'driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('vehicleNumber')}</label>
              <input
                type="text"
                value={form.vehicle_number}
                onChange={e => setForm({ ...form, vehicle_number: e.target.value })}
                placeholder={t('profile.vehicleNumberPlaceholder')}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          )}

          {form.role === 'driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('profile.routeLabel')}</label>
              <select
                value={selectedRouteId}
                onChange={e => setSelectedRouteId(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">{t('profile.routePlaceholder')}</option>
                {routes.filter(r => !form.city_id || !r.city_id || r.city_id === form.city_id).map(r => (
                  <option key={r.id} value={r.id}>
                    #{r.number} {r.name || ''} ({r.type === 'bus' ? t('bus') : t('minibus')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.role === 'driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('profile.bioLabel')}</label>
              <textarea
                value={bioForm}
                onChange={e => setBioForm(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm resize-none bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                placeholder={t('profile.bioPlaceholder')}
              />
              <p className="text-right text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{bioForm.length}/200</p>
            </div>
          )}

          {form.role !== 'taxi_driver' && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">{t('phone')}</label>
              <div className="flex gap-2">
                <CountryCodePicker value={countryCode} onChange={setCountryCode} t={t} />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^\d\s\-]/g, '') })}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                  placeholder="00 000 0000"
                />
              </div>
            </div>
          )}

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
            {t('logout')}
          </button>
        </div>}
      </div>
    </div>
  );
}
