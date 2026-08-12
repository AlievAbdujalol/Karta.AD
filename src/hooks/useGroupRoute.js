import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/api/supabase';

export function useGroupRoute(userId) {
  const [groupRoute, setGroupRoute] = useState(null);
  const [members, setMembers] = useState([]);
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const watchIdRef = useRef(null);
  const channelRef = useRef(null);

  const loadGroup = useCallback(async () => {
    if (!userId) return;
    const { data: membership } = await supabase
      .from('group_route_members')
      .select('group_route_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) { setGroupRoute(null); setMembers([]); return; }

    const { data: group } = await supabase
      .from('group_routes')
      .select('*')
      .eq('id', membership.group_route_id)
      .maybeSingle();

    if (group && group.status === 'active') {
      setGroupRoute(group);
      const { data: mbrs } = await supabase
        .from('group_route_members')
        .select('*')
        .eq('group_route_id', group.id);
      if (mbrs) setMembers(mbrs);
    } else {
      setGroupRoute(null);
      setMembers([]);
    }
  }, [userId]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  useEffect(() => {
    if (!userId) return;
    channelRef.current = supabase
      .channel('group_route_members_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_route_members',
      }, () => { loadGroup(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_routes',
      }, () => { loadGroup(); })
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [userId, loadGroup]);

  useEffect(() => {
    if (!userId || !groupRoute || !sharingEnabled) {
      if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        supabase.from('group_route_members').update({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
        }).eq('group_route_id', groupRoute.id).eq('user_id', userId);
      },
      (err) => console.error('[GroupRoute] watch error:', err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
    );
    return () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [userId, groupRoute, sharingEnabled]);

  const createGroup = useCallback(async (routeData) => {
    if (!userId) return null;
    const { data: group, error: gErr } = await supabase.from('group_routes').insert({
      creator_id: userId,
      route_id: routeData.routeId || null,
      from_name: routeData.fromName,
      from_lat: routeData.fromLat,
      from_lng: routeData.fromLng,
      to_name: routeData.toName,
      to_lat: routeData.toLat,
      to_lng: routeData.toLng,
    }).select().maybeSingle();
    if (gErr || !group) return null;

    await supabase.from('group_route_members').insert({
      group_route_id: group.id,
      user_id: userId,
      role: 'creator',
    });
    setGroupRoute(group);
    loadGroup();
    return group;
  }, [userId, loadGroup]);

  const joinGroup = useCallback(async (groupId) => {
    if (!userId || !groupId) return;
    await supabase.from('group_route_members').upsert({
      group_route_id: groupId,
      user_id: userId,
      role: 'member',
    }, { onConflict: 'group_route_id,user_id' });
    loadGroup();
  }, [userId, loadGroup]);

  const leaveGroup = useCallback(async () => {
    if (!userId || !groupRoute) return;
    await supabase.from('group_route_members')
      .delete()
      .eq('group_route_id', groupRoute.id)
      .eq('user_id', userId);
    setGroupRoute(null);
    setMembers([]);
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, [userId, groupRoute]);

  const finishGroup = useCallback(async () => {
    if (!userId || !groupRoute) return;
    await supabase.from('group_routes').update({ status: 'finished' }).eq('id', groupRoute.id);
    setGroupRoute(null);
    setMembers([]);
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, [userId, groupRoute]);

  const toggleSharing = useCallback(() => setSharingEnabled(p => !p), []);

  const onlineMembers = members.filter(m => m.lat && m.lng && m.sharing_enabled);

  return {
    groupRoute,
    members,
    onlineMembers,
    sharingEnabled,
    createGroup,
    joinGroup,
    leaveGroup,
    finishGroup,
    toggleSharing,
    loadGroup,
  };
}
