import { useState, useCallback, useRef, useEffect } from 'react';

export function useGeolocation(opts = {}) {
  const { enableHighAccuracy = true, timeout = 10000, maximumAge = 0 } = opts;
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef(null);

  const locateOnce = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { const e = new Error('Геолокация не поддерживается'); setError(e.message); reject(e); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude, accuracy: acc, heading: h, speed: s } = pos.coords;
        const p = [latitude, longitude];
        setPosition(p); setAccuracy(acc); setHeading(h); setSpeed(s); setError(null);
        resolve({ lat: latitude, lng: longitude, accuracy: acc, heading: h, speed: s });
      }, (err) => {
        const msg = err.code === 1 ? 'Разрешите доступ к геолокации' : 'Не удалось определить местоположение';
        setError(msg); reject(new Error(msg));
      }, { enableHighAccuracy, timeout, maximumAge });
    });
  }, [enableHighAccuracy, timeout, maximumAge]);

  const startWatch = useCallback((onUpdate) => {
    if (!navigator.geolocation) return null;
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    setWatching(true);
    watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, accuracy: acc, heading: h, speed: s } = pos.coords;
      const p = [latitude, longitude];
      setPosition(p); setAccuracy(acc); setHeading(h); setSpeed(s);
      onUpdate?.({ lat: latitude, lng: longitude, accuracy: acc, heading: h, speed: s });
    }, (err) => setError(err.message), { enableHighAccuracy, timeout: 15000, maximumAge: 3000 });
    return watchIdRef.current;
  }, [enableHighAccuracy]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setWatching(false);
  }, []);

  useEffect(() => () => stopWatch(), [stopWatch]);

  return { position, accuracy, heading, speed, error, watching, locateOnce, startWatch, stopWatch };
}
