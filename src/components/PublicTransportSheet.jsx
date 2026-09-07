import { useState, useEffect } from 'react';
import { Bus, TrainFront, TramFront, Cable, Ship, Mountain, X } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { getCityTransportTypes } from '@/lib/RouteEngine';
import { toast } from 'sonner';

const TYPES = [
  { id:'bus', label:'Автобус', icon: Bus },
  { id:'minibus', label:'Маршрутка', icon: Bus },
  { id:'trolley', label:'Троллейбус', icon: Bus },
  { id:'tram', label:'Трамвай', icon: TramFront },
  { id:'metro', label:'Метро', icon: TrainFront },
  { id:'train', label:'Электричка', icon: TrainFront },
  { id:'funicular', label:'Фуникулёр', icon: Mountain },
  { id:'monorail', label:'Монорельс', icon: TrainFront },
  { id:'ferry', label:'Речной', icon: Ship },
  { id:'cable', label:'Канатная', icon: Cable },
  { id:'express_tram', label:'Скоростной трамвай', icon: TramFront },
  { id:'mcc', label:'МЦК', icon: TrainFront },
  { id:'mcd', label:'МЦД', icon: TrainFront },
  { id:'aeroexpress', label:'Аэроэкспресс', icon: TrainFront },
  { id:'light_metro', label:'Лёгкое метро', icon: TrainFront },
  { id:'speed_tram', label:'МетроТрам', icon: TramFront },
];

export default function PublicTransportSheet({ cityId, routes=[], onClose }){
  const [s,setS]=useState(()=>{ try{return JSON.parse(localStorage.getItem('karta_public_transport')||'null')||{remember_choice:true, combo_taxi:false, allowed_types:['bus','minibus']};}catch{return {remember_choice:true,combo_taxi:false,allowed_types:['bus','minibus']}}});
  const [cityTypes, setCityTypes]=useState([]);
  useEffect(()=> setCityTypes(getCityTransportTypes(cityId, routes)),[cityId,routes]);
  useEffect(()=>{ supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('public_transport_settings').select('*').eq('user_id',user.id).maybeSingle().then(({data})=>{ if(data){ const v={remember_choice:data.remember_choice, combo_taxi:data.combo_taxi, allowed_types:data.allowed_types}; setS(v); localStorage.setItem('karta_public_transport', JSON.stringify(v)); }})})},[]);
  const save=async(patch)=>{
    const ns={...s,...patch}; setS(ns); localStorage.setItem('karta_public_transport', JSON.stringify(ns));
    if(!ns.remember_choice) return;
    const {data:{user}}=await supabase.auth.getUser(); if(!user) return;
    await supabase.from('public_transport_settings').upsert({user_id:user.id, ...ns, updated_at:new Date().toISOString()},{onConflict:'user_id'});
    toast.success('Сохранено');
  };
  const toggleType=(id)=>{
    const cur=s.allowed_types||[];
    const next=cur.includes(id)? cur.filter(x=>x!==id) : [...cur,id];
    save({allowed_types: next});
  };
  return (
    <div className="absolute bottom-[88px] left-2 right-2 md:left-auto md:right-4 md:w-[380px] z-[620] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[70vh] overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between"><h3 className="font-black">Общественный транспорт</h3><button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><X size={14}/></button></div>
      <div className="p-4 space-y-3 overflow-y-auto">
        <label className="flex items-center justify-between text-sm font-bold">Запомнить мой выбор <input type="checkbox" checked={s.remember_choice} onChange={e=>save({remember_choice:e.target.checked})}/></label>
        <label className="flex items-center justify-between text-sm font-bold">Предлагать комбо-маршруты <input type="checkbox" checked={s.combo_taxi} onChange={e=>save({combo_taxi:e.target.checked})}/></label>
        <p className="text-[11px] text-slate-500">Маршруты с пересадкой на такси: автобус → такси → пешком</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TYPES.map(t=>{
            const active=s.allowed_types?.includes(t.id);
            const available = cityTypes.includes(t.id);
            const disabled = !available;
            return (
              <button key={t.id} disabled={disabled} onClick={()=>toggleType(t.id)} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-bold ${active?'bg-slate-900 text-white border-slate-900':'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'} ${disabled?'opacity-40 cursor-not-allowed':''}`}>
                <t.icon size={14}/> {t.label} {disabled && <span className="ml-auto text-[9px]">нет</span>}{active && !disabled && <span className="ml-auto">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
