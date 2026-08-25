import fs from 'fs';
import path from 'path';

export function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      let value = trimmed.substring(index + 1).trim();
      value = value.replace(/^"|"$/g, '');
      envVars[key] = value;
    });
    return envVars;
  } catch {
    return {};
  }
}

export function getMongoFromEnv() {
  const envConfig = loadEnvConfig();
  const MONGO_URI =
    envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/demo-attendance-system';
  const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'demo-attendance-system';
  return { MONGO_URI, DB_NAME, envConfig };
}

export const MARKETING_DOC_ID = 'marketing_page_singleton';

export function defaultMarketingDoc() {
  return {
    _id: MARKETING_DOC_ID,
    page_state: true,
    teacher_picture: null,
    teacher_name: null,
    teacher_description: null,
    students_teached: null,
    years_of_experience: null,
    yt_session_link: null,
    session_video_type: null,
    session_video_id: null,
    dates_of_sessions: null,
    contact_assistants: null,
    contact_people: null,
    links: null,
    students_testimonials: null,
    testimonials_to_show: null,
    outro_text: null,
    note: null,
  };
}
