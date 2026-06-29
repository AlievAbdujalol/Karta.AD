---
name: karta-ad-realtime
description: >-
  This skill should be used when implementing real-time subscriptions,
  WebSocket connections, and live data updates in the Karta-AD project.
metadata:
  category: realtime
  version: "1.0.0"
---

# Karta-AD Realtime

Supabase Realtime subscriptions for live vehicle tracking and notifications.

## Realtime Channels

### Vehicle Position Tracking
```javascript
const useVehicleSubscription = (onUpdate) => {
  const channel = supabase
    .channel('vehicles-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles',
        filter: 'is_active=eq.true'
      },
      payload => onUpdate(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
};
```

### Notification System
```javascript
const useNotificationSubscription = (userId) => {
  const channel = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      handleNotification
    )
    .subscribe();
};
```

## Subscription Management

### Throttle Strategy
- Position updates: 500ms debounce
- Animation: Smooth transition over 4 seconds
- Batch updates for multiple vehicles

### Connection Recovery
```javascript
const reconnectPolicy = {
  maxRetries: 5,
  backoff: 'exponential',
  initialDelay: 1000,
  maxDelay: 30000
};
```

### Channel Best Practices
- Use unique channel names per component
- Clean up subscriptions on unmount
- Handle connection status changes
- Implement exponential backoff for reconnects