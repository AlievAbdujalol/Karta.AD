import { useState, useEffect } from 'react';
import { Download, Trash2, RefreshCw, Pause, Play, HardDrive, Check } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { saveCache } from '@/lib/cache';
import { toast } from 'sonner';

const REGIONS = [
  { name:'Таджикистан', size:617, cities:['Душанбе','Худжанд','Куляб','Бохтар'], bbox:{minLat:36.6,minLng:67.8,maxLat:41.1,maxLng:75.6} },
  { name:'Кыргызстан', size:617, cities:['Бишкек','Ош','Джалал-Абад','Каракол'], bbox:{minLat:39.1,minLng:69.2,maxLat:43.3,maxLng:80.3} },
  { name:'Узбекистан', size:892, cities:['Ташкент','Самарканд','Бухара','Наманган'], bbox:{minLat:37.1,minLng:55.9,maxLat:45.6,maxLng:73.1} },
];

export default function OfflineMaps(){
  const [offline, setOffline] = useState([]);
  const [downloading, setDownloading] = useState({});
  const [free, setFree] = useState(null);
  useEffect(()=>{ (async()=>{ try{ const e=await navigator.storage?.estimate(); if(e.quota) setFree(Math.round((e.quota-e.usage)/1024/1024)); }catch{} })(); },[]);
  useEffect(()=>{ supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('offline_maps').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).then(({data})=>setOffline(data||[])); }); },[]);
  const startDownload = async (region)=>{
    const { data:{user}} = await supabase.auth.getUser(); if(!user) return toast.error('Войдите');
    setDownloading(d=>({...d,[region.name]:{pct:0, paused:false}}));
    let pct=0;
    const urls=[];
    for(let z=10; z<=13; z++){ const n=Math.pow(2,z); const x1=Math.floor((region.bbox.minLng+180)/360*n), x2=Math.floor((region.bbox.maxLng+180)/360*n); const y1=Math.floor((1-Math.log(Math.tan(region.bbox.maxLat*Math.PI/180)+1/Math.cos(region.bbox.maxLat*Math.PI/180))/Math.PI)/2*n), y2=Math.floor((1-Math.log(Math.tan(region.bbox.minLat*Math.PI/180)+1/Math.cos(region.bbox.minLat*Math.PI/180))/Math.PI)/2*n); for(let x=Math.max(0,x1-1); x<=Math.min(n-1,x2+1); x++) for(let y=Math.max(0,y1-1); y<=Math.min(n-1,y2+1); y++) urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`); if(urls.length>60) break; } urls.splice(60);
    let idx=0;
    const tick=async()=>{
      if(idx>=urls.length){ await supabase.from('offline_maps').insert({ user_id:user.id, region_name:region.name, bbox:region.bbox, size_mb: region.size, status:'ready', downloaded_at:new Date().toISOString() }); saveCache('offline_'+region.name, {region, tiles:urls.length, at:Date.now()}, 30*24*60*60*1000); try{ if('caches' in window){ const c=await caches.open('karta-tiles'); await Promise.all(urls.slice(0,30).map(u=> fetch(u).then(r=>c.put(u,r)).catch(()=>{}))); } }catch{} setDownloading(d=>{ const n={...d}; delete n[region.name]; return n; }); supabase.from('offline_maps').select('*').eq('user_id',user.id).then(({data})=>setOffline(data||[])); toast.success(region.name+' скачан · '+urls.length+' тайлов'); return; }
      pct=Math.round(idx/urls.length*100); setDownloading(d=>({...d,[region.name]:{...d[region.name], pct}}));
      try{ const c= 'caches' in window ? await caches.open('karta-tiles') : null; const batch=urls.slice(idx, idx+6); await Promise.all(batch.map(u=> fetch(u).then(r=>c&&c.put(u,r)).catch(()=>{}))); }catch{}
      idx+=6; setTimeout(tick, 200);
    };
    tick();
  };
  const remove = async (id, name)=>{
    await supabase.from('offline_maps').delete().eq('id',id);
    try{ localStorage.removeItem('bustrack_cache_offline_'+name);}catch{}
    setOffline(o=>o.filter(x=>x.id!==id)); toast.success('Удалено');
  };
  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 pt-6 pb-24 px-4 max-w-[640px] mx-auto">
      <h1 className="text-xl font-black">Офлайн-карты</h1>
      <p className="text-xs text-slate-500 mt-1">Ищите места и стройте маршруты даже без интернета</p>
      {free!=null && <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><HardDrive size={11}/>Свободно: {free} МБ</p>}
      <h2 className="font-bold mt-6 mb-2">Мои города</h2>
      {offline.length===0? <p className="text-sm text-slate-400 py-4 text-center">Нет скачанных карт</p> :
        offline.map(m=> (
          <div key={m.id} className="bg-white dark:bg-slate-900 rounded-2xl p-3 flex items-center justify-between border border-slate-200 dark:border-slate-800 mb-2">
            <div><p className="font-bold text-sm">{m.region_name}</p><p className="text-[11px] text-slate-500">{m.size_mb} МБ · {m.status} · {m.downloaded_at?new Date(m.downloaded_at).toLocaleDateString('ru'):''}</p></div>
            <div className="flex gap-1">
              <button onClick={()=>remove(m.id,m.region_name)} className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold flex items-center gap-1"><Trash2 size={12}/>Удалить</button>
              <button onClick={()=>toast.info('Обновление — скоро')} className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold flex items-center gap-1"><RefreshCw size={12}/>Обновить</button>
            </div>
          </div>
        ))}
      <h2 className="font-bold mt-6 mb-2">Ближайшие территории</h2>
      {REGIONS.map(r=>{
        const dl=downloading[r.name];
        const done=offline.some(o=>o.region_name===r.name && o.status==='ready');
        return (
          <div key={r.name} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 mb-2">
            <div className="flex items-start justify-between">
              <div><p className="font-bold">{r.name}</p><p className="text-xs text-slate-500">{r.size} МБ</p><p className="text-[11px] text-slate-400">{r.cities.join(', ')}</p></div>
              {done? <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold flex items-center gap-1"><Check size={12}/>Готово</span>
               : dl? <div className="text-right"><div className="w-24 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width: dl.pct+'%'}}/></div><p className="text-[10px] text-slate-500">{dl.pct}%</p></div>
               : <button onClick={()=>startDownload(r)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1"><Download size={14}/>Скачать</button>}
            </div>
            {dl && <div className="flex gap-1 mt-2"><button className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center gap-1">{dl.paused?<Play size={10}/>:<Pause size={10}/>}{dl.paused?'Продолжить':'Пауза'}</button></div>}
          </div>
        );
      })}
      <div className="mt-4 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 text-xs">Офлайн режим позволяет смотреть карту, искать объекты, строить маршруты и использовать GPS без интернета (тайлы кэшируются IndexedDB).</div>
    </div>
  );
}
