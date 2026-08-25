import fs from 'fs';
import path from 'path';
import { parseSystemBackground } from '../../../lib/systemColors';

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (!envPath) return {};

    const envVars = {};
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index === -1) return;
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        // Strip only a full wrapping quote pair (keep JSON arrays intact)
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      });
    return envVars;
  } catch {
    return {};
  }
}

function parseGradesOrCourses(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
    }
  } catch {
    // CSV / loose format fallback
  }
  return String(raw)
    .split(',')
    .map((item) => item.replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const envConfig = loadEnvConfig();
    const systemDomain = envConfig.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || '';
    const systemName = envConfig.SYSTEM_NAME || process.env.SYSTEM_NAME || 'Demo Attendance System';
    const scoringSystem = envConfig.SYSTEM_SCORING_SYSTEM === 'true' || process.env.SYSTEM_SCORING_SYSTEM === 'true';
    const whatsappJoinGroupBtn = envConfig.SYSTEM_WHATSAPP_JOIN_GROUP === 'true' || process.env.SYSTEM_WHATSAPP_JOIN_GROUP === 'true';
    const onlineVideos = envConfig.SYSTEM_ONLINE_VIDEOS === 'true' || process.env.SYSTEM_ONLINE_VIDEOS === 'true';
    const homeworksVideos = envConfig.SYSTEM_HOMEWORKS_VIDEOS === 'true' || process.env.SYSTEM_HOMEWORKS_VIDEOS === 'true';
    const homeworks = envConfig.SYSTEM_HOMEWORKS === 'true' || process.env.SYSTEM_HOMEWORKS === 'true';
    const material = envConfig.SYSTEM_MATERIAL === 'true' || process.env.SYSTEM_MATERIAL === 'true';
    const certificates = envConfig.SYSTEM_CERTIFICATES === 'true' || process.env.SYSTEM_CERTIFICATES === 'true';
    const quizzes = envConfig.SYSTEM_QUIZZES === 'true' || process.env.SYSTEM_QUIZZES === 'true';
    const mockExams = envConfig.SYSTEM_MOCK_EXAMS === 'true' || process.env.SYSTEM_MOCK_EXAMS === 'true';
    const cloudflareR2 = envConfig.SYSTEM_CLOUDFLARE_R2 === 'true' || process.env.SYSTEM_CLOUDFLARE_R2 === 'true';
    const zoomJoinMeeting = envConfig.SYSTEM_ZOOM_JOIN_MEETING === 'true' || process.env.SYSTEM_ZOOM_JOIN_MEETING === 'true';
    const zoomIntegrations = envConfig.SYSTEM_ZOOM_INTEGRATIONS === 'true' || process.env.SYSTEM_ZOOM_INTEGRATIONS === 'true';
    const googleMeetIntegrations =
      envConfig.SYSTEM_GOOGLE_MEET_INTEGRATIONS === 'true' ||
      process.env.SYSTEM_GOOGLE_MEET_INTEGRATIONS === 'true' ||
      envConfig.SYSTEM_GOOGLE_MEET_INTEGRATION === 'true' ||
      process.env.SYSTEM_GOOGLE_MEET_INTEGRATION === 'true';
    const googleJoinMeeting =
      envConfig.SYSTEM_GOOGLE_JOIN_MEETING === 'true' ||
      process.env.SYSTEM_GOOGLE_JOIN_MEETING === 'true' ||
      envConfig.SYSTEM_GOOGLE_MEET_JOIN_MEETING === 'true' ||
      process.env.SYSTEM_GOOGLE_MEET_JOIN_MEETING === 'true';
    const desmosIntegrations =
      envConfig.SYSTEM_DESMOS_INTEGRATIONS === 'true' ||
      process.env.SYSTEM_DESMOS_INTEGRATIONS === 'true' ||
      envConfig.SYSTEM_DESMOS_INTEGRATION === 'true' ||
      process.env.SYSTEM_DESMOS_INTEGRATION === 'true';
    const desmosApiKey = desmosIntegrations
      ? (envConfig.DESMOS_API_KEY || process.env.DESMOS_API_KEY || '').trim()
      : '';
    const mathReferenceSheet =
      envConfig.SYSTEM_MATH_REFERENCE_SHEET === 'true' ||
      process.env.SYSTEM_MATH_REFERENCE_SHEET === 'true';
    const paymentSystem = envConfig.SYSTEM_PAYMENT_SYSTEM === 'true' || process.env.SYSTEM_PAYMENT_SYSTEM === 'true';
    const subscription = envConfig.SYSTEM_SUBSCRIPTION === 'true' || process.env.SYSTEM_SUBSCRIPTION === 'true';
    const deviceLimitations = envConfig.SYSTEM_DEVICE_LIMITATIONS === 'true' || process.env.SYSTEM_DEVICE_LIMITATIONS === 'true';
    const marketingPage = envConfig.SYSTEM_MARKETING_PAGE === 'true' || process.env.SYSTEM_MARKETING_PAGE === 'true';
    const pageBackground = parseSystemBackground(
      envConfig.SYSTEM_COLORS || process.env.SYSTEM_COLORS
    );

    const nationalSystem =
      envConfig.NATIONAL_SYSTEM === 'true' || process.env.NATIONAL_SYSTEM === 'true';

    const gradesOrCourses = parseGradesOrCourses(
      envConfig.GRADES_OR_COURSES || process.env.GRADES_OR_COURSES || '[]'
    );
    const courseTypes = parseGradesOrCourses(
      envConfig.COURSE_TYPE || process.env.COURSE_TYPE || '[]'
    );

    const studentDriveLink = envConfig.STUDENT_DRIVE_LINK || process.env.STUDENT_DRIVE_LINK || '';
    const studentSignupVideo = envConfig.STUDENT_SIGNUP_VIDEO || process.env.STUDENT_SIGNUP_VIDEO || '';
    const assistantDriveLink = envConfig.ASSISTANT_DRIVE_LINK || process.env.ASSISTANT_DRIVE_LINK || '';
    const adminDriveLink = envConfig.ADMIN_DRIVE_LINK || process.env.ADMIN_DRIVE_LINK || '';

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      domain: systemDomain,
      name: systemName,
      scoring_system: scoringSystem,
      whatsapp_join_group_btn: whatsappJoinGroupBtn,
      online_videos: onlineVideos,
      homeworks_videos: homeworksVideos,
      homeworks: homeworks,
      material: material,
      certificates: certificates,
      quizzes: quizzes,
      mock_exams: mockExams,
      cloudflare_r2: cloudflareR2,
      zoom_join_meeting: zoomJoinMeeting,
      zoom_integrations: zoomIntegrations,
      google_meet_integrations: googleMeetIntegrations,
      google_join_meeting: googleJoinMeeting,
      desmos_integrations: desmosIntegrations,
      desmos_api_key: desmosApiKey,
      math_reference_sheet: mathReferenceSheet,
      payment_system: paymentSystem,
      subscription: subscription,
      device_limitations: deviceLimitations,
      marketing_page: marketingPage,
      page_background: pageBackground,
      SYSTEM_COLORS: envConfig.SYSTEM_COLORS || process.env.SYSTEM_COLORS || '',
      national_system: nationalSystem,
      grades_or_courses: gradesOrCourses,
      course_type: courseTypes,
      student_drive_link: studentDriveLink,
      student_signup_video: studentSignupVideo,
      assistant_drive_link: assistantDriveLink,
      admin_drive_link: adminDriveLink,
    });
  } catch (error) {
    console.error('Error fetching system config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
