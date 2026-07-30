import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabase';

/**
 * Хук для получения текущего пользователя.
 * Совместим с паттерном, который использовался с Base44.
 */
export function useCurrentUser() {
  const { user, isLoadingAuth: loading, checkUserAuth: refetch, refreshUser, patchUser } = useAuth();

  /**
   * Обновить поля профиля текущего пользователя
   * @param {Object} data - поля для обновления
   */
  const update = async (data) => {
    if (!user?.id) return;

    patchUser(data);

    let payload = { ...data };
    let { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id);

    if (error) {
      const msg = error.message || '';
      const isSchemaIssue = msg.includes('schema cache') || msg.includes('Could not find the');

      if (isSchemaIssue) {
        const allowed = ['language', 'phone', 'full_name', 'photo_url', 'city_id', 'role', 'driver_status', 'vehicle_number', 'bio', 'balance', 'subscription_status', 'subscription_paid_until', 'admin_activated'];
        const cleaned = Object.fromEntries(
          Object.entries(payload).filter(([k]) => allowed.includes(k))
        );
        const retry = await supabase
          .from('profiles')
          .update(cleaned)
          .eq('id', user.id);
        if (retry.error) {
          console.error('[useCurrentUser] update error after retry:', retry.error.message);
          refreshUser().catch(console.error);
          throw new Error(retry.error.message);
        }
        await refreshUser();
        return;
      }

      console.error('[useCurrentUser] update error:', error.message);
      refreshUser().catch(console.error);
      throw new Error(error.message);
    }

    await refreshUser();
  };

  return {
    user,
    loading,
    refetch,
    update,
    patchUser,
  };
}
