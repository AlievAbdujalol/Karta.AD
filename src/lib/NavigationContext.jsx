import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { projectOnPolyline, haversineM } from '@/lib/geo';
import { parseOsrmRoute } from '@/lib/osrmClient';
import {
  ARRIVAL_THRESHOLD_M,
  OFF_ROUTE_THRESHOLD_M,
  initialArrivalState,
  nextArrivalState,
  computeRemainingM,
  computeEtaSec,
  routeLengthM,
  computeStepsArcM,
  pickNextStep,
} from '@/lib/navigationLogic';
import { toast } from 'sonner';

const NavigationContext = createContext(null);

export function useNavigation() {
  return useContext(NavigationContext);
}

const ANNOUNCEABLE = new Set(['turn', 'roundabout', 'rotary', 'uturn', 'merge', 'end of road', 'depart', 'arrive', 'exit', 'fork', 'off ramp', 'on ramp']);

const REROUTING_COOLDOWN_MS = 15000;

function getNavLang() {
  try {
    const l = JSON.parse(localStorage.getItem('karta_nav_settings') || '{}')?.voice_language;
    return l === 'tg' || l === 'en' ? l : 'ru';
  } catch { return 'ru'; }
}

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
    dest: 'пункт назначения',
    m: 'м', km: 'км',
  },
  tg: {
    depart: 'Ҳаракатро оғоз кунед', arrive: 'Шумо расидед',
    turn: k => `${{ left: 'Ба чап', right: 'Ба рост', 'sharp left': 'Тез ба чап', 'sharp right': 'Тез ба рост', 'slight left': 'Каме ба чап', 'slight right': 'Каме ба рост' }[k] || 'Рост'} гардед`,
    newName: () => 'Ҳаракатро давом диҳед', merge: () => 'Ҳаракатро давом диҳед',
    endOfRoad: d => `Дар охири роҳ ${d} гардед`, roundabout: () => 'Аз чорроҳаи даврӣ гузаред',
    continue: 'Рост равед', fallback: () => 'Рост равед',
    via: (dist, action) => `Баъди ${dist} ${action.toLowerCase()}`, arrived: 'Шумо ба манзили таъинот расидед',
    dest: 'манзили таъинот',
    m: 'метр', km: 'км',
  },
  en: {
    depart: 'Start driving', arrive: 'You have arrived',
    turn: d => `Turn ${d}`, newName: () => 'Continue', merge: () => 'Continue',
    endOfRoad: d => `At the end of the road, turn ${d}`, roundabout: () => 'At the roundabout, continue',
    continue: 'Continue straight ahead', fallback: d => `Go ${d || 'straight ahead'}`,
    via: (dist, action) => `In ${dist}, ${action.toLowerCase()}`, arrived: 'You have arrived at your destination',
    dest: 'destination',
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

  const [routeProgress, setRouteProgress] = useState(0);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [isRerouting, setIsRerouting] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [snappedPosition, setSnappedPosition] = useState(null);
  const [followingStep, setFollowingStep] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  // Предложение «Другая дорога»: более быстрый маршрут с текущей позиции до конца
  const [alternativeRoute, setAlternativeRoute] = useState(null);

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
  const lastRerouteRef = useRef(0);
  const offRouteStartRef = useRef(null);
  const routeProgressRef = useRef(0);
  const routeLenRef = useRef(0);
  const gpsErrorRef = useRef(null);
  // Трекер прибытия (navigationLogic): подтверждение = ARRIVAL_CONFIRM_FIXES
  // подряд валидных GPS-замеров; сбрасывается только сменой маршрута/цели.
  const arrivalStateRef = useRef(initialArrivalState());
  // Токен маршрута: поздний асинхронный ответ применяется, только если маршрут
  // с момента старта запроса не менялся (сценарий «поздний ответ»).
  const routeSeqRef = useRef(0);
  const alternativeRef = useRef(null);

  useEffect(() => { alternativeRef.current = alternativeRoute; }, [alternativeRoute]);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { routeProgressRef.current = routeProgress; }, [routeProgress]);
  useEffect(() => { gpsErrorRef.current = gpsError; }, [gpsError]);

  const clearGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const speak = useCallback((text) => {
    if (!voiceEnabledRef.current || !text) return;
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
    // Манёвр arrive: пока до цели есть расстояние — нейтральная подсказка
    // «Через X — пункт назначения». «Вы прибыли» показывается/озвучивается
    // только при подтверждённом прибытии, а не по факту манёвра (D6:
    // карточка показывала «924 м · Вы прибыли» за километры до цели).
    if (instruction === 'arrive') {
      if (distance > ARRIVAL_THRESHOLD_M) {
        const distStr = distance >= 1000 ? `${(distance / 1000).toFixed(1)} ${L.km}` : `${Math.round(distance)} ${L.m}`;
        return L.via(distStr, L.dest);
      }
      return L.arrive;
    }
    const action = {
      depart: L.depart,
      turn: L.turn(modifier),
      'new name': L.newName(dir),
      merge: L.merge(dir),
      'end of road': L.endOfRoad(dir),
      roundabout: L.roundabout(dir),
      rotary: L.roundabout(dir),
      continue: L.continue,
    }[instruction] || L.fallback(dir);
    if (distance > 50 && instruction !== 'depart') {
      const distStr = distance >= 1000 ? `${(distance / 1000).toFixed(1)} ${L.km}` : `${Math.round(distance)} ${L.m}`;
      return L.via(distStr, action);
    }
    return action;
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

  // Смена маршрута/цели: состояние прибытия и прогресса старого маршрута
  // недействительны (D2: застрявший «Вы прибыли» + запрет объявления прибытия
  // на новой цели). Вызывается ТОЛЬКО при успешной смене маршрута — неудачное
  // перестроение не теряет текущий рабочий маршрут (требование 4.3).
  const invalidateRouteState = useCallback(() => {
    arrivalStateRef.current = initialArrivalState();
    setHasArrived(false);
    setRouteProgress(0);
    routeProgressRef.current = 0;
    setIsOffRoute(false);
    offRouteStartRef.current = null;
    setSnappedPosition(null);
    stepIndexRef.current = 0;
    annKeyRef.current = { idx: -1, pre: false, final: false };
    routeSeqRef.current += 1;
  }, []);

  // Единая запись активного маршрута в localStorage (восстановление после F5).
  const persistActiveRoute = useCallback((route) => {
    try { localStorage.setItem('karta_nav_active', JSON.stringify(route)); } catch {}
  }, []);

  // Кеш дуговых позиций манёвров: считается один раз на маршрут, сбрасывается
  // автоматически при смене объекта маршрута.
  const stepsArcCacheRef = useRef({ route: null, arc: null });
  const getStepsArc = useCallback((route, steps, geometry) => {
    if (stepsArcCacheRef.current.route === route) return stepsArcCacheRef.current.arc;
    const arc = computeStepsArcM(geometry, steps);
    stepsArcCacheRef.current = { route, arc };
    return arc;
  }, []);

  const processPosition = useCallback((lat, lng, heading, speed, accuracy = null) => {
    const hist = positionsRef.current.slice(-2);
    if (hist.length >= 2) {
      const avgLat = (hist[0].lat + hist[1].lat + lat) / 3;
      const avgLng = (hist[0].lng + hist[1].lng + lng) / 3;
      if (Math.hypot(avgLat - lat, avgLng - lng) * 111320 < 40) { lat = avgLat; lng = avgLng; }
    }
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
    if (Number.isFinite(accuracy)) setGpsAccuracy(accuracy);
    if (gpsErrorRef.current) setGpsError(null); // первый живой фикс снимает ошибку геолокации

    if (isPausedRef.current) return;

    if (lastPos) {
      traveledRef.current += Math.hypot(lat - lastPos.lat, lng - lastPos.lng) * 111320;
      setTraveledDistance(traveledRef.current);
    }
    positionsRef.current.push({ lat, lng });
    if (positionsRef.current.length > 200) positionsRef.current = positionsRef.current.slice(-100);

    let route = routeRef.current;
    if (!route || !route.geometry || route.geometry.length < 2) return;

    const geometry = route.geometry;
    const routeLen = routeLenRef.current || routeLengthM(geometry);

    // Проекция с окном вокруг предыдущего положения (prev в метрах дуги):
    // петли и параллельные ветки не откатывают прогресс назад без основания.
    // На первом фиксе prev=0 — результат совпадает с прежним глобальным поиском.
    const proj = projectOnPolyline(lat, lng, geometry, {
      prevProgressM: routeLen * (routeProgressRef.current || 0),
    });
    setRouteProgress(proj.progress);
    routeProgressRef.current = proj.progress;
    setSnappedPosition([proj.snappedLat, proj.snappedLng]);

    const offDist = proj.distToRoute;
    const now = Date.now();
    if (offDist > OFF_ROUTE_THRESHOLD_M) {
      if (!offRouteStartRef.current) offRouteStartRef.current = now;
      setIsOffRoute(true);
    } else {
      offRouteStartRef.current = null;
      setIsOffRoute(false);
    }

    if (offDist > OFF_ROUTE_THRESHOLD_M && offRouteStartRef.current && (now - offRouteStartRef.current > 2000)) {
      if (now - lastRerouteRef.current > REROUTING_COOLDOWN_MS && !isReroutingRef.current) {
        lastRerouteRef.current = now;
        offRouteStartRef.current = null;
        triggerReroute();
      }
    }

    // ── Прибытие (D3, D4): подтверждается только несколькими подряд достоверными
    // замерами; одиночный GPS-выброс не завершает навигацию. После подтверждения
    // остаток/ETA обнуляются один раз, продвижения по завершённому маршруту нет.
    const end = geometry[geometry.length - 1];
    const routeValid = Array.isArray(end) && Number.isFinite(end[0]) && Number.isFinite(end[1]) && routeLen > 0;
    const prevArrival = arrivalStateRef.current;
    const arrival = nextArrivalState(prevArrival, {
      toDestM: routeValid ? haversineM(lat, lng, end[0], end[1]) : NaN,
      offRouteM: offDist,
      snappedToDestM: routeValid ? haversineM(proj.snappedLat, proj.snappedLng, end[0], end[1]) : NaN,
      progress: proj.progress,
      accuracyM: accuracy,
      routeValid,
    });
    const justArrived = arrival.confirmed && !prevArrival.confirmed;
    arrivalStateRef.current = arrival;
    if (arrival.confirmed) {
      setHasArrived(true);
      if (justArrived) {
        setRemainingDistance(0);
        setRemainingDuration(0);
        setEta(new Date());
        const arrivedText = (PHRASE[getNavLang()] || PHRASE.ru).arrived;
        speak(arrivedText);
        setNextInstruction({
          text: arrivedText, streetName: '', distance: 0, instruction: 'arrive', modifier: '',
        });
        setFollowingStep(null);
      }
      return;
    }

    // ── Остаток маршрута и ETA — единая геометрическая модель (navigationLogic):
    // остаток = длина × (1 − прогресс); ETA масштабирует OSRM-время тем же
    // прогрессом либо делит остаток по средней скорости, если она достоверна.
    // Это же обслуживает маршруты без пошаговки (транзит, GPX) — веток с
    // разными моделями больше нет.
    const totalRemaining = computeRemainingM(routeLen, proj.progress);
    setRemainingDistance(totalRemaining);

    const steps = ensureStepStarts(route.steps);
    if (!steps || !steps.length) {
      setNextInstruction({
        text: (PHRASE[getNavLang()] || PHRASE.ru).continue,
        streetName: '',
        distance: totalRemaining,
        instruction: 'continue',
        modifier: '',
      });
      setFollowingStep(null);
    } else {
      const stepsArc = getStepsArc(route, steps, geometry);
      // Следующий манёвр — первый шаг, чей старт ещё впереди; расстояние до
      // него считается вдоль маршрута и не включает пройденную часть шага (D5).
      const picked = pickNextStep(stepsArc, proj.progress * routeLen);
      const stepIdx = picked.idx;
      stepIndexRef.current = stepIdx;
      const distToNext = picked.distToNextM;

      const step = steps[stepIdx];
      const nextStep = steps[stepIdx + 1];
      setFollowingStep(nextStep
        ? { instruction: nextStep.instruction || '', modifier: nextStep.modifier || '', name: nextStep.name || '' }
        : null);

      try {
        const autoScale = JSON.parse(localStorage.getItem('karta_nav_settings')||'{}')?.auto_scale !== false;
        if (autoScale && nextStep && distToNext < 120) {
          window.dispatchEvent(new CustomEvent('karta_autoscale', { detail: nextStep.distance < 80 ? 18 : 16 }));
        }
      } catch {}

      const navLang = getNavLang();
      setNextInstruction({
        text: getManeuverText(step.instruction, step.modifier, distToNext, navLang),
        streetName: step.name || '',
        distance: distToNext,
        instruction: step.instruction,
        modifier: step.modifier,
      });

      const annNow = Date.now();
      if (annKeyRef.current.idx !== stepIdx) annKeyRef.current = { idx: stepIdx, pre: false, final: false };
      const ann = annKeyRef.current;
      if (ANNOUNCEABLE.has(step.instruction) && !ann.pre && distToNext < 200 && distToNext >= 25 && annNow - lastAnnounceRef.current > 8000) {
        speak(getManeuverText(step.instruction, step.modifier, Math.round(distToNext), navLang));
        ann.pre = true;
        lastAnnounceRef.current = annNow;
      }
      // Финальное «прибыли» озвучивает только блок подтверждения прибытия:
      // текст манёвра сам по себе навигацию не завершает.
      if (step.instruction !== 'arrive' && ANNOUNCEABLE.has(step.instruction) && !ann.final && distToNext < 25 && annNow - lastAnnounceRef.current > 8000) {
        speak(getManeuverText(step.instruction, step.modifier, 0, navLang));
        ann.final = true;
        lastAnnounceRef.current = annNow;
      }
    }

    const elapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    const avgSpd = traveledRef.current > 0 && elapsed > 15 ? traveledRef.current / elapsed : 0;
    const baseDur = route.duration ?? route.totalDuration ?? 0;
    const etaSec = computeEtaSec({
      remainingM: totalRemaining, routeLenM: routeLen, durationSec: baseDur, avgSpeedMps: avgSpd,
    });
    if (etaSec == null) {
      // Достоверного прогноза нет — нейтральное состояние, а не ложное время.
      setEta(null);
      setRemainingDuration(0);
    } else {
      setEta(new Date(Date.now() + etaSec * 1000));
      setRemainingDuration(Math.round(etaSec));
    }
    setTripStats({ distance: traveledRef.current, duration: elapsed, avgSpeed: avgSpd * 3.6 });
  }, [ensureStepStarts, getManeuverText, getStepsArc, speak, setGpsError]);

  const isReroutingRef = useRef(false);

  const triggerReroute = useCallback(async () => {
    if (isReroutingRef.current) return;
    const route = routeRef.current;
    if (!route?.from || !route?.to) return;
    const pos = positionsRef.current[positionsRef.current.length - 1];
    if (!pos) return;
    const seq = routeSeqRef.current; // защита от позднего ответа (D8)
    isReroutingRef.current = true;
    setIsRerouting(true);
    try {
      const profile = route.mode === 'walking' ? 'walking' : 'driving';
      const newRoute = await rerouteInternal(
        { lat: pos.lat, lng: pos.lng },
        route.to,
        route.waypoints,
        profile
      );
      if (newRoute && seq === routeSeqRef.current) {
        routeRef.current = {
          ...newRoute,
          from: { lat: pos.lat, lng: pos.lng, shortName: route.from?.shortName, name: route.from?.name },
          to: route.to, mode: route.mode, waypoints: route.waypoints,
        };
        setRouteData(routeRef.current);
        invalidateRouteState(); // прибытие/прогресс старого маршрута недействительны
        routeLenRef.current = routeLengthM(newRoute.geometry);
        setAlternativeRoute(null);
        persistActiveRoute(routeRef.current);
        speak('Маршрут обновлён');
      }
    } catch {}
    finally {
      isReroutingRef.current = false;
      setIsRerouting(false);
    }
  }, [speak, invalidateRouteState, persistActiveRoute]);

  const processPositionRef = useRef(processPosition);
  useEffect(() => { processPositionRef.current = processPosition; }, [processPosition]);
  const triggerRerouteRef = useRef(triggerReroute);
  useEffect(() => { triggerRerouteRef.current = triggerReroute; }, [triggerReroute]);

  const startGps = useCallback(() => {
    clearGps();
    if (!('geolocation' in navigator)) {
      toast.error('Геолокация недоступна в этом браузере');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        processPositionRef.current(latitude, longitude, heading, speed || 0, accuracy ?? null);
      },
      (err) => {
        const msg = err?.code === 1
          ? 'Разрешите доступ к геолокации — без неё навигация не следит за вами'
          : 'Не удаётся получить GPS-позицию';
        setGpsError(msg);
        toast.error(msg, { id: 'nav-geo-error' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [clearGps]);

  // Стартовые значения HUD: полный маршрут, а не нули — обновятся первым GPS-фиксом.
  // Работает и для транзитных маршрутов (totalDistance/totalDuration).
  const initStatsFromRoute = useCallback((route) => {
    if (!route) return;
    const dist = route.distance ?? route.totalDistance ?? routeLengthM(route.geometry);
    const dur = route.duration ?? route.totalDuration ?? 0;
    if (dist > 0) setRemainingDistance(dist);
    if (dur > 0) {
      setRemainingDuration(Math.round(dur));
      setEta(new Date(Date.now() + dur * 1000));
    }
  }, []);

  const resetNavState = useCallback(() => {
    // инвалидация состояния прибытия/прогресса + токен маршрута (D2)
    invalidateRouteState();
    setStartTime(Date.now());
    startTimeRef.current = Date.now();
    traveledRef.current = 0;
    setTraveledDistance(0);
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
    setIsRerouting(false);
    lastRerouteRef.current = 0;
    routeLenRef.current = 0;
    setAlternativeRoute(null);
  }, [invalidateRouteState]);

  const startNavigationWithFromTo = useCallback((route, from, to) => {
    const enriched = { ...route, from, to };
    routeRef.current = enriched;
    setRouteData(enriched);
    setIsActive(true);
    setIsPaused(false);
    isPausedRef.current = false;
    resetNavState();
    routeLenRef.current = routeLengthM(enriched.geometry);
    initStatsFromRoute(enriched);
    startGps();
    persistActiveRoute(enriched);
    speak('Начинаем навигацию');
  }, [startGps, resetNavState, speak, persistActiveRoute, initStatsFromRoute]);

  const startNavigation = useCallback((route) => {
    routeRef.current = route;
    setRouteData(route);
    setIsActive(true);
    setIsPaused(false);
    isPausedRef.current = false;
    resetNavState();
    routeLenRef.current = routeLengthM(route.geometry);
    initStatsFromRoute(route);
    startGps();
    persistActiveRoute(route);
    speak('Начинаем навигацию');
  }, [startGps, resetNavState, speak, persistActiveRoute, initStatsFromRoute]);

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
    setAlternativeRoute(null);
    // вручную остановленная навигация — не объявляем прибытие (оно annonceтся
    // только блоком подтверждения прибытия при достижении цели)
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

  const rerouteInternal = useCallback(async (from, to, waypoints, profile = 'driving', opts = {}) => {
    if (!from || !to) return null;
    try {
      const wps = (waypoints || []).filter(Boolean);
      const coords = [from, ...wps, to].map(p => `${p.lng},${p.lat}`).join(';');
      const endpoint = OSRM_ENDPOINTS[profile] || OSRM_ENDPOINTS.driving;
      const altParam = opts.alternatives ? '&alternatives=true' : '';
      const resp = await fetch(
        `${endpoint}/${coords}?overview=full&geometries=geojson&steps=true&annotations=true${altParam}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.routes?.length) return null;
      // Общий разбор OSRM: старты шагов = точки их манёвров (D1), без копий.
      const parsed = data.routes.map((r) => {
        const { distance, duration, geometry, steps } = parseOsrmRoute(r);
        return { distance, duration, geometry, steps };
      });
      // с alternatives=true отдаём все варианты, иначе — только лучший (как раньше)
      if (opts.alternatives) return parsed;
      return parsed[0] || null;
    } catch { return null; }
  }, []);

  const reroute = useCallback(async (from, to, profile = 'driving') => {
    const rd = routeRef.current;
    const seq = routeSeqRef.current; // защита от позднего ответа (D8, сценарий 15)
    const newRoute = await rerouteInternal(from, to, rd?.waypoints, profile);
    // Маршрут мог смениться, пока ждали ответ: поздний ответ не перезаписывает
    // более новый маршрут/цель.
    if (!newRoute || seq !== routeSeqRef.current) return null;
    routeRef.current = { ...newRoute, from, to, mode: rd?.mode || profile, waypoints: rd?.waypoints };
    setRouteData(routeRef.current);
    invalidateRouteState(); // прибытие/прогресс старого маршрута недействительны
    routeLenRef.current = routeLengthM(newRoute.geometry);
    setAlternativeRoute(null);
    persistActiveRoute(routeRef.current);
    speak('Маршрут обновлён');
    return newRoute;
  }, [rerouteInternal, speak, invalidateRouteState, persistActiveRoute]);

  // «Другая дорога»: периодически ищем более быстрый маршрут с текущей позиции до конца.
  // Показываем предложение только если он быстрее текущего остатка заметно (≥45 с).
  const checkAlternative = useCallback(async () => {
    const rd = routeRef.current;
    if (!rd?.to || !isActive || isReroutingRef.current) return;
    const pos = positionsRef.current[positionsRef.current.length - 1];
    if (!pos) return;
    const profile = rd.mode === 'walking' ? 'walking' : rd.mode === 'cycling' ? 'cycling' : 'driving';
    const seq = routeSeqRef.current;
    const routes = await rerouteInternal(pos, rd.to, rd.waypoints, profile, { alternatives: true });
    // Маршрут сменился, пока ждали — предложение неактуально (сценарий 15).
    if (seq !== routeSeqRef.current) return;
    if (!Array.isArray(routes) || routes.length < 2) { setAlternativeRoute(null); return; }
    // остаток текущего маршрута в терминах OSRM (оба числа «сырые», сравнение честное)
    const remaining = rd.duration ? rd.duration * (1 - routeProgressRef.current) : 0;
    if (!remaining) { setAlternativeRoute(null); return; }
    const best = routes.reduce((a, b) => (b.duration < a.duration ? b : a));
    const delta = remaining - best.duration;
    if (delta >= 45) setAlternativeRoute({ route: best, deltaSec: Math.round(delta) });
    else setAlternativeRoute(null);
  }, [isActive, rerouteInternal]);

  const checkAlternativeRef = useRef(null);
  useEffect(() => { checkAlternativeRef.current = checkAlternative; }, [checkAlternative]);

  const useAlternative = useCallback(() => {
    const alt = alternativeRef.current;
    const rd = routeRef.current;
    if (!alt?.route || !rd) return;
    const pos = positionsRef.current[positionsRef.current.length - 1];
    // подписи «ОТ» сохраняем от исходной точки маршрута, координаты — текущие
    const enriched = {
      ...alt.route,
      from: pos ? { ...pos, shortName: rd.from?.shortName, name: rd.from?.name } : rd.from,
      to: rd.to, mode: rd.mode, waypoints: rd.waypoints,
    };
    routeRef.current = enriched;
    setRouteData(enriched);
    invalidateRouteState(); // прибытие/прогресс старого маршрута недействительны (сценарий 13)
    routeLenRef.current = routeLengthM(enriched.geometry);
    setAlternativeRoute(null);
    initStatsFromRoute(enriched);
    persistActiveRoute(enriched);
    speak('Переключаемся на другую дорогу');
  }, [invalidateRouteState, initStatsFromRoute, persistActiveRoute, speak]);

  const dismissAlternative = useCallback(() => setAlternativeRoute(null), []);

  // первый запрос через 8 с после старта, дальше — раз в минуту
  useEffect(() => {
    if (!isActive || isPaused) { setAlternativeRoute(null); return; }
    const initial = setTimeout(() => checkAlternativeRef.current?.(), 8000);
    const id = setInterval(() => checkAlternativeRef.current?.(), 60000);
    return () => { clearTimeout(initial); clearInterval(id); };
  }, [isActive, isPaused]);

  const closeSummary = useCallback(() => {
    setShowSummary(false);
    setSummaryData(null);
    setRouteData(null);
    routeRef.current = null;
    setNextInstruction(null);
    setUserPosition(null);
    invalidateRouteState();
    setIsRerouting(false);
  }, [invalidateRouteState]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('karta_nav_active');
      if (saved) {
        const r = JSON.parse(saved);
        if (r?.geometry) {
          routeRef.current = r;
          setRouteData(r);
          setIsActive(true);
          routeLenRef.current = routeLengthM(r.geometry);
          initStatsFromRoute(r);
          startGps();
        }
      }
    } catch {}
    return () => { clearGps(); try { window.speechSynthesis.cancel(); } catch {} };
  }, [clearGps, startGps, initStatsFromRoute]);

  const value = useMemo(() => ({
    isActive, isPaused,
    routeData, userPosition, userHeading, userSpeed,
    nextInstruction, remainingDistance, remainingDuration, eta, traveledDistance,
    startTime, voiceEnabled, followUser,
    showSummary, summaryData, tripStats,
    routeProgress, isOffRoute, isRerouting, hasArrived, snappedPosition,
    followingStep, gpsAccuracy, gpsError,
    startNavigation, startNavigationWithFromTo, stopNavigation,
    togglePause, toggleVoice, toggleFollow,
    reroute, alternativeRoute, useAlternative, dismissAlternative, closeSummary,
    setUserPosition, setUserHeading, setUserSpeed, setFollowUser, setGpsError,
  }), [
    isActive, isPaused,
    routeData, userPosition, userHeading, userSpeed,
    nextInstruction, remainingDistance, remainingDuration, eta, traveledDistance,
    startTime, voiceEnabled, followUser,
    showSummary, summaryData, tripStats,
    routeProgress, isOffRoute, isRerouting, hasArrived, snappedPosition,
    followingStep, gpsAccuracy, gpsError,
    startNavigation, startNavigationWithFromTo, stopNavigation,
    togglePause, toggleVoice, toggleFollow,
    reroute, alternativeRoute, useAlternative, dismissAlternative, closeSummary,
  ]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
