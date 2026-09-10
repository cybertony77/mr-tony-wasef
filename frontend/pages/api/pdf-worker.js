import fs from 'fs';
import path from 'path';

/**
 * Serves pdf.worker.min.mjs from the frontend project root
 * (not from /public) for react-pdf / pdf.js.
 */
export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method Not Allowed');
  }

  const filePath = path.join(process.cwd(), 'pdf.worker.min.mjs');

  if (!fs.existsSync(filePath)) {
    return res.status(404).end('PDF worker not found');
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Length', String(stat.size));

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500);
    res.end('Failed to read PDF worker');
  });
  stream.pipe(res);
}
