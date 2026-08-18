import { useState, useEffect } from 'react';
import { MapPin, Share2, ChevronDown, ChevronUp, Search, Check } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { supabase } from '@/api/supabase';

export default function LocationSharingPanel({ contactLocations = [], sharingEnabled, onToggleSharing, onShareWith, onUnshareWith }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
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
  }, [sharingEnabled, expanded]);

  const filteredContacts = contacts.filter(c =>
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery)
  );

  const formatTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* ===== DESKTOP: Right side below GroupRoute ===== */}
      <div className="hidden md:block absolute top-[380px] right-4 z-[250] w-[340px]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5 flex-1 cursor-pointer" onClick={() => setExpanded(e => !e)}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
                <Share2 size={14} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-[13px] font-bold text-white">{t('locationSharing.title') || 'Геолокация'}</div>
                <div className="text-[10px] text-slate-400">{contactLocations.length} {t('locationSharing.online') || 'онлайн'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSharing?.(); }}
                className={`w-10 h-6 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <div className={`w-4.5 h-4.5 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
                {expanded
                  ? <ChevronDown size={16} className="text-slate-400" />
                  : <ChevronUp size={16} className="text-slate-400" />}
              </div>
            </div>
          </div>
          {expanded && (
            <div className="border-t border-slate-700/60 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">{t('locationSharing.shareMyLocation') || 'Делиться позицией'}</span>
                <button onClick={onToggleSharing} className={`w-10 h-5 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${sharingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {contactLocations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.nearby') || 'Контакты'}</div>
                  {contactLocations.map(loc => (
                    <div key={loc.user_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-800/50">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                        {loc.photo_url ? <img src={loc.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-white text-[10px] font-bold">{(loc.full_name || '?')[0]}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-200 truncate">{loc.full_name}</div>
                        <div className="text-[9px] text-slate-500">{formatTime(loc.updated_at)}</div>
                      </div>
                      <MapPin size={12} className="text-emerald-400 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {sharingEnabled && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.shareWith') || 'Поделиться с'}</div>
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('locationSharing.search') || 'Поиск...'}
                      className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-slate-800 rounded-lg border-0 outline-none text-slate-200 placeholder:text-slate-500" />
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {filteredContacts.slice(0, 8).map(c => (
                      <button key={c.id} onClick={() => {
                        if (sharedWith.includes(c.id)) { onUnshareWith?.(c.id); setSharedWith(prev => prev.filter(id => id !== c.id)); }
                        else { onShareWith?.(c.id); setSharedWith(prev => [...prev, c.id]); }
                      }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-left">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                          {c.photo_url ? <img src={c.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-[9px] font-bold text-slate-400">{(c.full_name || '?')[0]}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-slate-200 truncate">{c.full_name}</div>
                        </div>
                        {sharedWith.includes(c.id) && <Check size={12} className="text-emerald-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== MOBILE: Compact dark pill ===== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[60px] z-[480]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="w-full flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setExpanded(e => !e)}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500">
                <Share2 size={12} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-[11px] font-bold text-white">{t('locationSharing.title') || 'Геолокация'}</div>
                <div className="text-[8px] text-slate-400">{contactLocations.length} {t('locationSharing.online') || 'онлайн'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSharing?.(); }}
                className={`w-9 h-5 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${sharingEnabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
              </button>
              <div className="cursor-pointer" onClick={() => setExpanded(e => !e)}>
                {expanded
                  ? <ChevronDown size={14} className="text-slate-400" />
                  : <ChevronUp size={14} className="text-slate-400" />}
              </div>
            </div>
          </div>
          {expanded && (
            <div className="border-t border-slate-700/60 px-3 py-2.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">{t('locationSharing.shareMyLocation') || 'Делиться позицией'}</span>
                <button onClick={onToggleSharing} className={`w-9 h-5 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${sharingEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {contactLocations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.nearby') || 'Контакты'}</div>
                  {contactLocations.map(loc => (
                    <div key={loc.user_id} className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-800/50">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                        {loc.photo_url ? <img src={loc.photo_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-white text-[9px] font-bold">{(loc.full_name || '?')[0]}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold text-slate-200 truncate">{loc.full_name}</div>
                        <div className="text-[8px] text-slate-500">{formatTime(loc.updated_at)}</div>
                      </div>
                      <MapPin size={10} className="text-emerald-400 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {sharingEnabled && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('locationSharing.shareWith') || 'Поделиться с'}</div>
                  <div className="relative">
                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('locationSharing.search') || 'Поиск...'}
                      className="w-full pl-6 pr-3 py-1.5 text-[10px] bg-slate-800 rounded-lg border-0 outline-none text-slate-200 placeholder:text-slate-500" />
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
            </div>
          )}
        </div>
      </div>

      {expanded && <div className="md:hidden fixed inset-0 bg-black/20 z-[470]" onClick={() => setExpanded(false)} />}
    </>
  );
}
