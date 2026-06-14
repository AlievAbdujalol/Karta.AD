import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Загружаем профиль пользователя из таблицы profiles
  // Если профиль не существует — создаём его автоматически
  const loadUserProfile = async (authUser) => {
    if (!authUser) return null;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profile) {
      const localRole = localStorage.getItem(`demo_role_${authUser.id}`);
      const localAdminActivated = localStorage.getItem(`demo_admin_activated_${authUser.id}`);
      if (localRole) profile.role = localRole;
      if (localAdminActivated) profile.admin_activated = localAdminActivated === 'true';
      return profile;
    }

    // Профиль не найден — создаём с базовыми данными из OAuth
    const newProfile = {
      id: authUser.id,
      email: authUser.email,
      full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
      photo_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null,
      role: 'passenger',
      language: 'ru',
    };

    const { data: created } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    return created || newProfile;
  };

  useEffect(() => {
    // Получаем текущую сессию при монтировании
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await loadUserProfile(session.user);
        setUser(profile || { ...session.user, id: session.user.id });
        setIsAuthenticated(true);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    // Слушаем изменения сессии (вход / выход / обновление токена)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await loadUserProfile(session.user);
          setUser(profile || { ...session.user, id: session.user.id });
          setIsAuthenticated(true);
          setAuthError(null);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Тихое обновление токена — профиль не перезагружаем
        }
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Вход через Google OAuth
  const navigateToLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      console.error('[Auth] Google login error:', error.message);
      setAuthError({ type: 'login_error', message: error.message });
    }
  };

  // Выход
  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      window.location.href = '/';
    }
  };

  // Повторная проверка сессии (совместимость с ProtectedRoute)
  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profile = await loadUserProfile(session.user);
      setUser(profile || { ...session.user, id: session.user.id });
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Not authenticated' });
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  // Тихое обновление профиля без блокировки UI (setIsLoadingAuth не трогаем)
  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profile = await loadUserProfile(session.user);
      if (profile) setUser(profile);
    }
  };

  // Мгновенное локальное обновление user (без запроса к серверу)
  const patchUser = (data) => {
    setUser(prev => prev ? { ...prev, ...data } : prev);
  };

  // Повторная проверка состояния приложения (совместимость с App.jsx)
  const checkAppState = checkUserAuth;

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      refreshUser,
      patchUser,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
