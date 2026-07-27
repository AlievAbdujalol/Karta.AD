import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/useLanguage';

export default function Login() {
  const { navigateToLogin } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Karta.AD" className="w-20 h-20 object-contain mb-3 drop-shadow-lg" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Karta.AD</h1>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-5">
            {t('login.continuePrompt')}
          </p>

          <button
            onClick={navigateToLogin}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all active:scale-95 shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <path d="M47.532 24.552c0-1.636-.146-3.2-.418-4.698H24.48v9.01h13.02c-.57 2.994-2.26 5.532-4.8 7.232v6.01h7.764c4.544-4.19 7.068-10.36 7.068-17.554z" fill="#4285F4"/>
              <path d="M24.48 48c6.522 0 11.996-2.162 15.994-5.892l-7.764-6.012c-2.16 1.45-4.922 2.302-8.23 2.302-6.328 0-11.684-4.278-13.594-10.026H2.88v6.206C6.862 42.712 15.076 48 24.48 48z" fill="#34A853"/>
              <path d="M10.886 28.372A14.43 14.43 0 0 1 10.066 24c0-1.512.26-2.978.72-4.372v-6.206H2.88A23.94 23.94 0 0 0 .48 24c0 3.862.924 7.514 2.4 10.578l8.006-6.206z" fill="#FBBC05"/>
              <path d="M24.48 9.602c3.562 0 6.76 1.224 9.276 3.63l6.956-6.956C36.476 2.378 30.998 0 24.48 0 15.076 0 6.862 5.288 2.88 13.422l8.006 6.206c1.91-5.748 7.266-10.026 13.594-10.026z" fill="#EA4335"/>
            </svg>
            {t('login.loginWithGoogle')}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Karta.AD © 2026
        </p>
      </div>
    </div>
  );
}
