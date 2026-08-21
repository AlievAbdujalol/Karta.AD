---
name: karta-ad-transport
description: >-
  This skill should be used when implementing transport domain logic including
  routes, schedules, stops, and ETA calculations in the Karta-AD project.
metadata:
  category: transport
  version: "1.0.0"
---

# Karta-AD Transport

Transport domain logic for public transport route management and scheduling.

## Core Components

### Route Entity Structure
```javascript
{
  number: string,
  name: string,
  type: 'bus' | 'minibus',
  city_id: UUID,
  color: string,
  stops: [
    { lat: number, lng: number, name: string, sequence: number }
  ],
  fare: number
}
```

### ETA Calculation Algorithm
Located in `src/utils/eta.js`:
- Calculate distance between vehicle and next stop
- Estimate time based on average speed
- Detect skipped stops and recalculate

### Schedule Management
```javascript
// Schedule entity with day-of-week patterns
{
  route_id: UUID,
  day_of_week: number, // 0=Sunday, 1=Monday, etc.
  departure_time: string, // HH:MM format
  is_active: boolean
}
```

### Stop Proximity Detection
- Distance threshold: 50 meters
- Use Haversine formula for distance calculation
- Debounce position updates to prevent flickering

### Fare Calculation
- Bus: 2.50 TJS
- Minibus: 3.00 TJS
- Configurable via database per route