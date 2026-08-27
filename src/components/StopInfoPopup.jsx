import { useMemo } from 'react';
import { useLanguage } from '@/lib/useLanguage';

const EPSILON_MERGE = 0.00035;
const STOP_RADIUS_M = 140;
const SEGMENT_RADIUS_M = 200;
const GEOMETRY_RADIUS_M = 55;

function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distToSegmentM(pLat, pLng, aLat, aLng, bLat, bLng) {
  const cosLat = Math.cos(pLat * Math.PI / 180);
  const dx = (bLng - aLng) * cosLat;
  const dy = (bLat - aLat);
  const ldx = (pLng - aLng) * cosLat;
  const ldy = (pLat - aLat);
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-12) return distM(pLat, pLng, aLat, aLng);
  let t = (ldx * dx + ldy * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  const projLng = aLng + t * (bLng - aLng);
  const projLat = aLat + t * (bLat - aLat);
  return distM(pLat, pLng, projLat, projLng);
}

function isNearPolyline(pLat, pLng, polyline, radiusM) {
  if (!polyline || polyline.length < 2) return false;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    // polyline is [lat, lng] pairs
    if (distToSegmentM(pLat, pLng, a[0], a[1], b[0], b[1]) <= radiusM) return true;
  }
  return false;
}

function stopsMatch(a, b) {
  return Math.abs(a.lat - b.lat) < EPSILON_MERGE && Math.abs(a.lng - b.lng) < EPSILON_MERGE;
}

export function collectUniqueStops(routes) {
  const unique = [];
  (routes || []).forEach(r => {
    (r.stops || []).forEach(s => {
      if (!s.lat || !s.lng) return;
      const existing = unique.find(u => stopsMatch(u, s));
      if (!existing) {
        unique.push({ lat: s.lat, lng: s.lng, name: s.name || '' });
      } else if (!existing.name && s.name) {
        existing.name = s.name;
      }
    });
  });
  return unique;
}

export function findRoutesAtStop(stop, routes, routeGeometries = null) {
  return (routes || []).filter(r => {
    const stops = r.stops || [];
    // 1) near defined stop point
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s.lat || !s.lng) continue;
      if (distM(s.lat, s.lng, stop.lat, stop.lng) <= STOP_RADIUS_M) return true;
    }
    // 2) near actual OSRM geometry (road-following polyline) — most accurate for auto-attachment
    const geom = routeGeometries?.[r.id];
    if (geom && isNearPolyline(stop.lat, stop.lng, geom, GEOMETRY_RADIUS_M)) return true;
    // 3) fallback: near straight segment between defined stops
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a.lat || !a.lng || !b.lat || !b.lng) continue;
      if (distToSegmentM(stop.lat, stop.lng, a.lat, a.lng, b.lat, b.lng) <= SEGMENT_RADIUS_M) return true;
    }
    return false;
  });
}

const S = {
  card: { background: '#11162a', borderRadius: 16, padding: '14px 16px 12px', fontFamily: 'Inter, system-ui, sans-serif', minWidth: 250, maxWidth: 310, color: '#fff' },
  title: { fontWeight: 800, fontSize: 13.5, color: '#fff', lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: 0.2 },
  suggestRow: { fontSize: 11, color: '#f0a030', cursor: 'pointer', marginTop: 6, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.95 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#6b7a9e', letterSpacing: 0.9, marginBottom: 6, textTransform: 'uppercase' },
  chipsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chipBase: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 26, padding: '0 8px', borderRadius: 8, border: '1.5px solid', fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'transform 0.12s, opacity 0.12s' },
  emptyText: { fontSize: 11, color: '#4a5578', marginBottom: 10, fontStyle: 'italic' },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0 12px' },
  buttonsRow: { display: 'flex', gap: 10, marginTop: 2 },
  btnFrom: { flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.35)' },
  btnTo: { flex: 1, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.35)' },
};

function Chip({ r }) {
  const bg = r.color || '#1e293b';
  return (
    <span
      style={{ ...S.chipBase, background: bg, borderColor: bg, color: '#fff' }}
      title={r.name || `Маршрут ${r.number}`}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {r.number}
    </span>
  );
}

export default function StopInfoPopup({ stop, routes, routeGeometries, routingOpen, onPickFrom, onPickTo }) {
  const { t } = useLanguage();
  const passingRoutes = useMemo(() => findRoutesAtStop(stop, routes, routeGeometries), [stop, routes, routeGeometries]);
  const buses = passingRoutes.filter(r => r.type === 'bus');
  const minibuses = passingRoutes.filter(r => r.type === 'minibus');
  const stopName = stop.name || t('busmap.stopDefaultName');

  return (
    <div style={S.card}>
      <div style={S.title}>{stopName}</div>
      <div style={S.suggestRow}>✎ {t('stopPopup.suggestName') || 'Предложить народное название'}</div>

      {buses.length > 0 && (
        <div>
          <div style={S.sectionLabel}>{t('stopPopup.buses') || 'АВТОБУСЫ'}:</div>
          <div style={S.chipsRow}>{buses.map(r => <Chip key={r.id} r={r} />)}</div>
        </div>
      )}

      {minibuses.length > 0 && (
        <div>
          <div style={S.sectionLabel}>{t('stopPopup.minibuses') || 'МАРШРУТКИ'}:</div>
          <div style={S.chipsRow}>{minibuses.map(r => <Chip key={r.id} r={r} />)}</div>
        </div>
      )}

      <div style={S.sectionLabel}>{t('stopPopup.trolleybuses') || 'ТРОЛЛЕЙБУСЫ'}:</div>
      {passingRoutes.length === 0 && (
        <div style={S.emptyText}>{t('stopPopup.noRoutes') || 'Маршруты не найдены'}</div>
      )}

      <div style={S.divider} />
      <div style={S.buttonsRow}>
        <button onClick={() => onPickFrom?.(stop)} style={S.btnFrom}>
          {t('stopPopup.from') || 'Отсюда'}
        </button>
        <button onClick={() => onPickTo?.(stop)} style={S.btnTo}>
          {t('stopPopup.to') || 'Сюда'}
        </button>
      </div>
    </div>
  );
}

