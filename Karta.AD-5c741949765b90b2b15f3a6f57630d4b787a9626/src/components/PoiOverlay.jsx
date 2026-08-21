import L from 'leaflet';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { useLanguage } from '@/lib/useLanguage';

const CATEGORIES = {
  hospital:    { color: '#ef4444', icon: '🏥', zoom: 14, osmKey: 'amenity', osmVal: 'hospital' },
  clinic:      { color: '#f97316', icon: '🏥', zoom: 14, osmKey: 'amenity', osmVal: 'clinic' },
  pharmacy:    { color: '#22c55e', icon: '💊', zoom: 15, osmKey: 'amenity', osmVal: 'pharmacy' },
  school:      { color: '#f59e0b', icon: '🏫', zoom: 14, osmKey: 'amenity', osmVal: 'school' },
  university:  { color: '#8b5cf6', icon: '🎓', zoom: 14, osmKey: 'amenity', osmVal: 'university' },
  kindergarten:{ color: '#ec4899', icon: '🧸', zoom: 15, osmKey: 'amenity', osmVal: 'kindergarten' },
  cafe:        { color: '#a855f7', icon: '☕', zoom: 15, osmKey: 'amenity', osmVal: 'cafe' },
  restaurant:  { color: '#ec4899', icon: '🍽️', zoom: 14, osmKey: 'amenity', osmVal: 'restaurant' },
  fast_food:   { color: '#f97316', icon: '🍔', zoom: 15, osmKey: 'amenity', osmVal: 'fast_food' },
  bank:        { color: '#3b82f6', icon: '🏦', zoom: 15, osmKey: 'amenity', osmVal: 'bank' },
  atm:         { color: '#2563eb', icon: '🏧', zoom: 15, osmKey: 'amenity', osmVal: 'atm' },
  fuel:        { color: '#dc2626', icon: '⛽', zoom: 14, osmKey: 'amenity', osmVal: 'fuel' },
  parking:     { color: '#6b7280', icon: '🅿️', zoom: 15, osmKey: 'amenity', osmVal: 'parking' },
  police:      { color: '#1d4ed8', icon: '👮', zoom: 15, osmKey: 'amenity', osmVal: 'police' },
  fire_station:{ color: '#ef4444', icon: '🚒', zoom: 15, osmKey: 'amenity', osmVal: 'fire_station' },
  post_office: { color: '#ca8a04', icon: '📬', zoom: 15, osmKey: 'amenity', osmVal: 'post_office' },
  mosque:      { color: '#16a34a', icon: '🕌', zoom: 14, osmKey: 'amenity', osmVal: 'mosque' },
  park:        { color: '#16a34a', icon: '🌳', zoom: 13, osmKey: 'leisure', osmVal: 'park' },
  stadium:     { color: '#22c55e', icon: '🏟️', zoom: 14, osmKey: 'leisure', osmVal: 'stadium' },
  playground:  { color: '#22c55e', icon: '🎡', zoom: 15, osmKey: 'leisure', osmVal: 'playground' },
  theatre:     { color: '#a855f7', icon: '🎭', zoom: 15, osmKey: 'amenity', osmVal: 'theatre' },
  cinema:      { color: '#a855f7', icon: '🎬', zoom: 15, osmKey: 'amenity', osmVal: 'cinema' },
  library:     { color: '#f59e0b', icon: '📚', zoom: 15, osmKey: 'amenity', osmVal: 'library' },
  marketplace: { color: '#06b6d4', icon: '🏪', zoom: 14, osmKey: 'amenity', osmVal: 'marketplace' },
  supermarket: { color: '#06b6d4', icon: '🛒', zoom: 14, osmKey: 'shop', osmVal: 'supermarket' },
  mall:        { color: '#ec4899', icon: '🏬', zoom: 14, osmKey: 'shop', osmVal: 'mall' },
  shop:        { color: '#06b6d4', icon: '🛍️', zoom: 15, osmKey: 'shop', osmVal: 'all' },
  hotel:       { color: '#8b5cf6', icon: '🏨', zoom: 14, osmKey: 'tourism', osmVal: 'hotel' },
  hostel:      { color: '#8b5cf6', icon: '🛏️', zoom: 15, osmKey: 'tourism', osmVal: 'hostel' },
  attraction:  { color: '#f59e0b', icon: '🏛️', zoom: 14, osmKey: 'tourism', osmVal: 'attraction' },
  museum:      { color: '#8b5cf6', icon: '🏛️', zoom: 14, osmKey: 'tourism', osmVal: 'museum' },
  zoo:         { color: '#16a34a', icon: '🐾', zoom: 14, osmKey: 'tourism', osmVal: 'zoo' },
  bus_stop:    { color: '#1565c0', icon: '🚌', zoom: 15, osmKey: 'highway', osmVal: 'bus_stop' },
  railway:     { color: '#dc2626', icon: '🚆', zoom: 13, osmKey: 'railway', osmVal: 'station' },
  goverment:   { color: '#475569', icon: '🏛️', zoom: 15, osmKey: 'amenity', osmVal: 'townhall' },
  embassy:     { color: '#475569', icon: '🏛️', zoom: 15, osmKey: 'amenity', osmVal: 'embassy' },
};

