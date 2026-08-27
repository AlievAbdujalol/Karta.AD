import { Users, Package, Baby, Briefcase, Dog, Wind, Clock, Weight, Shield, Calendar, ArrowLeftRight } from 'lucide-react';

function Counter({ value, onChange, min = 1, max = 7, label }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2"><Users size={14} /> {label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-sm font-bold">−</button>
        <span className="w-6 text-center text-sm font-black">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">+</button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, icon: Icon }) {
  return (
    <button onClick={() => onChange(!value)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${value ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 text-blue-700 dark:text-blue-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}>
      {Icon && <Icon size={14} />} {label} {value ? '✓' : ''}
    </button>
  );
}

export function priceSurcharge(category, extras, baseDistance) {
  // категория-специфичный дополнительный сбор
  let add = 0;
  if (['economy', 'comfort', 'comfort_plus', 'business', 'minivan', 'intercity'].includes(category)) {
    if (extras.childSeat) add += 3;
    if (extras.childSeats) add += Number(extras.childSeats) * 3;
    if (extras.pets) add += 3;
    if (extras.luggage) add += 2;
  }
  if (category === 'delivery') {
    const w = Number(extras.weight) || 0;
    if (w > 5) add += (w - 5) * 1.2;
    if (extras.fragile) add += 4;
    if (extras.express) add += 6;
  }
  if (category === 'courier') {
    if (extras.urgent) add += 5;
    if (extras.signature) add += 1;
    const w = Number(extras.weight) || 0;
    if (w > 2) add += (w - 2) * 1.5;
  }
  if (category === 'intercity' && extras.returnTrip) add += baseDistance > 0 ? Math.round(baseDistance * 0.6) : 0;
  return Math.round(add * 2) / 2;
}

export default function TaxiTariffPanel({ category, extras, setExtras, routeInfo }) {
  const update = (patch) => setExtras(patch);
  const baseKm = routeInfo?.distanceKm || 0;

  if (['economy', 'comfort', 'comfort_plus', 'business'].includes(category)) {
    const seats = category === 'business' ? 3 : 4;
    return (
      <div className="space-y-2">
        <div className="px-1 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">Пассажирский тариф · до {seats} чел. · кондиц., без курения</div>
        <Counter label="Пассажиры" value={extras.passengers ?? 1} onChange={v => update({ passengers: v })} min={1} max={seats} />
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Багаж" value={!!extras.luggage} onChange={v => update({ luggage: v })} icon={Briefcase} />
          <Toggle label="Детское кресло +3 TJS" value={!!extras.childSeat} onChange={v => update({ childSeat: v })} icon={Baby} />
          <Toggle label="С питомцем +3" value={!!extras.pets} onChange={v => update({ pets: v })} icon={Dog} />
          <Toggle label="Кондиц." value={extras.has_ac ?? true} onChange={v => update({ has_ac: v })} icon={Wind} />
        </div>
        <input value={extras.comment || ''} onChange={e => update({ comment: e.target.value })} placeholder="Комментарий водителю" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
    );
  }

  if (category === 'minivan') {
    return (
      <div className="space-y-2">
        <div className="px-1 py-1 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-[11px] text-orange-700 dark:text-orange-300 font-medium">Минивэн · до 7 чел. · большой салон</div>
        <Counter label="Пассажиры" value={extras.passengers ?? 1} onChange={v => update({ passengers: v })} min={1} max={7} />
        <Counter label="Детских кресел" value={extras.childSeats ?? 0} onChange={v => update({ childSeats: v })} min={0} max={3} />
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Багаж +" value={!!extras.luggage} onChange={v => update({ luggage: v })} icon={Briefcase} />
          <Toggle label="С питомцем" value={!!extras.pets} onChange={v => update({ pets: v })} icon={Dog} />
        </div>
        <input value={extras.comment || ''} onChange={e => update({ comment: e.target.value })} placeholder="Например, 6 чел + 2 чемодана" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-orange-400" />
      </div>
    );
  }

  if (category === 'delivery') {
    return (
      <div className="space-y-2">
        <div className="px-1 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">Доставка · посылки до 20 кг</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'docs', label: 'Документы' },
            { id: 'box', label: 'Коробка' },
            { id: 'food', label: 'Еда' },
          ].map(o => (
            <button key={o.id} onClick={() => update({ parcelType: o.id })} className={`px-2 py-2 rounded-xl text-xs font-bold border ${extras.parcelType === o.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>{o.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Weight size={14} className="text-slate-400" />
          <input type="number" min="0.2" max="20" step="0.5" value={extras.weight ?? 1} onChange={e => update({ weight: e.target.value })} className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
          <span className="text-xs text-slate-500">кг</span>
          {Number(extras.weight) > 5 && <span className="text-[10px] font-bold text-orange-600">+{(Number(extras.weight)-5)*1.2 |0} TJS за перевес</span>}
        </div>
        <input value={extras.receiverName || ''} onChange={e => update({ receiverName: e.target.value })} placeholder="Имя получателя" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
        <input value={extras.receiverPhone || ''} onChange={e => update({ receiverPhone: e.target.value })} placeholder="Телефон получателя" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Хрупкое +4" value={!!extras.fragile} onChange={v => update({ fragile: v })} icon={Shield} />
          <Toggle label="Экспресс +6" value={!!extras.express} onChange={v => update({ express: v })} icon={Clock} />
        </div>
        <input value={extras.comment || ''} onChange={e => update({ comment: e.target.value })} placeholder="Что везём, этаж, код домофона" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
      </div>
    );
  }

  if (category === 'courier') {
    return (
      <div className="space-y-2">
        <div className="px-1 py-1 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-700 dark:text-teal-300 font-medium">Курьер · быстро, до 5 кг</div>
        <div className="flex gap-1.5">
          <button onClick={() => update({ urgent: false })} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${!extras.urgent ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>Стандарт 60м</button>
          <button onClick={() => update({ urgent: true })} className={`flex-1 py-2 rounded-xl text-xs font-bold border ${extras.urgent ? 'bg-amber-500 text-white border-amber-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>Срочно 30м +5</button>
        </div>
        <div className="flex items-center gap-2">
          <Package size={14} className="text-slate-400" />
          <input value={extras.itemDesc || ''} onChange={e => update({ itemDesc: e.target.value })} placeholder="Что доставить" className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <Weight size={14} className="text-slate-400" />
          <input type="number" min="0.1" max="5" step="0.5" value={extras.weight ?? 0.5} onChange={e => update({ weight: e.target.value })} className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
          <span className="text-xs text-slate-500">кг</span>
        </div>
        <div className="flex gap-1.5">
          <Toggle label="Подпись" value={!!extras.signature} onChange={v => update({ signature: v })} icon={Shield} />
          <Toggle label="Фото-подтв." value={!!extras.photoProof} onChange={v => update({ photoProof: v })} icon={Package} />
        </div>
        <input value={extras.comment || ''} onChange={e => update({ comment: e.target.value })} placeholder="Комментарий курьеру" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
      </div>
    );
  }

  if (category === 'intercity') {
    return (
      <div className="space-y-2">
        <div className="px-1 py-1 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-[11px] text-purple-700 dark:text-purple-300 font-medium">Межгород · между городами</div>
        <Counter label="Пассажиры" value={extras.passengers ?? 1} onChange={v => update({ passengers: v })} min={1} max={4} />
        <label className="flex items-center gap-2 text-xs font-medium">
          <Calendar size={14} /> Дата/время
          <input type="datetime-local" value={extras.scheduledAt || ''} onChange={e => update({ scheduledAt: e.target.value })} className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none ml-auto" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => update({ returnTrip: !extras.returnTrip })} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${extras.returnTrip ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}><ArrowLeftRight size={14} /> Туда-обратно {extras.returnTrip ? '✓' : ''}</button>
          <Toggle label="Багаж" value={!!extras.luggage} onChange={v => update({ luggage: v })} icon={Briefcase} />
          <Toggle label="Детское кресло" value={!!extras.childSeat} onChange={v => update({ childSeat: v })} icon={Baby} />
        </div>
        <input value={extras.comment || ''} onChange={e => update({ comment: e.target.value })} placeholder="Пожелания, города по пути" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs outline-none" />
        {extras.returnTrip && baseKm > 0 && <p className="text-[10px] text-purple-600">Обратно +{Math.round(baseKm*0.6*2)/2} TJS</p>}
      </div>
    );
  }
  return null;
}
