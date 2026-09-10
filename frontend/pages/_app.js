import "@/styles/globals.css";
import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';
import { MantineProvider } from '@mantine/core';
import NextJsApp from 'next/app';
import { useRouter } from "next/router";
import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import Head from "next/head";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getApiBaseUrl } from "../config";
import apiClient from "../lib/axios";
import Image from "next/image";
import ErrorBoundary from "../components/ErrorBoundary";
import {
  DEFAULT_SYSTEM_BACKGROUND,
  loadSystemBackgroundFromEnv,
} from "../lib/systemColors";
import DevToolsProtection from "../components/DevToolsProtection";
import { isIndexablePath } from "../lib/seo";

const SYSTEM_BG_STORAGE_KEY = 'system-page-bg';

function readCachedSystemBackground() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(SYSTEM_BG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function cacheSystemBackground(value) {
  if (typeof window === 'undefined' || !value) return;
  try {
    window.sessionStorage.setItem(SYSTEM_BG_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function applySystemBackground(value) {
  if (typeof document === 'undefined' || !value) return;
  document.documentElement.style.setProperty('--system-page-bg', value);
  cacheSystemBackground(value);
}

// DevTools protection lives in components/DevToolsProtection.jsx

/** Default robots for private/authenticated routes. Public pages override via SiteSeo. */
function DefaultRobotsMeta() {
  const router = useRouter();
  const path = String(router.pathname || '').split('?')[0];
  if (isIndexablePath(path)) return null;
  return (
    <Head>
      <meta key="robots" name="robots" content="noindex, nofollow" />
      <meta key="googlebot" name="googlebot" content="noindex, nofollow" />
    </Head>
  );
}

function Preloader({ background }) {
  const bg = background || DEFAULT_SYSTEM_BACKGROUND;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.3s ease-in-out'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div style={{
          position: 'relative',
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          <Image
            src="/logo.png"
            alt="Logo"
            width={150}
            height={150}
            style={{
              borderRadius: '50%',
              background: 'transparent',
            }}
          />
        </div>

        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(255, 255, 255, 0.3)',
          borderTop: '4px solid #1FA8DC',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function AccessDeniedPreloader() {
  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: 'white',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(255, 255, 255, 0.3)',
          borderTop: '4px solid #1FA8DC',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div>🔒 Access Denied</div>
        <div style={{ fontSize: '1rem', opacity: 0.8 }}>Redirecting to login...</div>
      </div>
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        body {
          overflow: hidden !important;
        }
        * {
          pointer-events: none !important;
        }
        body > * {
          filter: blur(15px) !important;
          -webkit-filter: blur(15px) !important;
        }
      `}</style>
    </>
  );
}

// Redirect to Login Preloader Component
function RedirectToLoginPreloader() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      color: 'white',
      fontSize: '1.2rem',
      fontWeight: 'bold',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '4px solid rgba(255, 255, 255, 0.3)',
        borderTop: '4px solid #1FA8DC',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <div>🔒 Redirecting to login...</div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Helper functions for route checking
const isDashboardRoute = (path) => {
  return path.startsWith('/dashboard');
};

const isStudentDashboardRoute = (path) => {
  return path.startsWith('/student_dashboard');
};

export default function App({ Component, pageProps, systemBackground }) {
  const isYtEmbed = Boolean(Component?.isYoutubeEmbedShell);
  const initialBg = isYtEmbed ? "#000" : systemBackground || DEFAULT_SYSTEM_BACKGROUND;
  const [pageBg, setPageBg] = useState(initialBg);

  // Sync when getInitialProps provides a new value (SSR / client navigation)
  useLayoutEffect(() => {
    if (Component?.isYoutubeEmbedShell) {
      if (typeof document !== "undefined") {
        document.documentElement.style.background = "#000";
        document.body.style.background = "#000";
        document.body.style.backgroundImage = "none";
        document.documentElement.style.backgroundImage = "none";
      }
      return;
    }
    if (systemBackground && systemBackground !== pageBg) {
      setPageBg(systemBackground);
    }
    applySystemBackground(systemBackground || pageBg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemBackground, Component]);

  // Always confirm against env via API so we never stick on the hardcoded default
  useEffect(() => {
    if (Component?.isYoutubeEmbedShell) return undefined;
    let cancelled = false;
    const ensureEnvBackground = async () => {
      try {
        const res = await fetch('/api/system/config');
        if (!res.ok) return;
        const data = await res.json();
        const nextBg = data?.page_background;
        if (!cancelled && nextBg) {
          setPageBg(nextBg);
          applySystemBackground(nextBg);
        }
      } catch {
        /* ignore */
      }
    };
    ensureEnvBackground();
    return () => {
      cancelled = true;
    };
  }, [Component]);

  // Create a new QueryClient instance
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 20 * 60 * 1000, // 20 minutes
        retry: 3,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchInterval: false,
        refetchIntervalInBackground: false,
      },
      mutations: {
        retry: 1,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000),
      },
    },
  }));

  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !isYtEmbed);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [isCheckingAdminAccess, setIsCheckingAdminAccess] = useState(false);
  const [isRouteChanging, setIsRouteChanging] = useState(false);
  const [showRedirectToLogin, setShowRedirectToLogin] = useState(false);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [devtoolsBlockEnabled, setDevtoolsBlockEnabled] = useState(null); // null = loading (fail open until known)
  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isSubscriptionEnabled, setIsSubscriptionEnabled] = useState(true); // Default to true

  // Define public pages using useMemo to prevent recreation on every render
  const publicPages = useMemo(() => ["/", "/sign-up", "/contact_developer", "/contact_assistants", "/welcome", "/leave-a-review", "/404", "/forgot_password", "/student_not_found", "/dashboard/student_info"], []);

  const isYoutubeEmbedShell = router.pathname.startsWith("/youtube-player");
  
  // Define pages that should never show header/footer (even if authenticated)
  const noHeaderFooterPages = useMemo(() => ["/", "/sign-up", "/leave-a-review", "/student_dashboard/my_homeworks/start", "/student_dashboard/my_quizzes/start"], []);
  
  // Define admin-only pages
  const adminPages = useMemo(() => [
    "/manage_assistants", 
    "/manage_assistants/add_assistant", 
    "/manage_assistants/edit_assistant", 
    "/manage_assistants/delete_assistant", 
    "/manage_assistants/all_assistants"
  ], []);

  // Define developer-only pages
  const developerPages = useMemo(() => [
    "/subscription_dashboard",
    "/subscription_dashboard/yearly",
    "/subscription_dashboard/monthly",
    "/subscription_dashboard/daily",
    "/subscription_dashboard/hourly",
    "/subscription_dashboard/minutely",
    "/subscription_dashboard/cancel"
  ], []);

  // Fetch DEVTOOLS_BLOCK configuration (null until loaded; fail open on error)
  useEffect(() => {
    if (Component?.isYoutubeEmbedShell) {
      setDevtoolsBlockEnabled(false);
      return undefined;
    }
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) {
          if (!cancelled) setDevtoolsBlockEnabled(false);
          return;
        }
        const config = await response.json();
        if (!cancelled) {
          setDevtoolsBlockEnabled(config.DEVTOOLS_BLOCK === true);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch DEVTOOLS_BLOCK config:', error);
        }
        if (!cancelled) setDevtoolsBlockEnabled(false);
      }
    };
    fetchConfig();
    return () => {
      cancelled = true;
    };
  }, [Component]);

  // Fetch SYSTEM_SUBSCRIPTION configuration
  useEffect(() => {
    if (Component?.isYoutubeEmbedShell) return undefined;
    const fetchSystemConfig = async () => {
      try {
        const response = await fetch('/api/system/config');
        if (response.ok) {
          const config = await response.json();
          setIsSubscriptionEnabled(config.subscription === true);
        }
      } catch (error) {
        console.error('Failed to fetch system config for subscription:', error);
        setIsSubscriptionEnabled(true); // Default to true if config can't be loaded
      }
    };
    fetchSystemConfig();
  }, [Component]);

  useEffect(() => {
    if (Component?.isYoutubeEmbedShell) {
      setIsLoading(false);
      return undefined;
    }
    const checkAuth = async () => {
      try {
        // Check authentication with server (cookies are sent automatically)
        const response = await apiClient.get('/api/auth/me');

        if (response.status === 200) {
          setIsAuthenticated(true);
          setUserRole(response.data.role);
          const role = response.data.role;
          
          // Check if student is trying to access staff dashboard
          if (isDashboardRoute(router.pathname) && role === 'student') {
            setShowAccessDenied(true);
            setTimeout(() => {
              setShowAccessDenied(false);
              router.push("/student_dashboard");
            }, 1000);
          }

          // Check if staff/admin/developer is trying to access student dashboard
          if (isStudentDashboardRoute(router.pathname) && role !== 'student') {
            setShowAccessDenied(true);
            setTimeout(() => {
              setShowAccessDenied(false);
              router.push("/dashboard");
            }, 1000);
          }
          
          // Check if user is trying to access admin pages but is not admin or developer
          if (adminPages.includes(router.pathname) && role !== 'admin' && role !== 'developer') {
            setShowAccessDenied(true);
            // Redirect to appropriate dashboard based on role
            setTimeout(() => {
              setShowAccessDenied(false);
              if (role === 'student') {
                router.push("/student_dashboard");
              } else {
                router.push("/dashboard");
              }
            }, 1000);
          }

          // Check if user is trying to access developer pages but is not developer
          if (developerPages.includes(router.pathname) && role !== 'developer') {
            setShowAccessDenied(true);
            // Redirect to appropriate dashboard based on role
            setTimeout(() => {
              setShowAccessDenied(false);
              if (role === 'student') {
                router.push("/student_dashboard");
              } else {
                router.push("/dashboard");
              }
            }, 1000);
          }
        } else {
          // Token invalid
          setIsAuthenticated(false);
          setUserRole(null);
        }
      } catch (error) {
        // Token invalid or expired - only set to false if we're not on a public page
        // This prevents redirect loops when the API call fails temporarily
        if (!publicPages.includes(router.pathname) && !router.pathname.startsWith("/youtube-player")) {
          setIsAuthenticated(false);
          setUserRole(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router.pathname, adminPages, developerPages, publicPages, router, Component]);

  // Handle route changes for main preloader
  useEffect(() => {
    const handleRouteStart = () => {
      setIsRouteChanging(true);
    };

    const handleRouteComplete = () => {
      setIsRouteChanging(false); // Hide preloader immediately when page loads
    };

    const handleRouteError = () => {
      setIsRouteChanging(false);
    };

    router.events.on('routeChangeStart', handleRouteStart);
    router.events.on('routeChangeComplete', handleRouteComplete);
    router.events.on('routeChangeError', handleRouteError);

    return () => {
      router.events.off('routeChangeStart', handleRouteStart);
      router.events.off('routeChangeComplete', handleRouteComplete);
      router.events.off('routeChangeError', handleRouteError);
    };
  }, [router]);

  // Redirect to login if not authenticated and trying to access protected page
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !publicPages.includes(router.pathname) && !isYoutubeEmbedShell) {
      // Show redirect to login preloader before redirect
      setShowRedirectToLogin(true);
      
      // Save the current path for redirect after login (except dashboards)
      if (router.pathname !== "/dashboard" && router.pathname !== "/student_dashboard") {
        // Store redirect path in a cookie or use router state
        document.cookie = `redirectAfterLogin=${router.pathname}; path=/; max-age=300`; // 5 minutes
      }
      
      // Redirect after showing preloader for 1 second
      setTimeout(() => {
        setShowRedirectToLogin(false); // Reset the state
        router.push("/");
      }, 1000); // Show preloader for 1 second
    }
  }, [isLoading, isAuthenticated, router.pathname, publicPages, router, isYoutubeEmbedShell]);

  // Check admin access for current route
  useEffect(() => {
    const checkAdminAccess = async () => {
      // Only check if user is authenticated and trying to access admin pages
      if (isAuthenticated && adminPages.includes(router.pathname)) {
        try {
          const response = await apiClient.get('/api/auth/me');
          
          if (response.data.role !== 'admin' && response.data.role !== 'developer') {
            setShowAccessDenied(true);
            // Redirect to appropriate dashboard based on role
            setTimeout(() => {
              setShowAccessDenied(false);
              if (response.data.role === 'student') {
                router.push("/student_dashboard");
              } else {
                router.push("/dashboard");
              }
            }, 1000);
          }
        } catch (error) {
          // Handle 401 (Unauthorized) errors gracefully - token expired or invalid
          if (error.response?.status === 401) {
            // Token validation failed, user needs to re-authenticate
            setIsAuthenticated(false);
            setUserRole(null);
            // The redirect to login will be handled by the useEffect that watches isAuthenticated
          } else {
            // For other errors, log them but don't break the flow
          console.error("❌ Error checking admin access:", error);
          }
        }
      }
    };

    // Only check admin access when route changes to an admin page
    if (isAuthenticated && adminPages.includes(router.pathname)) {
      checkAdminAccess();
    }
  }, [router.pathname, isAuthenticated, adminPages, router]);

  // Check developer access for current route
  useEffect(() => {
    const checkDeveloperAccess = async () => {
      // Only check if user is authenticated and trying to access developer pages
      if (isAuthenticated && developerPages.includes(router.pathname)) {
        try {
          const response = await apiClient.get('/api/auth/me');
          
          if (response.data.role !== 'developer') {
            setShowAccessDenied(true);
            // Redirect to appropriate dashboard based on role
            setTimeout(() => {
              setShowAccessDenied(false);
              if (response.data.role === 'student') {
                router.push("/student_dashboard");
              } else {
                router.push("/dashboard");
              }
            }, 1000);
          }
        } catch (error) {
          // Handle 401 (Unauthorized) errors gracefully - token expired or invalid
          if (error.response?.status === 401) {
            // Token validation failed, user needs to re-authenticate
            setIsAuthenticated(false);
            setUserRole(null);
            // The redirect to login will be handled by the useEffect that watches isAuthenticated
          } else {
            // For other errors, log them but don't break the flow
          console.error("❌ Error checking developer access:", error);
          }
        }
      }
    };

    // Only check developer access when route changes to a developer page
    if (isAuthenticated && developerPages.includes(router.pathname)) {
      checkDeveloperAccess();
    }
  }, [router.pathname, isAuthenticated, developerPages, router]);

  // Check dashboard access (staff/admin/developer only)
  useEffect(() => {
    const checkDashboardAccess = async () => {
      // Only check if user is authenticated and trying to access dashboard routes
      if (isAuthenticated && isDashboardRoute(router.pathname)) {
        try {
          const response = await apiClient.get('/api/auth/me');
          
          // Only allow assistant, admin, or developer roles
          if (response.data.role === 'student') {
            setShowAccessDenied(true);
            setTimeout(() => {
              setShowAccessDenied(false);
              router.push("/student_dashboard");
            }, 1000);
          }
        } catch (error) {
          // Handle 401 (Unauthorized) errors gracefully - token expired or invalid
          if (error.response?.status === 401) {
            // Token validation failed, user needs to re-authenticate
            setIsAuthenticated(false);
            setUserRole(null);
            // The redirect to login will be handled by the useEffect that watches isAuthenticated
          } else {
            // For other errors, log them but don't break the flow
          console.error("❌ Error checking dashboard access:", error);
          }
        }
      }
    };

    // Only check dashboard access when route changes to a dashboard page
    if (isAuthenticated && isDashboardRoute(router.pathname)) {
      checkDashboardAccess();
    }
  }, [router.pathname, isAuthenticated, router]);


  // Reset Access Denied state when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      setShowAccessDenied(false);
    }
  }, [isAuthenticated]);

  // Fetch subscription data when authenticated (only if subscription system is enabled)
  useEffect(() => {
    // Routes where subscription polling should be disabled (but still allow initial fetch)
    const skipSubscriptionPollingRoutes = [
      '/dashboard/manage_online_system/online_sessions',
      '/dashboard/manage_online_system/homeworks',
      '/dashboard/manage_online_system/quizzes'
    ];
    
    // Check if current route should skip subscription polling
    const shouldSkipPolling = router.pathname.startsWith('/student_dashboard') || 
                             router.pathname.startsWith('/dashboard/manage_online_system/online_mock_exams') ||
                             skipSubscriptionPollingRoutes.includes(router.pathname);
    
    // Students don't need subscription data at all, so skip entirely on student_dashboard
    const shouldSkipEntirely = router.pathname.startsWith('/student_dashboard');
    
    let isInitialLoad = true; // Track if this is the first load
    
    const fetchSubscription = async (isBackgroundPoll = false) => {
      if (!isSubscriptionEnabled || !isAuthenticated || publicPages.includes(router.pathname)) {
        setSubscription(null);
        return;
      }

      try {
        // Only show loading spinner on initial load, not during background polling
        if (!isBackgroundPoll) {
          setIsLoadingSubscription(true);
        }
        const response = await apiClient.get('/api/subscription');
        setSubscription(response.data);
      } catch (error) {
        const status = error.response?.status;
        const details = String(
          error.response?.data?.message ||
            error.response?.data?.error ||
            error.response?.data?.details ||
            error.message ||
            ''
        ).toLowerCase();
        const isAuthFailure =
          status === 401 ||
          status === 403 ||
          details.includes('token') ||
          details.includes('unauthorized') ||
          details.includes('jwt');

        setSubscription(null);

        if (isAuthFailure) {
          // Expired/invalid session — clear auth quietly (axios interceptor redirects on 401)
          if (status === 401) {
            setIsAuthenticated(false);
            setUserRole(null);
          }
        } else {
          console.warn('Subscription fetch failed:', status || error.message);
        }
      } finally {
        // Only clear loading spinner if it was set (not during background polling)
        if (!isBackgroundPoll) {
          setIsLoadingSubscription(false);
        }
      }
    };

    // Skip subscription entirely on student_dashboard (students don't need it)
    if (shouldSkipEntirely) {
      setSubscription(null);
      setIsLoadingSubscription(false);
      return;
    }

    // On routes that should skip polling, only do initial fetch (no 30-minute interval)
    if (shouldSkipPolling) {
      // Initial fetch only (no polling)
      fetchSubscription(false);
      return;
    }

    // Normal behavior: initial fetch + 30-minute polling
    // Initial fetch (with loading spinner)
    fetchSubscription(false);
    isInitialLoad = false;
    
    // Manual control: Refetch subscription every 30 minutes (reduced frequency)
    // Pass true to indicate this is a background poll (no loading spinner)
    const interval = setInterval(() => fetchSubscription(true), 30 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated, router.pathname, publicPages, isSubscriptionEnabled]);

  // Subscription countdown timer calculation
  useEffect(() => {
    // Only calculate timer if authenticated and subscription exists
    // Exclude only students, allow assistant, admin, and developer to see timer
    if (!isAuthenticated || !subscription || userRole === 'student') {
      setTimeRemaining(null);
      return;
    }

    // Simple logic: if active = false AND date_of_expiration = null, don't show timer
    if (subscription.active === false && !subscription.date_of_expiration) {
      setTimeRemaining(null);
      return;
    }

    // If date_of_expiration doesn't exist, don't show timer
    if (!subscription.date_of_expiration) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const expiration = new Date(subscription.date_of_expiration);
      const diff = expiration - now;

      // Calculate time components (use Math.max to ensure non-negative)
      let days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
      let hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      let minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
      let seconds = Math.max(0, Math.floor((diff % (1000 * 60)) / 1000));

      // Redistribute time: if hours is 00 and days > 0, borrow 1 day to fill hours
      if (hours === 0 && days > 0) {
        days -= 1;
        hours = 24;
      }
      // If minutes is 00 and hours > 0, borrow 1 hour to fill minutes
      if (minutes === 0 && hours > 0) {
        hours -= 1;
        minutes = 60;
      }
      // If seconds is 00 and minutes > 0, borrow 1 minute to fill seconds
      if (seconds === 0 && minutes > 0) {
        minutes -= 1;
        seconds = 60;
      }

      // Update timer with calculated values (always set, even if zero)
      setTimeRemaining({ days, hours, minutes, seconds });
    };

    // Calculate timer immediately
    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [subscription, userRole, isAuthenticated]);

  // Check if we should show subscription warning
  const shouldShowSubscriptionWarning = () => {
    // Don't show if subscription system is disabled
    if (!isSubscriptionEnabled) {
      return false;
    }

    // Don't show if not authenticated
    if (!isAuthenticated) {
      return false;
    }

    // Only hide for student role - show for assistant, admin, and developer
    if (userRole === 'student') {
      return false;
    }

    // Don't show on student_dashboard routes
    if (isStudentDashboardRoute(router.pathname)) {
      return false;
    }

    // Don't show if no subscription data
    if (!subscription) {
      return false;
    }

    // If subscription is expired (active = false and no date_of_expiration)
    if (subscription.active === false && !subscription.date_of_expiration) {
      return true;
    }

    // If subscription is active but expiring within 3 days
    if (subscription.active === true && subscription.date_of_expiration) {
      const now = new Date();
      const expiration = new Date(subscription.date_of_expiration);
      const fiveDaysBeforeExpiration = new Date(expiration);
      fiveDaysBeforeExpiration.setDate(fiveDaysBeforeExpiration.getDate() - 3);
      
      return now >= fiveDaysBeforeExpiration;
    }

    return false;
  };

  // Format remaining time for display
  const formatRemainingTime = () => {
    if (!timeRemaining) return '';
    const { days, hours, minutes, seconds } = timeRemaining;
    return `${String(days || 0).padStart(2, '0')} days : ${String(hours || 0).padStart(2, '0')} hours : ${String(minutes || 0).padStart(2, '0')} min : ${String(seconds || 0).padStart(2, '0')} sec`;
  };

  // Check subscription expiration and redirect non-developers/non-students to login (only if subscription system is enabled)
  useEffect(() => {
    // Skip if subscription system is disabled
    if (!isSubscriptionEnabled) return;

    // Only check if authenticated, not on public pages, and subscription data is loaded
    if (!isAuthenticated || publicPages.includes(router.pathname) || isLoadingSubscription || !subscription) {
      return;
    }

    // Allow developers and students to access regardless of subscription status
    if (userRole === 'developer' || userRole === 'student') {
      return;
    }

    // Check if subscription is inactive
    if (!subscription.active) {
      console.log('⏰ Subscription is inactive, redirecting to login...');
      setShowRedirectToLogin(true);
      setTimeout(() => {
        setShowRedirectToLogin(false);
        router.push("/");
      }, 1000);
      return;
    }

    // Check if subscription has expired (remaining time is 00:00:00:00)
    if (subscription.active && subscription.date_of_expiration) {
      const now = new Date();
      const expiration = new Date(subscription.date_of_expiration);
      const diff = expiration - now;

      if (diff <= 0) {
        // Subscription has expired
        console.log('⏰ Subscription has expired, redirecting to login...');
        setShowRedirectToLogin(true);
        setTimeout(() => {
          setShowRedirectToLogin(false);
          router.push("/");
        }, 1000);
        return;
      }

      // Calculate remaining time
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Check if all time components are zero
      if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
        console.log('⏰ Subscription remaining time is 00:00:00:00, redirecting to login...');
        setShowRedirectToLogin(true);
        setTimeout(() => {
          setShowRedirectToLogin(false);
          router.push("/");
        }, 1000);
      }
    }
  }, [isAuthenticated, subscription, isLoadingSubscription, router.pathname, publicPages, userRole, router, isSubscriptionEnabled]);

  // Note: Token expiry checking removed since we now use HTTP-only cookies
  // The server will handle token validation and expiry

  // Bare YouTube embed shell — detect via page flag (SSR-safe; never show system preloader)
  if (isYtEmbed || Component?.isYoutubeEmbedShell) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  // Show loading while checking authentication, subscription, or during route changes
  if (isLoading || (isSubscriptionEnabled && isAuthenticated && isLoadingSubscription && !publicPages.includes(router.pathname)) || isRouteChanging) {
    return <Preloader background={pageBg} />;
  }

  // Show redirect to login preloader if redirecting due to unauthorized access
  if (showRedirectToLogin) {
    return <RedirectToLoginPreloader />;
  }

  // Show access denied preloader if redirecting due to admin access denied
  if (showAccessDenied) {
    return <AccessDeniedPreloader />;
  }

  // For unauthorized users on protected pages, show loading (will redirect)
  if (!isAuthenticated && !publicPages.includes(router.pathname)) {
    return <Preloader background={pageBg} />;
  }

  // Only show Header/Footer if user is authenticated
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <MantineProvider forceColorScheme="light">
            <DefaultRobotsMeta />
            <DevToolsProtection
              userRole={userRole}
              authReady={!isLoading}
              devtoolsBlockEnabled={devtoolsBlockEnabled}
            />
            {router.pathname === "/dashboard/student_info" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "100vh",
                }}
              >
                <div style={{ flex: 1 }}>
                  <Component {...pageProps} />
                </div>
              </div>
            ) : router.pathname === "/welcome" || router.pathname === "/leave-a-review" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "100vh",
                }}
              >
                <Component {...pageProps} />
                {router.pathname === "/welcome" ? <Footer /> : null}
              </div>
            ) : (
              <Component {...pageProps} />
            )}
            {process.env.NODE_ENV === 'development' ? (
              <ReactQueryDevtools initialIsOpen={false} />
            ) : null}
          </MantineProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  // Check if current page should not show header/footer
  const shouldHideHeaderFooter = noHeaderFooterPages.includes(router.pathname);
  
  // If page should not show header/footer, render without them (like login page)
  if (shouldHideHeaderFooter) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <MantineProvider forceColorScheme="light">
            <DefaultRobotsMeta />
            <DevToolsProtection
              userRole={userRole}
              authReady={!isLoading}
              devtoolsBlockEnabled={devtoolsBlockEnabled}
            />
            <Component {...pageProps} />
            {process.env.NODE_ENV === 'development' ? (
              <ReactQueryDevtools initialIsOpen={false} />
            ) : null}
          </MantineProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <MantineProvider forceColorScheme="light">
          <DefaultRobotsMeta />
          <DevToolsProtection
            userRole={userRole}
            authReady={!isLoading}
            devtoolsBlockEnabled={devtoolsBlockEnabled}
          />
          <div className="page-container" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            minHeight: '100vh' 
          }}>
            <Header />
            
            {/* Subscription Warning - Show for assistant/admin/developer, not on student_dashboard */}
            {shouldShowSubscriptionWarning() && (
              <div className="subscription-warning" style={{
                background: 'linear-gradient(135deg, #dc3545 0%, #ff6b6b 100%)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '0 4px 16px rgba(220, 53, 69, 0.3)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 600,
                lineHeight: 1.5,
                maxWidth: '100%',
                margin: '10px 10px 0 10px'
              }}>
                <Image src="/alert-triangle.svg" alt="Warning" width={24} height={24} style={{ flexShrink: 0 }} />
                <div style={{ textAlign: 'center' }}>
                  {subscription.active === false && !subscription.date_of_expiration ? (
                    <span>
                      Subscription Expired, to renew contact{' '}
                      <a 
                        href="/contact_developer" 
                        onClick={(e) => {
                          e.preventDefault();
                          router.push('/contact_developer');
                        }}
                        style={{
                          color: '#ffffff',
                          textDecoration: 'underline',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Tony Joseph (developer)
                      </a>
                    </span>
                  ) : (
                    <span>
                      Subscription will expire after {formatRemainingTime()}, to renew contact{' '}
                      <a 
                        href="/contact_developer" 
                        onClick={(e) => {
                          e.preventDefault();
                          router.push('/contact_developer');
                        }}
                        style={{
                          color: '#ffffff',
                          textDecoration: 'underline',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Tony Joseph (developer)
                      </a>
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <style jsx>{`
              .subscription-warning {
                margin: 10px 10px 0 10px;
              }
              
              @media (max-width: 768px) {
                .subscription-warning {
                  margin: 10px 10px 0 10px;
                  padding: 12px 16px;
                  font-size: 14px;
                  gap: 10px;
                }
                .subscription-warning img {
                  width: 20px !important;
                  height: 20px !important;
                }
              }
              
              @media (max-width: 480px) {
                .subscription-warning {
                  margin: 10px 10px 0 10px;
                  padding: 10px 14px;
                  font-size: 13px;
                  gap: 8px;
                  flex-direction: column;
                  align-items: center;
                }
                .subscription-warning img {
                  width: 18px !important;
                  height: 18px !important;
                }
              }
            `}</style>
            
            {/* Session Expiry Warning */}
            {showExpiryWarning && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: '#ff6b6b',
                color: 'white',
                padding: '10px',
                textAlign: 'center',
                zIndex: 9999,
                fontWeight: 'bold'
              }}>
                ⚠️ Your session will expire soon. Please save your work and log in again.
              </div>
            )}
            
            <div className="content" style={{ flex: 1 }}>
              <Component {...pageProps} />
            </div>
            <Footer />
          </div>
          {process.env.NODE_ENV === 'development' ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}
        </MantineProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

// Ensures Custom App runs with the Pages Router context during `next build`
// static generation. Without this, `useRouter()` in this file can throw
// "NextRouter was not mounted" while prerendering pages.
App.getInitialProps = async (appContext) => {
  const appProps = await NextJsApp.getInitialProps(appContext);
  const path = String(appContext.ctx?.asPath || appContext.ctx?.pathname || "");
  const isYoutubeEmbed =
    path.includes("/api/youtube/") ||
    path.includes("/youtube-player/") ||
    appContext.Component?.isYoutubeEmbedShell;

  if (isYoutubeEmbed) {
    return { ...appProps, systemBackground: "#000" };
  }

  let systemBackground = DEFAULT_SYSTEM_BACKGROUND;

  if (typeof window === 'undefined') {
    try {
      systemBackground = loadSystemBackgroundFromEnv();
    } catch {
      /* keep default */
    }
  } else {
    // Client navigations cannot read env.config — use cache or API (never wipe SSR color with hardcoded default)
    const cached = readCachedSystemBackground();
    if (cached) {
      systemBackground = cached;
    } else {
      try {
        const res = await fetch('/api/system/config');
        if (res.ok) {
          const data = await res.json();
          if (data?.page_background) {
            systemBackground = data.page_background;
            cacheSystemBackground(systemBackground);
          }
        }
      } catch {
        /* keep default only as last resort */
      }
    }
  }

  return { ...appProps, systemBackground };
};
