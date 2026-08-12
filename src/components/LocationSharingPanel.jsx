import { useState, useEffect } from 'react';
import { MapPin, Share2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { supabase } from '@/api/supabase';

export default function LocationSharingPanel({ contactLocations = [], sharingEnabled, onToggleSharing, onShareWith, onUnshareWith }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, photo_url, phone')
      .then(({ data }) => {
        if (data) setContacts(data);
      }).catch(() => {});
  }, []);

  const filteredContacts = contacts.filter(c =>
    c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const formatTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="absolute bottom-20 md:bottom-6 right-4 z-[250] w-[min(280px,calc(100vw-32px))]">
      <div className="rounded-[20px] overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)]">
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-500">
              <Share2 size={13} className="text-white" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{t('locationSharing.title') || 'Геолокация'}</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-500">
                {contactLocations.length} {t('locationSharing.online') || 'онлайн'}
              </div>
            </div>
          </div>
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
        </button>

        {expanded && (
          <div className="border-t border-slate-100 dark:border-slate-800/80 px-4 py-3 space-y-3">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {t('locationSharing.shareMyLocation') || 'Делиться позицией'}
              </span>
              <button
                onClick={onToggleSharing}
                className={`w-10 h-5 rounded-full transition-colors ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${sharingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Contact locations */}
            {contactLocations.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t('locationSharing.nearby') || 'Контакты'}
                </div>
                {contactLocations.map(loc => (
                  <div key={loc.user_id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/50 dark:bg-slate-800/40">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                      {loc.photo_url ? (
                        <img src={loc.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-white text-xs font-bold">{(loc.full_name || '?')[0]}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{loc.full_name}</div>
                      <div className="text-[9px] text-slate-400">{formatTime(loc.updated_at)}</div>
                    </div>
                    <MapPin size={12} className="text-emerald-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* Share with contacts */}
            {sharingEnabled && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t('locationSharing.shareWith') || 'Поделиться с'}
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('locationSharing.search') || 'Поиск...'}
                    className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-slate-100 dark:bg-slate-800 rounded-lg border-0 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredContacts.slice(0, 10).map(c => (
                    <ContactRow key={c.id} contact={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactRow({ contact }) {
  return (
    <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
        {contact.photo_url ? (
          <img src={contact.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          <span className="text-[9px] font-bold text-slate-500">{(contact.full_name || '?')[0]}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">{contact.full_name}</div>
      </div>
    </div>
  );
}
