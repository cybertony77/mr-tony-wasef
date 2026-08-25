import jwt from 'jsonwebtoken';
import { getCookieValue } from './cookies';

// Load environment variables from env.config
function loadEnvConfig() {
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '..', 'env.config');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          value = value.replace(/^"|"$/g, ''); // strip quotes
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
const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = 401;
  }
}

/** Returns true for missing/invalid/expired auth errors. */
export function isAuthError(error) {
  if (!error) return false;
  if (error.name === 'AuthError' || error.statusCode === 401) return true;
  if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') return true;
  const msg = String(error.message || '');
  return (
    msg.includes('No token') ||
    msg.includes('Unauthorized') ||
    msg.includes('Invalid token') ||
    msg.includes('Token expired') ||
    msg.includes('jwt expired') ||
    msg.includes('jwt malformed')
  );
}

export async function authMiddleware(req) {
  const cookieHeader = req.headers.cookie;
  const token = getCookieValue(cookieHeader, 'token');

  if (!token) {
    throw new AuthError('No token provided');
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthError('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthError('Invalid token');
    }
    throw new AuthError('Unauthorized');
  }
}
