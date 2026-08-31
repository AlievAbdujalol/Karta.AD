/**
 * RoutingPanel.jsx
 * Full routing panel:
 *   - Driving / Taxi / Walking / Cycling via OSRM
 *   - Bus / Minibus via findTransitRoutes (walk -> bus -> walk segments)
 *   - ETA to board stop, driver/vehicle status
 *   - Nominatim autocomplete, geolocation auto-fill
 *   - Navigation launch via useNavigation
 *   Props: onClose, onRouteBuilt, onStartNavigation, onRequestMapPick,
 *          mapPickResult, mapPickTarget, routes=[], vehicles=[]
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Navigation, MapPin, X, RotateCw, Route, AlertCircle, Loader2, Crosshair,
  ChevronDown, Play, Car, Bike, PersonStanding, Clock3, ArrowLeftRight,
  LocateFixed, Share2, Copy, Check, Bus, Truck, Volume2, VolumeX, Timer,
  ArrowRight, Footprints, CheckCircle2, CircleDot, Radio, WifiOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '@/lib/NavigationContext';
import {
  findTransitRoutes, fmtDist, fmtDur, distanceM, buildSegmentPolylines,
} from '@/lib/transitRouter';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSPORT_MODES = [
  { id: 'driving',  icon: Car,            label: 'Авто',      osrmProfile: 'driving',  color: '#2563EB' },
  { id: 'taxi',     icon: Car,            label: 'Такси',     osrmProfile: 'driving',  color: '#F59E0B' },
  { id: 'walking',  icon: PersonStanding, label: 'Пешком',    osrmProfile: 'walking',  color: '#7C3AED' },
  { id: 'cycling',  icon: Bike,           label: 'Вело',      osrmProfile: 'cycling',  color: '#059669' },
  { id: 'bus',      icon: Bus,            label: 'Автобус',   osrmProfile: null,       color: '#EA580C' },
  { id: 'minibus',  icon: Truck,          label: 'Маршрутка', osrmProfile: null,       color: '#DC2626' },
];

const OSRM_ENDPOINTS = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
};

const RECENT_KEY = 'karta_route_recent_v2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function pushRecent(place) {
  try {
    const cur = getRecent().filter(
      (p) => !(Math.abs(p.lat - place.lat) < 0.0005 && Math.abs(p.lng - place.lng) < 0.0005),
    );
    cur.unshift({ shortName: place.shortName, lat: place.lat, lng: place.lng, name: place.name || place.shortName });
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 6)));
  } catch {}
}

async function searchAddress(query, limit = 5) {
  if (!query || query.length < 2) return [];
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&accept-language=ru&addressdetails=1'
      + '&q=' + encodeURIComponent(query) + '&limit=' + limit;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'KartaAD/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.map((item) => ({
      id: item.place_id,
      name: item.display_name,
      shortName: item.display_name.split(',').slice(0, 3).join(', '),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type,
    }));
  } catch {
    return [];
  }
}

async function buildOsrmRoute(from, to, profile = 'driving') {
  const endpoint = OSRM_ENDPOINTS[profile] || OSRM_ENDPOINTS.driving;
  const coords = from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat;
  try {
    const resp = await fetch(
      endpoint + '/' + coords + '?overview=full&geometries=geojson&steps=true',
      { signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.routes?.length) return null;
    const r = data.routes[0];
    const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const steps = [];
    let cursor = 0;
    (r.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => {
        steps.push({
          instruction: step.maneuver?.type || '',
          modifier:    step.maneuver?.modifier || '',
          name:        step.name || '',
          distance:    step.distance || 0,
          duration:    step.duration || 0,
          start:       geometry[cursor] || [0, 0],
        });
        cursor = Math.min(cursor + 1, geometry.length - 1);
      });
    });
    return { distance: r.distance, duration: r.duration, geometry, steps };
  } catch {
    return null;
  }
}

/** ETA of nearest active vehicle to a stop. Returns { sec, vehicle } or null. */
function etaToStop(vehicles, routeId, stop) {
  const active = (vehicles || []).filter(
    (v) => v.route_id === routeId && v.is_active && v.lat && v.lng,
  );
  if (!active.length) return null;
  let best = null;
  for (const v of active) {
    const d = distanceM(v.lat, v.lng, stop.lat, stop.lng);
    const speed = (v.speed || 30) / 3.6;
    const sec = d / speed;
    if (!best || sec < best.sec) best = { sec, vehicle: v };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Sub-component: PlaceField (autocomplete address input)
// ---------------------------------------------------------------------------

function PlaceField({ value, onChangeText, onPickPlace, placeholder, iconColor, isActive, onRequestMapPick, autoFocus }) {
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);

  const showDropdown = focused && (suggestions.length > 0 || (recent.length > 0 && value.length < 2));

  const handleChange = useCallback((val) => {
    onChangeText(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    setLoadingSug(true);
    timerRef.current = setTimeout(async () => {
      const res = await searchAddress(val);
      setSuggestions(res);
      setLoadingSug(false);
    }, 350);
  }, [onChangeText]);

  useEffect(() => {
    if (focused && value.length < 2) setRecent(getRecent());
  }, [focused, value.length]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const borderCls = isActive
    ? 'border-amber-400 dark:border-amber-500 shadow-md'
    : focused
    ? 'border-blue-500 shadow-md shadow-blue-500/10'
    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600';

  return (
    <div className="relative">
      <div className={'flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-2 bg-white dark:bg-slate-800 transition-all ' + borderCls}>
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconColor + '18', color: iconColor }}
        >
          <MapPin size={15} />
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none text-[13px] font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-normal min-w-0"
        />
        {loadingSug && <Loader2 size={14} className="animate-spin text-slate-400 flex-shrink-0" />}
        {!loadingSug && value && (
          <button
            onClick={() => { onChangeText(''); setSuggestions([]); }}
            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
          >
            <X size={11} className="text-slate-500" />
          </button>
        )}
        <button
          onClick={onRequestMapPick}
          title="Выбрать на карте"
          className={
            'w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all flex-shrink-0 ' +
            (isActive
              ? 'bg-amber-500 border-amber-500 text-white shadow'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-blue-400 hover:text-blue-600')
          }
        >
          <Crosshair size={12} strokeWidth={2.2} />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          {suggestions.length > 0 ? (
            <div className="max-h-52 overflow-y-auto py-1">
              <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400">
                Результаты поиска
              </p>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); onPickPlace(s); setSuggestions([]); }}
                  className="w-full flex items-start gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={11} className="text-slate-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white leading-tight truncate">{s.shortName}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{s.type} &middot; {s.name.slice(0, 80)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400 flex items-center gap-1.5">
                <Clock3 size={10} /> Недавние
              </p>
              {recent.length === 0 ? (
                <p className="px-3.5 py-3 text-xs text-slate-500">Начните вводить адрес</p>
              ) : recent.map((r, idx) => (
                <button
                  key={idx}
                  onMouseDown={(e) => { e.preventDefault(); onPickPlace(r); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left"
                >
                  <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Clock3 size={11} className="text-blue-600" />
                  </span>
                  <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200 truncate">{r.shortName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TransitCard
// ---------------------------------------------------------------------------

function TransitCard({ option, isSelected, onSelect, vehicles }) {
  const isTransfer = option.type === 'transfer';
  const routes = isTransfer ? (option.routes || []) : [option.route];
  const boardStop = option.boardStop || null;
  const alightStop = option.alightStop || null;
  const firstRoute = routes[0] || null;
  const eta = boardStop && firstRoute ? etaToStop(vehicles, firstRoute.id, boardStop) : null;
  const totalWalk = (option.walkToBoardDistance || 0) + (option.walkFromAlightDistance || 0);

  return (
    <button
      onClick={onSelect}
      className={
        'w-full text-left rounded-2xl border-2 p-3.5 transition-all ' +
        (isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 shadow-md shadow-blue-500/10'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600')
      }
    >
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        {routes.map((r, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] font-bold text-slate-400 mx-0.5">+пересадка</span>}
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-[11px] font-extrabold"
              style={{ backgroundColor: r.color || '#1565C0' }}
            >
              {r.type === 'bus' ? <Bus size={11} /> : <Truck size={11} />}
              #{r.number}
            </span>
          </span>
        ))}
        {isSelected && <span className="ml-auto"><CheckCircle2 size={16} className="text-blue-500" /></span>}
      </div>

      <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-wrap">
        <span className="flex items-center gap-1"><Timer size={11} className="text-slate-400" />{fmtDur(option.totalDuration)}</span>
        <span className="text-slate-300 dark:text-slate-600">&middot;</span>
        <span className="flex items-center gap-1"><Route size={11} className="text-slate-400" />{fmtDist(option.totalDistance)}</span>
        {totalWalk > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">&middot;</span>
            <span className="flex items-center gap-1"><Footprints size={11} className="text-violet-500" />Пешком {fmtDist(totalWalk)}</span>
          </>
        )}
        {option.stopCount > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-600">&middot;</span>
            <span className="text-slate-500">{option.stopCount} ост.</span>
          </>
        )}
      </div>

      {boardStop && alightStop && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <CircleDot size={11} className="text-emerald-500 flex-shrink-0" />
          <span className="truncate max-w-[100px]">{boardStop.name || 'Остановка'}</span>
          <ArrowRight size={10} className="flex-shrink-0 text-slate-400" />
          <CircleDot size={11} className="text-red-500 flex-shrink-0" />
          <span className="truncate max-w-[100px]">{alightStop.name || 'Остановка'}</span>
        </div>
      )}

      {eta && (
        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
          <Radio size={10} className="text-emerald-600 animate-pulse" />
          <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
            Транспорт через ~{fmtDur(eta.sec)}
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: VehicleStatus
// ---------------------------------------------------------------------------

function VehicleStatus({ vehicles, routeId }) {
  const active = useMemo(
    () => (vehicles || []).filter((v) => v.route_id === routeId && v.is_active),
    [vehicles, routeId],
  );
  if (!vehicles?.length) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      {active.length > 0 ? (
        <>
          <Radio size={13} className="text-emerald-500 animate-pulse flex-shrink-0" />
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            {active.length} {active.length === 1 ? 'транспорт активен' : 'транспорта активны'}
          </span>
        </>
      ) : (
        <>
          <WifiOff size={13} className="text-slate-400 flex-shrink-0" />
          <span className="text-[11px] font-medium text-slate-500">Нет данных о транспорте</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SegmentSteps (transit segment detail)
// ---------------------------------------------------------------------------

function SegmentSteps({ option }) {
  if (!option?.segments?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-[11px] font-black tracking-widest uppercase text-slate-600 dark:text-slate-300">
          Детали пути
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {option.segments.map((seg, i) => {
          const isWalking = seg.type === 'walking';
          const segColor = isWalking ? '#7C3AED' : (seg.routeColor || '#1565C0');
          return (
            <div key={i} className="flex items-start gap-3 px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: segColor + '18', color: segColor }}
              >
                {isWalking ? <Footprints size={14} /> : seg.type === 'bus' ? <Bus size={14} /> : <Truck size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-800 dark:text-slate-200 leading-snug">{seg.label}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {fmtDist(seg.distance)} &middot; {fmtDur(seg.duration)}
                </p>
                {!isWalking && seg.stopCount > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {seg.stopCount} {seg.stopCount === 1 ? 'остановка' : 'остановок'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: OsrmStepsList
// ---------------------------------------------------------------------------

function OsrmStepsList({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-[11px] font-black tracking-widest uppercase text-slate-600 dark:text-slate-300">
          Пошагово
        </span>
      </div>
      <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {steps.slice(0, 30).map((step, i) => (
          <div key={i} className="flex gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <span className={
              'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 ' +
              (i === 0 ? 'bg-emerald-500 text-white' : i === steps.length - 1 ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600')
            }>
              {i === 0 ? 'A' : i === steps.length - 1 ? 'B' : i}
            </span>
            <div className="flex-1 min-w-0 py-0.5">
              <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                {step.name || (
                  step.instruction === 'depart' ? 'Начало движения'
                  : step.instruction === 'arrive' ? 'Вы прибыли'
                  : 'Движение'
                )}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{fmtDist(step.distance)} &middot; {fmtDur(step.duration)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: OsrmResultBlock
// ---------------------------------------------------------------------------

function OsrmResultBlock({ route, mode, fromText, toText, nowTime, arrivalTime, onStart, onShare, copied, navCtl, showSteps, onToggleSteps }) {
  const modeMeta = TRANSPORT_MODES.find((m) => m.id === mode);
  const estimateCost = (dist, m) => {
    const km = dist / 1000;
    if (m === 'driving') return Math.round(km * 1.8 + 8);
    if (m === 'taxi')    return Math.round(km * 5 + 25);
    return 0;
  };
  const cost = estimateCost(route.distance, mode);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Расстояние', value: fmtDist(route.distance), Icon: Route },
          { label: 'Время',      value: fmtDur(route.duration),  Icon: Clock3 },
          { label: 'Стоимость',  value: cost > 0 ? cost + ' TJS' : 'Бесплатно', Icon: Copy },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="p-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center">
            <Icon size={14} className="mx-auto mb-1 text-slate-400" />
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">{label}</p>
            <p className="text-[13px] font-black mt-0.5 text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <span className="w-0.5 flex-1 min-h-[28px] bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full" />
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-[10px] font-black tracking-widest uppercase text-emerald-600 dark:text-emerald-400">Откуда</p>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{fromText || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest uppercase text-red-500">Куда</p>
              <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{toText || '—'}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-2.5">
              <Timer size={12} className="text-slate-400" />
              <span>Выезд {nowTime}</span>
              <span className="text-slate-300 dark:text-slate-600">&rarr;</span>
              <span className="text-emerald-600 dark:text-emerald-400">Прибытие {arrivalTime}</span>
            </div>
          </div>
        </div>
      </div>

      {onStart && (
        <div className="space-y-2">
          <button
            onClick={onStart}
            className="w-full rounded-2xl text-white shadow-xl active:scale-[0.98] transition-all p-1 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/25"
          >
            <span className="flex items-center gap-3 px-4 py-3">
              <span className="w-11 h-11 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow flex-shrink-0">
                <Play size={20} className="fill-emerald-600 ml-0.5" />
              </span>
              <span className="flex-1 text-left">
                <span className="block text-[15px] font-black leading-none">Поехать</span>
                <span className="block text-[11px] font-bold opacity-90 mt-0.5">
                  {(modeMeta?.label || mode)} &middot; {fmtDur(route.duration)} &middot; {fmtDist(route.distance)}
                  {cost > 0 ? ' · ~' + cost + ' TJS' : ''}
                </span>
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navCtl?.toggleVoice?.()}
              className={
                'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-colors ' +
                (navCtl?.voiceEnabled
                  ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500')
              }
            >
              {navCtl?.voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {navCtl?.voiceEnabled ? 'Озвучка вкл' : 'Без звука'}
            </button>
            <button
              onClick={onShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
              {copied ? 'Скопировано' : 'Поделиться'}
            </button>
          </div>
        </div>
      )}

      {route.steps?.length > 0 && (
        <>
          <button
            onClick={onToggleSteps}
            className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:bg-slate-50"
          >
            <Route size={12} />
            {showSteps ? 'Скрыть шаги' : 'Показать пошаговый маршрут (' + route.steps.length + ')'}
          </button>
          {showSteps && <OsrmStepsList steps={route.steps} />}
        </>
      )}
    </div>
  );
}

export default function RoutingPanel({ onClose, onRouteBuilt, onStartNavigation, onRequestMapPick, mapPickResult, mapPickTarget, routes = [], vehicles = [] }) {
  const navigate = useNavigate();
  const navCtl = useNavigation();

  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [transportMode, setTransportMode] = useState('minibus');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [osrmRoute, setOsrmRoute] = useState(null);
  const [transitResults, setTransitResults] = useState(null);
  const [fallbackWalk, setFallbackWalk] = useState(null);
  const [selectedTransitIdx, setSelectedTransitIdx] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevRef = useRef({ from: null, to: null, mode: 'minibus' });

  // Restore saved points
  useEffect(() => {
    try {
      const sf = localStorage.getItem('karta_route_from');
      const st = localStorage.getItem('karta_route_to');
      if (sf) { const p = JSON.parse(sf); if (p?.lat) { setFrom(p); setFromText(p.shortName || ''); } }
      if (st) { const p = JSON.parse(st); if (p?.lat) { setTo(p); setToText(p.shortName || ''); } }
    } catch {}
  }, []);

  useEffect(() => {
    try { if (from) localStorage.setItem('karta_route_from', JSON.stringify(from)); else localStorage.removeItem('karta_route_from'); } catch {}
  }, [from]);
  useEffect(() => {
    try { if (to) localStorage.setItem('karta_route_to', JSON.stringify(to)); else localStorage.removeItem('karta_route_to'); } catch {}
  }, [to]);

  // Map pick result
  useEffect(() => {
    if (!mapPickResult?.target) return;
    if (mapPickResult.target === 'from') { setFrom(mapPickResult); setFromText(mapPickResult.shortName || ''); pushRecent(mapPickResult); }
    else if (mapPickResult.target === 'to') { setTo(mapPickResult); setToText(mapPickResult.shortName || ''); pushRecent(mapPickResult); }
  }, [mapPickResult]);

  // Auto-fill from with geolocation on first open
  const autoLocRef = useRef(false);
  useEffect(() => {
    if (autoLocRef.current || from || fromText) return;
    autoLocRef.current = true;
    navigator.geolocation?.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      let shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&lat=${lat}&lon=${lng}`,
          { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(4000) });
        if (r.ok) { const d = await r.json(); if (d.display_name) shortName = d.display_name.split(',').slice(0, 2).join(', '); }
      } catch {}
      const place = { lat, lng, name: shortName, shortName };
      setFrom(place); setFromText(shortName); pushRecent(place);
    }, () => {}, { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 });
  }, [from, fromText]);

  // Fill with geolocation
  const fillWithMyLocation = useCallback(async (target) => {
    if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
    const tid = toast.loading('Определяем местоположение…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      let shortName = lat.toFixed(5) + ', ' + lng.toFixed(5);
      try {
        const r = await fetch(
          'https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&lat=' + lat + '&lon=' + lng,
          { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(4000) },
        );
        if (r.ok) { const d = await r.json(); if (d.display_name) shortName = d.display_name.split(',').slice(0, 2).join(', '); }
      } catch {}
      const place = { lat, lng, name: shortName, shortName };
      if (target === 'from') { setFrom(place); setFromText(shortName); }
      else { setTo(place); setToText(shortName); }
      pushRecent(place); toast.dismiss(tid); toast.success('Местоположение установлено');
    }, (err) => {
      toast.dismiss(tid);
      toast.error(err.code === 1 ? 'Разрешите доступ к геолокации' : 'Не удалось получить местоположение');
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  }, []);

  // Build route
  const buildRoute = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true); setError(null); setOsrmRoute(null); setTransitResults(null);
    setFallbackWalk(null); setSelectedTransitIdx(0); setShowSteps(false);

    const isTransit = transportMode === 'bus' || transportMode === 'minibus';

    if (isTransit) {
      let result;
      try { result = await findTransitRoutes(from, to, routes, transportMode); }
      catch { result = { direct: [], transfers: [], best: null }; }

      if (result.best) {
        setTransitResults(result);
        const option = result.best;
        onRouteBuilt?.({
          mode: transportMode, transitOption: option, segments: option.segments,
          geometry: option.segments.flatMap((s) => s.geometry || []),
          distance: option.totalDistance, duration: option.totalDuration,
          from, to, fromText, toText, steps: [],
        });
      } else {
        const walk = await buildOsrmRoute(from, to, 'walking');
        if (walk) {
          setFallbackWalk(walk);
          toast.info('Маршрут транспортом не найден — показан пешеходный');
          onRouteBuilt?.({ ...walk, mode: 'walking', from, to, fromText, toText, segments: null });
        } else {
          setError('Маршрут не найден. Проверьте точки и попробуйте снова.');
        }
      }
    } else {
      const mode = TRANSPORT_MODES.find((m) => m.id === transportMode);
      const result = await buildOsrmRoute(from, to, mode?.osrmProfile || 'driving');
      if (result) {
        setOsrmRoute(result);
        onRouteBuilt?.({ ...result, mode: transportMode, from, to, fromText, toText, segments: null });
      } else {
        setError('Маршрут не найден. Проверьте точки или смените режим.');
      }
    }
    setLoading(false);
  }, [from, to, transportMode, routes, fromText, toText, onRouteBuilt]);

  useEffect(() => {
    const prev = prevRef.current;
    const changed = prev.from !== from || prev.to !== to || prev.mode !== transportMode;
    prevRef.current = { from, to, mode: transportMode };
    if (from && to && changed) buildRoute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, transportMode]);

  // Swap
  const handleSwap = useCallback(() => {
    setFrom(to); setTo(from); setFromText(toText); setToText(fromText);
  }, [from, to, fromText, toText]);

  // Transit option selection
  const allTransitOptions = useMemo(() => {
    if (!transitResults) return [];
    return [...(transitResults.direct || []), ...(transitResults.transfers || [])];
  }, [transitResults]);

  const selectedTransitOption = allTransitOptions[selectedTransitIdx] ?? null;

  const handleSelectTransit = useCallback((idx) => {
    setSelectedTransitIdx(idx);
    const option = allTransitOptions[idx];
    if (!option) return;
    onRouteBuilt?.({
      mode: transportMode, transitOption: option, segments: option.segments,
      geometry: option.segments.flatMap((s) => s.geometry || []),
      distance: option.totalDistance, duration: option.totalDuration,
      from, to, fromText, toText, steps: [],
    });
  }, [allTransitOptions, from, to, fromText, toText, transportMode, onRouteBuilt]);

  // Navigation launch
  const handleStartNavigation = useCallback(() => {
    const isTransit = transportMode === 'bus' || transportMode === 'minibus';
    if (isTransit && selectedTransitOption) {
      const opt = selectedTransitOption;
      const navRoute = {
        mode: transportMode, transitOption: opt, segments: opt.segments,
        geometry: opt.segments.flatMap((s) => s.geometry || []),
        distance: opt.totalDistance, duration: opt.totalDuration, steps: [],
        from: { lat: from.lat, lng: from.lng, shortName: fromText },
        to:   { lat: to.lat,   lng: to.lng,   shortName: toText },
      };
      if (onStartNavigation) onStartNavigation(navRoute);
      else navCtl?.startNavigation?.(navRoute);
      onClose?.(); return;
    }
    const routeSource = isTransit ? fallbackWalk : osrmRoute;
    if (!routeSource) return;
    const navRoute = {
      ...routeSource,
      mode: isTransit ? 'walking' : transportMode,
      from: { lat: from.lat, lng: from.lng, shortName: fromText },
      to:   { lat: to.lat,   lng: to.lng,   shortName: toText },
    };
    if (onStartNavigation) onStartNavigation(navRoute);
    else navCtl?.startNavigation?.(navRoute);
    onClose?.();
  }, [transportMode, selectedTransitOption, osrmRoute, fallbackWalk, from, to, fromText, toText, onStartNavigation, navCtl, onClose]);

  // Share
  const handleShare = useCallback(async () => {
    if (!from || !to) return;
    const url = window.location.origin + window.location.pathname + '#route=' + encodeURIComponent(JSON.stringify({
      from: { lat: from.lat, lng: from.lng, name: fromText },
      to:   { lat: to.lat,   lng: to.lng,   name: toText },
    }));
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Ссылка скопирована'); setTimeout(() => setCopied(false), 2500); }
    catch { toast.info(url); }
  }, [from, to, fromText, toText]);

  // Derived
  const isTransit = transportMode === 'bus' || transportMode === 'minibus';
  const hasResult = !!osrmRoute || (transitResults && allTransitOptions.length > 0) || !!fallbackWalk;
  const boardStopForEta = selectedTransitOption?.boardStop ?? null;
  const etaInfo = boardStopForEta && selectedTransitOption?.route
    ? etaToStop(vehicles, selectedTransitOption.route.id, boardStopForEta) : null;
  const dur = selectedTransitOption?.totalDuration || osrmRoute?.duration || fallbackWalk?.duration || 0;
  const arrivalTime = new Date(Date.now() + dur * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const picking = !!mapPickTarget;

  // Minimized button
  if (minimized && hasResult) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-[88px] right-4 md:absolute md:bottom-auto md:top-[140px] md:right-4 z-[520] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-95 transition-all"
        title="Развернуть маршрут"
      >
        <Navigation size={22} />
      </button>
    );
  }

  if (picking) return null;

  return (
    <div
      className="absolute left-2 right-2 md:left-auto md:right-3 z-[520] bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden bottom-[calc(64px+env(safe-area-inset-bottom,0px)+8px)] max-h-[calc(100dvh-64px-env(safe-area-inset-bottom,0px)-1rem-8px)] md:bottom-auto md:top-[136px] md:max-h-[calc(100dvh-160px)] md:w-[400px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-blue-600/[0.06] to-transparent flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Navigation size={14} className="text-white" />
          </span>
          <div>
            <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
              Найти маршрут
            </h2>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedTransitOption
                ? fmtDist(selectedTransitOption.totalDistance) + ' · ' + fmtDur(selectedTransitOption.totalDuration)
                : osrmRoute
                ? fmtDist(osrmRoute.distance) + ' · ' + fmtDur(osrmRoute.duration)
                : 'Постройте маршрут'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasResult && (
            <button onClick={() => setMinimized(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="Свернуть">
              <ChevronDown size={16} />
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">

        {/* From / To */}
        <div className="relative">
          <div className="absolute left-[19px] top-[22px] bottom-[22px] w-0.5 bg-gradient-to-b from-emerald-500 via-slate-300 to-red-500 dark:via-slate-600 rounded-full opacity-50 pointer-events-none" />
          <button
            onClick={handleSwap}
            className="absolute left-[6px] top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow flex items-center justify-center hover:border-blue-400 hover:text-blue-600 active:scale-90 transition-all"
            title="Поменять местами"
          >
            <ArrowLeftRight size={12} className="text-slate-500 rotate-90" />
          </button>
          <div className="space-y-2.5">
            <PlaceField
              value={fromText}
              onChangeText={(v) => { setFromText(v); if (!v) setFrom(null); }}
              onPickPlace={(p) => { setFrom(p); setFromText(p.shortName); pushRecent(p); }}
              placeholder="Откуда — адрес или точка"
              iconColor="#22c55e"
              isActive={mapPickTarget === 'from'}
              onRequestMapPick={() => onRequestMapPick?.('from')}
              autoFocus={!from && !to}
            />
            <PlaceField
              value={toText}
              onChangeText={(v) => { setToText(v); if (!v) setTo(null); }}
              onPickPlace={(p) => { setTo(p); setToText(p.shortName); pushRecent(p); }}
              placeholder="Куда — цель маршрута"
              iconColor="#ef4444"
              isActive={mapPickTarget === 'to'}
              onRequestMapPick={() => onRequestMapPick?.('to')}
            />
          </div>
        </div>

        {/* Quick location */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => fillWithMyLocation('from')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all"
          >
            <LocateFixed size={12} /> Моё место → Откуда
          </button>
          <button
            onClick={() => fillWithMyLocation('to')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <LocateFixed size={12} /> Моё место → Куда
          </button>
          {(from || to) && (
            <button
              onClick={() => { setFrom(null); setTo(null); setFromText(''); setToText(''); setOsrmRoute(null); setTransitResults(null); setFallbackWalk(null); setError(null); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500 hover:text-slate-700"
            >
              <RotateCw size={11} /> Сбросить
            </button>
          )}
        </div>

        {/* Transport modes */}
        <div>
          <p className="text-[10px] font-black tracking-widest uppercase text-slate-400 mb-2 flex items-center gap-1.5">
            <Route size={11} /> Чем едем
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {TRANSPORT_MODES.map((mode) => {
              const active = transportMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setTransportMode(mode.id)}
                  className={
                    'flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border-2 transition-all ' +
                    (active
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:text-slate-900 dark:border-white shadow-lg'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300')
                  }
                >
                  <Icon size={15} />
                  <span className="text-[10px] font-bold mt-1 leading-none">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Map pick banner */}
        {mapPickTarget && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
              <Crosshair size={14} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-amber-900 dark:text-amber-300">Выберите точку на карте</p>
              <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70">Переместите карту и нажмите ✓</p>
            </div>
            <button onClick={() => onRequestMapPick?.(null)} className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2.5 py-10">
            <Loader2 size={30} className="animate-spin text-blue-500" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isTransit ? 'Ищем транспорт…' : 'Строим маршрут…'}
            </p>
            <p className="text-[11px] text-slate-400">Это займёт несколько секунд</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex gap-3 p-3.5 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-200 dark:border-red-500/20">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-red-700 dark:text-red-400">{error}</p>
              <p className="text-[11px] text-red-600/70 dark:text-red-400/70 mt-1">Попробуйте изменить точки или другой режим.</p>
            </div>
          </div>
        )}

        {/* Transit results */}
        {!loading && isTransit && transitResults && allTransitOptions.length > 0 && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">
                Найдено {allTransitOptions.length} {allTransitOptions.length === 1 ? 'вариант' : 'варианта'}
              </span>
              <button onClick={handleShare} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Share2 size={12} />}
                {copied ? 'Скопировано' : 'Поделиться'}
              </button>
            </div>

            <div className="space-y-2">
              {allTransitOptions.map((opt, idx) => (
                <TransitCard
                  key={idx}
                  option={opt}
                  isSelected={selectedTransitIdx === idx}
                  onSelect={() => handleSelectTransit(idx)}
                  vehicles={vehicles}
                />
              ))}
            </div>

            {selectedTransitOption?.route && (
              <VehicleStatus vehicles={vehicles} routeId={selectedTransitOption.route.id} />
            )}

            {etaInfo && (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                  <Bus size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black text-emerald-800 dark:text-emerald-300">
                    Транспорт прибудет через ~{fmtDur(etaInfo.sec)}
                  </p>
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5 truncate">
                    На остановку «{boardStopForEta?.name || 'Остановка'}»
                  </p>
                </div>
                <span className="text-[13px] font-black text-emerald-700 dark:text-emerald-300 flex-shrink-0">
                  {new Date(Date.now() + etaInfo.sec * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {selectedTransitOption && <SegmentSteps option={selectedTransitOption} />}

            {selectedTransitOption && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <Timer size={12} className="text-slate-400" />
                  <span>Выезд {nowTime}</span>
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Прибытие {arrivalTime}</span>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Fallback walking */}
        {!loading && isTransit && fallbackWalk && !transitResults && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                Маршрут транспортом не найден — показан пешеходный
              </p>
            </div>
            <OsrmResultBlock
              route={fallbackWalk}
              mode="walking"
              fromText={fromText}
              toText={toText}
              nowTime={nowTime}
              arrivalTime={arrivalTime}
              onStart={handleStartNavigation}
              onShare={handleShare}
              copied={copied}
              navCtl={navCtl}
              showSteps={showSteps}
              onToggleSteps={() => setShowSteps((s) => !s)}
            />
          </div>
        )}

        {/* OSRM result */}
        {!loading && !isTransit && osrmRoute && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            {transportMode === 'taxi' && from && to && (
              <button
                onClick={() => {
                  navigate('/taxi', {
                    state: { trip: { from: { name: fromText, lat: from.lat, lng: from.lng }, to: { name: toText, lat: to.lat, lng: to.lng } } },
                  });
                  onClose?.();
                }}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                🚕 Заказать такси · {fmtDur(osrmRoute.duration)} · {fmtDist(osrmRoute.distance)}
              </button>
            )}
            <OsrmResultBlock
              route={osrmRoute}
              mode={transportMode}
              fromText={fromText}
              toText={toText}
              nowTime={nowTime}
              arrivalTime={arrivalTime}
              onStart={transportMode !== 'taxi' ? handleStartNavigation : undefined}
              onShare={handleShare}
              copied={copied}
              navCtl={navCtl}
              showSteps={showSteps}
              onToggleSteps={() => setShowSteps((s) => !s)}
            />
          </div>
        )}
      </div>

      {/* Sticky footer — кнопка «Поехать» всегда видна */}
      {!loading && hasResult && (
        <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <button
            onClick={handleStartNavigation}
            className="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
          >
            <Play size={16} className="fill-white" />
            {isTransit && selectedTransitOption
              ? `Поехать · ${fmtDur(selectedTransitOption.totalDuration)} · ${fmtDist(selectedTransitOption.totalDistance)}`
              : osrmRoute
              ? `${TRANSPORT_MODES.find(m => m.id === transportMode)?.label || 'Поехать'} · ${fmtDur(osrmRoute.duration)} · ${fmtDist(osrmRoute.distance)}`
              : fallbackWalk
              ? `Пешком · ${fmtDur(fallbackWalk.duration)} · ${fmtDist(fallbackWalk.distance)}`
              : 'Поехать'
            }
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navCtl?.toggleVoice?.()}
              className={
                'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-colors ' +
                (navCtl?.voiceEnabled
                  ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500')
              }
            >
              {navCtl?.voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {navCtl?.voiceEnabled ? 'Озвучка вкл' : 'Без звука'}
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Share2 size={13} />}
              Поделиться
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
