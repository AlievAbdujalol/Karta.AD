import { useState } from 'react';
import { MapPin, Star, Navigation, Heart, Share2, Download, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';
import { useLanguage } from '@/lib/useLanguage';
import { haversineM } from '@/lib/geo';

export default function PlaceCard({ place, onClose, onRoute, onFlyTo, userPos }) {
  const { t } = useLanguage();
  const [saved, setSaved] = useState(false);
  if (!place) return null;
  const dist = userPos ? Math.round(haversineM(userPos[0], userPos[1], place.lat, place.lng)) : null;
  const share = async () => {
    const url = `${window.location.origin}/?lat=${place.lat}&lng=${place.lng}&name=${encodeURIComponent(place.name||'')}`;
    try { if (navigator.share) await navigator.share({ title: place.name, url }); else await navigator.clipboard.writeText(url); toast.success('Ссылка скопирована'); } catch {}
  };
  const savePlace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Войдите'); return; }
      await supabase.from('saved_places').insert({ user_id: user.id, name: place.name||'Место', address: place.display_name||'', lat: place.lat, lng: place.lng, category: 'favorite' });
      setSaved(true); toast.success('Сохранено в избранное');
    } catch (e) { toast.error('Ошибка сохранения'); }
  };
  const report = async () => {
    try { const { data:{user}} = await supabase.auth.getUser(); if(!user) return toast.error('Войдите');
      await supabase.from('reports').insert({ reporter_id: user.id, type: 'map_error', description: `Ошибка данных: ${place.name} ${place.lat},${place.lng}` }); toast.success('Сообщение отправлено');
    } catch {}
  };
  return (
    <div className="absolute bottom-[88px] left-2 right-2 md:left-auto md:right-4 md:w-[360px] z-[600] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="h-28 bg-gradient-to-br from-emerald-500 to-teal-600 relative">
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"><X size={14}/></button>
        <div className="absolute -bottom-6 left-4 w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow flex items-center justify-center text-emerald-600"><MapPin size={20}/></div>
      </div>
      <div className="pt-8 px-4 pb-4 space-y-3">
        <div>
          <h3 className="font-black text-[15px] text-slate-900 dark:text-white leading-tight">{place.name || place.shortName || 'Место'}</h3>
          <p className="text-[11px] text-slate-500 line-clamp-2">{place.display_name || ''}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
            {place.type && <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{place.type}</span>}
            {dist!=null && <span className="flex items-center gap-1"><Navigation size={10}/>{dist<1000?dist+' м':(dist/1000).toFixed(1)+' км'}</span>}
            {place.lat && <span className="font-mono text-[10px]">{place.lat.toFixed(5)}, {place.lng.toFixed(5)}</span>}
          </div>
        </div>
        {place.rating && (
          <div className="flex items-center gap-1 text-amber-500 text-xs"><Star size={12} fill="currentColor"/>{place.rating} <span className="text-slate-400">({place.reviews||0})</span></div>
        )}
        <div className="grid grid-cols-4 gap-2">
          <button onClick={()=>onRoute?.(place)} className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-emerald-600 text-white text-[11px] font-bold"><Navigation size={16}/>Маршрут</button>
          <button onClick={savePlace} className={`flex flex-col items-center gap-1 py-2 rounded-2xl border text-[11px] font-bold ${saved?'bg-rose-50 border-rose-200 text-rose-600':'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}><Heart size={16} fill={saved?'currentColor':'none'}/>Избранное</button>
          <button onClick={share} className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"><Share2 size={16}/>Поделиться</button>
          <button onClick={()=>onFlyTo?.(place)} className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"><Download size={16}/>Скачать</button>
        </div>
        <button onClick={report} className="w-full py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1.5"><AlertTriangle size={12}/>Сообщить об ошибке — не хватает данных</button>
      </div>
    </div>
  );
}
