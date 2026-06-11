import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabase';

/**
 * Хук для получения текущего пользователя.
 * Совместим с паттерном, который использовался с Base44.
 */
export function useCurrentUser() {
  const { user, isLoadingAuth: loading, checkUserAuth: refetch } = useAuth();

  /**
   * Обновить поля профиля текущего пользователя
   * @param {Object} data - поля для обновления
   */
  const update = async (data) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id);

    if (error) {
      console.error('[useCurrentUser] update error:', error.message);
      throw new Error(error.message);
    }

    // Обновляем сессию чтобы user в контексте был актуальным
    await refetch();
  };

  return {
    user,
    loading,
    refetch,
    update,
  };
}
