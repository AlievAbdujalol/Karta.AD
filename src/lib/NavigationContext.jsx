import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

const NavigationContext = createContext(null);

export function useNavigation() {
  return useContext(NavigationContext);
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
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      u.rate = 1.1;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  const getManeuverText = useCallback((instruction, modifier, distance) => {
    const dir = {
      left: 'налево', right: 'направо', 'sharp left': 'резко налево',
      'sharp right': 'резко направо', 'slight left': 'слегка налево',
      'slight right': 'слегка направо', straight: 'прямо',
      uturn: 'развернитесь',
    }[modifier] || '';
    const action = {
      depart: 'Начните движение',
      arrive: 'Вы прибыли',
      turn: `Поверните ${dir}`,
      'new name': `Продолжайте ${dir || 'прямо'}`,
      merge: `Продолжайте ${dir || 'прямо'}`,
      'end of road': `В конце дороги поверните ${dir}`,
      roundabout: `На круговом перекрёстке выезд ${dir}`,
      continue: 'Продолжайте движение прямо',
    }[instruction] || `Двигайтесь ${dir || 'прямо'}`;
    if (distance > 50 && instruction !== 'depart' && instruction !== 'arrive') {
      return `Через ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} км` : `${Math.round(distance)} м`} ${action.toLowerCase()}`;
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
      const loc = Array.isArray(s.start) ? s.start : [0, 0];
      const d = Math.hypot(lat - loc[1], lng - loc[0]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx < steps.length - 1) {
      const next = steps[bestIdx + 1];
      const nloc = Array.isArray(next.start) ? next.start : [0, 0];
      if (Math.hypot(lat - nloc[1], lng - nloc[0]) < bestDist) bestIdx++;
    }
    return bestIdx;
  }, []);

  const processPosition = useCallback((lat, lng, heading, speed) => {
    setUserPosition([lat, lng]);
    setUserHeading(heading || 0);
    setUserSpeed(speed || 0);

    if (isPausedRef.current) return;

    const last = positionsRef.current[positionsRef.current.length - 1];
    if (last) {
      traveledRef.current += Math.hypot(lat - last.lat, lng - last.lng) * 111320;
      setTraveledDistance(traveledRef.current);
    }
    positionsRef.current.push({ lat, lng });
    if (positionsRef.current.length > 200) positionsRef.current = positionsRef.current.slice(-100);

    const route = routeRef.current;
    if (!route || !route.steps || route.steps.length === 0) return;

    const steps = route.steps;
    const stepIdx = findClosestStep(lat, lng, steps);
    stepIndexRef.current = stepIdx;

    const step = steps[stepIdx];
    const loc = Array.isArray(step.start) ? step.start : [0, 0];
    const distToStep = Math.hypot(lat - loc[1], lng - loc[0]) * 111320;

    setNextInstruction({
      text: getManeuverText(step.instruction, step.modifier, step.distance),
      streetName: step.name || '',
      distance: distToStep,
      instruction: step.instruction,
      modifier: step.modifier,
    });

    const now = Date.now();
    if (distToStep < 25 && step.instruction !== 'arrive' && now - lastAnnounceRef.current > 8000) {
      speak(getManeuverText(step.instruction, step.modifier, step.distance));
      lastAnnounceRef.current = now;
    }
    if (step.instruction === 'arrive' && distToStep < 30 && now - lastAnnounceRef.current > 8000) {
      speak('Вы прибыли в пункт назначения');
      lastAnnounceRef.current = now;
    }

    let totalRemaining = 0;
    for (let i = stepIdx; i < steps.length; i++) {
      totalRemaining += steps[i].distance || 0;
    }
    setRemainingDistance(totalRemaining);

    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    const avgSpd = traveledRef.current > 0 ? traveledRef.current / elapsed : 0;
    const etaSec = avgSpd > 0 ? totalRemaining / avgSpd : 0;
    setEta(new Date(Date.now() + etaSec * 1000));
    setRemainingDuration(Math.round(etaSec));
    setTripStats({ distance: traveledRef.current, duration: elapsed, avgSpeed: avgSpd * 3.6 });
  }, [findClosestStep, getManeuverText, speak]);

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
    speak('Начинаем навигацию');
  }, [startGps, resetNavState, speak]);

  const stopNavigation = useCallback(() => {
    clearGps();
    try { window.speechSynthesis.cancel(); } catch {}
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

  const reroute = useCallback(async (from, to, profile = 'driving') => {
    if (!from || !to) return null;
    const rd = routeRef.current;
    try {
      const wps = (rd?.waypoints || []).filter(Boolean);
      const coords = [from, ...wps, to].map(p => `${p.lng},${p.lat}`).join(';');
      const resp = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.routes?.length) return null;
      const r = data.routes[0];
      const steps = [];
      if (r.legs) r.legs.forEach(leg => {
        if (leg.steps) leg.steps.forEach(step => steps.push({
          instruction: step.maneuver?.type || '',
          modifier: step.maneuver?.modifier || '',
          name: step.name || '',
          distance: step.distance || 0,
          duration: step.duration || 0,
          start: step.maneuver?.location || [0, 0],
        }));
      });
      const newRoute = {
        distance: r.distance, duration: r.duration,
        geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
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
    return () => { clearGps(); try { window.speechSynthesis.cancel(); } catch {} };
  }, [clearGps]);

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
