import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import {
  loadEnvConfig,
  resolveEmailTheme,
  resolveEmailBrand,
  buildBrandedEmailShell,
} from './emailShell';

// Module-load defaults for Gmail credentials (theme/brand re-read at send-time)
const envConfig = loadEnvConfig();
const EMAIL_USER = envConfig.EMAIL_USER || process.env.EMAIL_USER;
const GOOGLE_API_CREDENTIALS_PATH = envConfig.GOOGLE_API_CREDENTIALS_PATH || process.env.GOOGLE_API_CREDENTIALS_PATH;
const GOOGLE_REFRESH_TOKEN = envConfig.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
const STUDENT_DRIVE_LINK = envConfig.STUDENT_DRIVE_LINK || process.env.STUDENT_DRIVE_LINK || '';
const ASSISTANT_DRIVE_LINK = envConfig.ASSISTANT_DRIVE_LINK || process.env.ASSISTANT_DRIVE_LINK || '';
const ADMIN_DRIVE_LINK = envConfig.ADMIN_DRIVE_LINK || process.env.ADMIN_DRIVE_LINK || '';

export { buildBrandedEmailShell, resolveEmailTheme, resolveEmailBrand, loadEnvConfig };

// Initialize Gmail API client
let gmailClient = null;

function initializeGmailClient() {
  if (gmailClient) {
    return gmailClient;
  }

  if (!GOOGLE_API_CREDENTIALS_PATH || !GOOGLE_REFRESH_TOKEN || !EMAIL_USER) {
    console.error('❌ Gmail API credentials are not configured');
    return null;
  }

  try {
    const credentialsPath = GOOGLE_API_CREDENTIALS_PATH.replace(/^"|"$/g, '');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web || {};
    
    if (!client_id || !client_secret) {
      console.error('❌ Invalid credentials file structure');
      return null;
    }

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob'
    );

    oAuth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN
    });

    gmailClient = google.gmail({ version: 'v1', auth: oAuth2Client });
    
    return gmailClient;
  } catch (error) {
    console.error('❌ Error initializing Gmail API client:', error);
    return null;
  }
}

