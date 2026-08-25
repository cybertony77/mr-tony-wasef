import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { completeGoogleOAuthForUser, isGoogleMeetConfigured } from '../../../lib/googleServer';

function loadEnvConfig() {
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

const envConfig = loadEnvConfig();
const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;

function htmlPage(title, message, ok) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fb;color:#111}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;max-width:420px;text-align:center;box-shadow:0 8px 24px rgba(15,23,42,.08)}
h1{font-size:1.25rem;margin:0 0 10px}
p{margin:0 0 18px;color:#4b5563;line-height:1.5}
.ok{color:#15803d}.err{color:#b91c1c}
</style></head>
<body><div class="card">
<h1 class="${ok ? 'ok' : 'err'}">${title}</h1>
<p>${message}</p>
<p style="font-size:.9rem;color:#6b7280">You can close this tab and return to Video Input.</p>
<script>
try{if(window.opener){window.opener.postMessage({type:'google-meet-oauth',ok:${ok ? 'true' : 'false'}},window.location.origin);}}catch(e){}
setTimeout(function(){try{window.close();}catch(e){}},1200);
</script>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (!isGoogleMeetConfigured()) {
      return res.status(500).send(htmlPage('Google setup error', 'Google Meet OAuth is not configured.', false));
    }

    const error = String(req.query.error || '').trim();
    if (error) {
      return res.status(400).send(
        htmlPage('Connection cancelled', 'Google authorization was cancelled or failed. Please try again.', false)
      );
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      return res.status(400).send(htmlPage('Invalid callback', 'Missing authorization code.', false));
    }

    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.status(400).send(htmlPage('Invalid session', 'OAuth state expired. Please connect again.', false));
    }

    if (payload?.purpose !== 'google_meet_oauth' || payload?.assistant_id == null) {
      return res.status(400).send(htmlPage('Invalid session', 'OAuth state is invalid.', false));
    }

    await completeGoogleOAuthForUser(payload.assistant_id, code, payload.connected_by || null);
    return res.status(200).send(
      htmlPage('Google connected', 'Your Google account is connected for Meet recordings.', true)
    );
  } catch (err) {
    console.error('[google-callback] failed', err?.message || err);
    return res.status(500).send(
      htmlPage('Connection failed', 'Could not complete Google connection. Please try again.', false)
    );
  }
}
