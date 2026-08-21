import { useState, useEffect } from 'react';
import { Schedule } from '@/api/entities';
import { Plus, Trash2, Save, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';

export default function ScheduleManager({ route, onClose }) {
  const { t } = useLanguage();
  const [schedule, setSchedule] = useState(null);
  const [stops, setStops] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!route) return;
    const routeStops = (route.stops || []).map((s, i) => ({
      stop_index: i,
      stop_name: s.name || t('admin.schedule.stopDefaultName'),
      times: [],
      price_from_prev: '',
    }));

    Schedule.filter({ route_id: route.id }).then(res => {
      if (res[0]) {
        setSchedule(res[0]);
        const merged = routeStops.map(rs => {
          const existing = res[0].stops_schedule?.find(x => x.stop_index === rs.stop_index);
          return existing
            ? { ...rs, times: existing.times || [], price_from_prev: existing.price_from_prev ?? '' }
            : rs;
        });
        setStops(merged);
      } else {
        setSchedule(null);
        setStops(routeStops);
      }
    });
  }, [route?.id]);

  const updateStop = (stopIndex, field, value) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex ? { ...s, [field]: value } : s
    ));
  };

  const addTime = (stopIndex) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex ? { ...s, times: [...s.times, ''] } : s
    ));
  };

  const updateTime = (stopIndex, timeIdx, value) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex
        ? { ...s, times: s.times.map((t, i) => i === timeIdx ? value : t) }
        : s
    ));
  };

  const removeTime = (stopIndex, timeIdx) => {
    setStops(prev => prev.map(s =>
      s.stop_index === stopIndex
        ? { ...s, times: s.times.filter((_, i) => i !== timeIdx) }
        : s
    ));
  };

  const calcPriceToStop = (stopIndex) => {
    let total = 0;
    for (let i = 0; i <= stopIndex; i++) {
      const p = parseFloat(stops[i]?.price_from_prev);
      if (!isNaN(p)) total += p;
    }
    return total;
  };

  const handleSave = async () => {
    setSaving(true);
    const data = {
      route_id: route.id,
      route_number: route.number,
      city_id: route.city_id,
      stops_schedule: stops.map(s => ({
        stop_index: s.stop_index,
        stop_name: s.stop_name,
        times: s.times.filter(t => t.trim()).sort(),
        price_from_prev: s.price_from_prev ? parseFloat(s.price_from_prev) : null,
      })),
    };
    if (schedule) {
      await Schedule.update(schedule.id, data);
    } else {
      await Schedule.create(data);
    }
    setSaving(false);
    toast.success(t('admin.schedule.saved'));
    onClose();
  };

  if (!route.stops?.length) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-500 text-sm">{t('admin.schedule.noStopsMessage')}</p>
          <button onClick={onClose} className="mt-4 bg-gray-100 px-4 py-2 rounded-xl text-sm font-medium">{t('admin.schedule.closeButton')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            <h2 className="font-bold text-gray-800">{t('admin.schedule.title')} #{route.number}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {stops.map((stop, idx) => {
            const cumPrice = calcPriceToStop(idx);
            return (
              <div key={stop.stop_index} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-gray-700">
                    <span className="text-blue-600 mr-1">#{stop.stop_index + 1}</span>
                    {stop.stop_name}
                  </p>
                  <button onClick={() => addTime(stop.stop_index)}
                    className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800">
                    <Plus size={12} /> {t('admin.schedule.addTimeButton')}
                  </button>
                </div>

                {stop.times.map((time, ti) => (
                  <div key={ti} className="flex items-center gap-1 bg-blue-50 rounded-lg px-2 py-1 mt-1">
                    <input type="time" value={time}
                      onChange={e => updateTime(stop.stop_index, ti, e.target.value)}
                      className="text-xs text-blue-700 font-medium bg-transparent border-none outline-none w-20" />
                    <button onClick={() => removeTime(stop.stop_index, ti)}
                      className="text-gray-400 hover:text-red-500">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                  <label className="text-xs text-gray-500">{t('admin.schedule.priceFromPrevLabel')}</label>
                  <input type="number" step="0.01" min="0" value={stop.price_from_prev}
                    onChange={e => updateStop(stop.stop_index, 'price_from_prev', e.target.value)}
                    placeholder="0"
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20 bg-white text-gray-900 text-center"
                    disabled={idx === 0}
                  />
                  <span className="text-xs text-gray-400">{t('admin.schedule.currencyLabel')}</span>
                  {idx > 0 && (
                    <span className="text-xs text-gray-500 ml-auto">
                      {t('admin.schedule.toThisStopLabel')} <strong className="text-green-700">{cumPrice.toFixed(2)} {t('admin.schedule.currencyLabel')}</strong>
                    </span>
                  )}
                  {idx === 0 && (
                    <span className="text-xs text-gray-400 ml-auto">{t('admin.schedule.firstStopLabel')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t">
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            <Save size={16} />
            {saving ? t('admin.schedule.saving') : t('admin.schedule.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
