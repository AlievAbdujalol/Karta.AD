import { useState, useEffect } from 'react';
import { X, MapPin, Navigation, Loader2, Crosshair, Clock, History, Mic, MicOff, Star, Banknote, Share2 } from 'lucide-react';
import { buildOsrmRoute } from '@/lib/osrmClient';
import { toast } from 'sonner';
import { getSearchHistory, addToSearchHistory } from '@/lib/searchHistory';
import { toggleFavoriteRoute } from '@/lib/favorites';
import { estimatePublicTransportCost } from '@/lib/publicTransport';
import { formatTJS } from '@/lib/taxi';
import RouteFeedback from './RouteFeedback';
import LanguageSwitcher from './LanguageSwitcher';
import { useLanguage } from '@/lib/useLanguage';

export default function MultiStopPlanner({ onRouteBuilt, onRequestMapPick }) {
  const { t } = useLanguage();
  const [stops, setStops] = useState([
    { id: 'start', name: 'Начало', lat: null, lng: null },
    { id: 'end', name: 'Финиш', lat: null, lng: null }
  ]);
  const [calculating, setCalculating] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [listening, setListening] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [completedTripId, setCompletedTripId] = useState(null);

  useEffect(() => {
    setHistory(getSearchHistory());
    
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('share');
    if (shared) {
      try {
        const data = JSON.parse(atob(shared));
        if (data.stops) setStops(data.stops);
        if (data.routeInfo) setRouteInfo(data.routeInfo);
        toast.info("Маршрут успешно загружен");
      } catch (e) {
        toast.error("Не удалось загрузить маршрут");
      }
    }
  }, []);

  const startListening = (stopId) => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error("Ваш браузер не поддерживает голосовой ввод.");
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.onstart = () => setListening(stopId);
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setStops(stops.map(s => s.id === stopId ? { ...s, name: text } : s));
      setListening(null);
    };
    recognition.onerror = () => setListening(null);
    recognition.onend = () => setListening(null);
    recognition.start();
  };

  const addStop = () => setStops([...stops.slice(0, -1), { id: Date.now(), name: 'Точка', lat: null, lng: null }, stops[stops.length-1]]);
  const removeStop = (id) => setStops(stops.filter(s => s.id !== id));

  const selectHistory = (hStop, stopId) => {
    setStops(stops.map(s => s.id === stopId ? { ...s, ...hStop } : s));
  };

  const planRoute = async () => {
    if (stops.filter(s => s.lat).length < 2) {
      toast.error("Нужно как минимум две точки.");
      return;
    }
    setCalculating(true);
    const validStops = stops.filter(s => s.lat);
    validStops.forEach(s => addToSearchHistory({ name: s.name, lat: s.lat, lng: s.lng }));
    setHistory(getSearchHistory());

    const from = validStops[0];
    const to = validStops[validStops.length - 1];
    const waypoints = validStops.slice(1, -1);
    
    const route = await buildOsrmRoute(from, to, 'driving', { waypoints });
    if (route) {
      setRouteInfo(route);
      onRouteBuilt(route);
      setIsFav(false);
      setTimeout(() => {
          setCompletedTripId(Date.now().toString());
          setShowFeedback(true);
      }, 5000);
    } else {
      toast.error("Не удалось построить маршрут.");
    }
    setCalculating(false);
  };

  const handleToggleFav = () => {
    if(!routeInfo) return;
    toggleFavoriteRoute({ ...routeInfo, stops });
    setIsFav(!isFav);
    toast.success(isFav ? "Удалено из избранного" : "Добавлено в избранное");
  };

  const handleShare = () => {
    const data = { stops, routeInfo };
    const encoded = btoa(JSON.stringify(data));
    const url = `${window.location.origin}/planner?share=${encoded}`;
    if (navigator.share) {
      navigator.share({ title: 'Мой маршрут', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована в буфер обмена");
    }
  };

  const formatEta = (seconds) => {
    const mins = Math.round(seconds / 60);
    return mins > 60 ? `${Math.floor(mins/60)}ч ${mins%60}м` : `${mins}м`;
  };

  return (
    <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg space-y-3">
      {showFeedback && <RouteFeedback tripId={completedTripId} onClose={() => setShowFeedback(false)} />}
      <div className="flex justify-between items-center">
        <h3 className="font-bold">{t('planner.title')}</h3>
        <LanguageSwitcher />
      </div>
      {stops.map((stop, i) => {
        let cumulativeDuration = 0;
        if (routeInfo && routeInfo.legs) {
          for(let j=0; j < i && j < routeInfo.legs.length; j++) {
            cumulativeDuration += routeInfo.legs[j].duration;
          }
        }
        return (
          <div key={stop.id} className="flex gap-2 items-center">
            <MapPin size={16} className={i===0?"text-emerald-500":i===stops.length-1?"text-red-500":"text-blue-500"} />
            <input className="flex-1 p-2 rounded-lg bg-slate-100 text-xs" placeholder={stop.name} value={stop.name} readOnly />
            {routeInfo && i > 0 && (
              <span className="text-[10px] flex items-center gap-1 text-slate-500">
                <Clock size={10}/> {formatEta(cumulativeDuration)}
              </span>
            )}
            <button onClick={() => startListening(stop.id)} className={listening === stop.id ? "text-red-500" : ""}>
                {listening === stop.id ? <MicOff size={16}/> : <Mic size={16}/>}
            </button>
            <button onClick={() => onRequestMapPick(stop.id)}><Crosshair size={16}/></button>
            {stops.length > 2 && i > 0 && i < stops.length - 1 && <button onClick={() => removeStop(stop.id)}><X size={16}/></button>}
          </div>
        );
      })}
      
      {routeInfo && (
        <div className="text-xs text-slate-700 dark:text-slate-300 font-bold p-2 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-between">
            <span className="flex items-center gap-1"><Banknote size={14}/> {t('planner.price')}:</span>
            <span>{formatTJS(estimatePublicTransportCost(routeInfo.distance))} TJS</span>
        </div>
      )}

      <div className="text-xs text-slate-500 font-bold mt-2 flex items-center gap-1"><History size={12}/> {t('planner.recent')}</div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {history.map((h, i) => (
          <button key={i} onClick={() => selectHistory(h, stops[stops.length-1].id)} className="bg-slate-100 p-2 rounded-lg text-[10px] whitespace-nowrap">
            {h.name}
          </button>
        ))}
      </div>

      <button onClick={addStop} className="text-xs text-blue-600 font-bold">{t('planner.addPoint')}</button>
      <button onClick={planRoute} disabled={calculating} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center justify-center gap-2">
        {calculating ? <Loader2 className="animate-spin"/> : <Navigation size={16}/>} {t('planner.plan')}
      </button>
      {routeInfo && (
        <>
          <button onClick={handleToggleFav} className="w-full py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold flex items-center justify-center gap-2">
            <Star size={16} className={isFav ? "fill-yellow-500 text-yellow-500" : ""}/> {isFav ? "В избранном" : t('planner.fav')}
          </button>
          <button onClick={handleShare} className="w-full py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-bold flex items-center justify-center gap-2">
            <Share2 size={16}/> {t('planner.share')}
          </button>
        </>
      )}
    </div>
  );
}
