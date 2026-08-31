import { useState, useEffect, useMemo } from 'react';
import {
  Share2, MapPin, LogOut, CheckCircle, Search, Check, ChevronDown,
  Users, Radio, Navigation, Clock, Footprints,
  Eye, Target, UserPlus, Copy,
} from 'lucide-react';
import { supabase } from '@/api/supabase';
import { toast } from 'sonner';

function fmtDist(m) {
  if (m == null) return null;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`;
  return `${Math.round(m)} м`;
}
function fmtEta(sec) {
  if (sec == null) return null;
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 мин';
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}
function statusDot(s) {
  if (s === 'moving') return 'bg-blue-400 animate-pulse';
  if (s === 'online') return 'bg-emerald-400';
  return 'bg-slate-500';
}
function statusLabel(s) {
  if (s === 'moving') return 'В движении';
  if (s === 'online') return 'Онлайн';
  return 'Оффлайн';
}

function MemberCard({ member, isSelf, onNavigateTo, onFlyTo }) {
  return (
    <div className={`rounded-2xl border p-3 flex items-center gap-3 transition-all ${
      member.status === 'offline'
        ? 'border-slate-700/30 bg-slate-800/20 opacity-60'
        : 'border-slate-700/50 bg-slate-800/50'
    }`}>
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
          isSelf ? 'bg-gradient-to-br from-emerald-500 to-teal-500 border-emerald-400'
          : member.role === 'creator' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-400'
          : 'bg-gradient-to-br from-violet-500 to-purple-600 border-violet-400'
        }`}>
          {member.photo_url
            ? <img src={member.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
            : <span className="text-white text-[13px] font-bold">{(member.full_name || '?')[0].toUpperCase()}</span>
          }
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${statusDot(member.status)}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-slate-100 truncate">{member.full_name || 'Участник'}</span>
          {isSelf && <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full">ВЫ</span>}
          {member.role === 'creator' && !isSelf && <span className="text-[9px] font-black text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded-full">СОЗДАТЕЛЬ</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium ${member.status === 'moving' ? 'text-blue-400' : member.status === 'online' ? 'text-emerald-400' : 'text-slate-500'}`}>
            {statusLabel(member.status)}
          </span>
          {member.distFromMe != null && !isSelf && (
            <>
              <span className="text-slate-600 text-[10px]">·</span>
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Footprints size={9} />{fmtDist(member.distFromMe)}</span>
            </>
          )}
          {member.etaSec != null && !isSelf && (
            <>
              <span className="text-slate-600 text-[10px]">·</span>
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock size={9} />{fmtEta(member.etaSec)}</span>
            </>
          )}
        </div>
      </div>

      {!isSelf && member.lat && member.lng && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => onFlyTo?.({ lat: member.lat, lng: member.lng })}
            className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center" title="Показать на карте">
            <Eye size={13} className="text-slate-300" />
          </button>
          <button onClick={() => onNavigateTo?.({ lat: member.lat, lng: member.lng, name: member.full_name || 'Участник' })}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center" title="Маршрут к нему">
            <Navigation size={13} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

function ContactRow({ contact, isShared, loading, onToggle }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-700/40 transition-all">
      <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {contact.photo_url
          ? <img src={contact.photo_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-[11px] font-bold text-slate-300">{(contact.full_name || '?')[0]}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-slate-200 truncate">{contact.full_name || 'Без имени'}</p>
        <p className="text-[10px] text-slate-500 truncate">{contact.phone || ''}</p>
      </div>
      <button onClick={onToggle} disabled={loading}
        className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
          isShared ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        } ${loading ? 'opacity-60 cursor-wait' : ''}`}>
        {isShared ? '✓ Доступ' : 'Дать доступ'}
      </button>
    </div>
  );
}