function getLogoAttachment() {
  const candidates = [
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), '..', 'frontend', 'public', 'logo.png'),
  ];
  for (const logoPath of candidates) {
    try {
      if (fs.existsSync(logoPath)) {
        return {
          filename: 'logo.png',
          contentType: 'image/png',
          content: fs.readFileSync(logoPath),
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

// Create email message in RFC 2822 format (embeds logo when available)
function createEmailMessage(from, to, subject, html) {
  const logo = getLogoAttachment();
  let message;

  if (logo) {
    const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const htmlWithCid = html.replace(
      /src="cid:system_logo"|src="[^"]*\/logo\.png"|src="[^"]*logo\.png"/gi,
      'src="cid:system_logo"'
    );
    const logoBase64 = logo.content.toString('base64').replace(/(.{76})/g, '$1\r\n');
    message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/related; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      htmlWithCid,
      ``,
      `--${boundary}`,
      `Content-Type: ${logo.contentType}; name="${logo.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-ID: <system_logo>`,
      `Content-Disposition: inline; filename="${logo.filename}"`,
      ``,
      logoBase64,
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join('\r\n');
  }

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function p(text, extra = '') {
  return `<p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.7;${extra}">${text}</p>`;
}

function link(href, label, primary) {
  return `<a href="${href}" style="color:${primary};text-decoration:underline;font-weight:700;">${label}</a>`;
}

// Generate email HTML template
function generateEmailHTML(name, role, driveLink) {
  const { systemName, systemDomain } = resolveEmailBrand();
  const { primary, accent, headerStyle } = resolveEmailTheme();
  const hasDriveLink = driveLink && driveLink.trim() !== '';
  const assistantsLink = link(`${systemDomain}/contact_assistants`, 'assistants', primary);
  const tonyLink = link(`${systemDomain}/contact_developer`, 'Tony Joseph', primary);

  let mainContent = '';
  let subject = '';

  if (role === 'student') {
    subject = `Welcome to ${systemName}!`;

    if (!hasDriveLink) {
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're really happy to have you with us 😊")}
        ${p('Your account has been created successfully ✅')}
        ${p("You're now ready to explore, learn, and grow 🚀")}
        ${p(`If you have any questions or need help at any time, feel free to contact our ${assistantsLink} — we're always here for you 💬❤️`)}
      `;
    } else {
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're really happy to have you with us 😊")}
        ${p('Your account has been created successfully ✅')}
        ${p("You're now ready to explore, learn, and grow 🚀")}
        ${p('🎥 Learn how our system works in minutes')}
        ${p('This short video will walk you through the system and show you how to use it with ease:')}
        ${p(`👉 Watch the student guide: ${link(driveLink, driveLink, primary)}`)}
        ${p(`If you have any questions or need help at any time, feel free to contact our ${assistantsLink} — we're always here for you 💬❤️`)}
      `;
    }
  } else if (role === 'assistant') {
    subject = `Welcome to ${systemName}!`;

    if (!hasDriveLink) {
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're happy to have you as part of our team 😊")}
        ${p('Your assistant account has been created successfully ✅')}
        ${p("You're now ready to start working, collaborating, and supporting our students 🚀")}
        ${p(`If you have any questions or need help at any time, feel free to contact ${tonyLink} — we're always here for you 💬❤️`)}
      `;
    } else {
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're happy to have you as part of our team 😊")}
        ${p('Your assistant account has been created successfully ✅')}
        ${p("You're now ready to start working, collaborating, and supporting our students 🚀")}
        ${p('🎥 Learn how our system works in minutes')}
        ${p('This short video will walk you through the system and show you how to use it with ease:')}
        ${p(`👉 Watch the assistant guide: ${link(driveLink, driveLink, primary)}`)}
        ${p(`If you have any questions or need help at any time, feel free to contact ${tonyLink} — we're always here for you 💬❤️`)}
      `;
    }
  } else if (role === 'admin') {
    subject = `Welcome to ${systemName}!`;

    if (!hasDriveLink) {
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're happy to have you as part of our team 😊")}
        ${p('Your admin account has been created successfully ✅')}
        ${p("You're now ready to start working, collaborating, manage assistants and supporting our students 🚀")}
        ${p(`If you have any questions or need help at any time, feel free to contact ${tonyLink} — we're always here for you 💬❤️`)}
      `;
    } else {
      const adminGuide =
        ADMIN_DRIVE_LINK && ADMIN_DRIVE_LINK.trim() !== ''
          ? p(`👉 Watch the admin guide: ${link(ADMIN_DRIVE_LINK, ADMIN_DRIVE_LINK, primary)}`)
          : '';
      mainContent = `
        ${p(`Hi ${name} 👋`, 'font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px 0;')}
        ${p('Welcome to our platform! 🎊')}
        ${p("We're happy to have you as part of our team 😊")}
        ${p('Your admin account has been created successfully ✅')}
        ${p("You're now ready to start working, collaborating, manage assistants and supporting our students 🚀")}
        ${p('🎥 Learn how our system works in minutes')}
        ${p('This short video will walk you through the system and show you how to use it with ease:')}
        ${p(`👉 Watch the assistantt guide: ${link(driveLink, driveLink, primary)}`)}
        ${adminGuide}
        ${p(`If you have any questions or need help at any time, feel free to contact ${tonyLink} — we're always here for you 💬❤️`)}
      `;
    }
  } else {
    return null;
  }

  const bodyHtml = `
    ${mainContent}
    <p style="margin:24px 0 0 0;color:#0f172a;font-size:14px;font-weight:700;">Best regards,</p>
    <p style="margin:4px 0 0 0;color:#526277;font-size:14px;">${systemName} Support Team 🤝</p>
  `;

  const html = buildBrandedEmailShell({
    badge: 'Welcome',
    bodyHtml,
    systemName,
    systemDomain,
    headerStyle,
    primary,
    accent,
  });

  return { html, subject };
}

// Send welcome email using Gmail API
export async function sendWelcomeEmail(userEmail, userName, role, driveLink = '') {
  const gmail = initializeGmailClient();
  const { systemName } = resolveEmailBrand();

  if (!gmail || !EMAIL_USER) {
    console.error('❌ Gmail API is not configured. Cannot send welcome email.');
    return { success: false, error: 'Email service is not configured' };
  }

  if (!userEmail || !userName || !role) {
    console.error('❌ Missing required parameters for welcome email.');
    return { success: false, error: 'Missing required parameters' };
  }

  if (!['student', 'assistant', 'admin'].includes(role)) {
    console.log(`⏭️  Skipping email for role: ${role}`);
    return { success: false, error: 'Email not sent for this role' };
  }

  try {
    const emailData = generateEmailHTML(userName, role, driveLink);

    if (!emailData) {
      console.log(`⏭️  No email template for role: ${role}`);
      return { success: false, error: 'No email template for this role' };
    }

    const from = `"${systemName}" <${EMAIL_USER}>`;
    const message = createEmailMessage(from, userEmail, emailData.subject, emailData.html);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: message
      }
    });

    console.log('✅ Welcome email sent successfully to:', userEmail);
    console.log('✅ Email message ID:', response.data.id);

    return { success: true, messageId: response.data.id };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

// Generate password change email HTML template
function generatePasswordChangeEmailHTML(name, role) {
  const { systemName, systemDomain } = resolveEmailBrand();
  const { primary, accent, headerStyle } = resolveEmailTheme();

  let contactMessage = '';

  if (role === 'student') {
    contactMessage = `If this wasn't you, please contact <a href="${systemDomain}/contact_assistants" style="color:${primary};text-decoration:underline;font-weight:700;">assistants</a> immediately so we can help secure your account 💬`;
  } else if (role === 'assistant' || role === 'admin') {
    contactMessage = `If this wasn't you, please contact <a href="${systemDomain}/contact_developer" style="color:${primary};text-decoration:underline;font-weight:700;">Tony Joseph</a> immediately so we can help secure your account 💬`;
  } else {
    return null;
  }

  const bodyHtml = `
    <p style="margin:0 0 8px 0;color:#0f172a;font-size:20px;font-weight:800;">Hi ${name} 👋</p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.7;">This is a confirmation that your account password was successfully changed 🔒</p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.7;">If you made this change, no further action is required ✅</p>
    <p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.7;">Your account remains secure, and you can continue using the platform as usual 🚀</p>
    <p style="margin:0 0 8px 0;color:#0f172a;font-size:14px;font-weight:700;">⚠️ Didn't make this change?</p>
    <p style="margin:0 0 24px 0;color:#334155;font-size:15px;line-height:1.7;">${contactMessage}</p>
    <p style="margin:0;color:#0f172a;font-size:14px;font-weight:700;">Best regards,</p>
    <p style="margin:4px 0 0 0;color:#526277;font-size:14px;">${systemName} Support Team 🤝</p>
  `;

  const html = buildBrandedEmailShell({
    badge: 'Security',
    bodyHtml,
    systemName,
    systemDomain,
    headerStyle,
    primary,
    accent,
  });

  return { html, subject: 'Password Changed Successfully' };
}

// Send password change email using Gmail API
export async function sendPasswordChangeEmail(userEmail, userName, role) {
  const gmail = initializeGmailClient();
  const { systemName } = resolveEmailBrand();

  if (!gmail || !EMAIL_USER) {
    console.error('❌ Gmail API is not configured. Cannot send password change email.');
    return { success: false, error: 'Email service is not configured' };
  }

  if (!userEmail || !userName || !role) {
    console.error('❌ Missing required parameters for password change email.');
    return { success: false, error: 'Missing required parameters' };
  }

  if (!['student', 'assistant', 'admin'].includes(role)) {
    console.log(`⏭️  Skipping password change email for role: ${role}`);
    return { success: false, error: 'Email not sent for this role' };
  }

  try {
    const emailData = generatePasswordChangeEmailHTML(userName, role);

    if (!emailData) {
      console.log(`⏭️  No email template for role: ${role}`);
      return { success: false, error: 'No email template for this role' };
    }

    const from = `"${systemName}" <${EMAIL_USER}>`;
    const message = createEmailMessage(from, userEmail, emailData.subject, emailData.html);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: message
      }
    });

    console.log('✅ Password change email sent successfully to:', userEmail);
    console.log('✅ Email message ID:', response.data.id);

    return { success: true, messageId: response.data.id };
  } catch (error) {
    console.error('❌ Error sending password change email:', error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}
