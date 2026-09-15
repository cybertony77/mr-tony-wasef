import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../../lib/authMiddleware';

const DESMOS_API_VERSION = 'v1.12';

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((p) => fs.existsSync(p));
    if (!envPath) return {};

    const envVars = {};
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const index = trimmed.indexOf('=');
        if (index === -1) return;
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      });
    return envVars;
  } catch {
    return {};
  }
}

/**
 * Authenticated Desmos calculator.js proxy.
 * Keeps DESMOS_API_KEY on the server — never returns it in JSON.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await authMiddleware(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const envConfig = loadEnvConfig();
  const desmosIntegrations =
    envConfig.SYSTEM_DESMOS_INTEGRATIONS === 'true' ||
    process.env.SYSTEM_DESMOS_INTEGRATIONS === 'true' ||
    envConfig.SYSTEM_DESMOS_INTEGRATION === 'true' ||
    process.env.SYSTEM_DESMOS_INTEGRATION === 'true';

  if (!desmosIntegrations) {
    return res.status(404).json({ error: 'Not found' });
  }

  const apiKey = String(envConfig.DESMOS_API_KEY || process.env.DESMOS_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'Desmos is not configured' });
  }

  const upstream = `https://www.desmos.com/api/${DESMOS_API_VERSION}/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;

  try {
    const upstreamRes = await fetch(upstream, {
      headers: {
        Accept: 'application/javascript, text/javascript, */*',
        'User-Agent': 'demo-attendance-desmos-proxy',
      },
    });

    if (!upstreamRes.ok) {
      return res.status(502).json({ error: 'Failed to load Desmos API' });
    }

    const body = await upstreamRes.text();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(body);
  } catch (error) {
    console.error('Desmos calculator proxy error:', error);
    return res.status(502).json({ error: 'Failed to load Desmos API' });
  }
}
