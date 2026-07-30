import { useState } from 'react';
import { Upload, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const CAR_TYPES = ['Седан', 'Хэтчбек', 'Универсал', 'Минивэн', 'Внедорожник', 'Купе', 'Пикап', 'Электромобиль'];
const CAR_CATEGORIES = ['economy', 'comfort', 'comfort_plus', 'minivan', 'business', 'electric', 'women', 'cargo'];
const CATEGORY_LABELS = { economy: 'Эконом', comfort: 'Комфорт', comfort_plus: 'Комфорт+', minivan: 'Минивэн', business: 'Бизнес', electric: 'Электро', women: 'Для женщин', cargo: 'Грузовое' };

export default function TaxiDriverRegistration() {
  const { user, update } = useCurrentUser();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    city: '',
    make: '', model: '', year: '', color: '', plate_number: '', vin: '', seats: 4,
    body_type: '', category: 'economy',
    license_number: '', bank_details: '',
  });
  const [files, setFiles] = useState({ photo: null, car_photo: null, license: null, tech_passport: null, insurance: null });

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleFile = (key) => (e) => {
    const file = e.target.files?.[0];
    if (file) setFiles(prev => ({ ...prev, [key]: file }));
  };

  const uploadFile = async (file, path) => {
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/${path}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('taxi_docs').upload(filePath, file);
    if (error) throw error;
    const { data, error: signErr } = await supabase.storage.from('taxi_docs').createSignedUrl(filePath, 31536000);
    if (signErr) throw signErr;
    return data.signedUrl;
  };

  const handleSubmit = async () => {
    if (!form.full_name || !form.phone || !form.make || !form.model || !form.plate_number) {
      toast.error('Заполните обязательные поля');
      return;
    }
    setLoading(true);
    try {
      let photo_url = '', car_photo_url = '', license_url = '', tech_url = '', insurance_url = '';
      if (files.photo) photo_url = await uploadFile(files.photo, 'photos');
      if (files.car_photo) car_photo_url = await uploadFile(files.car_photo, 'cars');
      if (files.license) license_url = await uploadFile(files.license, 'documents');
      if (files.tech_passport) tech_url = await uploadFile(files.tech_passport, 'documents');
      if (files.insurance) insurance_url = await uploadFile(files.insurance, 'documents');

      await supabase.from('taxi_drivers').insert({
        user_id: user.id, full_name: form.full_name, phone: form.phone, email: form.email,
        city: form.city, photo_url, status: 'offline', is_verified: true, bank_details: form.bank_details ? { details: form.bank_details } : null,
      });

      const vehicleData = {
        driver_id: user.id, make: form.make, model: form.model, year: parseInt(form.year) || null,
        color: form.color, plate_number: form.plate_number, vin: form.vin || null,
        seats: parseInt(form.seats) || 4, body_type: form.body_type, category: form.category, photo_url: car_photo_url,
      };
      await supabase.from('taxi_vehicles').insert(vehicleData);

      await supabase.from('taxi_driver_documents').insert({
        driver_id: user.id, license_photo_url: license_url, tech_passport_url: tech_url, insurance_url: insurance_url,
        license_number: form.license_number, is_verified: true,
      });

      toast.success('Данные водителя сохранены! Включите статус "На линии" в панели.');
      navigate('/taxi/driver');
    } catch (err) {
      toast.error('Ошибка при отправке: ' + (err.message || 'повторите позже'));
    }
    setLoading(false);
  };

  const inputClass = "w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 pb-8">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-sm font-bold">Регистрация водителя</h1>
          <p className="text-[10px] text-slate-400">Шаг {step} из 4</p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1">
          {[1,2,3,4].map(s => (
            <div key={s} className={`w-6 h-1 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {step === 1 && (
          <>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Личные данные</h2>
            <input className={inputClass} placeholder="ФИО *" value={form.full_name} onChange={e => updateForm('full_name', e.target.value)} />
            <input className={inputClass} placeholder="Телефон *" value={form.phone} onChange={e => updateForm('phone', e.target.value)} />
            <input className={inputClass} placeholder="Email" value={form.email} onChange={e => updateForm('email', e.target.value)} />
            <input className={inputClass} placeholder="Город работы" value={form.city} onChange={e => updateForm('city', e.target.value)} />
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Фото профиля</p>
              <label className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <Upload size={16} className="text-slate-400" />
                <span className="text-xs text-slate-500">{files.photo ? files.photo.name : 'Загрузить фото'}</span>
                <input type="file" accept="image/*" onChange={handleFile('photo')} className="hidden" />
              </label>
            </div>
            <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
              Далее — Автомобиль
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Данные автомобиля</h2>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Марка *" value={form.make} onChange={e => updateForm('make', e.target.value)} />
              <input className={inputClass} placeholder="Модель *" value={form.model} onChange={e => updateForm('model', e.target.value)} />
              <input className={inputClass} placeholder="Год выпуска" value={form.year} onChange={e => updateForm('year', e.target.value)} />
              <input className={inputClass} placeholder="Цвет" value={form.color} onChange={e => updateForm('color', e.target.value)} />
              <input className={inputClass} placeholder="Госномер *" value={form.plate_number} onChange={e => updateForm('plate_number', e.target.value)} />
              <input className={inputClass} placeholder="VIN (необяз.)" value={form.vin} onChange={e => updateForm('vin', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className={inputClass} value={form.body_type} onChange={e => updateForm('body_type', e.target.value)}>
                <option value="">Тип кузова</option>
                {CAR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className={inputClass} value={form.seats} onChange={e => updateForm('seats', e.target.value)}>
                {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} места</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Категория автомобиля</p>
              <div className="grid grid-cols-2 gap-2">
                {CAR_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => updateForm('category', cat)}
                    className={`px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                      form.category === cat ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Фото автомобиля</p>
              <label className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <Upload size={16} className="text-slate-400" />
                <span className="text-xs text-slate-500">{files.car_photo ? files.car_photo.name : 'Загрузить фото'}</span>
                <input type="file" accept="image/*" onChange={handleFile('car_photo')} className="hidden" />
              </label>
            </div>
            <button onClick={() => setStep(3)} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
              Далее — Документы
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Документы</h2>
            <input className={inputClass} placeholder="Номер водительского удостоверения" value={form.license_number} onChange={e => updateForm('license_number', e.target.value)} />
            {[
              { key: 'license', label: 'Фото водительского удостоверения' },
              { key: 'tech_passport', label: 'Фото техпаспорта' },
              { key: 'insurance', label: 'Фото страховки' },
            ].map(({ key, label }) => (
              <div key={key}>
                <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
                <label className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload size={16} className="text-slate-400" />
                  <span className="text-xs text-slate-500">{files[key] ? files[key].name : 'Загрузить'}</span>
                  <input type="file" accept="image/*" onChange={handleFile(key)} className="hidden" />
                </label>
              </div>
            ))}
            <button onClick={() => setStep(4)} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">
              Далее — Выплаты
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Выплаты</h2>
            <input className={inputClass} placeholder="Банк или кошелёк для выплат" value={form.bank_details} onChange={e => updateForm('bank_details', e.target.value)} />
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-emerald-600 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Готово!</p>
                <p className="text-[10px] text-emerald-700/70">После сохранения вы сможете выходить на линию и принимать заказы.</p>
              </div>
            </div>
            <button onClick={handleSubmit} disabled={loading}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                loading ? 'bg-slate-300 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25'
              }`}
            >
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Сохранение...</span> : 'Сохранить данные'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
