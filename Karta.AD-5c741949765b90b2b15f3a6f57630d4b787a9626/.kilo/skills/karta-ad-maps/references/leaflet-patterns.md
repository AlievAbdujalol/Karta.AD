# Leaflet Integration Patterns

React-Leaflet component patterns for Karta-AD map visualization.

## MapContainer Setup
```jsx
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [38.559, 68.773]; // [lat, lng]

<MapContainer
  center={center || DEFAULT_CENTER}
  zoom={13}
  style={{ height: '100%', width: '100%' }}
  zoomControl={false}
>
  <TileLayer
    attribution=""
    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
  />
</MapContainer>
```

## Custom Icons

### Bus Vehicle Icon
```javascript
const createBusIcon = (routeNumber, type) => {
  const color = type === 'minibus' ? '#2e7d32' : '#1565c0';
  return L.divIcon({
    html: `<div class="bus-marker" style="background:${color};...">
      <span>#${routeNumber}</span>
    </div>`,
    className: '',
    iconSize: [46, 50],
    iconAnchor: [23, 50]
  });
};
```

## Position Animation
```javascript
const usePositionAnimation = (targetPosition) => {
  const [pos, setPos] = useState(targetPosition);
  useEffect(() => {
    // Animate over 4 seconds using requestAnimationFrame
  }, [targetPosition]);
  return pos;
};
```

## Stop Detection
```javascript
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  // Haversine formula
};
```