export default function GroupRoutePanel({
  groupRoute,
  members = [],
  onlineMembers = [],
  sharingEnabled,
  myPosition,
  meetPoint,
  onLeave,
  onFinish,
  onToggleSharing,
  contactLocations = [],
  onShareWith,
  onUnshareWith,
  onClose,
  onNavigateTo,
  onFlyTo,
  userId,
  onCreateGroup,
  selectedRoute,
}) {
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedWith, setSharedWith] = useState([]);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('members');
  const [loadingContact, setLoadingContact] = useState(null);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, photo_url, phone')
      .then(({ data }) => { if (data) setContacts(data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sharingEnabled) { setSharedWith([]); return; }
    supabase.from('location_shares').select('shared_with_id').eq('status', 'active')
      .then(({ data }) => { if (data) setSharedWith(data.map(r => r.shared_with_id)); }).catch(() => {});
  }, [sharingEnabled]);

  const filteredContacts = useMemo(() =>
    contacts.filter(c =>
      c.id !== userId &&
      (c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery))
    ), [contacts, searchQuery, userId]);

  const handleCreateGroupClick = () => {
    if (onCreateGroup) {
      const data = selectedRoute ? { routeId: selectedRoute.id, fromName: selectedRoute.name, fromLat: selectedRoute.stops?.[0]?.lat, fromLng: selectedRoute.stops?.[0]?.lng, toName: selectedRoute.stops?.[selectedRoute.stops.length-1]?.name, toLat: selectedRoute.stops?.[selectedRoute.stops.length-1]?.lat, toLng: selectedRoute.stops?.[selectedRoute.stops.length-1]?.lng } : {};
      onCreateGroup(data).then(g => { if (g) toast.success('Групповая поездка создана'); else toast.error('Не удалось создать'); });
    } else {
      toast.info('Постройте маршрут в «Найти маршрут» и нажмите «Поделиться поездкой»');
    }
  };

  const onlineCount = groupRoute ? onlineMembers.length : contactLocations.length;
  const inviteLink = groupRoute ? `${window.location.origin}/?group=${groupRoute.id}` : '';

  const copyInvite = async () => {
    if (!inviteLink) { toast.info('Сначала создайте группу'); return; }
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Ссылка скопирована — отправьте другу');
      setTimeout(() => setCopied(false), 2500);
    } catch { toast.info(inviteLink); }
  };

  const handleToggleContact = async (contactId, isShared) => {
    setLoadingContact(contactId);
    if (isShared) {
      await onUnshareWith?.(contactId);
      setSharedWith(prev => prev.filter(id => id !== contactId));
      toast.success('Доступ закрыт');
    } else {
      await onShareWith?.(contactId);
      setSharedWith(prev => [...prev.filter(id => id !== contactId), contactId]);
      toast.success('Геолокация открыта для этого пользователя');
    }
    setLoadingContact(null);
  };

  const panelContent = (
    <div className="space-y-3">

      {/* Переключатель вкладок */}
      <div className="flex gap-1.5 p-1 bg-slate-800/60 rounded-2xl">
        {[
          { id: 'members', label: 'Участники', icon: Users },
          { id: 'share', label: 'Поделиться', icon: Share2 },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all ${
              tab === id
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {/* ===== ВКЛАДКА УЧАСТНИКИ ===== */}
      {tab === 'members' && (
        <div className="space-y-3">

          {/* Активная группа */}
          {groupRoute ? (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold">
                <Radio size={11} className="animate-pulse" /> Групповой маршрут активен
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <MapPin size={10} className="text-emerald-400 flex-shrink-0" />
                <span className="truncate">{groupRoute.from_name || 'Откуда'}</span>
                <span className="text-slate-500">→</span>
                <span className="truncate">{groupRoute.to_name || 'Куда'}</span>
              </div>
              <button onClick={copyInvite}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 border border-emerald-500/20 text-[11px] font-bold text-emerald-400 hover:bg-slate-700 transition-colors">
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Ссылка скопирована!' : 'Скопировать ссылку-приглашение'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-800/40 border border-slate-700/40 p-3 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Users size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-200">Нет активной группы</p>
                <p className="text-[10px] text-slate-500">Постройте маршрут и нажмите «Поделиться поездкой»</p>
              </div>
            </div>
          )}

          {/* Точка встречи */}
          {meetPoint && onlineMembers.length >= 2 && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target size={13} className="text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-amber-300">Точка встречи (центр группы)</p>
                  <p className="text-[10px] text-slate-400">{meetPoint.lat.toFixed(4)}, {meetPoint.lng.toFixed(4)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onFlyTo?.(meetPoint)}
                  className="flex-1 py-1.5 rounded-xl bg-slate-800 border border-amber-500/20 text-[10px] font-bold text-amber-400 hover:bg-slate-700 flex items-center justify-center gap-1">
                  <Eye size={11} /> На карте
                </button>
                <button onClick={() => onNavigateTo?.({ lat: meetPoint.lat, lng: meetPoint.lng, name: 'Точка встречи' })}
                  className="flex-1 py-1.5 rounded-xl bg-amber-500 text-[10px] font-bold text-white hover:bg-amber-600 flex items-center justify-center gap-1">
                  <Navigation size={11} /> Маршрут
                </button>
              </div>
            </div>
          )}

          {/* Список участников группы */}
          {groupRoute && members.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 flex items-center gap-1">
                <Users size={10} /> Участники · {members.length}
              </p>
              {members.map(m => (
                <MemberCard
                  key={m.user_id}
                  member={m}
                  isSelf={m.user_id === userId}
                  onNavigateTo={onNavigateTo}
                  onFlyTo={onFlyTo}
                />
              ))}
            </div>
          )}

          {/* Контакты на карте (без группы) */}
          {!groupRoute && contactLocations.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-500 flex items-center gap-1">
                <MapPin size={10} /> Сейчас на карте · {contactLocations.length}
              </p>
              {contactLocations.map(loc => (
                <div key={loc.user_id} className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40">
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center overflow-hidden border-2 border-violet-400">
                      {loc.photo_url
                        ? <img src={loc.photo_url} alt="" className="w-full h-full object-cover" />
                        : <span className="text-white text-[11px] font-bold">{(loc.full_name || '?')[0]}</span>
                      }
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-200 truncate">{loc.full_name}</p>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> В сети
                      {loc.updated_at && (
                        <span className="text-slate-500 ml-1">· {new Date(loc.updated_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => onFlyTo?.({ lat: loc.lat, lng: loc.lng })}
                      className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center">
                      <Eye size={12} className="text-slate-300" />
                    </button>
                    <button onClick={() => onNavigateTo?.({ lat: loc.lat, lng: loc.lng, name: loc.full_name || 'Друг' })}
                      className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center">
                      <Navigation size={12} className="text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Действия группы */}
          {groupRoute && (
            <div className="flex gap-2 pt-1">
              <button onClick={onLeave}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-slate-700 border border-slate-700">
                <LogOut size={12} /> Выйти
              </button>
              <button onClick={onFinish}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-500">
                <CheckCircle size={12} /> Завершить
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== ВКЛАДКА ПОДЕЛИТЬСЯ ===== */}
      {tab === 'share' && (
        <div className="space-y-3">
          {/* Переключатель шаринга */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-slate-200">Транслировать геолокацию</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {sharingEnabled ? 'Выбранные друзья видят вас на карте' : 'Никто не видит где вы'}
              </p>
            </div>
            <button onClick={onToggleSharing}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${sharingEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sharingEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {!sharingEnabled && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400">
              <Radio size={11} /> Включите трансляцию чтобы выбрать друзей
            </div>
          )}

          {/* Поиск контактов */}
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени или телефону..."
              className="w-full pl-8 pr-3 py-2.5 text-[12px] bg-slate-800/60 rounded-xl border border-slate-700 outline-none text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50"
            />
          </div>

          {/* Список */}
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {filteredContacts.length === 0 ? (
              <p className="text-center text-[11px] text-slate-500 py-4">Контактов не найдено</p>
            ) : filteredContacts.slice(0, 12).map(c => {
              const isShared = sharedWith.includes(c.id);
              return (
                <ContactRow
                  key={c.id}
                  contact={c}
                  isShared={isShared}
                  loading={loadingContact === c.id}
                  onToggle={() => handleToggleContact(c.id, isShared)}
                />
              );
            })}
          </div>

          {sharedWith.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
              <Radio size={11} className="animate-pulse" />
              {sharedWith.length} {sharedWith.length === 1 ? 'пользователь видит' : 'пользователя видят'} вашу геолокацию
            </div>
          )}

          {/* Пригласить в группу */}
          {!groupRoute && (
            <button
              onClick={handleCreateGroupClick}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center gap-2 transition-colors">
              <UserPlus size={13} /> Создать совместную поездку
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* ===== DESKTOP ===== */}
      <div className="hidden md:block absolute top-[140px] right-4 z-[300] w-[360px]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/96 backdrop-blur-xl border border-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Share2 size={14} className="text-white" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-white leading-none">Геолокация / Группа</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {onlineCount > 0 ? `${onlineCount} онлайн` : 'Нет участников онлайн'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-slate-800 flex items-center justify-center">
              <ChevronDown size={15} className="text-slate-400" />
            </button>
          </div>
          <div className="px-4 py-3 max-h-[65vh] overflow-y-auto">
            {panelContent}
          </div>
        </div>
      </div>

      {/* ===== MOBILE ===== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[72px] z-[480]">
        <div className="rounded-2xl overflow-hidden bg-slate-900/96 backdrop-blur-xl border border-slate-700/60 shadow-[0_4px_24px_rgba(0,0,0,0.4)] max-h-[60vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Share2 size={12} className="text-white" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-white leading-none">Геолокация / Группа</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {onlineCount > 0 ? `${onlineCount} онлайн` : 'Нет участников'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-slate-800 flex items-center justify-center">
              <ChevronDown size={14} className="text-slate-400" />
            </button>
          </div>
          <div className="px-3 py-2.5 overflow-y-auto flex-1">
            {panelContent}
          </div>
        </div>
      </div>
    </>
  );
}
