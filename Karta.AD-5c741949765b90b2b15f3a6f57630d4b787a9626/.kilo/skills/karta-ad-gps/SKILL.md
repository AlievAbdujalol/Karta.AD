---
name: karta-ad-gps
description: >-
  This skill should be used when implementing GPS tracking, geolocation features,
  and real-time position updates in the Karta-AD project.
metadata:
  category: geolocation
  version: "1.0.0"
---

# Karta-AD GPS Tracking

Real-time GPS tracking and geolocation integration for vehicle positions.

## Core Components

### Geolocation API Integration
```javascript
const getCurrentPosition = (options = { enableHighAccuracy: true, timeout: 5000 }) => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve([pos.coords.latitude, pos.coords.longitude]),
      err => reject(err),
      options
    );
  });
};
```

### Position Accuracy Tolerance
- GPS accuracy threshold: 10 meters
- Position debounce: 2 seconds
- Speed threshold for active/inactive: 0.5 km/h

### Vehicle Position Update Flow
1. Driver app sends position every 5-10 seconds
2. Supabase triggers `update_vehicle_position` function
3. Realtime channel broadcasts update to all subscribers
4. Client animates marker to new position

### Location Permissions
```javascript
// Check and request location permission
const checkLocationPermission = async () => {
  if (!navigator.permissions) return 'unknown';
  const permission = await navigator.permissions.query({ name: 'geolocation' });
  return permission.state;
};
```

### Accuracy Handling
- Filter out positions with accuracy > 50 meters
- Smooth position changes with animation
- Cache last known position for offline display