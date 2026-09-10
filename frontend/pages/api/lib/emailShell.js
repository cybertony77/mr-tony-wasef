import fs from 'fs';
import path from 'path';
import {
  loadSystemBackgroundFromEnv,
  parseGradientColorStops,
  parseSystemBackground,
} from '../../../lib/systemColors';

/** Re-read env.config on each call (not frozen at module load). */
export function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (!envPath) return {};

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    });

    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using process.env as fallback');
    return {};
  }
}

/** Resolve SYSTEM_COLORS / brand for email at send-time. */
export function resolveEmailTheme() {
  const env = loadEnvConfig();
  const raw = env.SYSTEM_COLORS || process.env.SYSTEM_COLORS || '';
  const background = parseSystemBackground(raw) || loadSystemBackgroundFromEnv();
  const { start: primary, end: accent } = parseGradientColorStops(background);
  const headerStyle = `background-color:${primary};background-image:${background};background:${background};`;
  return { background, primary, accent, headerStyle };
}

/** Resolve SYSTEM_NAME + SYSTEM_DOMAIN at send-time. */
export function resolveEmailBrand() {
  const env = loadEnvConfig();
  const systemName =
    env.SYSTEM_NAME || process.env.SYSTEM_NAME || 'AI Agentic Assistant System';
  const systemDomain = String(
    env.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || 'https://demosys.myvnc.com'
  ).replace(/\/$/, '');
  return { systemName, systemDomain, env };
}

/**
 * Shared card-style email shell (OTP / welcome / password-changed).
 * Colored gradient header with logo + system name + optional badge,
 * light content body, footer with domain + contact links.
 */
export function buildBrandedEmailShell({
  badge,
  titleLine,
  bodyHtml,
  systemName,
  systemDomain,
  headerStyle,
  primary,
  accent,
}) {
  const domain = String(systemDomain || '').replace(/\/$/, '');
  const domainLabel = domain.replace(/^https?:\/\//, '');
  const logoSrc = `${domain}/logo.png`;
  const name = systemName || 'System';
  const linkColor = primary || '#1FA8DC';
  const badgeAccent = accent || primary || '#FEB954';

  const badgeHtml = badge
    ? `<div style="display:inline-block;margin-top:12px;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,0.22);color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">${badge}</div>`
    : '';

  const titleHtml = titleLine
    ? `<div style="color:rgba(255,255,255,0.92);font-size:14px;font-weight:600;margin-top:8px;letter-spacing:0.2px;">${titleLine}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fb;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f6fb;padding:36px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4ebf3;">
          <tr>
            <td style="height:6px;${headerStyle}font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="${headerStyle}padding:30px 28px 26px 28px;text-align:center;">
              <img src="${logoSrc}" alt="${name}" width="92" height="92" style="width:92px;height:92px;border-radius:18px;background:#ffffff;object-fit:contain;display:block;margin:0 auto 16px auto;border:3px solid rgba(255,255,255,0.95);" />
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.2px;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,0.12);">${name}</div>
              ${titleHtml}
              ${badgeHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:aliceblue;padding:34px 30px 10px 30px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:aliceblue;padding:22px 28px 28px 28px;text-align:center;border-top:1px solid #d7e3ef;">
              <div style="color:#0f172a;font-size:16px;font-weight:800;margin-bottom:6px;">${name}</div>
              <a href="${domain}" style="color:${linkColor};font-size:13px;text-decoration:none;font-weight:700;">${domainLabel}</a>
              <div style="margin:18px 0 0 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="padding:0 4px;">
                      <a href="${domain}/contact_assistants" style="display:inline-block;padding:10px 16px;border-radius:10px;border:1.5px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;font-weight:800;text-decoration:none;line-height:1.2;">
                        Contact Assistants
                      </a>
                    </td>
                    <td style="padding:0 8px;color:#94a3b8;font-size:16px;font-weight:700;vertical-align:middle;">•</td>
                    <td style="padding:0 4px;">
                      <a href="${domain}/contact_developer" style="display:inline-block;padding:10px 16px;border-radius:10px;border:1.5px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;font-weight:800;text-decoration:none;line-height:1.2;">
                        Contact Developer
                      </a>
                    </td>
                  </tr>
                </table>
              </div>
              <p style="margin:16px 0 0 0;color:#94a3b8;font-size:11px;line-height:1.55;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
