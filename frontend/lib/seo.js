/**
 * Client-safe SEO helpers for the Pages Router app.
 * Prefer SYSTEM_NAME / SYSTEM_DOMAIN from env (server) or explicit props (client).
 * Do not put secrets here.
 */

const FALLBACK_SITE_NAME = 'Attendance System';
const FALLBACK_ORIGIN = 'https://localhost';

function trimStr(value) {
  return String(value || '').trim();
}

export function normalizeOrigin(value) {
  let raw = trimStr(value);
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

/**
 * Resolve site name. Pass `override` from /api/system/config on the client.
 */
export function getSiteName(override) {
  const fromOverride = trimStr(override);
  if (fromOverride) return fromOverride;
  const fromEnv = trimStr(
    process.env.SYSTEM_NAME || process.env.NEXT_PUBLIC_SYSTEM_NAME || ''
  );
  return fromEnv || FALLBACK_SITE_NAME;
}

/**
 * Resolve production origin. Pass `override` from system config `domain` on the client.
 */
export function getSiteOrigin(override) {
  const fromOverride = normalizeOrigin(override);
  if (fromOverride) return fromOverride;
  const fromEnv = normalizeOrigin(
    process.env.SYSTEM_DOMAIN ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_SYSTEM_DOMAIN ||
      process.env.SITE_URL ||
      ''
  );
  return fromEnv || FALLBACK_ORIGIN;
}

export function absoluteUrl(pathname = '/', originOverride) {
  const origin = getSiteOrigin(originOverride);
  const path = trimStr(pathname) || '/';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') return `${origin}/`;
  return `${origin}${normalized}`;
}

export function absoluteMediaUrl(src, originOverride) {
  const value = trimStr(src);
  if (!value) return absoluteUrl('/logo.png', originOverride);
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return absoluteUrl(value, originOverride);
  return absoluteUrl(`/${value}`, originOverride);
}

export function buildPageTitle(pageTitle, siteName) {
  const page = trimStr(pageTitle);
  const site = trimStr(siteName) || FALLBACK_SITE_NAME;
  if (!page) return site;
  if (page.toLowerCase() === site.toLowerCase()) return site;
  if (page.toLowerCase().endsWith(`| ${site.toLowerCase()}`)) return page;
  return `${page} | ${site}`;
}

export function truncateMeta(text, max = 160) {
  const clean = trimStr(text).replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

export function getDefaultDescription(siteName) {
  const name = getSiteName(siteName);
  return `Sign in, register, and explore public information for ${name} — schedules, contact details, free sessions, and student reviews.`;
}

/** Genuinely public, indexable routes for this education system. */
export const INDEXABLE_PATHS = [
  '/',
  '/sign-up',
  '/welcome',
  '/leave-a-review',
  '/contact_assistants',
  '/contact_developer',
];

export const INDEXABLE_PATH_SET = new Set(INDEXABLE_PATHS);

export function isIndexablePath(pathname) {
  return INDEXABLE_PATH_SET.has(String(pathname || '').split('?')[0]);
}

/**
 * Private / sensitive path prefixes — must never be in sitemap and should be noindex.
 * Accessible ≠ indexable (e.g. signed student_info links).
 */
export const PRIVATE_SEO_DISALLOW_PREFIXES = [
  '/dashboard',
  '/student_dashboard',
  '/manage_assistants',
  '/subscription_dashboard',
  '/edit_my_profile',
  '/forgot_password',
  '/student_not_found',
  '/youtube-player',
  '/api/',
];

export function getPublicPageSeo(path, siteName) {
  const name = getSiteName(siteName);
  const map = {
    '/': {
      title: 'Login',
      description: `Sign in to your ${name} account to access attendance, homework, quizzes, and student resources.`,
    },
    '/sign-up': {
      title: 'Sign Up',
      description: `Create a new student account for ${name}. Register with your details to join classes and track your progress.`,
    },
    '/welcome': {
      title: 'Welcome',
      description: `Learn about ${name} — student reviews, free sessions, schedules, locations, and how to get in touch.`,
    },
    '/leave-a-review': {
      title: 'Leave a Review',
      description: `Share your experience with ${name}. Submit a public review to help other students and parents.`,
    },
    '/contact_assistants': {
      title: 'Contact Assistants',
      description: `Contact the assistants for ${name} for help with account access, registration, classes, and technical support.`,
    },
    '/contact_developer': {
      title: 'Contact Developer',
      description: `Contact Tony Joseph — Business Owner & Software Developer — for ${name} technical support, account access, and system help.`,
    },
  };
  return map[path] || { title: name, description: getDefaultDescription(name) };
}

export function websiteJsonLd({ siteName, origin }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: origin,
  };
}

export function personJsonLd({
  name,
  jobTitle,
  url,
  image,
  email,
  telephone,
  worksFor,
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
  };
  if (jobTitle) data.jobTitle = jobTitle;
  if (url) data.url = url;
  if (image) data.image = image;
  if (email) data.email = email;
  if (telephone) data.telephone = telephone;
  if (worksFor) {
    data.worksFor = {
      '@type': 'Organization',
      name: worksFor,
    };
  }
  return data;
}

export function educationalOrganizationJsonLd({
  siteName,
  origin,
  logoUrl,
  description,
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: siteName,
    url: origin,
  };
  if (logoUrl) data.logo = logoUrl;
  if (description) data.description = description;
  return data;
}

/**
 * AggregateRating only when real public ratings exist (no fabrication).
 */
export function aggregateRatingJsonLd({
  siteName,
  origin,
  ratingValue,
  reviewCount,
}) {
  const count = Number(reviewCount);
  const value = Number(ratingValue);
  if (!Number.isFinite(count) || count < 1) return null;
  if (!Number.isFinite(value) || value < 1 || value > 5) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: siteName,
    url: origin,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Math.round(value * 10) / 10,
      bestRating: 5,
      worstRating: 1,
      ratingCount: count,
    },
  };
}
