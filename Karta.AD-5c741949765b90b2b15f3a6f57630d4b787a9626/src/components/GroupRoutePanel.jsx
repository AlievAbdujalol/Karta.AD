import { useState, useEffect } from 'react';
import { Share2, MapPin, LogOut, CheckCircle, Search, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { supabase } from '@/api/supabase';

export default function GroupRoutePanel({ groupRoute, members, onlineMembers, sharingEnabled, onLeave, onFinish, onToggleSharing, contactLocations = [], onShareWith, onUnshareWith, onClose }) {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedWith, setSharedWith] = useState([]);

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

  const panelContent = (
    <div className="space-y-3">
      {/* Route info */}
      {groupRoute && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <MapPin size={11} className="text-emerald-400" />
          <span className="truncate">{groupRoute.from_name || 'Текущее положение'}</span>
          <span className="text-slate-600">→</span>
          <span className="truncate">{groupRoute.to_name || 'Поездка'}</span>
        </div>
      )}

      {/* Members */}
      {groupRoute && members.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('groupRoute.members') || 'Участники'}</div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-1.5 bg-slate-800/50 rounded-full pl-1 pr-2 py-0.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.role === 'creator' ? 'bg-blue-500' : 'bg-red-500'}`}>
                  {(m.profiles?.full_name || m.user_id || '?')[0]}
                </div>
                <span className="text-[10px] text-slate-300 truncate max-w-[70px]">{m.profiles?.full_name || 'Участник'}</span>
                {m.lat && m.lng && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Online contacts */}
      {contactLocations.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.nearby') || 'На карте'}</div>
          {contactLocations.map(loc => (
            <div key={loc.user_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-800/50">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                {loc.photo_url ? <img src={loc.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-white text-[9px] font-bold">{(loc.full_name || '?')[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-slate-200 truncate">{loc.full_name}</div>
              </div>
              <MapPin size={11} className="text-emerald-400 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Share with contacts */}
      {sharingEnabled && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.shareWith') || 'Поделиться с'}</div>
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('locationSharing.search') || 'Поиск...'}
              className="w-full pl-6 pr-3 py-1.5 text-[11px] bg-slate-800 rounded-lg border-0 outline-none text-slate-200 placeholder:text-slate-500" />
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredContacts.slice(0, 6).map(c => (
              <button key={c.id} onClick={() => {
                if (sharedWith.includes(c.id)) { onUnshareWith?.(c.id); setSharedWith(prev => prev.filter(id => id !== c.id)); }
                else { onShareWith?.(c.id); setSharedWith(prev => [...prev, c.id]); }
              }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-left">
                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                  {c.photo_url ? <img src={c.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-[8px] font-bold text-slate-400">{(c.full_name || '?')[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-slate-200 truncate">{c.full_name}</div>
                </div>
                {sharedWith.includes(c.id) && <Check size={11} className="text-emerald-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group actions */}
      {groupRoute && (
        <div className="flex gap-2 pt-1">
          <button onClick={onLeave} className="flex-1 min-h-[36px] rounded-xl bg-slate-800 text-slate-400 text-[11px] font-medium flex items-center justify-center gap-1.5 hover:bg-slate-700 transition-all">
            <LogOut size={11} />
            {t('groupRoute.leave') || 'Выйти'}
          </button>
          {groupRoute.creator_id && (
            <button onClick={onFinish} className="flex-1 min-h-[36px] rounded-xl bg-emerald-500 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-all">
              <CheckCircle size={11} />
              {t('groupRoute.finish') || 'Завершить'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ===== DESKTOP ===== */}
      <div className="hidden md:block absolute top-[140px] right-4 z-[300] w-[340px]">
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
              >
                <div className={`w-4.5 h-4.5 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                <ChevronDown size={16} className="text-slate-400" />
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700/60 px-4 py-3">
            {panelContent}
          </div>
        </div>
      </div>

      {/* ===== MOBILE ===== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[60px] z-[480]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="w-full flex items-center justify-between px-3 py-2.5">
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
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>
                <ChevronDown size={14} className="text-slate-400" />
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700/60 px-3 py-2.5">
            {panelContent}
          </div>
        </div>
      </div>
    </>
  );
}
