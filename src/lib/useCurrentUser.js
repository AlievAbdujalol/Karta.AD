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

    // Мгновенно обновляем локальный стейт — Layout/Profile получат новую роль сразу
    patchUser(data);

    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id);

    if (error) {
      console.error('[useCurrentUser] update error:', error.message);
      // Откатываем локальный патч если БД вернула ошибку
      refreshUser().catch(console.error);
      throw new Error(error.message);
    }
  };

  return {
    user,
    loading,
    refetch,
    update,
  };
}
