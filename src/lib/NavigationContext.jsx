import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

const NavigationContext = createContext(null);

export function useNavigation() {
  return useContext(NavigationContext);
}

// манёвры, о которых стоит говорить голосом (о «прямо» молчим, чтобы не спамить)
const ANNOUNCEABLE = new Set(['turn', 'roundabout', 'rotary', 'uturn', 'merge', 'end of road', 'depart', 'arrive', 'exit', 'fork', 'off ramp', 'on ramp']);

// язык озвучки из настроек («Навигатор» → Голоса)
function getNavLang() {
  try {
    const l = JSON.parse(localStorage.getItem('karta_nav_settings') || '{}')?.voice_language;
    return l === 'tg' || l === 'en' ? l : 'ru';
  } catch { return 'ru'; }
}

// фразы манёвров на трёх языках
const DIR_WORD = {
  ru: { left: 'налево', right: 'направо', 'sharp left': 'резко налево', 'sharp right': 'резко направо', 'slight left': 'слегка налево', 'slight right': 'слегка направо', straight: 'прямо', uturn: 'развернитесь' },
  tg: { left: 'ба чап', right: 'ба рост', 'sharp left': 'тез ба чап', 'sharp right': 'тез ба рост', 'slight left': 'каме ба чап', 'slight right': 'каме ба рост', straight: 'рост', uturn: 'бозгаштед' },
  en: { left: 'left', right: 'right', 'sharp left': 'sharp left', 'sharp right': 'sharp right', 'slight left': 'slight left', 'slight right': 'slight right', straight: 'straight ahead', uturn: 'make a U-turn' },
};
const PHRASE = {
  ru: {
    depart: 'Начните движение', arrive: 'Вы прибыли',
    turn: d => `Поверните ${d}`, newName: d => `Продолжайте ${d || 'прямо'}`, merge: d => `Продолжайте ${d || 'прямо'}`,
    endOfRoad: d => `В конце дороги поверните ${d}`, roundabout: () => 'На круговом перекрёстке продолжайте движение',
    continue: 'Продолжайте движение прямо', fallback: d => `Двигайтесь ${d || 'прямо'}`,
    via: (dist, action) => `Через ${dist} ${action.toLowerCase()}`, arrived: 'Вы прибыли в пункт назначения',
    m: 'м', km: 'км',
  },
  tg: {
    depart: 'Ҳаракатро оғоз кунед', arrive: 'Шумо расидед',
    turn: k => `${{ left: 'Ба чап', right: 'Ба рост', 'sharp left': 'Тез ба чап', 'sharp right': 'Тез ба рост', 'slight left': 'Каме ба чап', 'slight right': 'Каме ба рост' }[k] || 'Рост'} гардед`,
    newName: () => 'Ҳаракатро давом диҳед', merge: () => 'Ҳаракатро давом диҳед',
    endOfRoad: d => `Дар охири роҳ ${d} гардед`, roundabout: () => 'Аз чорроҳаи даврӣ гузаред',
    continue: 'Рост равед', fallback: () => 'Рост равед',
    via: (dist, action) => `Баъди ${dist} ${action.toLowerCase()}`, arrived: 'Шумо ба манзили таъинот расидед',
    m: 'метр', km: 'км',
  },
  en: {
    depart: 'Start driving', arrive: 'You have arrived',
    turn: d => `Turn ${d}`, newName: () => 'Continue', merge: () => 'Continue',
    endOfRoad: d => `At the end of the road, turn ${d}`, roundabout: () => 'At the roundabout, continue',
    continue: 'Continue straight ahead', fallback: d => `Go ${d || 'straight ahead'}`,
    via: (dist, action) => `In ${dist}, ${action.toLowerCase()}`, arrived: 'You have arrived at your destination',
    m: 'meters', km: 'kilometers',
  },
};

