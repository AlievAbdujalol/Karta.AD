import { useState, useEffect } from 'react';
import { Car } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

export default function VehicleSettings(){
  const [v,setV]=useState({ preferred_type:'car', plate_number:'', fuel_type:'petrol', auto_start:false, easy_routes:false, show_traffic_lights:true, green_wave_speed:50, suggest_better:true, use_sensors:true, taxi_mode:false, ads_on_stop:true });
  useEffect(()=>{ supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('vehicle_settings').select('*').eq('user_id',user.id).maybeSingle().then(({data})=>{ if(data) setV(data); }); }); },[]);
  const save=async(patch)=>{ const nv={...v,...patch}; setV(nv); const {data:{user}}=await supabase.auth.getUser(); if(!user) return; const {error}=await supabase.from('vehicle_settings').upsert({user_id:user.id,...nv, updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error) toast.error(error.message); else { localStorage.setItem('karta_vehicle', JSON.stringify(nv)); toast.success('Сохранено'); } };
  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 pt-6 pb-24 px-4 max-w-[640px] mx-auto space-y-4">
      <h1 className="text-xl font-black flex items-center gap-2"><Car size={20}/>Настройки автомобиля</h1>
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
        <label className="flex items-center justify-between text-sm">Автозапуск навигатора <input type="checkbox" checked={v.auto_start} onChange={e=>save({auto_start:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Лёгкие маршруты (без сложных развязок) <input type="checkbox" checked={v.easy_routes} onChange={e=>save({easy_routes:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Светофоры на карте <input type="checkbox" checked={v.show_traffic_lights} onChange={e=>save({show_traffic_lights:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Скорость зелёной волны <input type="number" value={v.green_wave_speed||50} onChange={e=>save({green_wave_speed:Number(e.target.value)})} className="w-20 rounded-lg border px-2 py-1 text-sm"/></label>
        <label className="flex items-center justify-between text-sm">Предлагать маршрут лучше <input type="checkbox" checked={v.suggest_better} onChange={e=>save({suggest_better:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Избегать платных дорог <input type="checkbox" checked={v.avoid_tolls??false} onChange={e=>save({avoid_tolls:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Избегать грунтовых <input type="checkbox" checked={v.avoid_unpaved??false} onChange={e=>save({avoid_unpaved:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Сенсоры если GPS ненадёжен <input type="checkbox" checked={v.use_sensors} onChange={e=>save({use_sensors:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Режим таксиста (выделенки) <input type="checkbox" checked={v.taxi_mode} onChange={e=>save({taxi_mode:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm">Реклама при остановке <input type="checkbox" checked={v.ads_on_stop} onChange={e=>save({ads_on_stop:e.target.checked})}/></label>
      </section>
    </div>
  );
}
