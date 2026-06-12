import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Home from './pages/Home';
import DriverDashboard from './pages/DriverDashboard';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile';
import Reviews from './pages/Reviews';
import DriverSchedule from './pages/DriverSchedule';
import Login from './pages/Login';
import ErrorBoundary, { BusMapErrorFallback } from '@/components/ErrorBoundary';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  // Если не авторизован — показываем страницу входа
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ErrorBoundary fallback={(err) => <BusMapErrorFallback error={err} />}><Home /></ErrorBoundary>} />
          <Route path="/driver" element={<ErrorBoundary><DriverDashboard /></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
          <Route path="/reviews" element={<ErrorBoundary><Reviews /></ErrorBoundary>} />
          <Route path="/driver-schedule" element={<ErrorBoundary><DriverSchedule /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </ErrorBoundary>
  );
};

import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/lib/NotificationContext';

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NotificationProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  )
}

export default App