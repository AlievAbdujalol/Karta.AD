import { useState, useRef } from 'react';
import { Construction, Camera, MessageSquare, AlertTriangle, Ban, Mic, ImagePlus, X, ArrowUp, ArrowDown, Calendar, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

const CATS = [
  { id: 'roadwork', label: 'Ремонт', shortLabel: 'Ремонт', icon: Construction, color: '#ef4444', desc: 'Дорожные работы' },
  { id: 'camera', label: 'Камера', shortLabel: 'Камера', icon: Camera, color: '#ef4444', desc: 'Камера контроля' },
  { id: 'other', label: 'Другое', shortLabel: 'Другое', icon: MessageSquare, color: '#9ca3af', desc: 'Другая причина' },
  { id: 'hazard', label: 'Опасность', shortLabel: 'Опасность', icon: AlertTriangle, color: '#ef4444', desc: 'Опасный участок' },
  { id: 'closure', label: 'Перекрытие', shortLabel: 'Перекрытие', icon: Ban, color: '#e10600', desc: 'Дорога перекрыта' },
];

const DESCS = {
  roadwork: 'Дорожные работы',
  camera: 'Камера контроля скорости',
  other: 'Другая причина',
  hazard: 'Опасный участок',
  closure: 'Дорога перекрыта',
};

export const EVENT_CATEGORIES = [
  ...CATS.map(c=>({ id:c.id, label:c.shortLabel, icon:c.icon, color:c.color })),
  { id:'accident', label:'ДТП', icon: AlertTriangle, color:'#ef4444' },
  { id:'traffic', label:'Пробка', icon: AlertTriangle, color:'#a855f7' },
];

export default function MapEventsSheet({ center, onClose, onPickHint, eventLine=[], roadDir=0, onDirChange, onClearLine, onTypeChange }) {
  const [type, setType] = useState('closure');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const active = CATS.find(c=>c.id===type) || CATS[4];
  const coords = center ? `${Array.isArray(center)?center[0].toFixed(4):center.lat?.toFixed(4)}, ${Array.isArray(center)?center[1].toFixed(4):center.lng?.toFixed(4)}` : '—';
  const handleType = (id)=>{ setType(id); onTypeChange?.(id); if(id!=='roadwork') onClearLine?.(); try{ navigator.vibrate?.(15);}catch{} };
  const [laneStates, setLaneStates] = useState(()=> ['blocked','up','down','empty']);
  const cycleLane = (v)=> v==='empty' ? 'blocked' : v==='blocked' ? 'up' : v==='up' ? 'down' : 'empty';

  const submit = async () => {
    if(submitting) return;
    if(!center) return toast.error('Выберите точку на карте — тапните по карте');
    if(startTime && endTime && new Date(startTime) >= new Date(endTime)) return toast.error('Конец должен быть позже начала');
    setSubmitting(true);
    const { data:{user} } = await supabase.auth.getUser(); if(!user){ setSubmitting(false); return toast.error('Войдите, чтобы отправить'); }
    try{
      const { data: recent } = await supabase.from('map_events').select('created_at').eq('user_id', user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(recent && Date.now() - new Date(recent.created_at).getTime() < 30000){ setSubmitting(false); return toast.error('Подождите 30 сек перед отправкой'); }
    }catch{}
    let photoUrl = null;
    if(photo){
      try{
        const ext = photo.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('reports').upload(path, photo);
        if(!upErr) photoUrl = path; else throw upErr;
      }catch(e){ toast.error('Фото не загружено: '+ (e.message||'')); }
    }
    const expiresAt = endTime ? new Date(endTime).toISOString() : null;
    const extra = (startTime || endTime) ? ` [${startTime||'—'} → ${endTime||'—'}]` : '';
    // для ремонта — берём первую точку линии, иначе центр
    let centerLat = Array.isArray(center) ? center[0] : center?.lat;
    let centerLng = Array.isArray(center) ? center[1] : center?.lng;
    let linePayload = null;
    let lanesPayload = null;
    if(type==='roadwork' && eventLine?.length){
      if(eventLine.length < 1){ setSubmitting(false); return toast.error('Нарисуйте линию ремонта на карте (минимум 1 точка)'); }
      centerLat = eventLine[0][0]; centerLng = eventLine[0][1];
      linePayload = { line: eventLine, dir: roadDir };
    }
    if(type==='closure'){
      lanesPayload = laneStates;
    }
    if(centerLat==null || centerLng==null){ setSubmitting(false); return toast.error('Нет координат'); }
    let descWithLine = (comment||'')+extra;
    if(linePayload) descWithLine += ` [line:${JSON.stringify(linePayload)}]`;
    if(lanesPayload) descWithLine += ` [lanes:${JSON.stringify(lanesPayload)}]`;
    const { error } = await supabase.from('map_events').insert({
      user_id: user.id,
      lat: centerLat, lng: centerLng,
      type: type==='roadwork' ? 'roadwork' : type==='closure' ? 'closure' : type,
      description: descWithLine,
      photo_url: photoUrl,
      is_active:true,
      expires_at: expiresAt,
    });
    if(error) toast.error(error.message);
    else { toast.success('Опубликовано'); setComment(''); setPhoto(null); setStartTime(''); setEndTime(''); setLaneStates(['blocked','up','down','empty']); onClearLine?.(); onDirChange?.(0); onClose?.(); }
    setSubmitting(false);
  };

  const toggleVoice = ()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return toast.error('Голос не поддерживается');
    const rec = new SR(); rec.lang='ru-RU'; rec.onstart=()=>setListening(true); rec.onend=()=>setListening(false);
    rec.onresult=(e)=> setComment(prev=> (prev? prev+' ':'') + e.results[0][0].transcript);
    try{ navigator.vibrate?.(20); }catch{}
    rec.start();
  };

  // свёрнутый режим — карта свободна, можно тапнуть и выбрать место
  if (collapsed) {
    return (
      <div className="absolute inset-x-0 bottom-0 z-[650] flex justify-center pointer-events-none px-3">
        <div
          className="pointer-events-auto w-full max-w-[560px] mx-auto rounded-[16px] border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-[0_-8px_32px_rgba(0,0,0,0.25)] px-3 py-2.5 flex items-center gap-2.5"
          style={{ marginBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
        >
          <span className="w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: active.color, color: '#fff' }}>
            <active.icon size={17} />
          </span>
          <button onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} setCollapsed(false); }} className="flex-1 text-left min-w-0">
            <p className="text-[13px] font-extrabold leading-none text-slate-900 dark:text-white truncate">{active.shortLabel} · {coords}</p>
            <p className="text-[11px] font-semibold text-[#1a8cff] mt-1 flex items-center gap-1"><MapPin size={12} /> Тапните по карте — затем разверните форму <ChevronUp size={12} /></p>
          </button>
          <button
            onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} setCollapsed(false); }}
            aria-label="Развернуть форму"
            className="h-10 px-3.5 rounded-[12px] bg-[#1a8cff] text-white text-[12px] font-extrabold shrink-0"
          >
            Форма
          </button>
          <button
            onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onClose?.(); }}
            aria-label="Закрыть"
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 top-[116px] z-[650] flex justify-center pointer-events-none px-2">
      {/* sheet — ниже верхней шапки (z600), выше карты; не перекрывает навбар */}
      <div
        className="relative pointer-events-auto w-full max-w-[720px] mx-auto bg-white dark:bg-slate-900 rounded-t-[20px] shadow-[0_-8px_32px_rgba(0,0,0,0.22)] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden"
        style={{
          marginBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          maxHeight: 'calc(100dvh - 116px - 56px - env(safe-area-inset-bottom, 0px) - 12px)',
          // fallback для старых браузеров
        }}
      >
        {/* scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {/* drag handle — тап сворачивает, освобождает карту */}
          <button onClick={()=>{ try{ navigator.vibrate?.(10);}catch{} setCollapsed(true); }} aria-label="Свернуть форму" className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-3 pb-2 flex justify-center w-full">
            <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </button>

          {/* header: закрыть слева, свернуть справа */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-3">
            <button
              onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onClose?.(); }}
              aria-label="Закрыть"
              className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X size={18} className="text-slate-600 dark:text-slate-300" />
            </button>
            <h2 className="flex-1 text-center text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">Событие</h2>
            <button
              onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} setCollapsed(true); }}
              aria-label="Свернуть — выбрать место на карте"
              title="Свернуть — выбрать место на карте"
              className="w-11 h-11 rounded-full bg-[#1a8cff]/10 dark:bg-[#1a8cff]/20 flex items-center justify-center hover:bg-[#1a8cff]/20 transition-colors shrink-0"
            >
              <ChevronDown size={20} className="text-[#1a8cff]" />
            </button>
          </div>

          {/* event type selector — единый сегментированный контрол */}
          <p className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2">Тип события</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1 snap-x snap-mandatory">
            {CATS.map(c=>{
              const isActive = type===c.id;
              return (
                <button
                  key={c.id}
                  onClick={()=> handleType(c.id)}
                  aria-label={`Тип ${c.label}`}
                  aria-pressed={isActive}
                  className={`snap-start shrink-0 flex flex-col items-center justify-center gap-1.5 w-[68px] h-[74px] rounded-[16px] border-[1.5px] transition-all
                    ${isActive
                      ? 'bg-[#fef2f2] dark:bg-[#e10600]/15 border-[#e10600] text-[#e10600] shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}
                >
                  <c.icon size={20} strokeWidth={isActive?2.3:1.9} className={isActive ? 'text-[#e10600]' : 'text-slate-500'} />
                  <span className={`text-[10px] font-bold leading-none ${isActive?'text-[#e10600]':''}`}>{c.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Перекрытие: карточка переехала вниз — компактная строка места + кнопка «Скрыть» */}
          {type==='closure' && (
            <button
              onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} setCollapsed(true); }}
              className="mt-3 w-full rounded-[14px] border border-dashed border-[#1a8cff]/50 bg-[#1a8cff]/5 dark:bg-[#1a8cff]/10 px-3 py-2.5 flex items-center gap-2.5 text-left"
            >
              <MapPin size={18} className="text-[#1a8cff] shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-extrabold text-slate-800 dark:text-slate-100 truncate">{coords} — тапните карту, чтобы уточнить</span>
                <span className="block text-[11px] font-semibold text-[#1a8cff]">Скрыть форму и выбрать место</span>
              </span>
              <ChevronDown size={18} className="text-[#1a8cff] shrink-0" />
            </button>
          )}

          {/* selected event card — только для НЕ-перекрытия */}
          {type!=='closure' && (
          <div className="mt-4 rounded-[14px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 flex gap-3 items-center">
            <button
              onClick={()=>{ try{ navigator.vibrate?.(30);}catch{} toast('Тапните по карте, чтобы выбрать место', { description: coords }); }}
              className="flex gap-3 flex-1 text-left min-w-0"
            >
              <span className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0" style={{ background: active.color, color:'#fff' }}>
                <active.icon size={18} />
              </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-none text-slate-900 dark:text-white">{active.shortLabel}</p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 leading-tight truncate">{DESCS[active.id] || active.shortLabel} — {eventLine?.length ? `${eventLine.length} точек` : 'тапните карту'}</p>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">{coords}</p>
            </div>
          </button>
          {/* стрелки направления для линии ремонта — как на референсе */}
          <div className="flex gap-1.5 shrink-0">
            <button onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onDirChange?.(0); }} title="Закрыто" className={`w-9 h-9 rounded-[10px] border-2 flex items-center justify-center ${roadDir===0?'bg-[#e10600] border-[#e10600] text-white':'bg-white dark:bg-slate-800 border-slate-300 text-slate-500'}`}>
              <X size={14} strokeWidth={roadDir===0?2.5:2} />
            </button>
            <button onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onDirChange?.(1); }} title="Вверх" className={`w-9 h-9 rounded-[10px] border-2 flex items-center justify-center ${roadDir===1?'bg-emerald-600 border-emerald-600 text-white':'bg-white dark:bg-slate-800 border-slate-300 text-slate-500'}`}>
              <ArrowUp size={14} strokeWidth={2.2} />
            </button>
            <button onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onDirChange?.(2); }} title="Вниз" className={`w-9 h-9 rounded-[10px] border-2 flex items-center justify-center ${roadDir===2?'bg-blue-600 border-blue-600 text-white':'bg-white dark:bg-slate-800 border-slate-300 text-slate-500'}`}>
              <ArrowDown size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        )}
          {type==='roadwork' && eventLine?.length>0 && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Линия: {eventLine.length} точек · {roadDir===0?'❌ Закрыто': roadDir===1?'⬆️ Вверх':'⬇️ Вниз'}</span>
              <button onClick={()=> onClearLine?.()} className="text-red-600 font-bold">Очистить</button>
            </div>
          )}
          {/* Перекрытие — как на референсе: заголовок + 4 крупные полосы + даты + комментарий + фото */}
          {type==='closure' && (
            <div className="mt-3">
              <p className="text-center text-[22px] leading-none font-extrabold tracking-tight text-slate-900 dark:text-white">Перекрытие</p>
              <p className="mt-1.5 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">Нажмите на полосы дороги, чтобы указать состояние</p>
              <div className="mt-3 grid grid-cols-4 gap-2.5">
                {laneStates.map((st,i)=>(
                  <button
                    key={i}
                    onClick={()=>{
                      try{ navigator.vibrate?.(15);}catch{}
                      setLaneStates(prev=> prev.map((v,idx)=> idx===i ? cycleLane(v) : v));
                    }}
                    aria-label={`Полоса ${i+1} ${st}`}
                    className={`h-[84px] rounded-[14px] border-2 flex items-center justify-center transition-all active:scale-95
                      ${st==='empty' ? 'bg-white dark:bg-slate-800 border-slate-400 dark:border-slate-600 hover:border-slate-500' : ''}
                      ${st==='blocked' ? 'bg-[#ffe3e3] dark:bg-[#e10600]/20 border-[#ff2d2d] text-[#f31212]' : ''}
                      ${st==='up' ? 'bg-[#e9f9ef] dark:bg-emerald-900/25 border-[#22b573] text-[#1d9e57]' : ''}
                      ${st==='down' ? 'bg-[#e8f2ff] dark:bg-blue-900/25 border-[#1a8cff] text-[#1a8cff]' : ''}`}
                  >
                    {st==='blocked' && <X size={46} strokeWidth={3.5} />}
                    {st==='up' && <ArrowUp size={48} strokeWidth={3.2} fill="currentColor" />}
                    {st==='down' && <ArrowDown size={48} strokeWidth={3.2} fill="currentColor" />}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2.5 mt-1.5 text-center text-[15px] font-extrabold text-slate-600 dark:text-slate-300">
                {[1,2,3,4].map(n=> <span key={n}>{n}</span>)}
              </div>

              {/* даты — две карточки как на референсе */}
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div className="rounded-[16px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Calendar size={22} className="text-[#1a8cff] shrink-0" />
                    <span className="text-[11px] font-medium leading-tight">Дата и время начала</span>
                  </div>
                  <input type="datetime-local" value={startTime} onChange={e=>setStartTime(e.target.value)} className="mt-2 w-full rounded-[12px] border border-slate-300 dark:border-slate-600 px-2 py-2 text-[12px] font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-[#1a8cff]" />
                </div>
                <div className="rounded-[16px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Calendar size={22} className="text-[#1a8cff] shrink-0" />
                    <span className="text-[11px] font-medium leading-tight">Дата и время окончания</span>
                  </div>
                  <input type="datetime-local" value={endTime} onChange={e=>setEndTime(e.target.value)} className="mt-2 w-full rounded-[12px] border border-slate-300 dark:border-slate-600 px-2 py-2 text-[12px] font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-[#1a8cff]" />
                </div>
              </div>

              {/* комментарий одной строкой + микрофон */}
              <div className="mt-3 relative rounded-[14px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                <input
                  value={comment}
                  onChange={e=>setComment(e.target.value)}
                  placeholder="Комментарий к событию"
                  className="w-full h-[52px] rounded-[14px] bg-transparent pl-3.5 pr-11 text-[14px] placeholder:text-slate-500 text-slate-900 dark:text-white outline-none"
                />
                <button
                  onClick={toggleVoice}
                  aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center ${listening?'text-red-500 animate-pulse':'text-slate-500'}`}
                >
                  <Mic size={22} />
                </button>
              </div>

              {/* добавить фото */}
              <button
                onClick={()=> fileRef.current?.click()}
                className="mt-3 w-full h-[56px] rounded-[14px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center gap-2 text-[#1a8cff] text-[16px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <Camera size={26} />
                <span>{photo ? 'Фото добавлено — заменить' : 'Добавить фото'}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e=> setPhoto(e.target.files?.[0]||null)} />
              {photo && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={URL.createObjectURL(photo)} alt="preview" className="w-14 h-14 rounded-[10px] object-cover border border-slate-200 dark:border-slate-700" />
                  <button onClick={()=> setPhoto(null)} className="text-[12px] font-bold text-red-600">Убрать фото</button>
                </div>
              )}
            </div>
          )}
          {onPickHint && <p className="text-center text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-2 animate-pulse">{onPickHint}</p>}

          {/* comment + photo + dates — только для НЕ-перекрытия (у перекрытия свой блок выше как на референсе) */}
          {type!=='closure' && (
          <>
          <div className="mt-5">
            <label htmlFor="event-comment" className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2">Комментарий</label>
            <div className="relative rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:border-[#0a84ff] focus-within:ring-4 focus-within:ring-[#0a84ff]/10 transition-all">
              <textarea
                id="event-comment"
                value={comment}
                onChange={e=>setComment(e.target.value)}
                placeholder="Опишите, что произошло..."
                rows={4}
                className="w-full min-h-[104px] max-h-[140px] resize-none rounded-[14px] bg-transparent p-3 pr-11 text-[13px] leading-[1.4] placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-white outline-none"
              />
              <button
                onClick={toggleVoice}
                aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'}
                className={`absolute right-2 top-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${listening?'bg-red-500 text-white animate-pulse':'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200'}`}
              >
                <Mic size={16} />
              </button>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2">Фото</p>
            {!photo ? (
              <button
                onClick={()=> fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-[14px] border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <span className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                  <ImagePlus size={18} className="text-[#0a84ff]" />
                </span>
                <span className="text-[13px] font-semibold text-[#0a84ff]">Добавить фото</span>
              </button>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <div className="relative shrink-0">
                  <img src={URL.createObjectURL(photo)} alt="preview" className="w-20 h-20 rounded-[12px] object-cover border border-slate-200 dark:border-slate-700" />
                  <button onClick={()=> setPhoto(null)} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center shadow"><X size={12}/></button>
                </div>
                <button onClick={()=> fileRef.current?.click()} className="shrink-0 w-20 h-20 rounded-[12px] border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500">
                  <ImagePlus size={18} />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e=> setPhoto(e.target.files?.[0]||null)} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Начало <span className="font-normal text-slate-400">(необязательно)</span>
                <input type="datetime-local" value={startTime} onChange={e=>setStartTime(e.target.value)} className="mt-1.5 w-full rounded-[12px] border border-slate-200 dark:border-slate-700 p-2.5 text-xs bg-white dark:bg-slate-800 focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/10 outline-none" />
              </label>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Конец <span className="font-normal text-slate-400">(необязательно)</span>
                <input type="datetime-local" value={endTime} onChange={e=>setEndTime(e.target.value)} className="mt-1.5 w-full rounded-[12px] border border-slate-200 dark:border-slate-700 p-2.5 text-xs bg-white dark:bg-slate-800 focus:border-[#0a84ff] focus:ring-2 focus:ring-[#0a84ff]/10 outline-none" />
              </label>
            </div>
          </div>
          </>
          )}

          {/* primary action — как на референсе */}
          <div className="mt-4">
            <button
              onClick={()=>{ try{ navigator.vibrate?.([30,40,30]); }catch{} submit(); }}
              disabled={submitting}
              className="w-full h-[52px] rounded-[14px] bg-[#1a8cff] hover:bg-[#0077ed] active:bg-[#0066cc] text-white font-extrabold text-[16px] tracking-wide shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center uppercase"
            >
              {submitting ? 'Отправка...' : 'Отправить'}
            </button>
          </div>

          {/* hint for small screens */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
