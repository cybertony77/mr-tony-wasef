// Helpers for generating Cloudinary signed URLs for PRIVATE-delivery images.
//
// IMPORTANT:
// - Uses the shared, cached Cloudinary configuration in `cloudinaryConfig.js`
//   so we don't re-read env.config from disk on every render. Image-heavy
//   pages were calling this dozens of times per request before.
// - The previous "manual" `getSignedImageUrl(publicId)` function built an
//   invalid URL (`t_${timestamp}/${publicId}`) and has been removed; always
//   use the SDK-based helper below.

import { getCloudinary, getCloudinaryCredentials } from './cloudinaryConfig';

const DEFAULT_EXPIRY_SECONDS = 60 * 60; // 1 hour

/**
 * Generate a signed URL for a PRIVATE Cloudinary image.
 *
 * @param {string} publicId
 * @param {{ expiresInSeconds?: number, resourceType?: 'image'|'raw'|'video' }} [opts]
 * @returns {Promise<string|null>}
 */
export async function getSignedImageUrlServer(publicId, opts = {}) {
  if (!publicId) return null;

  try {
    const creds = getCloudinaryCredentials();
    if (!creds.cloud_name || !creds.api_secret) {
      console.error('Cloudinary configuration missing');
      return null;
    }

    const cloudinary = getCloudinary();
    const expiresInSeconds = Number.isFinite(opts.expiresInSeconds)
      ? opts.expiresInSeconds
      : DEFAULT_EXPIRY_SECONDS;

    return cloudinary.url(publicId, {
      type: 'private',
      sign_url: true,
      expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
      secure: true,
      resource_type: opts.resourceType || 'image',
    });
  } catch (error) {
    console.error('Error generating signed Cloudinary URL:', error);
    return null;
  }
}