export default function PoiOverlay({ enabled }) {
  const map = useMap();
  const [pois, setPois] = useState([]);
  const cacheRef = useRef({});
  const timerRef = useRef(null);
  const { t } = useLanguage();
  const zoom = map.getZoom();

  const fetchPois = useCallback(() => {
    if (!enabled) { setPois([]); return; }

    const bounds = map.getBounds();
    const zoomLevel = map.getZoom();
    const bbox = `${bounds.getSouth().toFixed(4)},${bounds.getWest().toFixed(4)},${bounds.getNorth().toFixed(4)},${bounds.getEast().toFixed(4)}`;
    const cacheKey = `${zoomLevel}_${bbox}`;

    if (cacheRef.current[cacheKey]) {
      setPois(cacheRef.current[cacheKey]);
      return;
    }

    const filterByZoom = (cat) => (zoomLevel >= cat.zoom);

    const activeCategories = Object.entries(CATEGORIES).filter(([, cat]) => filterByZoom(cat));

    const queries = [];
    for (const [, cat] of activeCategories) {
      if (cat.osmKey === 'highway') {
        queries.push(`node["highway"="bus_stop"](${bbox});way["highway"="bus_stop"](${bbox});`);
      } else if (cat.osmKey === 'railway') {
        queries.push(`node["railway"="station"](${bbox});`);
      } else if (cat.osmKey === 'shop' && cat.osmVal === 'all') {
        queries.push(`node["shop"](${bbox});`);
      } else if (cat.osmKey === 'leisure') {
        queries.push(`node["leisure"="${cat.osmVal}"](${bbox});`);
      } else {
        queries.push(`node["${cat.osmKey}"="${cat.osmVal}"](${bbox});`);
      }
    }

    const maxResults = zoomLevel >= 16 ? 150 : zoomLevel >= 15 ? 100 : 60;
    const query = `[out:json][timeout:12];(${queries.join('')});out center tags(${maxResults});`;

    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
      .then(r => {
        if (!r.ok) {
          cacheRef.current[cacheKey] = [];
          if (Object.keys(cacheRef.current).length > 50) {
            const keys = Object.keys(cacheRef.current);
            delete cacheRef.current[keys[0]];
          }
          return null;
        }
        return r.json();
      })
      .then(data => { if (!data) return;
        const items = (data.elements || []).map(el => {
          const tags = el.tags || {};
          const catKey = getCategory(tags);
          const cat = CATEGORIES[catKey] || { icon: '📍', color: '#6b7280', label: 'busmap.poiOther' };
          return {
            lat: el.lat || el.center?.lat || (el.bounds ? (el.bounds.minlat + el.bounds.maxlat) / 2 : null),
            lng: el.lon || el.center?.lon || (el.bounds ? (el.bounds.minlon + el.bounds.maxlon) / 2 : null),
            name: tags.name || tags['name:ru'] || tags['name:tg'] || tags['name:en'] || '',
            category: catKey,
            color: cat.color,
            icon: cat.icon,
            label: cat.label,
            addrStreet: tags['addr:street'] || '',
            addrHouse: tags['addr:housenumber'] || '',
            addrCity: tags['addr:city'] || '',
            phone: tags.phone || tags['contact:phone'] || '',
            website: tags.website || tags['contact:website'] || '',
            hours: tags.opening_hours || '',
            operator: tags.operator || '',
            wheelchair: tags.wheelchair || '',
          };
        }).filter(p => p.lat && p.lng && p.name);

        cacheRef.current[cacheKey] = items;
        if (Object.keys(cacheRef.current).length > 50) {
          const keys = Object.keys(cacheRef.current);
          delete cacheRef.current[keys[0]];
        }
        setPois(items);
      })
      .catch(() => {});
  }, [enabled, map]);

  useEffect(() => {
    if (!enabled) { setPois([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchPois, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, fetchPois]);

  if (!enabled || pois.length === 0) return null;

  const size = zoom >= 16 ? 32 : zoom >= 15 ? 28 : 24;

  return pois.map((poi, i) => {
    const label = t(poi.label);
    const address = [poi.addrStreet, poi.addrHouse].filter(Boolean).join(', ');
    const fullAddress = [address, poi.addrCity].filter(Boolean).join(', ');

    return (
      <Marker
        key={`poi-${poi.lat}-${poi.lng}-${i}`}
        position={[poi.lat, poi.lng]}
        icon={L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${poi.color};
            border:2.5px solid #fff;
            box-shadow:0 2px 10px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            font-size:${zoom >= 16 ? '16' : zoom >= 15 ? '14' : '12'}px;line-height:1;
            cursor:pointer;
            transition:transform 0.15s;
          ">${poi.icon}</div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })}
      >
        <Popup className="poi-popup" maxWidth={280} minWidth={220}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{poi.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{poi.name}</div>
                <div style={{ fontSize: 11, color: poi.color, fontWeight: 600 }}>{label}</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4, fontSize: 12, color: '#64748b' }}>
              {fullAddress && (
                <div style={{ marginBottom: 3, display: 'flex', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: '#475569', minWidth: 28 }}>📍</span>
                  <span>{fullAddress}</span>
                </div>
              )}
              {poi.operator && (
                <div style={{ marginBottom: 3, display: 'flex', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: '#475569', minWidth: 28 }}>🏢</span>
                  <span>{poi.operator}</span>
                </div>
              )}
              {poi.hours && (
                <div style={{ marginBottom: 3, display: 'flex', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: '#475569', minWidth: 28 }}>⏰</span>
                  <span>{formatHours(poi.hours)}</span>
                </div>
              )}
              {poi.phone && (
                <div style={{ marginBottom: 3 }}>
                  <a href={`tel:${poi.phone}`} style={{ color: '#3b82f6', textDecoration: 'none', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, minWidth: 28 }}>📞</span>
                    <span>{poi.phone}</span>
                  </a>
                </div>
              )}
              {poi.website && (
                <div style={{ marginBottom: 3 }}>
                  <a href={poi.website.startsWith('http') ? poi.website : `https://${poi.website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', display: 'flex', gap: 4, alignItems: 'center', wordBreak: 'break-all' }}>
                    <span style={{ fontWeight: 600, minWidth: 28 }}>🌐</span>
                    <span>{poi.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                </div>
              )}
              <div style={{ marginTop: 2, fontSize: 11, color: '#94a3b8' }}>
                {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
              </div>
            </div>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function getCategory(tags) {
  if (tags.highway === 'bus_stop') return 'bus_stop';
  if (tags.railway === 'station') return 'railway';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.shop === 'mall') return 'mall';
  if (tags.shop) return 'shop';
  if (tags.amenity) {
    const map = {
      hospital: 'hospital', clinic: 'clinic', pharmacy: 'pharmacy',
      school: 'school', university: 'university', kindergarten: 'kindergarten',
      cafe: 'cafe', restaurant: 'restaurant', fast_food: 'fast_food',
      bank: 'bank', atm: 'atm', fuel: 'fuel', parking: 'parking',
      police: 'police', fire_station: 'fire_station', post_office: 'post_office',
      mosque: 'mosque', theatre: 'theatre', cinema: 'cinema', library: 'library',
      marketplace: 'marketplace', townhall: 'goverment', embassy: 'embassy',
    };
    return map[tags.amenity] || 'other';
  }
  if (tags.tourism) {
    const map = { hotel: 'hotel', hostel: 'hostel', attraction: 'attraction', museum: 'museum', zoo: 'zoo' };
    return map[tags.tourism] || 'other';
  }
  if (tags.leisure) {
    const map = { park: 'park', stadium: 'stadium', playground: 'playground' };
    return map[tags.leisure] || 'other';
  }
  return 'other';
}

function formatHours(hours) {
  if (!hours) return '';
  return hours.replace(/;/g, ', ').replace(/\s+/g, ' ').trim();
}
