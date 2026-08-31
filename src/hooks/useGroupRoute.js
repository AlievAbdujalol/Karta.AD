import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/api/supabase';

// Haversine расстояние в метрах
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Средняя точка между всеми участниками с координатами
function calcMeetPoint(members) {
  const valid = members.filter((m) => m.lat && m.lng);
  if (!valid.length) return null;
  const lat = valid.reduce((s, m) => s + m.lat, 0) / valid.length;
  const lng = valid.reduce((s, m) => s + m.lng, 0) / valid.length;
  return { lat, lng };
}

// ETA в секундах: расстояние / скорость (по умолчанию 5 км/ч пешком)
function calcEtaSec(distM, speedKmh = 5) {
  return distM / ((speedKmh * 1000) / 3600);
}

// Статус участника по времени последнего обновления и скорости
function getMemberStatus(member) {
  if (!member.lat || !member.lng) return 'offline';
  if (!member.updated_at) return 'online';
  const ago = Date.now() - new Date(member.updated_at).getTime();
  if (ago > 5 * 60 * 1000) return 'offline';
  if (member.speed && member.speed > 1) return 'moving';
  return 'online';
}

export function useGroupRoute(userId) {
  const [groupRoute, setGroupRoute] = useState(null);
  const [members, setMembers] = useState([]);
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [myPosition, setMyPosition] = useState(null);
  const watchIdRef = useRef(null);
  const channelRef = useRef(null);
  const posChannelRef = useRef(null);

  // Загрузка группы и участников
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
        .select('*, profiles:user_id(full_name, photo_url)')
        .eq('group_route_id', group.id);
      if (mbrs) setMembers(mbrs.map(m => ({ ...m, full_name: m.profiles?.full_name, photo_url: m.profiles?.photo_url })));
    } else {
      setGroupRoute(null);
      setMembers([]);
    }
  }, [userId]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  // Real-time подписка на изменения группы
  useEffect(() => {
    if (!userId) return;
    channelRef.current = supabase
      .channel('group_route_changes_' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_route_members' }, () => loadGroup())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_routes' }, () => loadGroup())
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [userId, loadGroup]);

  // Real-time инкрементальное обновление позиций участников
  useEffect(() => {
    if (!userId || !groupRoute) return;
    posChannelRef.current = supabase
      .channel('group_positions_' + groupRoute.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'group_route_members',
        filter: `group_route_id=eq.${groupRoute.id}`,
      }, (payload) => {
        if (!payload.new) return;
        setMembers(prev => prev.map(m =>
          m.user_id === payload.new.user_id
            ? { ...m, lat: payload.new.lat, lng: payload.new.lng, heading: payload.new.heading, speed: payload.new.speed, updated_at: payload.new.updated_at }
            : m
        ));
      })
      .subscribe();
    return () => { if (posChannelRef.current) supabase.removeChannel(posChannelRef.current); };
  }, [userId, groupRoute?.id]);

  // watchPosition — отправляем свою позицию в группу
  useEffect(() => {
    if (!userId || !groupRoute || !sharingEnabled) {
      if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
        setMyPosition([lat, lng]);
        supabase.from('group_route_members').update({
          lat, lng,
          heading: heading || null,
          speed: speed || null,
          updated_at: new Date().toISOString(),
        }).eq('group_route_id', groupRoute.id).eq('user_id', userId);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    return () => { if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; } };
  }, [userId, groupRoute?.id, sharingEnabled]);

  // Производные данные
  const membersWithStatus = useMemo(() =>
    members.map(m => ({
      ...m,
      status: getMemberStatus(m),
      distFromMe: myPosition && m.lat && m.lng && m.user_id !== userId
        ? haversineM(myPosition[0], myPosition[1], m.lat, m.lng)
        : null,
      etaSec: myPosition && m.lat && m.lng && m.user_id !== userId
        ? calcEtaSec(haversineM(myPosition[0], myPosition[1], m.lat, m.lng))
        : null,
    })),
  [members, myPosition, userId]);

  const onlineMembers = useMemo(() =>
    membersWithStatus.filter(m => m.status !== 'offline' && m.lat && m.lng),
  [membersWithStatus]);

  const meetPoint = useMemo(() => calcMeetPoint(onlineMembers), [onlineMembers]);

  // Создание группы
  const createGroup = useCallback(async (routeData = {}) => {
    if (!userId) return null;
    const { data: group, error } = await supabase.from('group_routes').insert({
      creator_id: userId,
      route_id: routeData.routeId || null,
      from_name: routeData.fromName || 'Текущее положение',
      from_lat: routeData.fromLat || null,
      from_lng: routeData.fromLng || null,
      to_name: routeData.toName || 'Встреча',
      to_lat: routeData.toLat || null,
      to_lng: routeData.toLng || null,
    }).select().maybeSingle();
    if (error || !group) return null;
    await supabase.from('group_route_members').insert({ group_route_id: group.id, user_id: userId, role: 'creator' });
    setGroupRoute(group);
    return group;
  }, [userId]);

  // Создать группу и сразу пригласить контакта
  const createGroupAndInvite = useCallback(async (contactId, routeData = {}) => {
    const group = await createGroup(routeData);
    if (!group) return null;
    // Создаём запись для контакта (ждёт подтверждения)
    await supabase.from('group_route_members').upsert({
      group_route_id: group.id,
      user_id: contactId,
      role: 'member',
      invited: true,
    }, { onConflict: 'group_route_id,user_id' });
    return group;
  }, [createGroup]);

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
    await supabase.from('group_route_members').delete()
      .eq('group_route_id', groupRoute.id).eq('user_id', userId);
    setGroupRoute(null); setMembers([]);
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, [userId, groupRoute]);

  const finishGroup = useCallback(async () => {
    if (!userId || !groupRoute) return;
    await supabase.from('group_routes').update({ status: 'finished' }).eq('id', groupRoute.id);
    setGroupRoute(null); setMembers([]);
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  }, [userId, groupRoute]);

  const toggleSharing = useCallback(() => setSharingEnabled(p => !p), []);

  // Установить точку встречи вручную
  const setMeetTarget = useCallback(async (lat, lng, name) => {
    if (!groupRoute) return;
    await supabase.from('group_routes').update({ to_lat: lat, to_lng: lng, to_name: name || 'Точка встречи' }).eq('id', groupRoute.id);
    setGroupRoute(prev => prev ? { ...prev, to_lat: lat, to_lng: lng, to_name: name || 'Точка встречи' } : prev);
  }, [groupRoute]);

  return {
    groupRoute,
    members: membersWithStatus,
    onlineMembers,
    sharingEnabled,
    myPosition,
    meetPoint,
    createGroup,
    createGroupAndInvite,
    joinGroup,
    leaveGroup,
    finishGroup,
    toggleSharing,
    setMeetTarget,
    loadGroup,
    haversineM,
  };
}
