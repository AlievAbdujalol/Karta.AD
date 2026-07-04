import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/lib/AuthContext';

/**
 * @typedef {Object} NotificationContextValue
 * @property {number} count - Number of unread notifications
 * @property {any[]} notifications - List of notification objects
 * @property {() => Promise<void>} clear - Marks all notifications as read
 * @property {(transactionId: string) => Promise<boolean>} confirmPayment - RPC to confirm payment
 * @property {(transactionId: string) => Promise<boolean>} rejectPayment - RPC to reject payment
 * @property {(n: any) => void} addLocalNotification - Add a local notification
 */

/** @type {import('react').Context<NotificationContextValue>} */
const NotificationContext = createContext({
  count: 0,
  notifications: /** @type {any[]} */ ([]),
  clear: async () => {},
  confirmPayment: /** @type {(transactionId: string) => Promise<boolean>} */ (async () => false),
  rejectPayment: /** @type {(transactionId: string) => Promise<boolean>} */ (async () => false),
  addLocalNotification: (/** @type {any} */ n) => {},
});

/**
 * Provides notification state to the component tree.
 * @param {{ children: import('react').ReactNode }} props
 */
export function NotificationProvider({ children }) {
  const { user } = /** @type {any} */ (useAuth());
  const [notifications, setNotifications] = useState(/** @type {any[]} */ ([]));

  // Fetch and subscribe to notifications when user is logged in
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      
      if (!error) {
        setNotifications(data || []);
      }
    };

    fetchNotifications();

    // Subscribe to real-time insert/update on notifications table for current user
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        /** @param {any} payload */ (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => {
              // Avoid duplicates
              if (prev.some(n => n.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.is_read) {
              setNotifications(prev => prev.filter(n => n.id !== payload.new.id));
            } else {
              setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
            }
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const clear = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);

    if (error) {
      console.error('[NotificationContext] clear error:', error.message);
    } else {
      setNotifications([]);
    }
  }, [user?.id]);

  const confirmPayment = useCallback(async (/** @type {any} */ transactionId) => {
    const { data, error } = await supabase.rpc('confirm_payment', { transaction_id: transactionId });
    if (error) {
      console.error('[NotificationContext] confirmPayment error:', error.message);
      throw new Error(error.message);
    }
    return data;
  }, []);

  const rejectPayment = useCallback(async (/** @type {any} */ transactionId) => {
    const { data, error } = await supabase.rpc('reject_payment', { transaction_id: transactionId });
    if (error) {
      console.error('[NotificationContext] rejectPayment error:', error.message);
      throw new Error(error.message);
    }
    return data;
  }, []);

  const addLocalNotification = useCallback(/** @param {any} n */ (n) => {
    setNotifications(prev => [
      {
        id: String(Date.now()),
        title: n.title,
        body: n.body,
        type: n.type || 'local',
        is_read: false,
        created_at: new Date().toISOString(),
      },
      ...prev
    ]);
  }, []);

  const value = {
    count: notifications.length,
    notifications,
    clear,
    confirmPayment,
    rejectPayment,
    addLocalNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access the notification context.
 * @returns {NotificationContextValue}
 */
export function useNotificationCount() {
  return useContext(NotificationContext);
}

export default NotificationContext;
