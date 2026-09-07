import { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

export default function TruckSettings(){
  const [t,setT]=useState({ truck_type:'10t', length_m:6, height_m:3.5, width_m:2.5, weight_t:10, allowed_weight_t:10, axle_load_t:6, hazmat:false, explosive:false });
  useEffect(()=>{ supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('truck_settings').select('*').eq('user_id',user.id).maybeSingle().then(({data})=>{ if(data) setT(data); }); }); },[]);
  const save=async(patch)=>{ const nt={...t,...patch}; setT(nt); const {data:{user}}=await supabase.auth.getUser(); if(!user) return; const {error}=await supabase.from('truck_settings').upsert({user_id:user.id,...nt, updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error) toast.error(error.message); else { localStorage.setItem('karta_truck', JSON.stringify(nt)); toast.success('Сохранено'); } };
  const Stepper=({label, field, step=0.5, min=0})=>(
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={()=>save({[field]: Math.max(min, Number((t[field]-step).toFixed(1)))})} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 font-black">−</button>
        <span className="w-14 text-center text-sm font-bold">{t[field]}</span>
        <button onClick={()=>save({[field]: Number((t[field]+step).toFixed(1))})} className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black">+</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 pt-6 pb-24 px-4 max-w-[640px] mx-auto space-y-4">
      <h1 className="text-xl font-black flex items-center gap-2"><Truck size={20}/>Грузовик — габариты и масса</h1>
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
        <p className="text-xs font-bold text-slate-500 mb-2">Тип грузовика</p>
        <div className="flex gap-2 mb-4">{['3.5t','10t','20t'].map(x=> <button key={x} onClick={()=>save({truck_type:x})} className={`flex-1 py-2 rounded-xl font-black border ${t.truck_type===x?'bg-slate-900 text-white border-slate-900':'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>{x}</button>)}</div>
        <Stepper label="Длина, м" field="length_m" step={0.5}/>
        <Stepper label="Высота, м" field="height_m" step={0.1}/>
        <Stepper label="Ширина, м" field="width_m" step={0.1}/>
        <Stepper label="Факт. масса, т" field="weight_t" step={0.5}/>
        <Stepper label="Разреш. масса, т" field="allowed_weight_t" step={0.5}/>
        <Stepper label="Нагрузка на ось, т" field="axle_load_t" step={0.5}/>
        <label className="flex items-center justify-between py-3 text-sm font-bold">Опасный груз <input type="checkbox" checked={t.hazmat} onChange={e=>save({hazmat:e.target.checked})}/></label>
        <label className="flex items-center justify-between py-3 text-sm font-bold">Взрывоопасный <input type="checkbox" checked={t.explosive} onChange={e=>save({explosive:e.target.checked})}/></label>
        <p className="text-[11px] text-slate-500 mt-2">Учитывается при маршрутизации: мосты/тоннели/ограничения массы/ширины/осей/запреты.</p>
      </section>
    </div>
  );
}
