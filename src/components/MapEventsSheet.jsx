import { useState, useRef } from 'react';
import { Construction, Camera, MessageSquare, AlertTriangle, Ban, Mic, ImagePlus, X, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
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

  const active = CATS.find(c=>c.id===type) || CATS[4];
  const coords = center ? `${Array.isArray(center)?center[0].toFixed(4):center.lat?.toFixed(4)}, ${Array.isArray(center)?center[1].toFixed(4):center.lng?.toFixed(4)}` : '—';
  const handleType = (id)=>{ setType(id); onTypeChange?.(id); if(id!=='roadwork') onClearLine?.(); try{ navigator.vibrate?.(15);}catch{} };

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
    if(type==='roadwork' && eventLine?.length){
      if(eventLine.length < 1){ setSubmitting(false); return toast.error('Нарисуйте линию ремонта на карте (минимум 1 точка)'); }
      centerLat = eventLine[0][0]; centerLng = eventLine[0][1];
      linePayload = { line: eventLine, dir: roadDir };
    }
    if(centerLat==null || centerLng==null){ setSubmitting(false); return toast.error('Нет координат'); }
    const descWithLine = linePayload ? `${comment||''}${extra} [line:${JSON.stringify(linePayload)}]` : (comment||'')+extra;
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
    else { toast.success('Опубликовано'); setComment(''); setPhoto(null); setStartTime(''); setEndTime(''); onClearLine?.(); onDirChange?.(0); onClose?.(); }
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

  return (
    <div className="absolute inset-x-0 bottom-0 z-[500] flex justify-center pointer-events-none">
      {/* sheet — не перекрывает навбар, занимает доступную область */}
      <div
        className="relative pointer-events-auto w-full max-w-[720px] mx-auto bg-white dark:bg-slate-900 rounded-t-[20px] shadow-[0_-8px_32px_rgba(0,0,0,0.22)] flex flex-col border-t border-slate-200 dark:border-slate-800 overflow-hidden"
        style={{
          marginBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          maxHeight: 'calc(100dvh - 56px - env(safe-area-inset-bottom, 0px) - 12px)',
          // fallback для старых браузеров
        }}
      >
        {/* scrollable content */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {/* drag handle */}
          <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-3 pb-2 flex justify-center">
            <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          {/* header */}
          <div className="flex items-center justify-between gap-3 pt-1 pb-3">
            <button
              onClick={()=>{ try{ navigator.vibrate?.(15);}catch{} onClose?.(); }}
              aria-label="Закрыть"
              className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X size={18} className="text-slate-600 dark:text-slate-300" />
            </button>
            <h2 className="flex-1 text-center text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">Событие</h2>
            <div className="w-11 h-11 shrink-0" aria-hidden />
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

          {/* selected event card — tap to pick place on map, с управлением линией как на референсе */}
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
            {/* стрелки направления как на референсе: ❌ ⬆️ ⬇️ — зелёные рамки как на скрине */}
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
          {type==='roadwork' && eventLine?.length>0 && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Линия: {eventLine.length} точек · {roadDir===0?'❌ Закрыто': roadDir===1?'⬆️ Вверх':'⬇️ Вниз'}</span>
              <button onClick={()=> onClearLine?.()} className="text-red-600 font-bold">Очистить</button>
            </div>
          )}
          {onPickHint && <p className="text-center text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-2 animate-pulse">{onPickHint}</p>}

          {/* comment */}
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

          {/* photo */}
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

          {/* primary action */}
          <div className="mt-5">
            <button
              onClick={()=>{ try{ navigator.vibrate?.([30,40,30]); }catch{} submit(); }}
              disabled={submitting}
              className="w-full h-12 rounded-[14px] bg-[#0a84ff] hover:bg-[#0077ed] active:bg-[#0066cc] text-white font-bold text-[14px] tracking-wide shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {submitting ? 'Отправка...' : 'Опубликовать'}
            </button>
          </div>

          {/* hint for small screens */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
