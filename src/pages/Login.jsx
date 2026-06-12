import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabase';
import { Bus, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const { navigateToLogin } = useAuth();
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Неверный email или пароль');
    }
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Проверьте почту для подтверждения регистрации');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <Bus size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Karta.AD</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Транспортная карта Андижана</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
          {/* Tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-6">
            {[
              { id: 'signin', label: 'Войти' },
              { id: 'signup', label: 'Регистрация' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === id
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">Пароль</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === 'signup' ? 'Минимум 6 символов' : '••••••••'}
                  minLength={tab === 'signup' ? 6 : undefined}
                  className="w-full pl-9 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-95"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {tab === 'signin' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
            <span className="text-xs text-gray-400">или</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
          </div>

          {/* Google OAuth */}
          <button
            onClick={navigateToLogin}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M47.532 24.552c0-1.636-.146-3.2-.418-4.698H24.48v9.01h13.02c-.57 2.994-2.26 5.532-4.8 7.232v6.01h7.764c4.544-4.19 7.068-10.36 7.068-17.554z" fill="#4285F4"/>
              <path d="M24.48 48c6.522 0 11.996-2.162 15.994-5.892l-7.764-6.012c-2.16 1.45-4.922 2.302-8.23 2.302-6.328 0-11.684-4.278-13.594-10.026H2.88v6.206C6.862 42.712 15.076 48 24.48 48z" fill="#34A853"/>
              <path d="M10.886 28.372A14.43 14.43 0 0 1 10.066 24c0-1.512.26-2.978.72-4.372v-6.206H2.88A23.94 23.94 0 0 0 .48 24c0 3.862.924 7.514 2.4 10.578l8.006-6.206z" fill="#FBBC05"/>
              <path d="M24.48 9.602c3.562 0 6.76 1.224 9.276 3.63l6.956-6.956C36.476 2.378 30.998 0 24.48 0 15.076 0 6.862 5.288 2.88 13.422l8.006 6.206c1.91-5.748 7.266-10.026 13.594-10.026z" fill="#EA4335"/>
            </svg>
            Войти через Google
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Karta.AD © 2025
        </p>
      </div>
    </div>
  );
}
