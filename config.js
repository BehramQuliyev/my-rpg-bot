// config.js

// Prefix (fallback if not set in .env)
const PREFIX = process.env.PREFIX || '.';

// 🪙 Currency system
const CURRENCIES = {
  BRONZE: { name: 'Bronze Coins', emoji: '🥉', type: 'basic' },
  SILVER: { name: 'Silver Coins', emoji: '🥈', type: 'mid' },
  GOLD:   { name: 'Gold Coins', emoji: '🥇', type: 'premium' },
  GEMS:   { name: 'Gems', emoji: '💎', type: 'special' } // used in Hunt shop
};

// 🏆 Prestige system
const PRESTIGE = {
  enabled: true,
  description: 'Prestige resets progress for leaderboard competition',
  maxLevel: 999 // arbitrary cap, can be infinite
};

// 📊 Leaderboards
const LEADERBOARDS = [
  { key: 'hunt', name: 'Hunt Leaderboard', emoji: '🦖' },
  { key: 'work', name: 'Work Leaderboard', emoji: '⚒️' },
  { key: 'quest', name: 'Quest Leaderboard', emoji: '📜' },
  { key: 'auction', name: 'Auction Leaderboard', emoji: '🏷️' },
  { key: 'trade', name: 'Trade Leaderboard', emoji: '🔄' },
  { key: 'collector', name: 'Collector Leaderboard', emoji: '📦' }
];

// ⚔️ Gear & Weapons
// storage.js defines tiers 0..11 (12 tiers). Keep TIERS consistent with storage.
const TIERS = 12; // 0–11

const RARITIES = [
  { key: 'brown', name: 'Brown', emoji: '🟤', tier: 0 }, // starter rarity
  { key: 'common', name: 'Common', emoji: '⚪' },
  { key: 'uncommon', name: 'Uncommon', emoji: '🟢' },
  { key: 'rare', name: 'Rare', emoji: '🔵' },
  { key: 'epic', name: 'Epic', emoji: '🟣' },
  { key: 'legendary', name: 'Legendary', emoji: '🟡' },
  { key: 'mystical', name: 'Mystical', emoji: '✨' } // matches highest tier in storage.js
];

// 🐉 Hunt system
// This is a lightweight UI helper; actual monster catalog lives in storage.js
const HUNT_MONSTERS = Array.from({ length: TIERS }, (_, i) => ({
  tier: i,
  name: `Monster Tier ${i}`,
  reward: `${i * 5} 💎 Gems`
}));

// ⏱️ Cooldowns
// Values are in milliseconds. Storage helpers use seconds for some logic; convert as needed.
const COOLDOWNS = {
  hunt: 60 * 1000,            // 1 minute
  work: 5 * 60 * 1000,        // 5 minutes
  quest: 10 * 60 * 1000,      // 10 minutes
  auction: 30 * 60 * 1000,    // 30 minutes
  trade: 60 * 1000,           // 1 minute
  collector: 24 * 60 * 60 * 1000 // daily
};

// 🎨 Embed theme colors
const COLORS = {
  INFO: 0x3498db,
  SUCCESS: 0x2ecc71,
  ERROR: 0xe74c3c
};

// 🔤 Emoji map
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

// 🏷️ Global footer
const GLOBAL_FOOTER = '⚔️ Powered by FUNTAN Bot';

module.exports = {
  PREFIX,
  CURRENCIES,
  PRESTIGE,
  LEADERBOARDS,
  TIERS,
  RARITIES,
  HUNT_MONSTERS,
  COOLDOWNS,
  COLORS,
  EMOJIS,
  GLOBAL_FOOTER
};
