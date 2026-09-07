import { useState } from 'react';
import { Share2, Radio, X, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ShareRouteSheet({ from, to, route, onClose }) {
  const [copied, setCopied] = useState(false);
  const buildUrl = () => {
    const p = { from: from?{lat:from.lat,lng:from.lng,name:from.shortName||from.name}:null, to: to?{lat:to.lat,lng:to.lng,name:to.shortName||to.name}:null, dist: route?.distance, dur: route?.duration };
    return `${window.location.origin}${window.location.pathname}#route=${encodeURIComponent(JSON.stringify(p))}`;
  };
  const share = async () => {
    const url = buildUrl();
    try {
      if (navigator.share) await navigator.share({ title: 'Маршрут Karta-AD', text: `${from?.shortName||'Откуда'} → ${to?.shortName||'Куда'}`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(()=>setCopied(false),2000); toast.success('Ссылка скопирована'); }
    } catch { await navigator.clipboard.writeText(url); toast.success('Ссылка скопирована'); }
  };
  const broadcast = async () => {
    if (!navigator.geolocation) return toast.error('Геолокация недоступна');
    navigator.geolocation.getCurrentPosition(async (pos)=>{
      const url = `${window.location.origin}/live/${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
      try { if(navigator.share) await navigator.share({title:'Моя геопозиция', url}); else {await navigator.clipboard.writeText(url); toast.success('Ссылка скопирована');}} catch {}
    });
  };
  if (!from && !to) return null;
  return (
    <div className="absolute bottom-[88px] left-2 right-2 md:left-auto md:right-4 md:w-[360px] z-[600] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-black text-sm">Поделиться маршрутом</h3><button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><X size={14}/></button></div>
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"/> {from?.shortName||from?.name||'Моё местоположение'}</div>
        <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-600 ml-1"/>
        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"/> {to?.shortName||to?.name||'Место на карте'}</div>
        {route && <div className="text-[11px] text-slate-500">{Math.round(route.distance/1000*10)/10} км · {Math.round(route.duration/60)} мин</div>}
      </div>
      <button onClick={share} className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2">{copied?<Check size={16}/>:<Share2 size={16}/>} {copied?'Скопировано':'Поделиться маршрутом'}</button>
      <button onClick={broadcast} className="w-full py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-sm flex items-center justify-center gap-2"><Radio size={16}/>Транслировать геопозицию</button>
    </div>
  );
}
