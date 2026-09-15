import { Readable } from 'stream';
import { getSignedImageUrlServer } from './cloudinary';

/**
 * Fetch a private Cloudinary image server-side and stream bytes to the client.
 * The Cloudinary signed URL never leaves the server.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} publicId
 * @param {{ expiresInSeconds?: number }} [opts]
 * @returns {Promise<boolean>} true if streamed, false if URL could not be generated
 */
export async function streamCloudinaryPrivateImage(res, publicId, opts = {}) {
  const signedUrl = await getSignedImageUrlServer(publicId, opts);
  if (!signedUrl) return false;

  const upstream = await fetch(signedUrl);
  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502;
    if (!res.headersSent) {
      res.status(status).json({
        error: status === 404 ? 'Image not found' : 'Failed to fetch image',
      });
    }
    return true; // handled (do not also send JSON success)
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=600, stale-while-revalidate=120');
  res.setHeader('Vary', 'Cookie, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200);

  if (!upstream.body) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
    return true;
  }

  const nodeStream = Readable.fromWeb(upstream.body);
  await new Promise((resolve, reject) => {
    nodeStream.on('error', reject);
    res.on('error', reject);
    res.on('finish', resolve);
    nodeStream.pipe(res);
  });
  return true;
}

/**
 * Same-origin URL the browser can use as <img src> (cookies authenticate).
 * @param {string} publicId
 * @param {Record<string, string>} [extraQuery]
 */
export function buildCloudinaryImageProxyPath(publicId, extraQuery = {}) {
  const params = new URLSearchParams({
    public_id: publicId,
    ...extraQuery,
  });
  return `/api/media/cloudinary-image?${params.toString()}`;
}
