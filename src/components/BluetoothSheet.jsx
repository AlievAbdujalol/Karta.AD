import { useState } from 'react';
import { Bluetooth, X } from 'lucide-react';
import { useBluetooth } from '@/hooks/useBluetooth';
import { toast } from 'sonner';

export default function BluetoothSheet({ onClose }){
  const { supported, request } = useBluetooth();
  const [dismissed, setDismissed]=useState(()=> { try { return localStorage.getItem('karta_bt_dismissed')==='1'; } catch { return false; } });
  const dismiss = () => {
    try { localStorage.setItem('karta_bt_dismissed','1'); } catch {}
    setDismissed(true);
    onClose?.();
  };
  if(dismissed) return null;
  if(!supported) return null;
  return (
    <div className="absolute bottom-[88px] left-2 right-2 md:left-auto md:right-4 md:w-[360px] z-[610] bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center flex-shrink-0">
          <Bluetooth size={20} />
        </span>
        <h3 className="flex-1 text-sm font-extrabold leading-snug pt-0.5">Разрешите использовать Bluetooth</h3>
        <button onClick={dismiss} title="Закрыть" className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center flex-shrink-0 transition-colors">
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Это поможет точнее определять местоположение и понимать, когда вы подключаетесь к авто.</p>
      <div className="flex gap-2">
        <button onClick={async()=>{ const d=await request(); if(d) toast.success('Подключено: '+(d.name||'')); onClose?.(); }} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold text-sm transition-all">Разрешить</button>
        <button onClick={dismiss} className="flex-1 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-sm transition-colors">Не сейчас</button>
      </div>
    </div>
  );
}