function bearing(fromLat, fromLng, toLat, toLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x = Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function NavigationProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [userHeading, setUserHeading] = useState(0);
  const [userSpeed, setUserSpeed] = useState(0);
  const [nextInstruction, setNextInstruction] = useState(null);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingDuration, setRemainingDuration] = useState(0);
  const [eta, setEta] = useState(null);
  const [traveledDistance, setTraveledDistance] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [followUser, setFollowUser] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [tripStats, setTripStats] = useState({ distance: 0, duration: 0, avgSpeed: 0 });

  const watchIdRef = useRef(null);
  const lastAnnounceRef = useRef(0);
  const annKeyRef = useRef({ idx: -1, pre: false, final: false });
  const routeRef = useRef(null);
  const stepIndexRef = useRef(0);
  const traveledRef = useRef(0);
  const startTimeRef = useRef(null);
  const positionsRef = useRef([]);
  const isPausedRef = useRef(false);
  const voiceEnabledRef = useRef(false);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  const clearGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const speak = useCallback((text) => {
    if (!voiceEnabledRef.current || !text) return;
    // настройки из «Навигатор» (голоса): выкл/громкость/язык — читаем живьём, чтобы тумблер сразу работал
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('karta_nav_settings') || '{}'); } catch {}
    if (cfg.voice_enabled === false) return;
    const langMap = { ru: 'ru-RU', tg: 'tg-TJ', en: 'en-US' };
    const wantLang = langMap[cfg.voice_language] || 'ru-RU';
    const wantUri = cfg.voice_uri || null;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = wantLang;
      u.rate = 1.1;
      u.pitch = 1;
      if (typeof cfg.voice_volume === 'number') u.volume = Math.max(0, Math.min(1, cfg.voice_volume));
      // голос: сначала выбранный вручную, потом под язык настроек, потом любой русский
      try {
        const vs = synth.getVoices?.() || [];
        const prefix = wantLang.split('-')[0].toLowerCase();
        const match = (wantUri && vs.find(v => v.voiceURI === wantUri))
          || vs.find(v => (v.lang || '').toLowerCase().startsWith(prefix))
          || vs.find(v => (v.lang || '').toLowerCase().startsWith('ru'))
          || vs[0];
        if (match) { u.voice = match; u.lang = match.lang; }
      } catch {}
      synth.speak(u);
    } catch {}
  }, []);

  const getManeuverText = useCallback((instruction, modifier, distance, lang) => {
    const L = PHRASE[lang] || PHRASE.ru;
    const D = DIR_WORD[lang] || DIR_WORD.ru;
    const dir = D[modifier] || '';
    const action = {
      depart: L.depart,
      arrive: L.arrive,
      turn: L.turn(modifier),
      'new name': L.newName(dir),
      merge: L.merge(dir),
      'end of road': L.endOfRoad(dir),
      roundabout: L.roundabout(dir),
      rotary: L.roundabout(dir),
      continue: L.continue,
    }[instruction] || L.fallback(dir);
    if (distance > 50 && instruction !== 'depart' && instruction !== 'arrive') {
      const distStr = distance >= 1000 ? `${(distance / 1000).toFixed(1)} ${L.km}` : `${Math.round(distance)} ${L.m}`;
      return L.via(distStr, action);
    }
    return action;
  }, []);

  const findClosestStep = useCallback((lat, lng, steps) => {
    if (!steps || steps.length === 0) return 0;
    let bestIdx = stepIndexRef.current;
    let bestDist = Infinity;
    const start = Math.max(stepIndexRef.current - 1, 0);
    for (let i = start; i < steps.length; i++) {
      const s = steps[i];
      const loc = s.start || [0, 0];
      if (!loc[0] && !loc[1]) continue;
      const d = Math.hypot(lat - loc[0], lng - loc[1]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  }, []);

  const ensureStepStarts = useCallback((steps) => {
    if (!steps || steps.length === 0) return steps;
    let last = null;
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].start || (steps[i].start[0] === 0 && steps[i].start[1] === 0)) {
        steps[i].start = last ? [...last] : [0, 0];
      }
      last = steps[i].start;
    }
    return steps;
  }, []);

  const processPosition = useCallback((lat, lng, heading, speed) => {
    // GPS smoothing: moving average last 3
    const hist = positionsRef.current.slice(-2);
    if (hist.length >= 2) {
      const avgLat = (hist[0].lat + hist[1].lat + lat) / 3;
      const avgLng = (hist[0].lng + hist[1].lng + lng) / 3;
      if (Math.hypot(avgLat - lat, avgLng - lng) * 111320 < 40) { lat = avgLat; lng = avgLng; }
    }
    // jump filter >150m in <2s
    const last = positionsRef.current[positionsRef.current.length - 1];
    if (last) {
      const jump = Math.hypot(lat - last.lat, lng - last.lng) * 111320;
      if (jump > 150) return;
    }
    setUserPosition([lat, lng]);

    const lastPos = positionsRef.current[positionsRef.current.length - 1];
    let effectiveHeading = heading;
    if (!effectiveHeading && lastPos) {
      const moved = Math.hypot(lat - lastPos.lat, lng - lastPos.lng) * 111320;
      if (moved > 1) {
        effectiveHeading = bearing(lastPos.lat, lastPos.lng, lat, lng);
      }
    }
    setUserHeading(effectiveHeading || 0);
    setUserSpeed(speed || 0);

    if (isPausedRef.current) return;

    if (lastPos) {
      traveledRef.current += Math.hypot(lat - lastPos.lat, lng - lastPos.lng) * 111320;
      setTraveledDistance(traveledRef.current);
    }
    positionsRef.current.push({ lat, lng });
    if (positionsRef.current.length > 200) positionsRef.current = positionsRef.current.slice(-100);

    const route = routeRef.current;
    if (!route || !route.steps || route.steps.length === 0) return;

    const steps = ensureStepStarts(route.steps);
    const stepIdx = findClosestStep(lat, lng, steps);
    stepIndexRef.current = stepIdx;

    const step = steps[stepIdx];
    const nextStep = steps[stepIdx + 1];
    const loc = step.start || [0, 0];
    const distToStep = Math.hypot(lat - loc[0], lng - loc[1]) * 111320;
    // авто-масштаб: приблизить перед поворотом
    try {
      const autoScale = JSON.parse(localStorage.getItem('karta_nav_settings')||'{}')?.auto_scale !== false;
      if (autoScale && nextStep && step.distance < 120) {
        window.dispatchEvent(new CustomEvent('karta_autoscale', { detail: nextStep.distance < 80 ? 18 : 16 }));
      }
    } catch {}

    const navLang = getNavLang();
    const arrivedText = (PHRASE[navLang] || PHRASE.ru).arrived;
    setNextInstruction({
      text: getManeuverText(step.instruction, step.modifier, step.distance, navLang),
      streetName: step.name || '',
      distance: distToStep,
      instruction: step.instruction,
      modifier: step.modifier,
    });

    // двухэтапные подсказки: за ~200 м предупреждаем, у поворота — командуем. По разу на шаг.
    const now = Date.now();
    if (annKeyRef.current.idx !== stepIdx) annKeyRef.current = { idx: stepIdx, pre: false, final: false };
    const ann = annKeyRef.current;
    if (ANNOUNCEABLE.has(step.instruction) && !ann.pre && distToStep < 200 && distToStep >= 25 && now - lastAnnounceRef.current > 8000) {
      speak(getManeuverText(step.instruction, step.modifier, Math.round(distToStep), navLang));
      ann.pre = true;
      lastAnnounceRef.current = now;
    }
    if (ANNOUNCEABLE.has(step.instruction) && !ann.final && distToStep < 25 && now - lastAnnounceRef.current > 8000) {
      speak(step.instruction === 'arrive'
        ? arrivedText
        : getManeuverText(step.instruction, step.modifier, 0, navLang));
      ann.final = true;
      lastAnnounceRef.current = now;
    }

    // осталось до конца маршрута (сумма оставшихся шагов)
    let totalRemaining = 0;
    for (let i = stepIdx; i < steps.length; i++) {
      totalRemaining += steps[i].distance || 0;
    }
    setRemainingDistance(totalRemaining);

    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    const avgSpd = traveledRef.current > 0 && elapsed > 15 ? traveledRef.current / elapsed : 0;
    // ETA: пока мало проехали (<100м) или скорость нестабильна — используем OSRM duration пропорционально
    let etaSec = 0;
    if (route && route.duration && route.distance) {
      const progress = Math.max(0, Math.min(1, 1 - totalRemaining / route.distance));
      const osrmRemaining = route.duration * (1 - progress);
      if (traveledRef.current < 100 || avgSpd < 1.2) etaSec = osrmRemaining;
      else etaSec = totalRemaining / avgSpd;
    } else if (avgSpd > 0) etaSec = totalRemaining / avgSpd;
    // защита от 3524 мин бага — не показываем > 12ч
    if (etaSec > 43200) etaSec = route?.duration || 0;
    setEta(new Date(Date.now() + etaSec * 1000));
    setRemainingDuration(Math.round(etaSec));
    setTripStats({ distance: traveledRef.current, duration: elapsed, avgSpeed: avgSpd * 3.6 });
  }, [findClosestStep, ensureStepStarts, getManeuverText, speak]);

  const processPositionRef = useRef(processPosition);
  useEffect(() => { processPositionRef.current = processPosition; }, [processPosition]);

  const startGps = useCallback(() => {
    clearGps();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        processPositionRef.current(latitude, longitude, heading, speed || 0);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [clearGps]);

  const resetNavState = useCallback(() => {
    setStartTime(Date.now());
    startTimeRef.current = Date.now();
    traveledRef.current = 0;
    setTraveledDistance(0);
    stepIndexRef.current = 0;
    annKeyRef.current = { idx: -1, pre: false, final: false };
    positionsRef.current = [];
    lastAnnounceRef.current = 0;
    setTripStats({ distance: 0, duration: 0, avgSpeed: 0 });
    setShowSummary(false);
    setSummaryData(null);
    setFollowUser(true);
    setNextInstruction(null);
    setRemainingDistance(0);
    setRemainingDuration(0);
    setEta(null);
  }, []);

  const startNavigationWithFromTo = useCallback((route, from, to) => {
    const enriched = { ...route, from, to };
    routeRef.current = enriched;
    setRouteData(enriched);
    setIsActive(true);
    setIsPaused(false);
    isPausedRef.current = false;
    resetNavState();
    startGps();
    // сохраняем С обогащением — иначе после перезагрузки ОТ/ДО пропадают с карты
    try { localStorage.setItem('karta_nav_active', JSON.stringify(enriched)); } catch {}
    speak('Начинаем навигацию');
  }, [startGps, resetNavState, speak]);

  const startNavigation = useCallback((route) => {
    routeRef.current = route;
    setRouteData(route);
    setIsActive(true);
    setIsPaused(false);
    isPausedRef.current = false;
    resetNavState();
    startGps();
    try { localStorage.setItem('karta_nav_active', JSON.stringify(route)); } catch {}
    speak('Начинаем навигацию');
  }, [startGps, resetNavState, speak]);

  const stopNavigation = useCallback(() => {
    clearGps();
    try { window.speechSynthesis.cancel(); } catch {}
    try { localStorage.removeItem('karta_nav_active'); } catch {}
    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    const dist = traveledRef.current;
    const avgSpd = elapsed > 0 ? (dist / elapsed) * 3.6 : 0;
    const rd = routeRef.current;
    const endMode = rd?.mode;
    let cost = 0;
    if (endMode === 'taxi') cost = Math.round((dist / 1000) * 2 + 15);
    else if (endMode === 'driving') cost = Math.round((dist / 1000) * 1.5 + 10);
    else if (endMode === 'bus' || endMode === 'minibus') cost = 3;

    setSummaryData({
      duration: elapsed, distance: dist, avgSpeed: avgSpd, cost, mode: endMode,
      fromName: rd?.from?.shortName || rd?.from?.name || '',
      toName: rd?.to?.shortName || rd?.to?.name || '',
    });
    setShowSummary(true);
    setIsActive(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setNextInstruction(null);
    setFollowUser(true);
    speak('Вы прибыли');
  }, [clearGps, speak]);

  const togglePause = useCallback(() => {
    setIsPaused(p => { isPausedRef.current = !p; return !p; });
  }, []);

  const toggleVoice = useCallback(() => setVoiceEnabled(v => !v), []);
  const toggleFollow = useCallback(() => setFollowUser(f => !f), []);

  const OSRM_ENDPOINTS = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
};

const reroute = useCallback(async (from, to, profile = 'driving') => {
    if (!from || !to) return null;
    const rd = routeRef.current;
    try {
      const wps = (rd?.waypoints || []).filter(Boolean);
      const coords = [from, ...wps, to].map(p => `${p.lng},${p.lat}`).join(';');
      const endpoint = OSRM_ENDPOINTS[profile] || OSRM_ENDPOINTS.driving;
      const resp = await fetch(
        `${endpoint}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.routes?.length) return null;
      const r = data.routes[0];
      const geom = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const steps = [];
      let cursor = 0;
      if (r.legs) r.legs.forEach(leg => {
        if (leg.steps) leg.steps.forEach(step => {
          const start = geom[cursor] || [0, 0];
          cursor = Math.min(cursor + 1, geom.length - 1);
          steps.push({
            instruction: step.maneuver?.type || '',
            modifier: step.maneuver?.modifier || '',
            name: step.name || '',
            distance: step.distance || 0,
            duration: step.duration || 0,
            start,
          });
        });
      });
      const newRoute = {
        distance: r.distance, duration: r.duration,
        geometry: geom,
        steps, mode: rd?.mode || profile,
      };
      routeRef.current = newRoute;
      setRouteData(newRoute);
      stepIndexRef.current = 0;
      speak('Маршрут обновлён');
      return newRoute;
    } catch { return null; }
  }, [speak]);

  const closeSummary = useCallback(() => {
    setShowSummary(false);
    setSummaryData(null);
    setRouteData(null);
    routeRef.current = null;
    setNextInstruction(null);
    setUserPosition(null);
  }, []);

  useEffect(() => {
    try { const saved = localStorage.getItem('karta_nav_active'); if (saved) { const r = JSON.parse(saved); if (r?.geometry) { routeRef.current = r; setRouteData(r); setIsActive(true); startGps(); } } } catch {}
    return () => { clearGps(); try { window.speechSynthesis.cancel(); } catch {} };
  }, [clearGps, startGps]);

  const value = useMemo(() => ({
    isActive, isPaused,
    routeData, userPosition, userHeading, userSpeed,
    nextInstruction, remainingDistance, remainingDuration, eta, traveledDistance,
    startTime, voiceEnabled, followUser,
    showSummary, summaryData, tripStats,
    startNavigation, startNavigationWithFromTo, stopNavigation,
    togglePause, toggleVoice, toggleFollow,
    reroute, closeSummary,
    setUserPosition, setUserHeading, setUserSpeed, setFollowUser,
  }), [
    isActive, isPaused,
    routeData, userPosition, userHeading, userSpeed,
    nextInstruction, remainingDistance, remainingDuration, eta, traveledDistance,
    startTime, voiceEnabled, followUser,
    showSummary, summaryData, tripStats,
    startNavigation, startNavigationWithFromTo, stopNavigation,
    togglePause, toggleVoice, toggleFollow,
    reroute, closeSummary,
  ]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
