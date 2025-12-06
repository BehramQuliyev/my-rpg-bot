'use strict';

// Prefix (fallback if not set in .env)
const PREFIX = process.env.PREFIX || '.';

/* ======================
   Currency system
   ====================== */

const CURRENCIES = {
  BRONZE: { name: 'Bronze Coins', emoji: '🥉', type: 'basic' },
  SILVER: { name: 'Silver Coins', emoji: '🥈', type: 'mid' },
  GOLD:   { name: 'Gold Coins', emoji: '🥇', type: 'premium' },
  GEMS:   { name: 'Gems', emoji: '💎', type: 'special' } // used in Hunt shop
};

/* ======================
   Prestige
   ====================== */

const PRESTIGE = {
  enabled: true,
  description: 'Prestige resets progress for leaderboard competition',
  maxLevel: 999
};

/* ======================
   Leaderboards
   ====================== */

const LEADERBOARDS = [
  { key: 'hunt', name: 'Hunt Leaderboard', emoji: '🦖' },
  { key: 'work', name: 'Work Leaderboard', emoji: '⚒️' },
  { key: 'quest', name: 'Quest Leaderboard', emoji: '📜' },
  { key: 'auction', name: 'Auction Leaderboard', emoji: '🏷️' },
  { key: 'trade', name: 'Trade Leaderboard', emoji: '🔄' },
  { key: 'collector', name: 'Collector Leaderboard', emoji: '📦' }
];

/* ======================
   Tiers & rarities
   ====================== */

// storage.js defines tiers 0..11 (12 tiers). Keep consistent here.
const TIERS = 12; // 0–11

const RARITIES = [
  { key: 'brown', name: 'Brown', emoji: '🟤', tier: 0 },
  { key: 'common', name: 'Common', emoji: '⚪' },
  { key: 'uncommon', name: 'Uncommon', emoji: '🟢' },
  { key: 'rare', name: 'Rare', emoji: '🔵' },
  { key: 'epic', name: 'Epic', emoji: '🟣' },
  { key: 'legendary', name: 'Legendary', emoji: '🟡' },
  { key: 'mystical', name: 'Mystical', emoji: '✨' }
];

/* ======================
   Hunt UI helpers
   ====================== */

const HUNT_MONSTERS = Array.from({ length: TIERS }, (_, i) => ({
  tier: i,
  name: `Monster Tier ${i}`,
  reward: `${i * 5} 💎 Gems`
}));

/* ======================
   Cooldowns (seconds & ms)
   ====================== */

// Primary representation (seconds) to match storage.js logic
const COOLDOWNS_SEC = {
  hunt: 60,                 // 1 minute
  work: 5 * 60,             // 5 minutes (UI-only; storage has its own 9h/3h logic)
  quest: 10 * 60,           // 10 minutes
  auction: 30 * 60,         // 30 minutes
  trade: 60,                // 1 minute
  collector: 24 * 60 * 60   // daily
};

// Convenience in milliseconds for UI timers/interactions
const COOLDOWNS_MS = Object.fromEntries(
  Object.entries(COOLDOWNS_SEC).map(([k, v]) => [k, v * 1000])
);

/* ======================
   Theme (reply.js compatible)
   ====================== */

const COLORS = {
  INFO: 0x3498db,
  SUCCESS: 0x2ecc71,
  ERROR: 0xe74c3c
};

const EMOJIS = {
  INFO: 'ℹ️',
  SUCCESS: '✅',
  ERROR: '⚠️',
  BALANCE: '💰',
  PRESTIGE: '🏆',
  LEADERBOARD: '📊',
  HUNT: '🦖',
  WORK: '⚒️',
  QUEST: '📜',
  AUCTION: '🏷️',
  TRADE: '🔄',
  COLLECTOR: '📦'
};

const GLOBAL_FOOTER = '⚔️ Powered by FUNTAN Bot';

// Unified theme object used by reply.js buildEmbed
const THEME = {
  COLORS: {
    INFO: 0x3498db,
    SUCCESS: 0x2ecc71,
    ERROR: 0xe74c3c
  },
  EMOJIS: {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '⚠️'
  },
  FOOTER: '⚔️ Powered by FUNTAN Bot'
};

/* ======================
   Helpers
   ====================== */

function getTheme(overrides = {}) {
  // Shallow merge to allow runtime tweaks
  const colors = overrides.COLORS ? { ...COLORS, ...overrides.COLORS } : COLORS;
  const emojis = overrides.EMOJIS ? { ...EMOJIS, ...overrides.EMOJIS } : EMOJIS;
  const footer = overrides.FOOTER || GLOBAL_FOOTER;
  return { COLORS: colors, EMOJIS: emojis, FOOTER: footer };
}

module.exports = {
  PREFIX,
  CURRENCIES,
  PRESTIGE,
  LEADERBOARDS,
  TIERS,
  RARITIES,
  HUNT_MONSTERS,
  COOLDOWNS_SEC,
  COOLDOWNS_MS,
  COLORS,
  EMOJIS,
  GLOBAL_FOOTER,
  THEME,
  getTheme
};
