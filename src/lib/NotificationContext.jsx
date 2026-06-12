import { createContext, useContext, useState, useCallback } from 'react';

/**
 * @typedef {Object} NotificationContextValue
 * @property {number} count - Number of unread notifications
 * @property {Array} notifications - List of notification objects
 * @property {() => void} clear - Clears all notifications
 */

/** @type {import('react').Context<NotificationContextValue>} */
const NotificationContext = createContext({
  count: 0,
  notifications: [],
  clear: () => {},
});

/**
 * Provides notification state to the component tree.
 * @param {{ children: import('react').ReactNode }} props
 */
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const clear = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    count: notifications.length,
    notifications,
    clear,
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
