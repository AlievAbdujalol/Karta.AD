import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';

export default function ConnectivityIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Mocking sync state check - in a real app, subscribe to IndexedDB sync events
    const syncInterval = setInterval(() => {
      // Example: check if there's pending data to sync
      const pendingData = localStorage.getItem('pending_sync');
      setIsSyncing(!!pendingData);
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, []);

  return (
    <div className={`fixed top-4 right-4 z-[1000] px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-lg ${isOnline ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
      {isOnline ? (
        <>
          <Wifi size={12} />
          {isSyncing ? (
            <span className="flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" />
              {t('connectivity.syncing')}
            </span>
          ) : (
            <span>{t('connectivity.online')}</span>
          )}
        </>
      ) : (
        <>
          <WifiOff size={12} />
          <span>{t('connectivity.offline')}</span>
        </>
      )}
    </div>
  );
}
