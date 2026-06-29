---
name: karta-ad-maps
description: >-
  This skill should be used when implementing or working with OpenStreetMap,
  Leaflet mapping components, and OSRM route planning in the Karta-AD project.
metadata:
  category: mapping
  version: "1.0.0"
---

# Karta-AD Maps

Mapping integration for public transport visualization with OpenStreetMap and Leaflet.

## Core Components

### Map Initialization
```javascript
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_DEFAULT_MAP_CENTER_LAT || 38.559),
  Number(import.meta.env.VITE_DEFAULT_MAP_CENTER_LNG || 68.773)
];

const TILE_LAYERS = [
  { label: 'Standard', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
  { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' }
];
```

### OSRM Route Planning
```javascript
const fetchRoute = async (coordinates) => {
  const OSRM_URL = import.meta.env.OSRM_URL || 'https://router.project-osrm.org';
  const coordString = coordinates.map(c => `${c[1]},${c[0]}`).join(';');
  const response = await fetch(
    `${OSRM_URL}/route/v1/driving/${coordString}?geometries=geojson&steps=true`
  );
  return response.json();
};
```

### Stop Marker Creation
```javascript
const createStopIcon = (isFirst, isLast, isWatched, index, total) => {
  const color = isWatched ? '#FF6D00' : isFirst ? '#2e7d32' : isLast ? '#c62828' : '#1565C0';
  const size = isWatched ? 20 : (isFirst || isLast) ? 16 : 11;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};..."></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};
```

### Vehicle Animation
Use `AnimatedVehicleMarker` pattern for smooth position transitions with requestAnimationFrame.