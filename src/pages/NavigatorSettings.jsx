import { useState, useEffect } from 'react';
import { ArrowLeft, Check, Download, Volume2, Map, Moon, PictureInPicture } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

const AVAILABLE = [
  { id:'kamaz', label:'KAMAZ', icon:'🚚' },
  { id:'love_car', label:'Машина любви', icon:'❤️' },
  { id:'blin', label:'Блин', icon:'🥞' },
  { id:'kabrik', label:'Кабрик с Патриков', icon:'🌈', rainbow:true },
  { id:'vezdehod', label:'Вездеход', icon:'🚙', rainbow:true, hasIcon:true },
  { id:'sportcar', label:'Спорткар', icon:'🏎️', rainbow:true },
  { id:'ghost', label:'Привидение', icon:'👻' },
  { id:'monster', label:'Монстр-трак', icon:'🚜' },
];

export default function NavigatorSettings(){
  const navigate = useNavigate();
  const [tab, setTab] = useState('cursors');
  const [s, setS] = useState({ voice_enabled:true, voice_language:'ru', voice_volume:0.9, cursor_style:'classic', night_mode:'auto', pip_enabled:false, auto_scale:true, show_traffic:true, speed_alert:true });
  const [profilePhoto, setProfilePhoto] = useState(null);

  useEffect(()=>{ supabase.auth.getUser().then(({data:{user}})=>{ if(!user) return; supabase.from('profiles').select('photo_url').eq('id', user.id).maybeSingle().then(({data})=> setProfilePhoto(data?.photo_url)); supabase.from('navigation_settings').select('*').eq('user_id',user.id).maybeSingle().then(({data})=>{ if(data) setS(data); }); }); },[]);

  const save = async (patch)=>{
    const ns={...s,...patch}; setS(ns);
    const { data:{user}} = await supabase.auth.getUser(); if(!user) { localStorage.setItem('karta_nav_settings', JSON.stringify(ns)); return; }
    const { error } = await supabase.from('navigation_settings').upsert({ user_id:user.id, ...ns, updated_at:new Date().toISOString() }, {onConflict:'user_id'});
    if(error) toast.error(error.message); else { localStorage.setItem('karta_nav_settings', JSON.stringify(ns)); toast.success('Сохранено'); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f5f5f7] dark:bg-slate-950 flex flex-col">
      {/* header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 px-4 py-3">
        <button onClick={()=>navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={20} className="text-slate-800 dark:text-white" />
        </button>
        <h1 className="text-[16px] font-bold text-slate-900 dark:text-white">Кастомизация навигатора</h1>
      </div>

      {/* tabs */}
      <div className="px-4 pt-4">
        <div className="flex bg-[#e9e9eb] dark:bg-slate-800 rounded-[12px] p-1">
          <button onClick={()=>setTab('cursors')} className={`flex-1 py-2 rounded-[10px] text-[14px] font-semibold transition-all ${tab==='cursors' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Курсоры</button>
          <button onClick={()=>setTab('voices')} className={`flex-1 py-2 rounded-[10px] text-[14px] font-semibold transition-all ${tab==='voices' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}>Голоса</button>
        </div>
      </div>

      {tab==='cursors' ? (
        <div className="flex-1 px-4 pt-5 pb-24 space-y-6 overflow-y-auto">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Ваши курсоры</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Настраивайте курсор под себя — выбирайте тип навигатора и анимацию движения</p>

            <div className="mt-3 bg-white dark:bg-slate-900 rounded-[14px] overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800">
              {/* classic */}
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="w-9 h-9 flex items-center justify-center">
                  <span className="text-[26px]">🔷</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-white leading-none">Классический курсор</p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">Для всех навигаторов</p>
                  <button onClick={()=> toast.info('Настройка курсора скоро')} className="text-[12px] font-semibold text-[#0a7a3a] dark:text-emerald-400 mt-1">Настроить курсор</button>
                </div>
                {s.cursor_style==='classic' && <Check size={20} className="text-[#0a7a3a]" strokeWidth={2.5} />}
              </div>
              <div className="h-[1px] bg-slate-100 dark:bg-slate-800 mx-4" />
              {/* photo profile */}
              <div className="flex items-center gap-3 px-4 py-4">
                <img src={profilePhoto || `https://i.pravatar.cc/100?img=5`} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Фото профиля</p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-tight">Заменить курсор на аватарку и эффекты из «Друзей на карте»</p>
                </div>
                {s.cursor_style==='photo' && <Check size={20} className="text-[#0a7a3a]" strokeWidth={2.5} />}
                {s.cursor_style!=='photo' && <button onClick={()=>save({cursor_style:'photo'})} className="w-7 h-7 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-slate-300"/></button>}
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2">Доступные</h2>
            <div className="bg-white dark:bg-slate-900 rounded-[14px] overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {AVAILABLE.map(item=>(
                <button
                  key={item.id}
                  onClick={()=> save({cursor_style:item.id})}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {item.hasIcon && <span className="text-[20px]">🚙</span>}
                  <span className="flex-1 text-[14px] font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                    {item.label}
                    {item.rainbow && <span className="w-4 h-4 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 via-green-400 via-blue-500 to-purple-600 inline-block border border-white shadow-sm" />}
                  </span>
                  {s.cursor_style===item.id
                    ? <Check size={18} className="text-[#0a7a3a]" strokeWidth={2.5} />
                    : <Download size={18} className="text-[#0a7a3a]" />
                  }
                </button>
              ))}
            </div>
          </div>

          {/* extra settings kept but collapsed under */}
          <div className="bg-white dark:bg-slate-900 rounded-[14px] p-4 border border-slate-100 dark:border-slate-800 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Map size={14}/>Дополнительно</h3>
            <label className="flex items-center justify-between text-sm">Авто-масштаб <input type="checkbox" checked={s.auto_scale} onChange={e=>save({auto_scale:e.target.checked})} /></label>
            <label className="flex items-center justify-between text-sm">Пробки <input type="checkbox" checked={s.show_traffic} onChange={e=>save({show_traffic:e.target.checked})} /></label>
            <div className="flex items-center gap-2 text-sm"><Moon size={14}/>Ночной режим
              <select value={s.night_mode} onChange={e=>save({night_mode:e.target.value})} className="ml-auto rounded-xl border px-2 py-1 text-xs bg-white dark:bg-slate-800">
                <option value="auto">Автоматически</option><option value="system">Как в системе</option><option value="on">Включён</option><option value="off">Выключен</option>
              </select>
            </div>
            <label className="flex items-center justify-between text-sm"><span className="flex items-center gap-1"><PictureInPicture size={14}/>Картинка-в-картинке</span> <input type="checkbox" checked={s.pip_enabled} onChange={e=>save({pip_enabled:e.target.checked})} /></label>
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 pt-6 pb-24 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-[14px] p-4 border">
            <h3 className="font-bold flex items-center gap-2"><Volume2 size={16}/>Голоса</h3>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm">Включён</span>
              <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={s.voice_enabled} onChange={e=>save({voice_enabled:e.target.checked})} className="sr-only peer"/><div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 relative"/></label>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs">Язык</span>
              <select value={s.voice_language} onChange={e=>save({voice_language:e.target.value})} className="rounded-xl border px-2 py-1 text-xs bg-white dark:bg-slate-800">
                <option value="ru">Русский</option><option value="tg">Таджикский</option><option value="en">English</option>
              </select>
              <input type="range" min="0" max="1" step="0.1" value={s.voice_volume} onChange={e=>save({voice_volume: Number(e.target.value)})} className="flex-1 ml-2"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
