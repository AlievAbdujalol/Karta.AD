import { buildOsrmRoute } from '@/lib/osrmClient';
import { findTransitRoutes } from '@/lib/transitRouter';

export const ROUTE_MODES = ['car','taxi','public_transport','walking','bicycle','scooter','truck'];

export class RouteEngine {
  constructor({ supabase } = {}) { this.supabase = supabase; }
  profileFor(mode){
    if(mode==='car'||mode==='taxi'||mode==='truck') return 'driving';
    if(mode==='walking') return 'walking';
    if(mode==='bicycle'||mode==='scooter') return 'cycling';
    return null;
  }
  getAvoid(){
    try{ const s=JSON.parse(localStorage.getItem('karta_nav_settings')||'{}'); const v=JSON.parse(localStorage.getItem('karta_vehicle')||'{}'); const ex=[]; if(s.avoid_tolls||v.avoid_tolls) ex.push('toll'); if(s.avoid_unpaved||v.avoid_unpaved) ex.push('unpaved'); return ex.join(',')||null; }catch{return null}
  }
  getTruckParams(){
    try{ const t=JSON.parse(localStorage.getItem('karta_truck')||'{}'); if(!t) return null; return { weight: t.weight_t, height: t.height_m, width: t.width_m }; }catch{return null}
  }
  async build({ from, to, waypoints=[], mode='car' }){
    if(mode==='public_transport') return null;
    const profile = this.profileFor(mode);
    const avoid = this.getAvoid();
    const truckParams = mode==='truck' ? this.getTruckParams() : null;
    return buildOsrmRoute(from, to, profile, { waypoints, alternatives:true, exclude: avoid, truckParams });
  }
  async buildTransit(from,to,routes,opts={}){
    return findTransitRoutes(from,to,routes, opts.typeFilter||null);
  }
  async logHistory(userId, route, meta){
    if(!userId || !route) return;
    try{ await this.supabase?.from('route_history').insert({ user_id:userId, start_lat: meta?.from?.lat, start_lng: meta?.from?.lng, end_lat: meta?.to?.lat, end_lng: meta?.to?.lng, distance_km: (route.distance||0)/1000, duration_min: (route.duration||0)/60, polyline: route.geometry||route.polyline, transport_mode: meta?.mode||'driving' }); }catch{}
  }
}

export function getCityTransportTypes(cityId, routes){
  const set = new Set(routes.filter(r=> !cityId || r.city_id===cityId).map(r=>r.type).filter(Boolean));
  return Array.from(set);
}
