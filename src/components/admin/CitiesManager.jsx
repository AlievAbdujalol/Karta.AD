import { useState, useEffect, useMemo } from 'react';
import { City } from '@/api/entities';
import { useLanguage } from '@/lib/useLanguage';
import { COUNTRIES, getFlag, getCountryCenter } from '@/lib/countryData';
import { Plus, Trash2, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import MapLocationPicker from './MapLocationPicker';



export default function CitiesManager() {
  const { t } = useLanguage();
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({ name: '', country: '', lat: '', lng: '' });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const load = () => City.list().then(setCities);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const handleCountrySelect = (country) => {
    setForm(prev => ({ ...prev, country }));
    setSearch('');
    setOpen(false);
    const center = getCountryCenter(country);
    if (center) {
      setForm(prev => ({ ...prev, lat: String(center[0]), lng: String(center[1]) }));
    }
  };

  const mapCenter = form.country && getCountryCenter(form.country)
    ? getCountryCenter(form.country)
    : [38.5581, 68.7738];

  const handleAdd = async () => {
    if (!form.name || !form.country) {
      toast.error(t('admin.cities.fillFieldsError'));
      return;
    }
    if (!form.lat || !form.lng) {
      toast.error(t('admin.cities.locationRequired'));
      return;
    }
    try {
      await City.create({
        name: form.name,
        country: form.country,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
      });
      setForm({ name: '', country: '', lat: '', lng: '' });
      setAdding(false);
      load();
      toast.success(t('save'));
    } catch (err) {
      toast.error(err.message || t('admin.cities.saveError'));
    }
  };

  const handleDelete = async (id) => {
    await City.delete(id);
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
              className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
            />
            <div className="relative">
              <div className="flex items-center border rounded-lg bg-white px-3 py-2 text-sm cursor-pointer"
                onClick={() => setOpen(!open)}
              >
                {form.country ? (
                  <span className="text-gray-900">{getFlag(form.country)} {form.country}</span>
                ) : (
                  <span className="text-gray-400">{t('country')}</span>
                )}
              </div>
              {open && (
                <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-hidden flex flex-col" onWheel={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b sticky top-0 bg-white">
                    <Search size={14} className="text-gray-400" />
                    <input
                      autoFocus
                      placeholder={t('admin.cities.searchPlaceholder')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="flex-1 text-sm outline-none bg-gray-800 text-white placeholder-gray-400 rounded px-2 py-1"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1" onWheel={e => e.stopPropagation()}>
                    {filtered.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">{t('admin.cities.countryNotFound')}</p>
                    ) : (
                      filtered.map(c => (
                        <button
                          key={c}
                          onClick={() => handleCountrySelect(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors ${form.country === c ? 'bg-blue-50 font-medium' : ''}`}
                        >
                          <span>{getFlag(c)}</span>
                          <span className="text-gray-900">{c}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <MapLocationPicker
            value={form.lat ? { lat: parseFloat(form.lat), lng: parseFloat(form.lng) } : null}
            onChange={({ lat, lng }) => setForm(prev => ({ ...prev, lat: String(lat), lng: String(lng) }))}
            center={mapCenter}
            zoom={5}
            height="280px"
          />

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {t('save')}
            </button>
            <button
              onClick={() => { setAdding(false); setForm({ name: '', country: '', lat: '', lng: '' }); }}
              className="border text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors"
            >
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
                  {getFlag(city.country)} {city.country}
                  {city.lat ? ` · ${Number(city.lat).toFixed(4)}, ${Number(city.lng).toFixed(4)}` : ''}
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
