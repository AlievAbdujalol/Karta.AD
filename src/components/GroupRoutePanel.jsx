import { useState, useEffect } from 'react';
import { Share2, MapPin, LogOut, CheckCircle, Search, Check, ChevronDown, Users, Link2, Radio, UserPlus } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

export default function GroupRoutePanel({ groupRoute, members, onlineMembers, sharingEnabled, onLeave, onFinish, onToggleSharing, contactLocations = [], onShareWith, onUnshareWith, onClose }) {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedWith, setSharedWith] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, photo_url, phone')
      .then(({ data }) => { if (data) setContacts(data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sharingEnabled) { setSharedWith([]); return; }
    supabase.from('location_shares').select('shared_with_id')
      .eq('status', 'active')
      .then(({ data }) => { if (data) setSharedWith(data.map(r => r.shared_with_id)); }).catch(() => {});
  }, [sharingEnabled]);

  const filteredContacts = contacts.filter(c =>
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery)
  );

  const onlineCount = groupRoute ? onlineMembers.length : contactLocations.length;
  const inviteLink = groupRoute ? `${window.location.origin}/?group=${groupRoute.id}` : '';

  const copyInvite = async () => {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); toast.success('Ссылка скопирована'); setTimeout(() => setCopied(false), 2000); } catch { toast.info(inviteLink); }
  };

  const panelContent = (
    <div className="space-y-3">
      {/* Group route header */}
      {groupRoute ? (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
            <Radio size={12} className="animate-pulse" /> Групповой маршрут активен
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1.5">
            <MapPin size={11} className="text-emerald-400 flex-shrink-0" />
            <span className="truncate">{groupRoute.from_name || 'Текущее положение'}</span>
            <span className="text-slate-600">→</span>
            <span className="truncate">{groupRoute.to_name || 'Поездка'}</span>
          </div>
          <button onClick={copyInvite} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 transition-colors">
            {copied ? <Check size={12} className="text-emerald-600" /> : <Link2 size={12} />} {copied ? 'Скопировано' : 'Скопировать ссылку-приглашение'}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0"><Users size={14} className="text-white" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-200">Нет активного группового маршрута</p>
            <p className="text-[10px] text-slate-500">Создайте маршрут в «Найти маршрут» и поделитесь поездкой</p>
          </div>
        </div>
      )}

      {/* Members */}
      {groupRoute && members.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Users size={10} /> {t('groupRoute.members') || 'Участники'} · {members.length}</div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-1.5 bg-slate-800/50 rounded-full pl-1 pr-2 py-0.5 border border-slate-700/40">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.role === 'creator' ? 'bg-blue-500' : 'bg-red-500'}`}>
                  {(m.profiles?.full_name || m.user_id || '?')[0]}
                </div>
                <span className="text-[10px] text-slate-300 truncate max-w-[70px]">{m.profiles?.full_name || 'Участник'}</span>
                {m.lat && m.lng && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Online contacts on map */}
      {contactLocations.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><MapPin size={10} /> {t('locationSharing.nearby') || 'На карте'} · {contactLocations.length}</div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {contactLocations.map(loc => (
              <div key={loc.user_id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-800/50 border border-slate-700/30">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {loc.photo_url ? <img src={loc.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-white text-[10px] font-bold">{(loc.full_name || '?')[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 truncate">{loc.full_name}</div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1">● в сети</div>
                </div>
                <MapPin size={12} className="text-emerald-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share controls */}
      <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-2.5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5"><Share2 size={12} className="text-emerald-400" /> {t('locationSharing.shareWith') || 'Поделиться с'}</p>
            <p className="text-[10px] text-slate-500">Выберите кому показывать вашу геолокацию</p>
          </div>
        </div>
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('locationSharing.search') || 'Поиск по имени или телефону...'}
            className="w-full pl-7 pr-3 py-2 text-[11px] bg-slate-900 rounded-lg border border-slate-700 outline-none text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50" />
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {filteredContacts.length === 0 ? (
            <p className="text-center text-[11px] text-slate-500 py-3">Контактов не найдено</p>
          ) : (
            filteredContacts.slice(0, 8).map(c => {
              const isShared = sharedWith.includes(c.id);
              return (
                <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700/40 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {c.photo_url ? <img src={c.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-[10px] font-bold text-slate-400">{(c.full_name || '?')[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-200 truncate">{c.full_name || 'Без имени'}</div>
                    <div className="text-[10px] text-slate-500 truncate">{c.phone || ''}</div>
                  </div>
                  <button onClick={() => {
                    if (isShared) { onUnshareWith?.(c.id); setSharedWith(prev => prev.filter(id => id !== c.id)); }
                    else { onShareWith?.(c.id); setSharedWith(prev => [...prev, c.id]); }
                  }} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${isShared ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    {isShared ? '✓ Доступ' : 'Дать доступ'}
                  </button>
                </div>
              );
            })
          )}
        </div>
        {!sharingEnabled && (
          <p className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5 mt-2 flex items-center gap-1.5">
            <Radio size={10} /> Включите «Поделиться», чтобы выбрать контакты
          </p>
        )}
      </div>

      {/* Group actions */}
      {groupRoute && (
        <div className="flex gap-2 pt-1">
          <button onClick={onLeave} className="flex-1 min-h-[36px] rounded-xl bg-slate-800 text-slate-400 text-[11px] font-medium flex items-center justify-center gap-1.5 hover:bg-slate-700 transition-all">
            <LogOut size={12} />
            {t('groupRoute.leave') || 'Выйти'}
          </button>
          {groupRoute.creator_id && (
            <button onClick={onFinish} className="flex-1 min-h-[36px] rounded-xl bg-emerald-500 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-all">
              <CheckCircle size={12} />
              {t('groupRoute.finish') || 'Завершить'}
            </button>
          )}
        </div>
      )}
      {!groupRoute && sharingEnabled && filteredContacts.length > 0 && (
        <button onClick={() => toast.info('Создайте маршрут в «Найти маршрут» → «Поделиться поездкой»')} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors">
          <UserPlus size={12} /> Пригласить и создать маршрут
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* ===== DESKTOP ===== */}
      <div className="hidden md:block absolute top-[140px] right-4 z-[300] w-[360px]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5 flex-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
                <Share2 size={14} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-[13px] font-bold text-white">{t('locationSharing.title') || 'Геолокация'} / {t('groupRoute.title') || 'Групповой маршрут'}</div>
                <div className="text-[10px] text-slate-400">{onlineCount} {t('locationSharing.online') || 'онлайн'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSharing?.(); }}
                className={`w-10 h-6 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                title={sharingEnabled ? 'Выключить шаринг' : 'Включить шаринг'}
              >
                <div className={`w-4.5 h-4.5 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer p-1 hover:bg-slate-800 rounded-lg" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                <ChevronDown size={16} className="text-slate-400" />
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700/60 px-4 py-3 max-h-[60vh] overflow-y-auto">
            {panelContent}
          </div>
        </div>
      </div>

      {/* ===== MOBILE ===== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[60px] z-[480]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-[0_4px_20px_rgba(0,0,0,0.3)] max-h-[65vh] flex flex-col">
          <div className="w-full flex items-center justify-between px-3 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500">
                <Share2 size={12} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-[11px] font-bold text-white">{t('locationSharing.title') || 'Геолокация'} / {t('groupRoute.title') || 'Групповой маршрут'}</div>
                <div className="text-[8px] text-slate-400">{onlineCount} {t('locationSharing.online') || 'онлайн'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); onToggleSharing?.(); }} className={`w-9 h-5 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer p-1" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                <ChevronDown size={14} className="text-slate-400" />
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700/60 px-3 py-2.5 overflow-y-auto flex-1">
            {panelContent}
          </div>
        </div>
      </div>
    </>
  );
}
