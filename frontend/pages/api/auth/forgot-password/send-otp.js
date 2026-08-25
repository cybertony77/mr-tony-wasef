import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, '');
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

const envConfig = loadEnvConfig();
const MONGO_URI = envConfig.MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/topphysics';
const DB_NAME = envConfig.DB_NAME || process.env.DB_NAME || 'topphysics';
const EMAIL_USER = envConfig.EMAIL_USER || process.env.EMAIL_USER;
const GOOGLE_API_CREDENTIALS_PATH = envConfig.GOOGLE_API_CREDENTIALS_PATH || process.env.GOOGLE_API_CREDENTIALS_PATH;
const GOOGLE_REFRESH_TOKEN = envConfig.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
const SYSTEM_DOMAIN = envConfig.SYSTEM_DOMAIN || process.env.SYSTEM_DOMAIN || 'https://demosys.myvnc.com';
const SYSTEM_NAME = envConfig.SYSTEM_NAME || process.env.SYSTEM_NAME || 'Demo Attendance System';
const SYSTEM_COLORS = envConfig.SYSTEM_COLORS || process.env.SYSTEM_COLORS || 'background: linear-gradient(380deg, #1FA8DC 0%, #FEB954 100%);';

function parseEmailBrandColors(raw) {
  const colors = String(raw || '').match(/#(?:[0-9a-fA-F]{3,8})\b/g) || [];
  return {
    primary: colors[0] || '#1FA8DC',
    accent: colors[1] || '#FEB954',
  };
}

const { primary: EMAIL_PRIMARY, accent: EMAIL_ACCENT } = parseEmailBrandColors(SYSTEM_COLORS);

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
    // Read credentials file
    const credentialsPath = GOOGLE_API_CREDENTIALS_PATH.replace(/^"|"$/g, '');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web || {};
    
    if (!client_id || !client_secret) {
      console.error('❌ Invalid credentials file structure');
      return null;
    }

    // Create OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set refresh token
    oAuth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN
    });

    // Create Gmail API client
    // Note: Token validation will happen when actually sending emails
    // Errors like "deleted_client" will be caught in the email sending try-catch block
    gmailClient = google.gmail({ version: 'v1', auth: oAuth2Client });
    
    return gmailClient;
  } catch (error) {
    console.error('❌ Error initializing Gmail API client:', error);
    return null;
  }
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
    const logoUrl = `${String(SYSTEM_DOMAIN).replace(/\/$/, '')}/logo.png`;
    const htmlWithUrl = html.replace(/src="cid:system_logo"/gi, `src="${logoUrl}"`);
    message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlWithUrl,
    ].join('\r\n');
  }

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate 8-digit random OTP
function generateOTP() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;

  console.log('📧 Send OTP request received:', { id, hasEmailConfig: !!(EMAIL_USER && GOOGLE_API_CREDENTIALS_PATH && GOOGLE_REFRESH_TOKEN) });

  if (!id) {
    return res.status(400).json({ error: 'ID is required' });
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    return res.status(400).json({ error: 'Invalid ID type' });
  }

  const safeId = String(id).replace(/[$]/g, '');

  let client;
  try {
    console.log('🔗 Connecting to MongoDB...');
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);
    console.log('✅ Connected to database');

    const userId = /^\d+$/.test(safeId) ? Number(safeId) : safeId;
    console.log('🔍 Searching for user with ID:', userId, 'or', id);
    
    const user = await db.collection('users').findOne({
      $or: [
        { id: userId },
        { id: safeId }
      ]
    });

    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User found:', { id: user.id, email: user.email, hasEmail: !!user.email });

    if (!user.email) {
      console.log('❌ User does not have email');
      return res.status(400).json({ error: 'User does not have an email address' });
    }

    // Check resend_expiration - only send if null or expired
    const resendExpiration = user.OTP_rest_password?.resend_expiration;
    const now = new Date();
    
    if (resendExpiration) {
      const expirationDate = new Date(resendExpiration);
      if (now < expirationDate) {
        // Still in cooldown period
        console.log('⏳ Resend cooldown active, cannot send email yet');
        return res.status(429).json({ 
          success: false, 
          error: 'Please wait before requesting another OTP',
          resend_expiration: resendExpiration
        });
      }
    }

    // Get user name
    let userName = user.name || 'User';
    
    // If user is a student (numeric ID), get name from students collection
    // For other roles (assistant, admin, developer), use name from users collection
    if (typeof userId === 'number' && user.role === 'student') {
      const student = await db.collection('students').findOne({ id: userId });
      if (student && student.name) {
        userName = student.name;
      }
    }

    // Generate OTP (but don't save to DB yet - only save after successful email send)
    const otpCode = generateOTP();
    const hashedOTP = await bcrypt.hash(otpCode, 10);
    
    // Set expiration to 10 minutes from now
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + 10);

    // Set resend expiration to 5 minutes from now
    const resendExpirationDate = new Date();
    resendExpirationDate.setMinutes(resendExpirationDate.getMinutes() + 5);

    // Check if Gmail API is configured
    const gmail = initializeGmailClient();
    if (!gmail || !EMAIL_USER) {
      console.error('❌ Gmail API is not configured.');
      console.error('❌ EMAIL_USER from env.config:', !!envConfig.EMAIL_USER);
      console.error('❌ GOOGLE_API_CREDENTIALS_PATH from env.config:', !!envConfig.GOOGLE_API_CREDENTIALS_PATH);
      console.error('❌ GOOGLE_REFRESH_TOKEN from env.config:', !!envConfig.GOOGLE_REFRESH_TOKEN);
      return res.status(500).json({ 
        error: 'Email service is not configured. Please contact administrator.',
        debug: process.env.NODE_ENV === 'development' ? {
          envConfigKeys: Object.keys(envConfig),
          hasEmailUser: 'EMAIL_USER' in envConfig,
          hasGoogleCredentialsPath: 'GOOGLE_API_CREDENTIALS_PATH' in envConfig,
          hasGoogleRefreshToken: 'GOOGLE_REFRESH_TOKEN' in envConfig
        } : undefined
      });
    }

    console.log('📧 Attempting to send OTP email to:', user.email);
    console.log('🔑 Generated OTP code:', otpCode);
    console.log('👤 User name:', userName);
    console.log('📧 Using email from:', EMAIL_USER);

    try {
      const primary = EMAIL_PRIMARY || '#1FA8DC';
      const accent = EMAIL_ACCENT || '#FEB954';
      const domainLabel = String(SYSTEM_DOMAIN || '').replace(/^https?:\/\//, '');
      const systemGradient = `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`;
      const emailHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fb;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f6fb;padding:36px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4ebf3;">
          <tr>
            <td style="height:6px;background:${systemGradient};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:${systemGradient};padding:30px 28px 26px 28px;text-align:center;">
              <img src="cid:system_logo" alt="${SYSTEM_NAME}" width="92" height="92" style="width:92px;height:92px;border-radius:18px;background:#ffffff;object-fit:contain;display:block;margin:0 auto 16px auto;border:3px solid rgba(255,255,255,0.95);" />
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.2px;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,0.12);">${SYSTEM_NAME}</div>
              <div style="display:inline-block;margin-top:12px;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,0.22);color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Password Reset</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:aliceblue;padding:34px 30px 10px 30px;">
              <p style="margin:0 0 8px 0;color:#0f172a;font-size:20px;font-weight:800;">Hi ${userName},</p>
              <p style="margin:0 0 26px 0;color:#526277;font-size:15px;line-height:1.7;">
                Enter this one-time code to reset your password. Keep it private and use it only on our official reset page.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
                <tr>
                  <td style="background:#ffffff;border:1px solid #d7eaf5;border-radius:16px;padding:4px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="padding:22px 16px 10px 16px;">
                          <div style="color:${primary};font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin-bottom:12px;">Your verification code</div>
                          <div style="color:#0f172a;font-size:36px;font-weight:800;letter-spacing:10px;font-family:'Courier New',Courier,monospace;line-height:1.15;">${otpCode}</div>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:8px 16px 18px 16px;">
                          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${accent};color:#1f2937;font-size:12px;font-weight:800;">
                            Valid for 10 minutes
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
                <tr>
                  <td style="background:#ffffff;border-left:4px solid ${primary};border-radius:0 12px 12px 0;padding:14px 16px;">
                    <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">
                      <strong style="color:#0f172a;">Security tip:</strong> We will never ask for this code by phone, WhatsApp, or chat.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0;color:#6b7c90;font-size:13px;line-height:1.65;">
                If you did not request a password reset, you can safely ignore this email. Your account stays secure.
              </p>
              <p style="margin:0;color:#0f172a;font-size:14px;font-weight:700;">Best regards,</p>
              <p style="margin:4px 0 0 0;color:#526277;font-size:14px;">${SYSTEM_NAME} Support Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:aliceblue;padding:22px 28px 28px 28px;text-align:center;border-top:1px solid #d7e3ef;">
              <div style="color:#0f172a;font-size:16px;font-weight:800;margin-bottom:6px;">${SYSTEM_NAME}</div>
              <a href="${SYSTEM_DOMAIN}" style="color:${primary};font-size:13px;text-decoration:none;font-weight:700;">${domainLabel}</a>
              <div style="margin:18px 0 0 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="padding:0 4px;">
                      <a href="${SYSTEM_DOMAIN}/contact_assistants" style="display:inline-block;padding:10px 16px;border-radius:10px;border:1.5px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;font-weight:800;text-decoration:none;line-height:1.2;">
                        Contact Assistants
                      </a>
                    </td>
                    <td style="padding:0 8px;color:#94a3b8;font-size:16px;font-weight:700;vertical-align:middle;">•</td>
                    <td style="padding:0 4px;">
                      <a href="${SYSTEM_DOMAIN}/contact_developer" style="display:inline-block;padding:10px 16px;border-radius:10px;border:1.5px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:13px;font-weight:800;text-decoration:none;line-height:1.2;">
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
</html>
      `;
      const from = `"${SYSTEM_NAME}" <${EMAIL_USER}>`;
      const message = createEmailMessage(from, user.email, "Password Reset OTP Code", emailHTML);
      
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message
        }
      });

      console.log('✅ Email sent successfully');
      console.log('✅ Email message ID:', response.data.id);
      
      // Email sent successfully - NOW save OTP to database
      const emailId = response.data.id || `gmail-${Date.now()}`;
      console.log('✅ Email sent successfully with ID:', emailId);
      await db.collection('users').updateOne(
        { id: user.id },
        {
          $set: {
            OTP_rest_password: {
              OTP: hashedOTP,
              OTP_Expiration_Date: expirationDate,
              resend_expiration: resendExpirationDate,
              used: false
            }
          }
        }
      );
      console.log('✅ OTP saved to database after successful email send');

      res.json({ 
        success: true, 
        message: 'OTP sent to email',
        email_id: emailId,
        resend_expiration: resendExpirationDate
      });
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError);
      console.error('❌ Email error message:', emailError?.message);
      console.error('❌ Email error code:', emailError?.code);
      console.error('❌ Email error stack:', emailError?.stack);
      
      // Handle Gmail API errors
      let errorMessage = 'Failed to send email';
      let errorDetails = null;

      if (emailError?.message) {
        errorMessage = emailError.message;
        errorDetails = { 
          message: emailError.message, 
          code: emailError.code
        };
      }

      // Check for common Gmail API errors
      const errorMsgLower = errorMessage.toLowerCase();
      if (errorMsgLower.includes('deleted_client')) {
        errorMessage = 'Gmail API client has been deleted or revoked. Please create a new OAuth2 client in Google Cloud Console and update GOOGLE_API_CREDENTIALS_PATH and GOOGLE_REFRESH_TOKEN in env.config.';
      } else if (errorMsgLower.includes('invalid grant') || 
          errorMsgLower.includes('invalid token') ||
          errorMsgLower.includes('token expired')) {
        errorMessage = 'Gmail API authentication failed. Please verify GOOGLE_REFRESH_TOKEN in env.config.';
      } else if (errorMsgLower.includes('rate limit') || 
                 errorMsgLower.includes('quota exceeded')) {
        errorMessage = 'Email sending rate limit exceeded. Please try again later.';
      } else if (errorMsgLower.includes('invalid credentials') ||
                 errorMsgLower.includes('unauthorized')) {
        errorMessage = 'Gmail API credentials are invalid. Please check GOOGLE_API_CREDENTIALS_PATH and GOOGLE_REFRESH_TOKEN in env.config.';
      }

      // Return detailed error for debugging
      res.status(500).json({ 
        error: errorMessage,
        details: errorDetails,
        debug: process.env.NODE_ENV === 'development' ? {
          hasEmailUser: !!EMAIL_USER,
          hasGoogleCredentialsPath: !!GOOGLE_API_CREDENTIALS_PATH,
          hasGoogleRefreshToken: !!GOOGLE_REFRESH_TOKEN,
          errorCode: emailError?.code,
          errorMessage: emailError?.message
        } : undefined
      });
    }
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.', details: error.message });
  } finally {
    if (client) await client.close();
  }
}

