// env-validate.js
'use strict';

require('dotenv').config();
const { URL } = require('url');

/**
 * Validate required environment variables and normalize them into a config object.
 * Returns { success: boolean, errors: string[], config?: object }.
 */
function validateEnv() {
  const errors = [];
  const cfg = {};

  // DISCORD_TOKEN (must be non-empty)
  const token = (process.env.DISCORD_TOKEN || '').trim();
  if (!token || token === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
    errors.push('DISCORD_TOKEN is missing or looks like a placeholder.');
  } else {
    cfg.DISCORD_TOKEN = token;
  }

  // PREFIX (fallback to '.' but warn if empty)
  const prefix = (process.env.PREFIX || '.').trim();
  if (!prefix) {
    errors.push('PREFIX is empty. Using default "." may be safer.');
    cfg.PREFIX = '.';
  } else {
    cfg.PREFIX = prefix;
  }

  // DATABASE_URL (validate URL shape)
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    errors.push('DATABASE_URL is missing.');
  } else {
    try {
      // Basic parse to ensure it's a valid URL (postgres://...)
      const parsed = new URL(dbUrl);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        errors.push('DATABASE_URL protocol should be postgres:// or postgresql://');
      } else {
        cfg.DATABASE_URL = dbUrl;
      }
    } catch (e) {
      errors.push('DATABASE_URL is not a valid URL.');
    }
  }

  // ADMIN_IDS (optional) -> normalize to array of snowflake strings
  const rawAdmins = (process.env.ADMIN_IDS || '').trim();
  if (rawAdmins) {
    const ids = rawAdmins.split(',').map(s => s.trim()).filter(Boolean);
    const invalid = ids.filter(id => !/^\d+$/.test(id));
    if (invalid.length) {
      errors.push(`ADMIN_IDS contains invalid IDs: ${invalid.join(', ')}`);
    } else {
      cfg.ADMIN_IDS = ids;
    }
  } else {
    cfg.ADMIN_IDS = [];
  }

  // DEV_MODE (boolean)
  const devRaw = (process.env.DEV_MODE || 'false').trim().toLowerCase();
  cfg.DEV_MODE = devRaw === 'true' || devRaw === '1';

  // Quick safety checks for obvious placeholders
  if (cfg.DATABASE_URL && cfg.DATABASE_URL.includes('user:password')) {
    errors.push('DATABASE_URL contains placeholder credentials; replace with real credentials.');
  }

  return { success: errors.length === 0, errors, config: cfg };
}

/* Example usage at startup:
   const { success, errors, config } = validateEnv();
   if (!success) {
     console.error('Environment validation failed:\n', errors.join('\n'));
     process.exit(1);
   }
   // Use config.DISCORD_TOKEN, config.DATABASE_URL, config.ADMIN_IDS, config.PREFIX, config.DEV_MODE
*/

module.exports = { validateEnv };
