/**
 * base44Client.js — слой совместимости для миграции Base44 → Supabase
 *
 * Экспортирует объект `base44` с теми же методами, что использовались раньше,
 * но реализованными через Supabase.
 *
 * По мере обновления компонентов этот файл будет упрощаться,
 * пока не будет удалён полностью.
 */

import { supabase } from './supabase';
import { entities } from './entities';

// ─── Auth ────────────────────────────────────────────────────────────────────

const auth = {
  /**
   * Получить текущего пользователя (профиль из таблицы profiles)
   */
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw Object.assign(new Error('Not authenticated'), { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return profile || user;
  },

  /**
   * Обновить профиль текущего пользователя
   */
  async updateMe(data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id);

    if (error) throw new Error(error.message);
    return true;
  },

  /**
   * Выход из системы
   */
  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  },

  /**
   * Редирект на страницу входа (Google OAuth)
   */
  async redirectToLogin(returnUrl) {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl || window.location.origin },
    });
  },
};

// ─── Экспорт совместимого объекта ────────────────────────────────────────────

export const base44 = {
  auth,
  entities,
};
