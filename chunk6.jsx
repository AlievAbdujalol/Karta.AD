// ---------------------------------------------------------------------------
// Main component: RoutingPanel
// ---------------------------------------------------------------------------

export default function RoutingPanel({
  onClose,
  onRouteBuilt,
  onStartNavigation,
  onRequestMapPick,
  mapPickResult,
  mapPickTarget,
  routes = [],
  vehicles = [],
}) {
  const navigate = useNavigate();
  const navCtl = useNavigation();

  // Points
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  // Mode
  const [transportMode, setTransportMode] = useState('driving');

  // Route state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [osrmRoute, setOsrmRoute] = useState(null);
  const [transitResults, setTransitResults] = useState(null);
  const [selectedTransitIdx, setSelectedTransitIdx] = useState(0);
  const [fallbackWalk, setFallbackWalk] = useState(null);

  // UI
  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const autoLocatedRef = useRef(false);

  // ── Map pick ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapPickResult?.target) return;
    const place = mapPickResult;
    if (place.target === 'from') {
      setFrom(place); setFromText(place.shortName || place.name || ''); pushRecent(place);
    } else if (place.target === 'to') {
      setTo(place); setToText(place.shortName || place.name || ''); pushRecent(place);
    }
  }, [mapPickResult]);

  // ── Auto-geolocation "Откуда" ─────────────────────────────────────────────

  useEffect(() => {
    if (autoLocatedRef.current || from || fromText) return;
    if (!navigator.geolocation) return;
    autoLocatedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&lat=${lat}&lon=${lng}`,
            { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(4000) },
          );
          if (resp.ok) {
            const d = await resp.json();
            if (d.display_name) shortName = d.display_name.split(',').slice(0, 2).join(', ');
          }
        } catch {}
        const place = { lat, lng, name: shortName, shortName };
        setFrom(place); setFromText(shortName); pushRecent(place);
        toast.success('«Откуда» — ваше местоположение');
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fill field with geolocation ───────────────────────────────────────────

  const fillWithMyLocation = useCallback(async (target) => {
    if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
    const tid = toast.loading('Определяем местоположение…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let shortName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ru&lat=${lat}&lon=${lng}`,
            { headers: { 'User-Agent': 'KartaAD/1.0' }, signal: AbortSignal.timeout(4000) },
          );
          if (resp.ok) {
            const d = await resp.json();
            if (d.display_name) shortName = d.display_name.split(',').slice(0, 2).join(', ');
          }
        } catch {}
        const place = { lat, lng, name: shortName, shortName };
        if (target === 'from') { setFrom(place); setFromText(shortName); }
        else { setTo(place); setToText(shortName); }
        pushRecent(place);
        toast.dismiss(tid);
        toast.success('Местоположение установлено');
      },
      (err) => {
        toast.dismiss(tid);
        toast.error(err.code === 1 ? 'Разрешите доступ к геолокации' : 'Не удалось получить местоположение');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }, []);
