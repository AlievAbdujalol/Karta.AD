import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabase';

const UPDATE_INTERVAL = 10000;
const STALE_THRESHOLD = 5 * 60 * 1000;

export function useLocationSharing(userId) {
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [sharedContacts, setSharedContacts] = useState([]);
  const [contactLocations, setContactLocations] = useState([]);
  const watchIdRef = useRef(null);
  const channelRef = useRef(null);

  const loadShareSettings = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('location_shares')
      .select('id, sharer_id, shared_with_id, status')
      .or(`sharer_id.eq.${userId},shared_with_id.eq.${userId}`)
      .eq('status', 'active');
    if (data) {
      const myShares = data.filter(r => r.sharer_id === userId);
      setSharingEnabled(myShares.length > 0);
      setSharedContacts(data);
    }
  }, [userId]);

  useEffect(() => {
    loadShareSettings();
  }, [loadShareSettings]);

  useEffect(() => {
    if (!userId || !sharingEnabled) {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    // при мёртвой сети GPS шлёт апдейты постоянно — после 3 провалов молчим минуту, консоль не спамим
    let fails = 0;
    let pausedUntil = 0;
    const sendLocation = (pos) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (Date.now() < pausedUntil) return;
      supabase.from('user_locations').upsert({
        user_id: userId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading || null,
        speed: pos.coords.speed || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).then(({ error }) => {
        if (error) {
          fails += 1;
          if (fails >= 3) { pausedUntil = Date.now() + 60000; fails = 0; }
        } else {
          fails = 0;
        }
      });
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      sendLocation,
      (err) => {},
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 }
    );

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [userId, sharingEnabled]);

  // id пользователей, которые реально поделились со мной (источник правды — RPC).
  // realtime шлёт ВСЮ таблицу user_locations, поэтому чужих отбрасываем здесь.
  const allowedIdsRef = useRef(new Set());
  const reloadTimerRef = useRef(null);

  const loadContactLocations = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc('get_shared_locations');
    if (data) {
      const mine = data.filter(l => l.user_id !== userId);
      allowedIdsRef.current = new Set(mine.map(l => l.user_id));
      setContactLocations(mine);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    channelRef.current = supabase
      .channel('user_locations_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_locations',
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setContactLocations(prev => prev.filter(c => c.user_id !== payload.old.user_id));
          return;
        }
        const loc = payload.new;
        if (!loc || loc.user_id === userId) return; // себя не показываем
        if (!allowedIdsRef.current.has(loc.user_id)) {
          // чужак без шаринга — не добавляем; вдруг шаринг дали только что — перепроверяем через RPC
          clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = setTimeout(() => loadContactLocations(), 2000);
          return;
        }
        setContactLocations(prev => {
          const idx = prev.findIndex(c => c.user_id === loc.user_id);
          const updated = { ...loc };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
      })
      .subscribe();

    return () => {
      clearTimeout(reloadTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, loadContactLocations]);

  useEffect(() => {
    loadContactLocations();
  }, [loadContactLocations]);

  const shareWith = useCallback(async (contactId, minutes=60) => {
    if (!userId || !contactId) return;
    const expires = minutes ? new Date(Date.now()+minutes*60000).toISOString() : null;
    const { error } = await supabase.from('location_shares').upsert({
      sharer_id: userId,
      shared_with_id: contactId,
      status: 'active',
      expires_at: expires,
    }, { onConflict: 'sharer_id,shared_with_id' });
    if (!error) {
      setSharingEnabled(true);
      loadShareSettings();
    }
  }, [userId, loadShareSettings]);

  const unshareWith = useCallback(async (contactId) => {
    if (!userId || !contactId) return;
    const { error } = await supabase.from('location_shares')
      .delete()
      .eq('sharer_id', userId)
      .eq('shared_with_id', contactId);
    if (!error) loadShareSettings();
  }, [userId, loadShareSettings]);

  const toggleSharing = useCallback(async () => {
    if (sharingEnabled) {
      const { error } = await supabase.from('location_shares')
        .delete()
        .eq('sharer_id', userId);
      if (!error) {
        setSharingEnabled(false);
        setSharedContacts([]);
        await supabase.from('user_locations').delete().eq('user_id', userId);
      }
    } else {
      setSharingEnabled(true);
    }
  }, [userId, sharingEnabled]);

  return {
    sharingEnabled,
    sharedContacts,
    contactLocations,
    shareWith,
    unshareWith,
    toggleSharing,
    loadContactLocations,
  };
}
