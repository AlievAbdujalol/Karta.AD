import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, ChevronUp, ChevronDown, MapPin } from 'lucide-react';

function getNextTimes(times, count = 3) {
  if (!times?.length) return [];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const parsed = times
    .filter(t => t)
    .map(t => {
      const [h, m] = t.split(':').map(Number);
      return { label: t, mins: h * 60 + m };
    })
    .sort((a, b) => a.mins - b.mins);

  const upcoming = parsed.filter(t => t.mins >= nowMins);
  const result = upcoming.slice(0, count);
  if (result.length < count) result.push(...parsed.slice(0, count - result.length));
  return result.map(t => t.label);
}

export default function SchedulePanel({ route }) {
  const [schedule, setSchedule] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!route?.id) { setSchedule(null); return; }
    base44.entities.Schedule.filter({ route_id: route.id }).then(res => setSchedule(res[0] || null));
  }, [route?.id]);

  if (!schedule || !schedule.stops_schedule?.length) return null;
  const stopsWithTimes = schedule.stops_schedule.filter(s => s.times?.length > 0);
  if (!stopsWithTimes.length) return null;

  return (
    <div className="absolute bottom-4 left-3 z-10 w-[min(320px,calc(100%-70px))]">
      <div className="rounded-2xl overflow-hidden bg-white/[0.97] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-black/[0.06] dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">

        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-[#1a3f8f] to-[#1e56d0]">
              <Clock size={13} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Расписание</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Маршрут #{route.number}</p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            {expanded
              ? <ChevronUp size={14} className="text-gray-500 dark:text-gray-400" />
              : <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 max-h-56 overflow-y-auto space-y-1.5">
            {stopsWithTimes.map(stop => {
              const next = getNextTimes(stop.times, 3);
              return (
                <div key={stop.stop_index} className="flex items-start gap-2.5 py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-gradient-to-br from-[#1a3f8f] to-[#1e56d0]">
                    <span className="text-white text-[9px] font-bold">{stop.stop_index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">{stop.stop_name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {next.map((t, i) => (
                        <span
                          key={i}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                            i === 0
                              ? 'bg-gradient-to-br from-[#1a3f8f] to-[#1e56d0] text-white'
                              : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
