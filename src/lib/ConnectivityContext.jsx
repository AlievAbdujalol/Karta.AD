import { createContext, useContext, useState, useEffect } from 'react';

const ConnectivityContext = createContext({
  isOnline: true,
  syncState: 'synced',
  forceOffline: false,
  setForceOffline: () => {},
});

export function ConnectivityProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState('synced');
  const [forceOffline, setForceOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSyncStart = () => setSyncState('syncing');
    const handleSyncEnd = () => setSyncState('synced');
    const handleSyncError = () => setSyncState('error');

    window.addEventListener('cache-sync-start', handleSyncStart);
    window.addEventListener('cache-sync-end', handleSyncEnd);
    window.addEventListener('cache-sync-error', handleSyncError);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('cache-sync-start', handleSyncStart);
      window.removeEventListener('cache-sync-end', handleSyncEnd);
      window.removeEventListener('cache-sync-error', handleSyncError);
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{ isOnline: isOnline && !forceOffline, syncState, forceOffline, setForceOffline }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export const useConnectivity = () => useContext(ConnectivityContext);
