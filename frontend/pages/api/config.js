import fs from 'fs';
import path from 'path';

function loadEnvConfig() {
  try {
    const candidates = [
      path.join(process.cwd(), '..', 'env.config'),
      path.join(process.cwd(), 'env.config'),
    ];
    const envPath = candidates.find((candidate) => fs.existsSync(candidate));
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
        value = value.replace(/^["']|["']$/g, '');
        envVars[key] = value;
      });

    return envVars;
  } catch (error) {
    console.log('⚠️  Could not read env.config, using defaults');
    return {};
  }
}

function parseEnvBoolean(raw, defaultValue = false) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  return String(raw).trim().toLowerCase() === 'true';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const envConfig = loadEnvConfig();
    const withPhysicalCard = parseEnvBoolean(envConfig.WITH_PHISICAL_CARD, false);
    const devtoolsBlock = parseEnvBoolean(envConfig.DEVTOOLS_BLOCK, false);

    res.json({
      WITH_PHISICAL_CARD: withPhysicalCard,
      DEVTOOLS_BLOCK: devtoolsBlock,
      SYSTEM_NAME: envConfig.SYSTEM_NAME || 'Mr. Amgad El-Alfy Math Academy',
      STUDENT_SIGNUP_VIDEO: envConfig.STUDENT_SIGNUP_VIDEO || ''
    });
  } catch (error) {
    console.error('❌ Config API error:', error);
    res.status(500).json({
      error: 'Failed to load configuration',
      details: error.message
    });
  }
}
