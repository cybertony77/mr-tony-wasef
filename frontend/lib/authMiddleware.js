import jwt from 'jsonwebtoken';
import { getCookieValue } from './cookies';
import { getJwtSecret } from './authSecrets';

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

  let JWT_SECRET;
  try {
    JWT_SECRET = getJwtSecret();
  } catch {
    throw new AuthError('Unauthorized');
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
