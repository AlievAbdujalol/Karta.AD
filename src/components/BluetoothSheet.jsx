import { useState } from 'react';
import { Bluetooth, X } from 'lucide-react';
import { useBluetooth } from '@/hooks/useBluetooth';
import { toast } from 'sonner';

export default function BluetoothSheet({ onClose }){
  const { supported, request } = useBluetooth();
  const [dismissed, setDismissed]=useState(()=> localStorage.getItem('karta_bt_dismissed')==='1');
  if(dismissed) return null;
  if(!supported) return null;
  return (
    <div className="absolute bottom-[88px] left-2 right-2 md:left-auto md:right-4 md:w-[360px] z-[610] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-black flex items-center gap-2"><Bluetooth size={16}/>Разрешите использовать Bluetooth</h3><button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"><X size={14}/></button></div>
      <p className="text-xs text-slate-500">Это поможет точнее определять местоположение и понимать, когда вы подключаетесь к авто.</p>
      <div className="flex gap-2">
        <button onClick={async()=>{ const d=await request(); if(d) toast.success('Подключено: '+(d.name||'')); onClose?.(); }} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm">Разрешить</button>
        <button onClick={()=>{ localStorage.setItem('karta_bt_dismissed','1'); setDismissed(true); onClose?.(); }} className="flex-1 py-2.5 rounded-xl bg-white border font-bold text-sm">Не сейчас</button>
      </div>
    </div>
  );
}
