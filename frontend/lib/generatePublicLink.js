import apiClient from './axios';

/**
 * Generate a public student info URL (server-signed HMAC).
 * Staff-authenticated — uses /api/students/public-link
 */
export async function generatePublicStudentLink(studentId) {
  let baseUrl;
  if (typeof window !== 'undefined') {
    baseUrl = `${window.location.protocol}//${window.location.host}`;
  } else {
    baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:3000';
  }

  const { data } = await apiClient.get('/api/students/public-link', {
    params: { id: String(studentId) },
  });

  if (data?.url) return data.url;
  if (data?.path) return `${baseUrl}${data.path}`;
  throw new Error(data?.error || 'Failed to generate public link');
}
