import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Save, X, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function ScheduleManager({ route, onClose }) {
  const [schedule, setSchedule] = useState(null);
  const [stops, setStops] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!route) return;
    const routeStops = (route.stops || []).map((s, i) => ({
      stop_index: i,
      stop_name: s.name || `Остановка ${i + 1}`,
      times: [],
    }));

    base44.entities.Schedule.filter({ route_id: route.id }).then(res => {
      if (res[0]) {
        setSchedule(res[0]);
        // merge existing times with route stops
        const merged = routeStops.map(rs => {
          const existing = res[0].stops_schedule?.find(x => x.stop_index === rs.stop_index);
          return existing ? { ...rs, times: existing.times || [] } : rs;
        });
        setStops(merged);
      } else {
        setSchedule(null);
        setStops(routeStops);
      }
    });
  }, [route?.id]);

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

  const handleSave = async () => {
    setSaving(true);
    const data = {
      route_id: route.id,
      route_number: route.number,
      city_id: route.city_id,
      stops_schedule: stops.map(s => ({
        ...s,
        times: s.times.filter(t => t.trim()).sort(),
      })),
    };
    if (schedule) {
      await base44.entities.Schedule.update(schedule.id, data);
    } else {
      await base44.entities.Schedule.create(data);
    }
    setSaving(false);
    toast.success('Расписание сохранено');
    onClose();
  };

  if (!route.stops?.length) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-500 text-sm">У этого маршрута нет остановок. Сначала добавьте остановки.</p>
          <button onClick={onClose} className="mt-4 bg-gray-100 px-4 py-2 rounded-xl text-sm font-medium">Закрыть</button>
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
            <h2 className="font-bold text-gray-800">Расписание: Маршрут #{route.number}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {stops.map(stop => (
            <div key={stop.stop_index} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm text-gray-700">
                  <span className="text-blue-600 mr-1">#{stop.stop_index + 1}</span>
                  {stop.stop_name}
                </p>
                <button
                  onClick={() => addTime(stop.stop_index)}
                  className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800"
                >
                  <Plus size={12} /> Время
                </button>
              </div>
              {stop.times.length === 0 && (
                <p className="text-xs text-gray-400 italic">Нет времени отправления</p>
              )}
              <div className="flex flex-wrap gap-2">
                {stop.times.map((time, ti) => (
                  <div key={ti} className="flex items-center gap-1 bg-blue-50 rounded-lg px-2 py-1">
                    <input
                      type="time"
                      value={time}
                      onChange={e => updateTime(stop.stop_index, ti, e.target.value)}
                      className="text-xs text-blue-700 font-medium bg-transparent border-none outline-none w-20"
                    />
                    <button onClick={() => removeTime(stop.stop_index, ti)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Сохранение...' : 'Сохранить расписание'}
          </button>
        </div>
      </div>
    </div>
  );
}