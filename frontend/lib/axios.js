import axios from 'axios';
import { getApiBaseUrl } from '../config';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true, // This ensures cookies are sent with requests
  // 30 minutes covers slow networks uploading large PDFs (up to 200 MB).
  timeout: 30 * 60 * 1000,
  // Allow large request/response bodies when falling back to API base64 uploads.
  maxContentLength: 300 * 1024 * 1024,
  maxBodyLength: 300 * 1024 * 1024,
  headers: {
    'Content-Type': 'application/json',
  },
});

let handlingUnauthorized = false;

function isPublicBrowserPath(pathname) {
  const publicPaths = [
    '/',
    '/sign-up',
    '/forgot_password',
    '/welcome',
    '/contact_developer',
    '/contact_assistants',
    '/404',
    '/student_not_found',
    '/dashboard/student_info',
  ];
  return publicPaths.includes(pathname);
}

function shouldSkipUnauthorizedRedirect(url = '') {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/otp') ||
    url.includes('/api/auth/forgot') ||
    url.includes('/api/auth/reset') ||
    url.includes('/api/auth/signup') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/me')
  );
}

function hasPublicStudentInfoSig() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('sig');
  } catch {
    return false;
  }
}

async function redirectToLoginOnUnauthorized() {
  if (typeof window === 'undefined' || handlingUnauthorized) return;
  // Never force-login away from public pages or HMAC student links
  if (isPublicBrowserPath(window.location.pathname)) return;
  if (
    window.location.pathname.startsWith('/dashboard/student_info') &&
    hasPublicStudentInfoSig()
  ) {
    return;
  }

  handlingUnauthorized = true;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (_) {
    // Ignore logout failures — still send the user to login
  }

  window.location.assign('/');
}

// Request interceptor for debugging
apiClient.interceptors.request.use(
  (config) => {
    console.log('🚀 API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      withCredentials: config.withCredentials,
    });
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor — handle expired/missing sessions without crashing the UI
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data,
    });
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const details = String(
      error.response?.data?.message ||
        error.response?.data?.error ||
        error.response?.data?.details ||
        error.message ||
        ''
    ).toLowerCase();
    const looksLikeAuthFailure =
      status === 401 ||
      details.includes('token expired') ||
      details.includes('jwt expired') ||
      details.includes('no token') ||
      details.includes('invalid token') ||
      details.includes('unauthorized');

    if (looksLikeAuthFailure) {
      if (!shouldSkipUnauthorizedRedirect(url)) {
        redirectToLoginOnUnauthorized();
      }
      // Soft log — avoid console.error(Error) which triggers Next.js overlay in dev
      console.warn('Session expired or unauthorized:', url);
      return Promise.reject(error);
    }

    console.error('❌ API Error:', {
      status,
      url,
      message: error.message,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

export default apiClient;
