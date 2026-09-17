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
  return `Official public pages for ${name} — log in, create an account, view schedules, and contact the team.`;
}

/** Strip query/hash and trailing slash (except root). */
export function normalizeSeoPath(pathname) {
  let path = String(pathname || '/').split('?')[0].split('#')[0].trim();
  if (!path) return '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/**
 * Meta copy for signed parent links (/dashboard/student_info?id=…&sig=…).
 * Used for link previews (e.g. WhatsApp); page stays noindex.
 */
export function getStudentInfoPublicSeo({ siteName, studentName } = {}) {
  const academy = getSiteName(siteName);
  const fullName = trimStr(studentName);
  const firstName = fullName.split(/\s+/).find(Boolean) || '';

  if (firstName) {
    return {
      title: `${firstName}'s Progress`,
      description:
        `Official parent report from ${academy}: view ${firstName}'s attendance, homework, quiz and mock exam results, and clear progress charts—shared through a secure link so you can follow learning with confidence.`,
    };
  }

  return {
    title: 'Parent Progress Report',
    description:
      `Secure parent link from ${academy}. See attendance, homework, quizzes, and progress charts in one place—accurate records from your child's academy, updated regularly.`,
  };
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
  return INDEXABLE_PATH_SET.has(normalizeSeoPath(pathname));
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

function privateDesc(action, siteName) {
  const name = getSiteName(siteName);
  return `${action} in the ${name} management system.`;
}

/**
 * Title + description for every app route.
 * Public routes use marketing copy; private routes stay noindex but still
 * get a clear browser title: "Page Name | SYSTEM_NAME".
 */
export function getPageSeo(pathname, siteName) {
  const name = getSiteName(siteName);
  const path = normalizeSeoPath(pathname);

  const publicMap = {
    '/': {
      title: 'Login',
      description: `Log in to your ${name} account to access attendance, homework, quizzes, and student resources.`,
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

  if (publicMap[path]) return publicMap[path];

  const privateMap = {
    '/forgot_password': {
      title: 'Forgot Password',
      description: privateDesc('Reset your account password', name),
    },
    '/edit_my_profile': {
      title: 'Edit My Profile',
      description: privateDesc('Update your profile details', name),
    },
    '/student_not_found': {
      title: 'Student Not Found',
      description: privateDesc('The requested student record could not be found', name),
    },
    '/404': {
      title: 'Page Not Found',
      description: `The page you requested was not found on ${name}.`,
    },

    '/dashboard': {
      title: 'Dashboard',
      description: privateDesc('Open the staff dashboard', name),
    },
    '/dashboard/all_students': {
      title: 'All Students',
      description: privateDesc('Browse and manage all students', name),
    },
    '/dashboard/add_student': {
      title: 'Add Student',
      description: privateDesc('Register a new student', name),
    },
    '/dashboard/edit_student': {
      title: 'Edit Student',
      description: privateDesc('Edit student details', name),
    },
    '/dashboard/delete_student': {
      title: 'Delete Student',
      description: privateDesc('Remove a student account', name),
    },
    '/dashboard/student_info': {
      title: 'Student Info',
      description: privateDesc('View student information and progress', name),
    },
    '/dashboard/centers': {
      title: 'Centers',
      description: privateDesc('Manage centers and schedules', name),
    },
    '/dashboard/lessons': {
      title: 'Lessons',
      description: privateDesc('Manage lessons and sessions', name),
    },
    '/dashboard/history': {
      title: 'History',
      description: privateDesc('View attendance and activity history', name),
    },
    '/dashboard/payment': {
      title: 'Payment',
      description: privateDesc('Manage student payments', name),
    },
    '/dashboard/mock_exam': {
      title: 'Mock Exam',
      description: privateDesc('Manage mock exams', name),
    },
    '/dashboard/session_info': {
      title: 'Session Info',
      description: privateDesc('View session details', name),
    },
    '/dashboard/scan_page': {
      title: 'Scan QR',
      description: privateDesc('Scan student QR codes', name),
    },
    '/dashboard/qr_generator': {
      title: 'QR Generator',
      description: privateDesc('Generate student QR codes', name),
    },
    '/dashboard/public_link_generator': {
      title: 'Public Link Generator',
      description: privateDesc('Generate secure parent progress links', name),
    },
    '/dashboard/students_reviews': {
      title: 'Students Reviews',
      description: privateDesc('Manage published student reviews', name),
    },
    '/dashboard/pending_reviews': {
      title: 'Pending Reviews',
      description: privateDesc('Review and approve pending feedback', name),
    },
    '/dashboard/desmos_config': {
      title: 'Desmos Config',
      description: privateDesc('Configure Desmos integrations', name),
    },
    '/dashboard/join_whatsapp_group': {
      title: 'Join WhatsApp Group',
      description: privateDesc('Open WhatsApp group links', name),
    },
    '/dashboard/join_google_meeting': {
      title: 'Join Google Meeting',
      description: privateDesc('Open Google Meet links', name),
    },
    '/dashboard/join_zoom_meeting': {
      title: 'Join Zoom Meeting',
      description: privateDesc('Open Zoom meeting links', name),
    },

    '/dashboard/certificates': {
      title: 'Certificates',
      description: privateDesc('Manage student certificates', name),
    },
    '/dashboard/certificates/add': {
      title: 'Add Certificate',
      description: privateDesc('Create a new certificate', name),
    },
    '/dashboard/certificates/edit': {
      title: 'Edit Certificate',
      description: privateDesc('Edit an existing certificate', name),
    },

    '/dashboard/manage_online_system': {
      title: 'Manage Online System',
      description: privateDesc('Manage online learning content', name),
    },
    '/dashboard/manage_online_system/links': {
      title: 'Online Links',
      description: privateDesc('Manage online system links', name),
    },
    '/dashboard/manage_online_system/verification_video_codes': {
      title: 'Verification Video Codes',
      description: privateDesc('Manage VVC codes', name),
    },
    '/dashboard/manage_online_system/verification_homework_codes': {
      title: 'Verification Homework Codes',
      description: privateDesc('Manage VHC codes', name),
    },
    '/dashboard/manage_online_system/verification_accounts_codes': {
      title: 'Verification Account Codes',
      description: privateDesc('Manage account verification codes', name),
    },
    '/dashboard/manage_online_system/manage_students_devices': {
      title: 'Manage Student Devices',
      description: privateDesc('Manage student device limits', name),
    },
    '/dashboard/manage_online_system/change_student_account_password': {
      title: 'Change Student Password',
      description: privateDesc('Reset a student account password', name),
    },
    '/dashboard/manage_online_system/delete_student_account': {
      title: 'Delete Student Account',
      description: privateDesc('Delete an online student account', name),
    },

    '/dashboard/manage_online_system/online_sessions': {
      title: 'Online Sessions',
      description: privateDesc('Manage recorded online sessions', name),
    },
    '/dashboard/manage_online_system/online_sessions/add': {
      title: 'Add Online Session',
      description: privateDesc('Add a recorded online session', name),
    },
    '/dashboard/manage_online_system/online_sessions/edit': {
      title: 'Edit Online Session',
      description: privateDesc('Edit a recorded online session', name),
    },

    '/dashboard/manage_online_system/homeworks': {
      title: 'Homeworks',
      description: privateDesc('Manage homework assignments', name),
    },
    '/dashboard/manage_online_system/homeworks/add': {
      title: 'Add Homework',
      description: privateDesc('Create a homework assignment', name),
    },
    '/dashboard/manage_online_system/homeworks/edit': {
      title: 'Edit Homework',
      description: privateDesc('Edit a homework assignment', name),
    },

    '/dashboard/manage_online_system/homeworks_videos': {
      title: 'Homework Videos',
      description: privateDesc('Manage homework videos', name),
    },
    '/dashboard/manage_online_system/homeworks_videos/add': {
      title: 'Add Homework Video',
      description: privateDesc('Add a homework video', name),
    },
    '/dashboard/manage_online_system/homeworks_videos/edit': {
      title: 'Edit Homework Video',
      description: privateDesc('Edit a homework video', name),
    },

    '/dashboard/manage_online_system/quizzes': {
      title: 'Quizzes',
      description: privateDesc('Manage quizzes', name),
    },
    '/dashboard/manage_online_system/quizzes/add': {
      title: 'Add Quiz',
      description: privateDesc('Create a quiz', name),
    },
    '/dashboard/manage_online_system/quizzes/edit': {
      title: 'Edit Quiz',
      description: privateDesc('Edit a quiz', name),
    },

    '/dashboard/manage_online_system/online_mock_exams': {
      title: 'Online Mock Exams',
      description: privateDesc('Manage online mock exams', name),
    },
    '/dashboard/manage_online_system/online_mock_exams/add': {
      title: 'Add Online Mock Exam',
      description: privateDesc('Create an online mock exam', name),
    },
    '/dashboard/manage_online_system/online_mock_exams/edit': {
      title: 'Edit Online Mock Exam',
      description: privateDesc('Edit an online mock exam', name),
    },

    '/dashboard/manage_online_system/material': {
      title: 'Material',
      description: privateDesc('Manage study material', name),
    },
    '/dashboard/manage_online_system/material/add': {
      title: 'Add Material',
      description: privateDesc('Upload study material', name),
    },
    '/dashboard/manage_online_system/material/edit': {
      title: 'Edit Material',
      description: privateDesc('Edit study material', name),
    },

    '/dashboard/manage_online_system/preview_student_homeworks': {
      title: 'Preview Student Homeworks',
      description: privateDesc('Preview student homework submissions', name),
    },
    '/dashboard/manage_online_system/preview_student_homeworks/details': {
      title: 'Homework Details',
      description: privateDesc('View homework submission details', name),
    },
    '/dashboard/manage_online_system/preview_student_quizzes': {
      title: 'Preview Student Quizzes',
      description: privateDesc('Preview student quiz results', name),
    },
    '/dashboard/manage_online_system/preview_student_quizzes/details': {
      title: 'Quiz Details',
      description: privateDesc('View quiz result details', name),
    },
    '/dashboard/manage_online_system/preview_student_mock_exams': {
      title: 'Preview Student Mock Exams',
      description: privateDesc('Preview student mock exam results', name),
    },
    '/dashboard/manage_online_system/preview_student_mock_exams/details': {
      title: 'Mock Exam Details',
      description: privateDesc('View mock exam result details', name),
    },

    '/dashboard/manage_scoring_system': {
      title: 'Manage Scoring System',
      description: privateDesc('Manage scoring and ranks', name),
    },
    '/dashboard/manage_scoring_system/manage_scoring_defaults': {
      title: 'Scoring Defaults',
      description: privateDesc('Configure default scoring rules', name),
    },
    '/dashboard/manage_scoring_system/manage_student_score': {
      title: 'Manage Student Score',
      description: privateDesc('Adjust a student score', name),
    },
    '/dashboard/manage_scoring_system/scoring_history': {
      title: 'Scoring History',
      description: privateDesc('View scoring history', name),
    },
    '/dashboard/manage_scoring_system/view_scores_and_ranks': {
      title: 'Scores and Ranks',
      description: privateDesc('View scores and ranks', name),
    },

    '/manage_assistants': {
      title: 'Manage Assistants',
      description: privateDesc('Manage assistant and admin accounts', name),
    },
    '/manage_assistants/all_assistants': {
      title: 'All Assistants',
      description: privateDesc('Browse assistant and admin accounts', name),
    },
    '/manage_assistants/add_assistant': {
      title: 'Add Assistant',
      description: privateDesc('Create an assistant or admin account', name),
    },
    '/manage_assistants/edit_assistant': {
      title: 'Edit Assistant',
      description: privateDesc('Edit an assistant or admin account', name),
    },
    '/manage_assistants/delete_assistant': {
      title: 'Delete Assistant',
      description: privateDesc('Delete an assistant account', name),
    },
    '/manage_assistants/manage_assistants_devices': {
      title: 'Manage Assistant Devices',
      description: privateDesc('Manage assistant device limits', name),
    },

    '/student_dashboard': {
      title: 'Student Dashboard',
      description: privateDesc('Open your student dashboard', name),
    },
    '/student_dashboard/my_info': {
      title: 'My Info',
      description: privateDesc('View your student profile', name),
    },
    '/student_dashboard/change_password': {
      title: 'Change Password',
      description: privateDesc('Change your account password', name),
    },
    '/student_dashboard/centers-schedule': {
      title: 'Centers Schedule',
      description: privateDesc('View center schedules', name),
    },
    '/student_dashboard/online_sessions': {
      title: 'Recorded Sessions',
      description: privateDesc('Watch recorded online sessions', name),
    },
    '/student_dashboard/homeworks_videos': {
      title: 'Homework Videos',
      description: privateDesc('Watch homework videos', name),
    },
    '/student_dashboard/my_certificates': {
      title: 'My Certificates',
      description: privateDesc('View your certificates', name),
    },
    '/student_dashboard/scoring_rules_and_ranking': {
      title: 'Scoring Rules and Ranking',
      description: privateDesc('View scoring rules and ranks', name),
    },
    '/student_dashboard/my_material': {
      title: 'My Material',
      description: privateDesc('Access your study material', name),
    },
    '/student_dashboard/my_homeworks': {
      title: 'My Homeworks',
      description: privateDesc('View and submit homeworks', name),
    },
    '/student_dashboard/my_homeworks/details': {
      title: 'Homework Details',
      description: privateDesc('View homework details', name),
    },
    '/student_dashboard/my_homeworks/start': {
      title: 'Start Homework',
      description: privateDesc('Start a homework assignment', name),
    },
    '/student_dashboard/my_homeworks/result': {
      title: 'Homework Result',
      description: privateDesc('View homework results', name),
    },
    '/student_dashboard/my_quizzes': {
      title: 'My Quizzes',
      description: privateDesc('View and take quizzes', name),
    },
    '/student_dashboard/my_quizzes/details': {
      title: 'Quiz Details',
      description: privateDesc('View quiz details', name),
    },
    '/student_dashboard/my_quizzes/start': {
      title: 'Start Quiz',
      description: privateDesc('Start a quiz', name),
    },
    '/student_dashboard/my_quizzes/result': {
      title: 'Quiz Result',
      description: privateDesc('View quiz results', name),
    },
    '/student_dashboard/my_mock_exams': {
      title: 'My Mock Exams',
      description: privateDesc('View and take mock exams', name),
    },
    '/student_dashboard/my_mock_exams/details': {
      title: 'Mock Exam Details',
      description: privateDesc('View mock exam details', name),
    },
    '/student_dashboard/my_mock_exams/start': {
      title: 'Start Mock Exam',
      description: privateDesc('Start a mock exam', name),
    },
    '/student_dashboard/my_mock_exams/result': {
      title: 'Mock Exam Result',
      description: privateDesc('View mock exam results', name),
    },

    '/subscription_dashboard': {
      title: 'Subscription Dashboard',
      description: privateDesc('View subscription usage', name),
    },
    '/subscription_dashboard/hourly': {
      title: 'Hourly Subscription',
      description: privateDesc('View hourly subscription usage', name),
    },
    '/subscription_dashboard/daily': {
      title: 'Daily Subscription',
      description: privateDesc('View daily subscription usage', name),
    },
    '/subscription_dashboard/monthly': {
      title: 'Monthly Subscription',
      description: privateDesc('View monthly subscription usage', name),
    },
    '/subscription_dashboard/yearly': {
      title: 'Yearly Subscription',
      description: privateDesc('View yearly subscription usage', name),
    },
    '/subscription_dashboard/minutely': {
      title: 'Minutely Subscription',
      description: privateDesc('View minutely subscription usage', name),
    },
    '/subscription_dashboard/cancel': {
      title: 'Cancel Subscription',
      description: privateDesc('Cancel a subscription plan', name),
    },

    '/youtube-player/[videoId]': {
      title: 'Video Player',
      description: privateDesc('Watch a video lesson', name),
    },
  };

  if (privateMap[path]) return privateMap[path];

  if (path.startsWith('/youtube-player/')) {
    return privateMap['/youtube-player/[videoId]'];
  }

  const segment = path.split('/').filter(Boolean).pop() || 'Page';
  const title = segment
    .replace(/\[|\]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    title,
    description: privateDesc(`Open ${title}`, name),
  };
}

/** Alias kept for existing public page imports. */
export function getPublicPageSeo(path, siteName) {
  return getPageSeo(path, siteName);
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
