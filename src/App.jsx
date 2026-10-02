import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Login from './pages/Login';

const Home = lazy(() => import('./pages/Home'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Profile = lazy(() => import('./pages/Profile'));
const Reviews = lazy(() => import('./pages/Reviews'));
const DriverSchedule = lazy(() => import('./pages/DriverSchedule'));
const TaxiPassenger = lazy(() => import('./pages/TaxiPassenger'));
const TaxiDriverRegistration = lazy(() => import('./pages/TaxiDriverRegistration'));
const TaxiDriverDashboard = lazy(() => import('./pages/TaxiDriverDashboard'));
const TaxiHistory = lazy(() => import('./pages/TaxiHistory'));
const TaxiFinance = lazy(() => import('./pages/TaxiFinance'));
const OfflineMaps = lazy(() => import('./pages/OfflineMaps'));
const NavigatorSettings = lazy(() => import('./pages/NavigatorSettings'));
const VehicleSettings = lazy(() => import('./pages/VehicleSettings'));
const TruckSettings = lazy(() => import('./pages/TruckSettings'));
const DeliveryTracking = lazy(() => import('./pages/DeliveryTracking'));
const MerchantDashboard = lazy(() => import('./pages/MerchantDashboard'));
const BusinessDashboard = lazy(() => import('./pages/BusinessDashboard'));
const BusinessProducts = lazy(() => import('./pages/BusinessProducts'));
const BusinessOrders = lazy(() => import('./pages/BusinessOrders'));
const BusinessDelivery = lazy(() => import('./pages/BusinessDelivery'));
const BusinessAnalytics = lazy(() => import('./pages/BusinessAnalytics'));
const BusinessSettings = lazy(() => import('./pages/BusinessSettings'));
const BusinessAI = lazy(() => import('./pages/BusinessAI'));
const SiteView = lazy(() => import('./pages/SiteView'));

import ErrorBoundary, { BusMapErrorFallback } from '@/components/ErrorBoundary';
import { TripProvider } from '@/lib/TripContext';
import { NavigationProvider } from '@/lib/NavigationContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, user } = useAuth();

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
      <TripProvider user={user}>
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ErrorBoundary fallback={(err) => <BusMapErrorFallback error={err} />}><NavigationProvider><Home /></NavigationProvider></ErrorBoundary>} />
          <Route path="/driver" element={<ErrorBoundary><DriverDashboard /></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
          <Route path="/reviews" element={<ErrorBoundary><Reviews /></ErrorBoundary>} />
          <Route path="/driver-schedule" element={<ErrorBoundary><DriverSchedule /></ErrorBoundary>} />
          <Route path="/taxi" element={<ErrorBoundary><TaxiPassenger /></ErrorBoundary>} />
          <Route path="/taxi/register" element={<ErrorBoundary><TaxiDriverRegistration /></ErrorBoundary>} />
          <Route path="/taxi/driver" element={<ErrorBoundary><TaxiDriverDashboard /></ErrorBoundary>} />
          <Route path="/taxi/history" element={<ErrorBoundary><TaxiHistory /></ErrorBoundary>} />
          <Route path="/taxi/finance" element={<ErrorBoundary><TaxiFinance /></ErrorBoundary>} />
          <Route path="/business" element={<ErrorBoundary><BusinessDashboard /></ErrorBoundary>} />
          <Route path="/business/products" element={<ErrorBoundary><BusinessProducts /></ErrorBoundary>} />
          <Route path="/business/orders" element={<ErrorBoundary><BusinessOrders /></ErrorBoundary>} />
          <Route path="/business/delivery" element={<ErrorBoundary><BusinessDelivery /></ErrorBoundary>} />
          <Route path="/business/analytics" element={<ErrorBoundary><BusinessAnalytics /></ErrorBoundary>} />
          <Route path="/business/settings" element={<ErrorBoundary><BusinessSettings /></ErrorBoundary>} />
          <Route path="/business/ai" element={<ErrorBoundary><BusinessAI /></ErrorBoundary>} />
          <Route path="/offline-maps" element={<ErrorBoundary><OfflineMaps /></ErrorBoundary>} />
          <Route path="/settings/navigator" element={<ErrorBoundary><NavigatorSettings /></ErrorBoundary>} />
          <Route path="/settings/vehicle" element={<ErrorBoundary><VehicleSettings /></ErrorBoundary>} />
          <Route path="/settings/truck" element={<ErrorBoundary><TruckSettings /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </TripProvider>
    </ErrorBoundary>
  );
};

import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/lib/NotificationContext';

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <NotificationProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route
                  path="/track/:token"
                  element={
                    <Suspense
                      fallback={
                        <div className="fixed inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <DeliveryTracking />
                    </Suspense>
                  }
                />
                <Route
                  path="/merchant"
                  element={
                    <Suspense
                      fallback={
                        <div className="fixed inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <MerchantDashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="/s/:id"
                  element={
                    <Suspense
                      fallback={
                        <div className="fixed inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <SiteView />
                    </Suspense>
                  }
                />
                <Route path="*" element={<AuthenticatedApp />} />
              </Routes>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App