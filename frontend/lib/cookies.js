// Utility functions for handling HTTP-only cookies
import { clearAuthCookieHeader } from './authSecrets';

export function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const targetCookie = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  if (!targetCookie) return null;

  return targetCookie.substring(name.length + 1);
}

export function clearCookie(res, name) {
  if (name === 'token') {
    res.setHeader('Set-Cookie', clearAuthCookieHeader());
    return;
  }
  res.setHeader('Set-Cookie', [
    `${name}=; HttpOnly; Secure=true; SameSite=Strict; Path=/; Max-Age=0`,
  ]);
}
