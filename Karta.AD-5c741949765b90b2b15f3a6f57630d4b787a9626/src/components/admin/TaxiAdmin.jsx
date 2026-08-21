import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { toast } from 'sonner';
import {
  CheckCircle, XCircle, ShieldCheck, AlertTriangle, ExternalLink,
  Phone, MapPin, Ban, UserCheck, Car, Star, Loader2, Siren,
} from 'lucide-react';
import { tariffById } from '@/lib/taxi';

const DOC_FIELDS = [
  { key: 'license_photo_url', label: 'Водительское удостоверение' },
  { key: 'tech_passport_url', label: 'Техпаспорт' },
  { key: 'insurance_url', label: 'Страховка' },
];

function DocThumb({ url, label }) {
  if (!url) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <a href={url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group">
        <img src={url} alt={label} className="w-full h-24 object-cover group-hover:scale-105 transition-transform" />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ExternalLink size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </a>
    </div>
  );
}

export default function TaxiAdmin() {
  const { user } = useCurrentUser();
  const [tab, setTab] = useState('requests');
  const [docs, setDocs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);

  const notify = useCallback((userId, title, body) => {
    supabase.from('notifications').insert({ user_id: userId, title, body, type: 'taxi_docs' }).then(({ error }) => { if (error) console.error('[TaxiAdmin] notification failed:', error); }).catch(() => {});
  }, []);

  // Заявки на верификацию
  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from('taxi_driver_documents')
      .select('*').neq('status', 'approved').order('created_at', { ascending: true });
    const rows = data || [];
    const ids = [...new Set(rows.map(r => r.driver_id))];
    if (ids.length) {
      const { data: driversData } = await supabase.from('taxi_drivers')
        .select('user_id, full_name, phone, city, photo_url').in('user_id', ids);
      const map = Object.fromEntries((driversData || []).map(d => [d.user_id, d]));
      setDocs(rows.map(r => ({ ...r, driver: map[r.driver_id] })));
    } else setDocs([]);
  }, []);

  const loadDrivers = useCallback(async () => {
    const [dr, veh] = await Promise.all([
      supabase.from('taxi_drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('taxi_vehicles').select('*'),
    ]);
    const vehicleMap = Object.fromEntries((veh.data || []).map(v => [v.driver_id, v]));
    setDrivers((dr.data || []).map(d => ({ ...d, vehicle: vehicleMap[d.user_id] })));
  }, []);

  const loadEmergencies = useCallback(async () => {
    const { data } = await supabase.from('taxi_emergencies')
      .select('*').order('created_at', { ascending: false }).limit(20);
    const rows = data || [];
    const ids = [...new Set(rows.map(r => r.user_id))];
    if (ids.length) {
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map = Object.fromEntries((profilesData || []).map(p => [p.id, p.full_name]));
      setEmergencies(rows.map(r => ({ ...r, name: map[r.user_id] })));
    } else setEmergencies([]);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDocs(), loadDrivers(), loadEmergencies()]).finally(() => setLoading(false));
  }, [loadDocs, loadDrivers, loadEmergencies]);

  // Живые SOS-сигналы
  useEffect(() => {
    const sub = supabase.channel('taxi-admin-emergencies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taxi_emergencies' }, (payload) => {
        if (payload.new?.status === 'active') {
          loadEmergencies();
          toast.warning('🚨 Новый SOS-сигнал!', { duration: 6000 });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxi_emergencies' }, () => loadEmergencies())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [loadEmergencies]);

  const handleApprove = async (doc) => {
    const { error } = await supabase.from('taxi_driver_documents').update({
      status: 'approved', is_verified: true, verified_by: user.id, verified_at: new Date().toISOString(),
    }).eq('id', doc.id);
    if (error) { toast.error('Не удалось одобрить документы'); return; }
    const { error: driverErr } = await supabase.from('taxi_drivers').update({ is_verified: true }).eq('user_id', doc.driver_id);
    if (driverErr) { toast.error('Документы одобрены, но статус водителя не обновлён'); loadDocs(); return; }
    await supabase.from('profiles').update({ driver_status: 'approved' }).eq('id', doc.driver_id);
    notify(doc.driver_id, 'Документы одобрены ✅', 'Вы можете выходить на линию. Приятных поездок!');
    toast.success(`Заявка ${doc.driver?.full_name || ''} одобрена`);
    loadDocs(); loadDrivers();
  };

  const handleReject = async (doc) => {
    const reason = window.prompt('Причина отклонения (видна водителю):', 'Нечитаемые документы');
    if (reason === null) return;
    const { error } = await supabase.from('taxi_driver_documents').update({
      status: 'rejected', is_verified: false, reject_reason: reason || 'Документы не прошли проверку',
    }).eq('id', doc.id);
    if (error) { toast.error('Не удалось отклонить документы'); return; }
    const { error: driverErr } = await supabase.from('taxi_drivers').update({ is_verified: false }).eq('user_id', doc.driver_id);
    if (driverErr) { toast.warning('Документы отклонены, но статус водителя не обновлён'); loadDocs(); return; }
    await supabase.from('profiles').update({ driver_status: 'pending' }).eq('id', doc.driver_id);
    notify(doc.driver_id, 'Документы отклонены ❌', reason || 'Документы не прошли проверку. Обновите их в профиле.');
    toast.info('Заявка отклонена');
    loadDocs(); loadDrivers();
  };

  const toggleVerified = async (d) => {
    const next = !d.is_verified;
    const { error } = await supabase.from('taxi_drivers').update({ is_verified: next }).eq('user_id', d.user_id);
    if (error) { toast.error('Не удалось изменить верификацию'); return; }
    await supabase.from('taxi_driver_documents').update({ status: next ? 'approved' : 'pending' }).eq('driver_id', d.user_id);
    await supabase.from('profiles').update({ driver_status: next ? 'approved' : 'pending' }).eq('id', d.user_id);
    setDrivers(prev => prev.map(x => x.user_id === d.user_id ? { ...x, is_verified: next } : x));
    notify(d.user_id, next ? 'Документы одобрены ✅' : 'Верификация снята', next ? 'Вы можете выходить на линию.' : 'Администратор снял верификацию. Обновите документы.');
    toast.success(next ? 'Водитель верифицирован' : 'Верификация снята');
  };

  const toggleBlock = async (d) => {
    const next = d.status === 'blocked' ? 'offline' : 'blocked';
    const { error } = await supabase.from('taxi_drivers').update({ status: next }).eq('user_id', d.user_id);
    if (error) { toast.error('Не удалось изменить статус'); return; }
    await supabase.from('taxi_driver_locations').update({ status: next === 'blocked' ? 'blocked' : 'offline' }).eq('driver_id', d.user_id);
    setDrivers(prev => prev.map(x => x.user_id === d.user_id ? { ...x, status: next } : x));
    toast.success(next === 'blocked' ? 'Водитель заблокирован' : 'Водитель разблокирован');
  };

  const resolveEmergency = async (e) => {
    await supabase.from('taxi_emergencies').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', e.id);
    toast.success('Сигнал закрыт');
    loadEmergencies();
  };

  const activeSos = emergencies.filter(e => e.status === 'active');
  const pendingDocs = docs.filter(d => d.status === 'pending');

  const tabs = [
    { id: 'requests', label: `Заявки${pendingDocs.length ? ` (${pendingDocs.length})` : ''}`, icon: ShieldCheck, color: 'bg-blue-100 text-blue-600' },
    { id: 'drivers', label: `Водители (${drivers.length})`, icon: Car, color: 'bg-emerald-100 text-emerald-600' },
    { id: 'sos', label: `SOS${activeSos.length ? ` (${activeSos.length})` : ''}`, icon: Siren, color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map(({ id, label, icon: Icon, color }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
              tab === id ? `${color} shadow` : 'bg-white dark:bg-slate-900 text-slate-500 border border-gray-100 dark:border-slate-800'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-xs text-slate-400 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Загрузка...</div>}

      {/* ===== ЗАЯВКИ ===== */}
      {tab === 'requests' && !loading && (
        <div className="space-y-3">
          {pendingDocs.length === 0 && docs.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-slate-800">
              <ShieldCheck size={32} className="text-emerald-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">Нет заявок на проверку</p>
              <p className="text-[10px] text-slate-400 mt-1">Все документы рассмотрены</p>
            </div>
          )}
          {pendingDocs.map(doc => (
            <div key={doc.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-blue-100 dark:border-blue-900/30 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold overflow-hidden flex-shrink-0">
                  {doc.driver?.photo_url ? <img src={doc.driver.photo_url} alt="" className="w-full h-full object-cover" /> : (doc.driver?.full_name?.[0] || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{doc.driver?.full_name || 'Водитель'}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Phone size={9} /> {doc.driver?.phone || '—'} · {doc.driver?.city || '—'}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-bold">ОЖИДАЕТ</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {DOC_FIELDS.map(f => <DocThumb key={f.key} url={doc[f.key]} label={f.label} />)}
              </div>
              {doc.license_number && (
                <p className="text-[10px] text-slate-400">Удостоверение: <b>{doc.license_number}</b>{doc.license_expiry ? ` · до ${doc.license_expiry}` : ''}</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => handleApprove(doc)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-colors">
                  <CheckCircle size={14} /> Одобрить
                </button>
                <button onClick={() => handleReject(doc)}
                  className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors">
                  <XCircle size={14} /> Отклонить
                </button>
              </div>
            </div>
          ))}
          {docs.filter(d => d.status === 'rejected').length > 0 && (
            <>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">Отклонённые</p>
              {docs.filter(d => d.status === 'rejected').map(doc => (
                <div key={doc.id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold">{doc.driver?.full_name || 'Водитель'}</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Причина: {doc.reject_reason || '—'}</p>
                  </div>
                  <button onClick={() => handleApprove(doc)} className="text-[10px] font-bold text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
                    Одобрить повторно
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ===== ВОДИТЕЛИ ===== */}
      {tab === 'drivers' && !loading && (
        <div className="space-y-3">
          {drivers.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Нет зарегистрированных водителей</p>}
          {drivers.map(d => (
            <div key={d.user_id} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm overflow-hidden flex-shrink-0">
                  {d.photo_url ? <img src={d.photo_url} alt="" className="w-full h-full object-cover" /> : (d.full_name?.[0] || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{d.full_name}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1"><Phone size={9} /> {d.phone} · {d.city || '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${d.status === 'blocked' ? 'bg-red-100 text-red-600' : (d.status === 'online' || d.status === 'free') ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {d.status === 'blocked' ? 'Заблокирован' : (d.status === 'online' || d.status === 'free') ? 'На линии' : 'Оффлайн'}
                  </span>
                  {d.vehicle && (
                    <span className="text-[9px] text-slate-400">
                      {d.vehicle.make} {d.vehicle.model} · {tariffById(d.vehicle.category)?.short || d.vehicle.category} · {d.vehicle.plate_number}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><Star size={10} className="text-amber-400" /> {d.rating?.toFixed(1) || '5.0'}</span>
                <span>·</span>
                <span>{d.rides_count || 0} поездок</span>
                <span>·</span>
                <span>зар.</span>
                <span className="font-bold text-emerald-600">{Number(d.total_earnings || 0).toFixed(0)} TJS</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleVerified(d)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${d.is_verified ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-slate-800 text-slate-500 hover:bg-green-50'}`}>
                  <UserCheck size={12} className="inline mr-1" />{d.is_verified ? 'Верифицирован' : 'Верифицировать'}
                </button>
                <button onClick={() => toggleBlock(d)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${d.status === 'blocked' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 hover:bg-amber-100' : 'bg-red-50 text-red-500 dark:bg-red-900/20 hover:bg-red-100'}`}>
                  <Ban size={12} className="inline mr-1" />{d.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== SOS ===== */}
      {tab === 'sos' && !loading && (
        <div className="space-y-3">
          {emergencies.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-slate-800">
              <AlertTriangle size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">Сигналов нет</p>
            </div>
          )}
          {emergencies.map(e => (
            <div key={e.id} className={`rounded-2xl p-4 border space-y-2.5 ${
              e.status === 'active'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40'
                : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center ${e.status === 'active' ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                    {e.status === 'active' ? <Siren size={15} /> : <AlertTriangle size={15} />}
                  </span>
                  <div>
                    <p className="text-xs font-bold">{e.name || 'Пользователь'} <span className="text-slate-400 font-medium">({e.role === 'driver' ? 'водитель' : 'пассажир'})</span></p>
                    <p className="text-[10px] text-slate-400">{new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${e.status === 'active' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                  {e.status === 'active' ? 'АКТИВЕН' : 'ЗАКРЫТ'}
                </span>
              </div>
              {e.lat != null && e.lng != null && (
                <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-[11px] font-bold text-blue-600">
                  <MapPin size={12} />
                  {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                  <ExternalLink size={10} />
                </a>
              )}
              {e.message && <p className="text-[11px] text-slate-600 dark:text-slate-300">{e.message}</p>}
              {e.status === 'active' && (
                <button onClick={() => resolveEmergency(e)}
                  className="w-full py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity">
                  Отметить как решённый
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
