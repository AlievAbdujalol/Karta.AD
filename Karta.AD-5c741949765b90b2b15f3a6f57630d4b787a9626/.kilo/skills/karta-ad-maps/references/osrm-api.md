# OSRM API Integration Reference

Open Source Routing Machine for route calculation and ETA.

## Public OSRM Server
```
https://router.project-osrm.org
```

## Route Calculation

### Simple Route
```
GET /route/v1/driving/{coordinates}
```

### Parameters
- `geometries=geojson` - Return GeoJSON geometry
- `steps=true` - Include turn-by-turn instructions
- `overview=full` - Include full route geometry
- `annotations=duration,distance` - Include timing info

### Example Request
```javascript
const coordinates = [
  [68.773, 38.559], // lng, lat of stop 1
  [68.781, 38.562], // lng, lat of stop 2
  [68.790, 38.555]  // lng, lat of stop 3
].map(c => `${c[0]},${c[1]}`).join(';');

const response = await fetch(
  `https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&steps=true`
);
const data = await response.json();
```

### Response Structure
```javascript
{
  routes: [{
    weight: 450.5,
    duration: 320, // seconds
    distance: 2500, // meters
    geometry: { type: 'LineString', coordinates: [...] }
  }]
}
```

## Nearest Point

### Find nearest road
```
GET /nearest/v1/driving/{lng},{lat}
```

### Example
```javascript
const { lng, lat } = vehiclePosition;
const nearest = await fetch(
  `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`
);
```

## Trip Calculation

For calculating trip duration with waypoints:
```javascript
const tripUrl = `https://router.project-osrm.org/trip/v1/driving/${coordinates}?source=first&destination=last`;
```