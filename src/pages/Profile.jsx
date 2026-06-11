import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { User, Save, Heart, History, Camera, Loader2 } from 'lucide-react';
import FavoriteRoutes from '@/components/profile/FavoriteRoutes';
import TripHistory from '@/components/profile/TripHistory';
import { toast } from 'sonner';

const LANGS = [
  { code: 'ru', label: 'Русский' },
  { code: 'tg', label: 'Тоҷикӣ' },
  { code: 'en', label: 'English' },
];

export default function Profile() {
  const { t, setLang } = useLanguage();
  const { user, update } = useCurrentUser();
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

  useEffect(() => {
    base44.entities.City.list().then(setCities);
    base44.entities.Vehicle.list().then(setVehicles);
  }, []);

  useEffect(() => {
    if (user) {
      setForm({
        role: user.role || 'passenger',
        language: user.language || 'ru',
        city_id: user.city_id || '',
        vehicle_number: user.vehicle_number || '',
        phone: user.phone || '',
        driver_status: user.driver_status || 'pending',
      });
      setBioForm(user.bio || '');
    }
  }, [user]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ photo_url: file_url });
    await update({ photo_url: file_url });
    setUploadingPhoto(false);
    toast.success('Фото обновлено');
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, bio: bioForm };
    if (data.role !== 'driver') {
      delete data.driver_status;
      delete data.vehicle_number;
    }
    await update(data);
    setLang(data.language);
    setSaving(false);
    toast.success(t('saveProfile'));
  };

  const statusInfo = {
    pending: { emoji: '⏳', key: 'pending', cls: 'text-amber-700 bg-amber-50' },
    approved: { emoji: '✅', key: 'approved', cls: 'text-green-700 bg-green-50' },
    blocked: { emoji: '🚫', key: 'blocked', cls: 'text-red-700 bg-red-50' },
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4">
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
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
          {[
            { id: 'settings', label: 'Профиль', icon: User },
            { id: 'favorites', label: 'Избранное', icon: Heart },
            { id: 'history', label: 'История', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setProfileTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                profileTab === id ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-800'
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
        {profileTab === 'settings' && <div className="bg-white rounded-2xl p-5 shadow-sm space-y-5">
          {/* Role */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">{t('role')}</label>
            <div className="grid grid-cols-3 gap-2">
              {['passenger', 'driver', 'admin'].map(r => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, role: r, driver_status: r === 'driver' ? (user?.driver_status || 'pending') : form.driver_status })}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.role === r
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t(r)}
                </button>
              ))}
            </div>
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
            <label className="text-sm font-semibold text-gray-700 mb-2 block">{t('language')}</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => setForm({ ...form, language: l.code })}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.language === l.code
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">{t('city')}</label>
            <select
              value={form.city_id}
              onChange={e => setForm({ ...form, city_id: e.target.value })}
              className="w-full border rounded-xl px-4 py-3 text-sm bg-white"
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
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">{t('vehicleNumber')}</label>
              <select
                value={form.vehicle_number}
                onChange={e => setForm({ ...form, vehicle_number: e.target.value })}
                className="w-full border rounded-xl px-4 py-3 text-sm bg-white"
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
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">О себе</label>
              <textarea
                value={bioForm}
                onChange={e => setBioForm(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full border rounded-xl px-4 py-3 text-sm resize-none"
                placeholder="Краткая информация о вас, которую увидят пассажиры..."
              />
              <p className="text-right text-[11px] text-gray-400 mt-0.5">{bioForm.length}/200</p>
            </div>
          )}

          {/* Phone */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">{t('phone')}</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded-xl px-4 py-3 text-sm"
              placeholder="+992 00 000 0000"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-95"
          >
            <Save size={18} />
            {saving ? t('loading') : t('saveProfile')}
          </button>
        </div>}
      </div>
    </div>
  );
}