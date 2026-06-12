import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useAuth } from '@/lib/AuthContext';
import { User, Save, Heart, History, Camera, Loader2, LogOut, ChevronDown, Search } from 'lucide-react';
import FavoriteRoutes from '@/components/profile/FavoriteRoutes';
import TripHistory from '@/components/profile/TripHistory';
import { toast } from 'sonner';

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
  const { user, update } = useCurrentUser();
  const { logout } = useAuth();
  const [cities, setCities] = useState([]);
  const [vehicles, setVehicles] = useState([]);
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
      const data = { ...form, phone: fullPhone, bio: bioForm };
      if (data.role !== 'driver') {
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

        {profileTab === 'favorites' && <FavoriteRoutes user={user} />}
        {profileTab === 'history' && <TripHistory user={user} />}

        {/* Form */}
        {profileTab === 'settings' && <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm space-y-5">
          {/* Role */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 block">{t('role')}</label>
            <div className="grid grid-cols-2 gap-2">
              {['passenger', 'driver'].map(r => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, role: r, driver_status: r === 'driver' ? (user?.driver_status || 'pending') : form.driver_status })}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.role === r
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {t(r)}
                </button>
              ))}
            </div>
            {/* Если пользователь уже admin — показываем бейдж, но не даём менять */}
            {form.role === 'admin' && (
              <div className="mt-2 rounded-lg p-2.5 text-xs font-medium flex items-center gap-2 text-purple-700 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-300">
                <span>🛡️</span> Администратор — назначено администратором системы
              </div>
            )}
            {form.role === 'driver' && (
              <div className={`mt-2 rounded-lg p-2.5 text-xs font-medium flex items-center gap-2 ${
                statusInfo[form.driver_status]?.cls || statusInfo.pending.cls
              }`}>
                <span>{statusInfo[form.driver_status]?.emoji || '⏳'}</span>
                {t(form.driver_status || 'pending')}
              </div>
            )}
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