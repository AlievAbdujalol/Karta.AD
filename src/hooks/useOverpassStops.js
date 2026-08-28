import { useState, useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';

const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const LS_KEY = 'osm_stops_cache_v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildQuery(south, west, north, east) {
  return `[out:json][timeout:12];node["highway"="bus_stop"](${south},${west},${north},${east});out body;`;
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveCache(cache) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
}

export function useOverpassStops() {
  const [osmStops, setOsmStops] = useState(() => {
    const c = loadCache();
    const all = [];
    const seen = new Set();
    Object.values(c).forEach((entry) => {
      if (!entry?.stops) return;
      entry.stops.forEach((s) => {
        if (!seen.has(s.id)) { seen.add(s.id); all.push(s); }
      });
    });
    return all;
  });
  const map = useMap();
  const fetchedKeys = useRef(new Set(Object.keys(loadCache())));
  const timerRef = useRef(null);
  const fetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  const fetchStops = useCallback(async (bounds, key, attempt = 0) => {
    if (fetchingRef.current) return;
    if (fetchedKeys.current.has(key)) return;
    if (Date.now() < cooldownUntilRef.current) return;
    if (Date.now() - lastFetchRef.current < 8000) return;
    if (map.getZoom() < 12) return;
    // check localStorage cache freshness
    const cache = loadCache();
    const entry = cache[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL) {
      fetchedKeys.current.add(key);
      const ids = new Set(osmStops.map((p) => p.id));
      const extra = entry.stops.filter((s) => !ids.has(s.id));
      if (extra.length) setOsmStops((prev) => [...prev, ...extra]);
      return;
    }
    fetchingRef.current = true;
    lastFetchRef.current = Date.now();
    try {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const query = buildQuery(sw.lat, sw.lng, ne.lat, ne.lng);
      let data = null;
      let lastStatus = 0;
      for (const url of OVERPASS_URLS) {
        try {
          const resp = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
          });
          lastStatus = resp.status;
          if (resp.status === 429 || resp.status === 406) {
            cooldownUntilRef.current = Date.now() + 60000;
            fetchedKeys.current.add(key);
            if (resp.status === 429) console.warn('[OSM] 429 — пауза 60с');
            fetchingRef.current = false;
            return;
          }
          if (!resp.ok) continue;
          data = await resp.json();
          break;
        } catch {
          continue;
        }
      }
      if (!data) {
        return;
      }
      const stops = (data.elements || [])
        .map((el) => ({
          id: el.id,
          lat: el.lat,
          lng: el.lon,
          name: el.tags?.name || el.tags?.['name:ru'] || el.tags?.['name:en'] || el.tags?.ref || `Остановка ${el.id}`,
        }))
        .filter((s) => s.lat != null && s.lng != null);
      // save to cache
      const newCache = loadCache();
      newCache[key] = { ts: Date.now(), stops };
      saveCache(newCache);
      fetchedKeys.current.add(key);
      setOsmStops((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        const extra = stops.filter((s) => !ids.has(s.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
    } catch (e) {
      console.warn('[OSM stops] fetch failed', e);
    } finally {
      fetchingRef.current = false;
    }
  }, [map]);

  useEffect(() => {
    const handleMoveEnd = () => {
      if (map.getZoom() < 12) return;
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const key = `${sw.lat.toFixed(2)}_${sw.lng.toFixed(2)}_${ne.lat.toFixed(2)}_${ne.lng.toFixed(2)}_z${map.getZoom()}`;
      if (fetchedKeys.current.has(key)) return;
      if (Date.now() < cooldownUntilRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fetchStops(bounds, key), 2200);
    };
    map.on('moveend', handleMoveEnd);
    timerRef.current = setTimeout(handleMoveEnd, 1400);
    return () => {
      map.off('moveend', handleMoveEnd);
      clearTimeout(timerRef.current);
    };
  }, [map, fetchStops]);

  return osmStops;
}
