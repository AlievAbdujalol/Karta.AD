import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function CitiesManager() {
  const { t } = useLanguage();
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({ name: '', country: '', lat: '', lng: '' });
  const [adding, setAdding] = useState(false);

  const load = () => base44.entities.City.list().then(setCities);
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name || !form.country) return;
    await base44.entities.City.create({
      name: form.name,
      country: form.country,
      lat: parseFloat(form.lat) || 0,
      lng: parseFloat(form.lng) || 0,
    });
    setForm({ name: '', country: '', lat: '', lng: '' });
    setAdding(false);
    load();
    toast.success(t('save'));
  };

  const handleDelete = async (id) => {
    await base44.entities.City.delete(id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">{t('cities')}</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> {t('addCity')}
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder={t('name')}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder={t('country')}
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder={t('latitude')}
              value={form.lat}
              onChange={e => setForm({ ...form, lat: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
              type="number"
              step="any"
            />
            <input
              placeholder={t('longitude')}
              value={form.lng}
              onChange={e => setForm({ ...form, lng: e.target.value })}
              className="border rounded-lg px-3 py-2 text-sm"
              type="number"
              step="any"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {t('save')}
            </button>
            <button onClick={() => setAdding(false)} className="border text-gray-600 px-4 py-2 rounded-lg text-sm">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {cities.map(city => (
          <div key={city.id} className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
                <MapPin size={17} className="text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">{city.name}</p>
                <p className="text-xs text-gray-500">
                  {city.country}
                  {city.lat ? ` · ${city.lat.toFixed(3)}, ${city.lng.toFixed(3)}` : ''}
                </p>
              </div>
            </div>
            <button onClick={() => handleDelete(city.id)} className="text-red-400 hover:text-red-600 transition-colors p-1">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {cities.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">{t('addCity')}</p>
        )}
      </div>
    </div>
  );
}