'use strict';

/**
 * storage.js
 * Complete, self-contained storage utilities for the RPG bot.
 * - Sequelize models
 * - Catalogs (weapons, gear, monsters)
 * - Helpers for players, inventory, daily, work, hunt, admin
 * - Unified return shape: { success, data, error, reason }
 */

const { Sequelize, DataTypes, Op } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

/* ======================
   Configuration constants
   ====================== */

const DAILY_BASE_BRONZE = 50;
const DAILY_STREAK_BONUS = 5;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const DAILY_STREAK_WINDOW_SECONDS = 48 * 60 * 60;

const WORK_DURATION_SECONDS = 9 * 60 * 60; // 9 hours
const WORK_COOLDOWN_AFTER_COLLECT_SECONDS = 3 * 60 * 60; // 3 hours
const WORK_REWARD_SILVER = 100;
const WORK_STREAK_WINDOW_SECONDS = 48 * 60 * 60;
const WORK_STREAK_BONUS_PER_DAY = 5;
const WORK_STREAK_BONUS_CAP_DAYS = 30;

const DEFAULT_HUNT_COOLDOWN_SECONDS = 60;

/* ======================
   Response helpers
   ====================== */

function ok(data = {}) {
  return { success: true, data, error: null, reason: null };
}
function fail(error, reason = null, data = null) {
  return { success: false, data, error: String(error), reason };
}

/* ======================
   Models
   ====================== */

const Player = sequelize.define('Player', {
  userId: { type: DataTypes.STRING, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: true },
  displayName: { type: DataTypes.STRING, allowNull: true },
  bronze: { type: DataTypes.INTEGER, defaultValue: 0 },
  silver: { type: DataTypes.INTEGER, defaultValue: 0 },
  gold: { type: DataTypes.INTEGER, defaultValue: 0 },
  gems: { type: DataTypes.INTEGER, defaultValue: 0 },
  prestige: { type: DataTypes.INTEGER, defaultValue: 0 },
  equippedWeaponInvId: { type: DataTypes.INTEGER, allowNull: true },
  equippedGearInvId: { type: DataTypes.INTEGER, allowNull: true },
  workStreak: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastWorkCollectedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  indexes: [{ fields: ['email'] }, { fields: ['displayName'] }],
  timestamps: true
});

const Inventory = sequelize.define('Inventory', {
  userId: { type: DataTypes.STRING, allowNull: false },
  itemType: { type: DataTypes.STRING, allowNull: false }, // 'gear' or 'weapon'
  catalogId: { type: DataTypes.STRING, allowNull: false },
  tier: { type: DataTypes.INTEGER },
  rarity: { type: DataTypes.STRING },
  itemName: { type: DataTypes.STRING },
  attack: { type: DataTypes.INTEGER, defaultValue: 0 },
  defense: { type: DataTypes.INTEGER, defaultValue: 0 },
  count: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  indexes: [
    { unique: true, fields: ['userId', 'catalogId', 'itemType'] },
    { fields: ['userId'] },
    { fields: ['itemType'] },
    { fields: ['catalogId'] }
  ],
  timestamps: true
});

const HuntRecord = sequelize.define('HuntRecord', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  kills: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  indexes: [
    { unique: true, fields: ['userId', 'monsterTier'] },
    { fields: ['userId'] },
    { fields: ['monsterTier'] }
  ],
  timestamps: true
});

const HuntCooldown = sequelize.define('HuntCooldown', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  lastHuntAt: { type: DataTypes.DATE }
}, {
  indexes: [{ fields: ['userId'] }, { fields: ['monsterTier'] }],
  timestamps: true
});

const Auction = sequelize.define('Auction', {
  auctionId: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sellerId: { type: DataTypes.STRING },
  itemName: { type: DataTypes.STRING },
  startingBid: { type: DataTypes.INTEGER },
  highestBid: { type: DataTypes.INTEGER, defaultValue: 0 },
  highestBidder: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true });

const DailyClaim = sequelize.define('DailyClaim', {
  userId: { type: DataTypes.STRING, primaryKey: true },
  lastClaimAt: { type: DataTypes.DATE, allowNull: true },
  streak: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { indexes: [{ fields: ['userId'] }], timestamps: true });

const WorkSession = sequelize.define('WorkSession', {
  userId: { type: DataTypes.STRING },
  startedAt: { type: DataTypes.DATE },
  finishAt: { type: DataTypes.DATE },
  collectedAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'working' } // working | finished | collected | cancelled
}, { indexes: [{ fields: ['userId'] }], timestamps: true });

const ServerAdmin = sequelize.define('ServerAdmin', {
  serverId: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'admin' }
}, {
  indexes: [
    { fields: ['serverId'] },
    { fields: ['userId'] },
    { unique: true, fields: ['serverId', 'userId'] }
  ],
  timestamps: true
});

/* ======================
   Catalogs
   ====================== */

// weapons
const weapons = [
  { id: 'w1',  name: 'Rusty Sword',        tier: 1,  attack: 5,   gems: 0, rarity: 'common' },
  { id: 'w2',  name: 'Wooden Club',        tier: 1,  attack: 6,   gems: 0, rarity: 'common' },
  { id: 'w3',  name: 'Short Dagger',       tier: 2,  attack: 9,   gems: 0, rarity: 'common' },
  { id: 'w4',  name: 'Hunting Spear',      tier: 2,  attack: 11,  gems: 0, rarity: 'uncommon' },
  { id: 'w5',  name: 'Iron Blade',         tier: 3,  attack: 16,  gems: 0, rarity: 'uncommon' },
  { id: 'w6',  name: 'War Hammer',         tier: 3,  attack: 18,  gems: 0, rarity: 'uncommon' },
  { id: 'w7',  name: 'Steel Longsword',    tier: 4,  attack: 24,  gems: 1, rarity: 'rare' },
  { id: 'w8',  name: 'Reinforced Axe',     tier: 4,  attack: 26,  gems: 1, rarity: 'rare' },
  { id: 'w9',  name: 'Flanged Mace',       tier: 5,  attack: 33,  gems: 1, rarity: 'rare' },
  { id: 'w10', name: 'Keen Rapier',        tier: 5,  attack: 35,  gems: 1, rarity: 'rare' },
  { id: 'w11', name: 'Knight\'s Claymore', tier: 6,  attack: 44,  gems: 2, rarity: 'epic' },
  { id: 'w12', name: 'Stormcaller Spear',  tier: 6,  attack: 46,  gems: 2, rarity: 'epic' },
  { id: 'w13', name: 'Dragonfang Blade',   tier: 7,  attack: 58,  gems: 3, rarity: 'epic' },
  { id: 'w14', name: 'Titan Maul',         tier: 7,  attack: 62,  gems: 3, rarity: 'epic' },
  { id: 'w15', name: 'Void Edge',          tier: 8,  attack: 78,  gems: 4, rarity: 'legendary' },
  { id: 'w16', name: 'Sunforged Halberd',  tier: 8,  attack: 82,  gems: 4, rarity: 'legendary' },
  { id: 'w17', name: 'Abyssal Cleaver',    tier: 9,  attack: 100, gems: 6, rarity: 'mythic' },
  { id: 'w18', name: 'Celestial Pike',     tier: 9,  attack: 104, gems: 6, rarity: 'mythic' },
  { id: 'w19', name: 'Eternal Greatsword', tier: 10, attack: 130, gems: 8, rarity: 'ancient' },
  { id: 'w20', name: 'Mythic Soulblade',   tier: 11, attack: 220, gems: 20, rarity: 'mystical' } // tier 11 (hidden)
];

// gear
const gear = [
  { id: 'g1',  name: 'Cloth Tunic',        tier: 1,  defense: 2,  gems: 0, rarity: 'common' },
  { id: 'g2',  name: 'Leather Vest',       tier: 1,  defense: 3,  gems: 0, rarity: 'common' },
  { id: 'g3',  name: 'Padded Jacket',      tier: 2,  defense: 6,  gems: 0, rarity: 'common' },
  { id: 'g4',  name: 'Studded Leather',    tier: 2,  defense: 8,  gems: 0, rarity: 'uncommon' },
  { id: 'g5',  name: 'Chain Shirt',        tier: 3,  defense: 12, gems: 0, rarity: 'uncommon' },
  { id: 'g6',  name: 'Scale Mail',         tier: 3,  defense: 14, gems: 0, rarity: 'uncommon' },
  { id: 'g7',  name: 'Brigandine',         tier: 4,  defense: 20, gems: 1, rarity: 'rare' },
  { id: 'g8',  name: 'Iron Plate',         tier: 4,  defense: 22, gems: 1, rarity: 'rare' },
  { id: 'g9',  name: 'Knight\'s Guard',    tier: 5,  defense: 30, gems: 1, rarity: 'rare' },
  { id: 'g10', name: 'Guardian Mail',      tier: 5,  defense: 32, gems: 1, rarity: 'rare' },
  { id: 'g11', name: 'Tempered Cuirass',   tier: 6,  defense: 40, gems: 2, rarity: 'epic' },
  { id: 'g12', name: 'Aegis Plate',        tier: 6,  defense: 42, gems: 2, rarity: 'epic' },
  { id: 'g13', name: 'Dragonhide Armor',   tier: 7,  defense: 54, gems: 3, rarity: 'epic' },
  { id: 'g14', name: 'Stormguard Vest',    tier: 7,  defense: 56, gems: 3, rarity: 'epic' },
  { id: 'g15', name: 'Celestial Mail',     tier: 8,  defense: 70, gems: 4, rarity: 'legendary' },
  { id: 'g16', name: 'Sunplate Armor',     tier: 8,  defense: 74, gems: 4, rarity: 'legendary' },
  { id: 'g17', name: 'Abyssal Shroud',     tier: 9,  defense: 92, gems: 6, rarity: 'mythic' },
  { id: 'g18', name: 'Eternal Breastplate',tier: 9,  defense: 96, gems: 6, rarity: 'mythic' },
  { id: 'g19', name: 'Worldbreaker Armor', tier: 10, defense: 120,gems: 8, rarity: 'ancient' },
  { id: 'g20', name: 'Mystic Wardrobe',    tier: 11, defense: 200,gems: 20, rarity: 'mystical' } // tier 11 (hidden)
];

// monsters
const monsters = [
  { id: 'm1',  name: 'Rat',              tier: 1,  threshold: 15,   gems: 1 },
  { id: 'm2',  name: 'Wild Boar',        tier: 1,  threshold: 15,   gems: 1 },
  { id: 'm3',  name: 'Giant Spider',     tier: 2,  threshold: 40,   gems: 1 },
  { id: 'm4',  name: 'Forest Wolf',      tier: 2,  threshold: 40,   gems: 1 },
  { id: 'm5',  name: 'Bandit',           tier: 3,  threshold: 75,   gems: 3 },
  { id: 'm6',  name: 'Ogre Brute',       tier: 3,  threshold: 75,   gems: 3 },
  { id: 'm7',  name: 'Stone Golem',      tier: 4,  threshold: 120,  gems: 4 },
  { id: 'm8',  name: 'Warg Rider',       tier: 4,  threshold: 120,  gems: 4 },
  { id: 'm9',  name: 'Harpy',            tier: 5,  threshold: 175,  gems: 6 },
  { id: 'm10', name: 'Troll',            tier: 5,  threshold: 175,  gems: 6 },
  { id: 'm11', name: 'Wyvern',           tier: 6,  threshold: 240,  gems: 8 },
  { id: 'm12', name: 'Ironclad Knight',  tier: 6,  threshold: 240,  gems: 8 },
  { id: 'm13', name: 'Basilisk',         tier: 7,  threshold: 315,  gems: 11 },
  { id: 'm14', name: 'Fire Drake',       tier: 7,  threshold: 315,  gems: 11 },
  { id: 'm15', name: 'Storm Elemental',  tier: 8,  threshold: 400,  gems: 13 },
  { id: 'm16', name: 'Titan Warden',     tier: 8,  threshold: 400,  gems: 13 },
  { id: 'm17', name: 'Leviathan Spawn',  tier: 9,  threshold: 495,  gems: 17 },
  { id: 'm18', name: 'Void Reaver',      tier: 9,  threshold: 495,  gems: 17 },
  { id: 'm19', name: 'Ancient Colossus', tier:10,  threshold: 600,  gems: 20 },
  { id: 'm20', name: 'Mythic Seraph',    tier:11,  threshold: 715,  gems: 24 } // tier 11 mystical (very hard)
];

/* ======================
   Lookup helpers
   ====================== */

function getWeaponById(id) {
  return weapons.find(w => w.id === id) || null;
}
function getGearById(id) {
  return gear.find(g => g.id === id) || null;
}
function getMonsterById(id) {
  return monsters.find(m => m.id === id) || null;
}
function getMonstersByTier(tier) {
  return monsters.filter(m => m.tier === tier);
}

/* ======================
   Tier index helpers
   ====================== */

function buildTierIndex(monstersList = []) {
  try {
    if (!Array.isArray(monstersList) || monstersList.length === 0) {
      return ok({ index: { tiers: [], tiersMap: {}, minThresholdByTier: {} } });
    }
    const tiersMap = {};
    for (const m of monstersList) {
      const t = Number(m.tier) || 0;
      tiersMap[t] = tiersMap[t] || [];
      tiersMap[t].push(m);
    }
    const tiers = Object.keys(tiersMap).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    const minThresholdByTier = {};
    for (const t of tiers) {
      const arr = tiersMap[t];
      const thresholds = arr.map(x => Number(x.threshold) || 0);
      minThresholdByTier[t] = thresholds.length ? Math.min(...thresholds) : 0;
    }
    return ok({ index: { tiers, tiersMap, minThresholdByTier } });
  } catch (err) {
    console.error('buildTierIndex failed:', err);
    return fail(err.message || 'Index build failed');
  }
}

let _monsterIndexCache = null;
function refreshMonsterIndex(monstersList = monsters) {
  const res = buildTierIndex(monstersList);
  if (res.success) {
    _monsterIndexCache = res.data.index;
    return ok({ index: _monsterIndexCache });
  }
  return res;
}

function getBestTier(power, monstersList = monsters, index = null) {
  try {
    const p = Number(power) || 0;
    const list = Array.isArray(monstersList) ? monstersList : [];
    if ((!index || Object.keys(index).length === 0) && _monsterIndexCache) index = _monsterIndexCache;
    const idx = index || buildTierIndex(list).data.index;
    if (!idx || !Array.isArray(idx.tiers) || idx.tiers.length === 0) return ok({ tier: 0, monsters: [] });
    let best = 0;
    for (const t of idx.tiers) {
      const minThreshold = Number(idx.minThresholdByTier[t] || 0);
      if (p >= minThreshold) best = t;
      else break;
    }
    const resultMonsters = Array.isArray(idx.tiersMap[best]) ? [...idx.tiersMap[best]] : [];
    resultMonsters.sort((a, b) => (Number(a.threshold) - Number(b.threshold)) || (a.id - b.id));
    return ok({ tier: best, monsters: resultMonsters });
  } catch (err) {
    console.error('getBestTier failed:', err);
    return fail(err.message || 'getBestTier error');
  }
}

function getEligibleMonsters(power, monstersList = monsters, index = null) {
  try {
    const p = Number(power) || 0;
    const list = Array.isArray(monstersList) ? monstersList : [];
    if ((!index || Object.keys(index).length === 0) && _monsterIndexCache) index = _monsterIndexCache;
    const idx = index || buildTierIndex(list).data.index;
    if (!idx || !Array.isArray(idx.tiers) || idx.tiers.length === 0) return ok({ eligible: {} });
    const out = {};
    for (const t of idx.tiers) {
      const arr = (idx.tiersMap[t] || []).filter(m => (Number(m.threshold) || 0) <= p);
      if (arr.length > 0) {
        arr.sort((a, b) => (Number(a.threshold) - Number(b.threshold)) || (a.id - b.id));
        out[t] = arr;
      }
    }
    return ok({ eligible: out });
  } catch (err) {
    console.error('getEligibleMonsters failed:', err);
    return fail(err.message || 'getEligibleMonsters error');
  }
}

/* ======================
   Base helpers
   ====================== */

async function ensurePlayer(userId, opts = {}) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    let player = await Player.findByPk(userId);
    if (!player) {
      player = await Player.create({
        userId,
        email: opts.email || null,
        displayName: opts.displayName || null
      });
    }
    return ok({ player });
  } catch (err) {
    console.error('Failed to ensure player:', err);
    return fail(err.message);
  }
}

async function ensurePlayerOrThrow(userId, opts = {}) {
  const res = await ensurePlayer(userId, opts);
  if (!res.success) throw new Error(res.error || 'Failed to load player');
  return res.data.player;
}

async function getBalance(userId) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const p = res.data.player;
    return ok({ balance: { bronze: p.bronze, silver: p.silver, gold: p.gold, gems: p.gems } });
  } catch (err) {
    console.error('Failed to get balance:', err);
    return fail(err.message);
  }
}

async function addCurrency(userId, type, amount) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.data.player;
    if (player[type] !== undefined) {
      player[type] += amount;
      await player.save();
      return ok({ newValue: player[type] });
    }
    return fail('Invalid currency type', 'InvalidCurrencyType');
  } catch (err) {
    console.error('Failed to add currency:', err);
    return fail(err.message);
  }
}

/* ======================
   Admin helpers
   ====================== */

// Admin: adjust a player's currency (safe, transactional)
async function adminAdjustCurrency(adminUserId, targetUserId, deltas = {}) {
  try {
    if (!adminUserId) return fail('Invalid admin user', 'InvalidUser');
    if (!targetUserId) return fail('Invalid target user', 'InvalidInput');

    const allowed = ['bronze', 'silver', 'gold', 'gems'];
    const keys = Object.keys(deltas || {});
    if (keys.length === 0) return fail('No currency deltas provided', 'InvalidInput');

    for (const k of keys) {
      if (!allowed.includes(k)) return fail(`Invalid currency type: ${k}`, 'InvalidCurrencyType');
      if (typeof deltas[k] !== 'number' || !Number.isFinite(deltas[k])) {
        return fail(`Invalid delta for ${k}`, 'InvalidInput');
      }
    }

    const res = await sequelize.transaction(async (t) => {
      let player = await Player.findByPk(targetUserId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) {
        player = await Player.create({ userId: targetUserId }, { transaction: t });
      }

      for (const k of keys) {
        const delta = Number(deltas[k]) || 0;
        player[k] = Math.max(0, (player[k] || 0) + delta);
      }

      await player.save({ transaction: t });

      return {
        userId: player.userId,
        balance: { bronze: player.bronze, silver: player.silver, gold: player.gold, gems: player.gems }
      };
    });

    return ok(res);
  } catch (err) {
    console.error('adminAdjustCurrency failed:', err);
    return fail(err.message || 'adminAdjustCurrency error', 'Error');
  }
}

// Admin: grant an item (weapon or gear) to a user
async function adminGrantItem(adminUserId, targetUserId, itemType, catalogId, qty = 1) {
  try {
    if (!adminUserId) return fail('Invalid admin user', 'InvalidUser');
    if (!targetUserId) return fail('Invalid target user', 'InvalidInput');
    if (!itemType || !['weapon', 'gear'].includes(itemType)) return fail('Invalid itemType', 'InvalidInput');
    if (!catalogId) return fail('catalogId required', 'InvalidInput');
    qty = Number(qty) || 1;
    if (qty <= 0) return fail('qty must be positive', 'InvalidInput');

    if (itemType === 'weapon') {
      return await giveWeapon(targetUserId, catalogId, qty);
    } else {
      return await giveGear(targetUserId, catalogId, qty);
    }
  } catch (err) {
    console.error('adminGrantItem failed:', err);
    return fail(err.message || 'adminGrantItem error', 'Error');
  }
}

/* ======================
   Currency helpers (non-admin)
   ====================== */

async function adjustCurrency(userId, deltas = {}) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.data.player;
    const allowed = ['bronze', 'silver', 'gold', 'gems'];
    for (const k of Object.keys(deltas)) {
      if (!allowed.includes(k)) continue;
      player[k] = Math.max(0, (player[k] || 0) + deltas[k]);
    }
    await player.save();
    return ok({ balance: { bronze: player.bronze, silver: player.silver, gold: player.gold, gems: player.gems } });
  } catch (err) {
    console.error('Failed to adjust currency:', err);
    return fail(err.message);
  }
}

async function addPrestige(userId) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.data.player;
    player.prestige += 1;
    await player.save();
    return ok({ prestige: player.prestige });
  } catch (err) {
    console.error('Failed to add prestige:', err);
    return fail(err.message);
  }
}

/* ======================
   ServerAdmin helpers
   ====================== */

async function addServerAdmin(serverId, userId, role = 'admin') {
  if (!serverId || !userId) return fail('serverId and userId required', 'InvalidInput');
  try {
    const [rec, created] = await ServerAdmin.findOrCreate({
      where: { serverId, userId },
      defaults: { serverId, userId, role }
    });
    if (!created && rec.role !== role) {
      rec.role = role;
      await rec.save();
    }
    return ok({ rec: { userId: rec.userId, role: rec.role, createdAt: rec.createdAt } });
  } catch (err) {
    console.error('Failed to add server admin:', err);
    return fail(err.message);
  }
}

async function removeServerAdmin(serverId, userId) {
  if (!serverId || !userId) return fail('serverId and userId required', 'InvalidInput');
  try {
    const deleted = await ServerAdmin.destroy({ where: { serverId, userId } });
    return ok({ removed: deleted > 0 });
  } catch (err) {
    console.error('Failed to remove server admin:', err);
    return fail(err.message);
  }
}

async function listServerAdmins(serverId) {
  if (!serverId) return fail('serverId required', 'InvalidInput');
  try {
    const rows = await ServerAdmin.findAll({ where: { serverId }, order: [['createdAt', 'ASC']] });
    const admins = rows.map(r => ({ userId: r.userId, role: r.role, createdAt: r.createdAt }));
    return ok({ admins, rows: admins });
  } catch (err) {
    console.error('Failed to list server admins:', err);
    return fail(err.message);
  }
}

async function isServerAdmin(serverId, userId) {
  if (!serverId || !userId) return ok({ isAdmin: false });
  try {
    const rec = await ServerAdmin.findOne({ where: { serverId, userId } });
    return ok({ isAdmin: !!rec });
  } catch (err) {
    console.error('Failed to check server admin:', err);
    return fail(err.message, null, { isAdmin: false });
  }
}

/* ======================
   Inventory operations (stacking)
   ====================== */

async function giveWeapon(userId, weaponId, qty = 1) {
  try {
    if (!userId || !weaponId) return fail('userId and weaponId required', 'InvalidInput');
    const weapon = getWeaponById(weaponId);
    if (!weapon) return fail('Weapon not found in catalog', 'NotFound');

    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'weapon', catalogId: weapon.id },
        transaction: t
      });
      if (existing) {
        existing.count += qty;
        await existing.save({ transaction: t });
        inv = existing;
        return;
      }
      inv = await Inventory.create({
        userId,
        itemType: 'weapon',
        catalogId: weapon.id,
        tier: weapon.tier,
        rarity: weapon.rarity,
        itemName: weapon.name,
        attack: weapon.attack,
        defense: 0,
        count: qty
      }, { transaction: t });
    });

    return ok({ inventory: inv });
  } catch (err) {
    console.error('giveWeapon failed:', err);
    return fail(err.message || 'Database error');
  }
}

async function giveGear(userId, gearId, qty = 1) {
  try {
    if (!userId || !gearId) return fail('userId and gearId required', 'InvalidInput');
    const item = getGearById(gearId);
    if (!item) return fail('Gear not found in catalog', 'NotFound');

    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'gear', catalogId: item.id },
        transaction: t
      });
      if (existing) {
        existing.count += qty;
        await existing.save({ transaction: t });
        inv = existing;
        return;
      }
      inv = await Inventory.create({
        userId,
        itemType: 'gear',
        catalogId: item.id,
        tier: item.tier,
        rarity: item.rarity,
        itemName: item.name,
        attack: 0,
        defense: item.defense,
        count: qty
      }, { transaction: t });
    });

    return ok({ inventory: inv });
  } catch (err) {
    console.error('giveGear failed:', err);
    return fail(err.message || 'Database error');
  }
}

async function getWeapons(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const rows = await Inventory.findAll({ where: { userId, itemType: 'weapon' } });
    return ok({ items: rows });
  } catch (err) {
    console.error('getWeapons failed:', err);
    return fail(err.message);
  }
}

async function getGear(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const rows = await Inventory.findAll({ where: { userId, itemType: 'gear' } });
    return ok({ items: rows });
  } catch (err) {
    console.error('getGear failed:', err);
    return fail(err.message);
  }
}

async function removeInventoryCount(inventoryId, qty = 1) {
  try {
    if (!inventoryId) return fail('inventoryId required', 'InvalidInput');
    if (qty <= 0) return fail('qty must be positive', 'InvalidInput');

    let resultInv = null;
    await sequelize.transaction(async (t) => {
      const inv = await Inventory.findByPk(inventoryId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!inv) throw new Error('Inventory row not found');
      if (inv.count < qty) throw new Error('Not enough items to remove');
      inv.count -= qty;
      if (inv.count <= 0) {
        await inv.destroy({ transaction: t });
        resultInv = null;
      } else {
        await inv.save({ transaction: t });
        resultInv = inv;
      }
    });

    return ok({ inventory: resultInv });
  } catch (err) {
    console.error('removeInventoryCount failed:', err);
    return fail(err.message || 'Database error');
  }
}

/* ======================
   Equip helpers
   ====================== */

async function equipWeaponByInventoryId(userId, inventoryId) {
  try {
    if (!userId || !inventoryId) return fail('userId and inventoryId required', 'InvalidInput');
    const inv = await Inventory.findByPk(inventoryId);
    if (!inv) return fail('Inventory not found', 'NotFound');
    if (inv.userId !== userId) return fail('Inventory does not belong to user', 'Forbidden');
    if (inv.itemType !== 'weapon') return fail('Inventory is not a weapon', 'InvalidType');

    const playerRes = await ensurePlayer(userId);
    if (!playerRes.success) return playerRes;
    const player = playerRes.data.player;
    player.equippedWeaponInvId = inv.id;
    await player.save();
    return ok({ inventory: inv });
  } catch (err) {
    console.error('equipWeaponByInventoryId failed:', err);
    return fail(err.message || 'Database error');
  }
}

async function equipGearByInventoryId(userId, inventoryId) {
  try {
    if (!userId || !inventoryId) return fail('userId and inventoryId required', 'InvalidInput');
    const inv = await Inventory.findByPk(inventoryId);
    if (!inv) return fail('Inventory not found', 'NotFound');
    if (inv.userId !== userId) return fail('Inventory does not belong to user', 'Forbidden');
    if (inv.itemType !== 'gear') return fail('Inventory is not gear', 'InvalidType');

    const playerRes = await ensurePlayer(userId);
    if (!playerRes.success) return playerRes;
    const player = playerRes.data.player;
    player.equippedGearInvId = inv.id;
    await player.save();
    return ok({ inventory: inv });
  } catch (err) {
    console.error('equipGearByInventoryId failed:', err);
    return fail(err.message || 'Database error');
  }
}

async function getEquipped(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const player = await Player.findByPk(userId);
    if (!player) return fail('Player not found', 'NotFound');
    const weapon = player.equippedWeaponInvId ? await Inventory.findByPk(player.equippedWeaponInvId) : null;
    const gearItem = player.equippedGearInvId ? await Inventory.findByPk(player.equippedGearInvId) : null;

    const power = (weapon ? (weapon.attack || 0) : 0) + (gearItem ? (gearItem.defense || 0) : 0);

    return ok({ weapon, gear: gearItem, power });
  } catch (err) {
    console.error('getEquipped failed:', err);
    return fail(err.message);
  }
}

/* ======================
   Work session helpers
   ====================== */

async function startWork(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const now = new Date();

    const result = await sequelize.transaction(async (t) => {
      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) throw new Error('Player not found');

      const active = await WorkSession.findOne({
        where: { userId, status: 'working' },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (active) {
        return fail('Already working', 'AlreadyWorking', { session: active });
      }

      if (player.lastWorkCollectedAt) {
        const secondsSinceCollect = Math.floor((now.getTime() - new Date(player.lastWorkCollectedAt).getTime()) / 1000);
        if (secondsSinceCollect < WORK_COOLDOWN_AFTER_COLLECT_SECONDS) {
          const remaining = WORK_COOLDOWN_AFTER_COLLECT_SECONDS - secondsSinceCollect;
          return fail('Cooldown after collect', 'CooldownAfterCollect', { remaining });
        }
      }

      const finishAt = new Date(now.getTime() + WORK_DURATION_SECONDS * 1000);
      const session = await WorkSession.create({
        userId,
        startedAt: now,
        finishAt,
        status: 'working'
      }, { transaction: t });

      return ok({ session });
    });

    return result;
  } catch (err) {
    console.error('startWork failed:', err);
    return fail(err.message || String(err), 'Error');
  }
}

/**
 * Collect finished work reward
 * Returns unified shape: ok({ totalReward, baseReward, bonus, newSilver, streak })
 * or fail(...) on error / cooldown / no session.
 */
async function collectWork(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const now = new Date();

    // Run in a transaction to avoid races
    const result = await sequelize.transaction(async (t) => {
      // Find the most recent session that is working/finished/collected
      const session = await WorkSession.findOne({
        where: { userId, status: { [Op.in]: ['working', 'finished', 'collected'] } },
        order: [['createdAt', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!session) {
        return fail('No active session', 'NoSession');
      }

      // If session is still 'working', check remaining time
      if (session.status === 'working') {
        const finishAt = new Date(session.finishAt);
        const secondsLeft = Math.max(0, Math.ceil((finishAt.getTime() - now.getTime()) / 1000));
        if (secondsLeft > 0) {
          const hours = Math.floor(secondsLeft / 3600);
          const minutes = Math.floor((secondsLeft % 3600) / 60);
          const seconds = secondsLeft % 60;
          return fail('Work collect is on cooldown', 'CooldownAfterWork', {
            remaining: secondsLeft,
            human: `${hours} hours, ${minutes} minutes, ${seconds} seconds`
          });
        }
        // mark finished if time passed
        session.status = 'finished';
        await session.save({ transaction: t });
      }

      // If already collected, return info
      if (session.status === 'collected') {
        // load player to return current silver and streak
        const playerAlready = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        return fail('Already collected', 'AlreadyCollected', {
          message: 'This work session has already been collected',
          newSilver: playerAlready ? playerAlready.silver : null,
          streak: playerAlready ? playerAlready.workStreak : null
        });
      }

      // At this point session.status === 'finished'
      // Compute rewards
      const baseReward = Number(WORK_REWARD_SILVER) || 0;

      // Load player and lock
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) {
        // create player if missing
        player = await Player.create({ userId }, { transaction: t });
      }

      // Compute streak: if lastWorkCollectedAt within WORK_STREAK_WINDOW_SECONDS, increment streak, else reset to 1
      let streak = Number(player.workStreak || 0);
      if (player.lastWorkCollectedAt) {
        const last = new Date(player.lastWorkCollectedAt);
        const secondsSince = Math.floor((now.getTime() - last.getTime()) / 1000);
        if (secondsSince <= WORK_STREAK_WINDOW_SECONDS) {
          streak = Math.min(WORK_STREAK_BONUS_CAP_DAYS, streak + 1);
        } else {
          streak = 1;
        }
      } else {
        streak = 1;
      }

      // Bonus calculation: WORK_STREAK_BONUS_PER_DAY per streak day (capped)
      const bonus = Math.floor((WORK_STREAK_BONUS_PER_DAY * streak)); // integer bonus silver
      const totalReward = Math.max(0, baseReward + bonus);

      // Apply to player
      player.silver = (player.silver || 0) + totalReward;
      player.workStreak = streak;
      player.lastWorkCollectedAt = now;
      await player.save({ transaction: t });

      // Update session
      session.collectedAt = now;
      session.status = 'collected';
      await session.save({ transaction: t });

      return ok({
        totalReward,
        baseReward,
        bonus,
        newSilver: player.silver,
        streak
      });
    });

    return result;
  } catch (err) {
    console.error('collectWork failed:', err);
    return fail(err.message || 'collectWork error', 'Error');
  }
}


/* ======================
   Daily claim helpers
   ====================== */

async function claimDaily(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');
    const now = new Date();

    const res = await sequelize.transaction(async (t) => {
      let claim = await DailyClaim.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!claim) {
        claim = await DailyClaim.create({ userId, lastClaimAt: null, streak: 0 }, { transaction: t });
      }

      if (claim.lastClaimAt) {
        const secondsSince = Math.floor((now.getTime() - new Date(claim.lastClaimAt).getTime()) / 1000);
        if (secondsSince < DAILY_COOLDOWN_SECONDS) {
          const remaining = DAILY_COOLDOWN_SECONDS - secondsSince;
          return fail('Already claimed', 'AlreadyClaimed', { remaining });
        }
      }

      // Determine streak
      let newStreak = 1;
      if (claim.lastClaimAt) {
        const secondsSince = Math.floor((now.getTime() - new Date(claim.lastClaimAt).getTime()) / 1000);
        if (secondsSince <= DAILY_STREAK_WINDOW_SECONDS) {
          newStreak = (claim.streak || 0) + 1;
        }
      }

      const bonus = (newStreak - 1) * DAILY_STREAK_BONUS;
      const bronzeReward = Math.max(0, DAILY_BASE_BRONZE + bonus);

      // Update claim record
      claim.lastClaimAt = now;
      claim.streak = newStreak;
      await claim.save({ transaction: t });

      // Update player currency
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) {
        player = await Player.create({ userId }, { transaction: t });
      }
      player.bronze = (player.bronze || 0) + bronzeReward;
      await player.save({ transaction: t });

      return ok({ reward: { bronze: bronzeReward }, streak: newStreak });
    });

    return res;
  } catch (err) {
    console.error('claimDaily failed:', err);
    return fail(err.message || 'claimDaily error');
  }
}

/* ======================
   Hunt helpers
   ====================== */

async function hunt(userId, monsterTier = null) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    // Determine player's power from equipped items
    const equipped = await getEquipped(userId);
    if (!equipped.success) return equipped;
    const power = equipped.data.power || 0;

    // Choose tier if not provided
    let chosenTier = Number(monsterTier) || 0;
    if (!chosenTier || chosenTier <= 0) {
      const best = getBestTier(power);
      if (!best.success) return best;
      chosenTier = best.data.tier || 0;
    }

    if (chosenTier <= 0) return fail('No eligible monsters for your power', 'NoMonsters');

    // pick a random monster from that tier that the player can fight
    const eligible = getEligibleMonsters(power);
    if (!eligible.success) return eligible;
    const arr = eligible.data.eligible[chosenTier] || [];
    if (!arr || arr.length === 0) return fail('No eligible monsters in chosen tier', 'NoMonsters');

    const monster = arr[Math.floor(Math.random() * arr.length)];

    const now = new Date();

    // Check cooldown
    const cooldownRec = await HuntCooldown.findOne({ where: { userId, monsterTier: chosenTier } });
    if (cooldownRec && cooldownRec.lastHuntAt) {
      const secondsSince = Math.floor((now.getTime() - new Date(cooldownRec.lastHuntAt).getTime()) / 1000);
      if (secondsSince < DEFAULT_HUNT_COOLDOWN_SECONDS) {
        const remaining = DEFAULT_HUNT_COOLDOWN_SECONDS - secondsSince;
        return fail('Hunt cooldown', 'Cooldown', { remaining });
      }
    }

    // Simulate fight: simple success chance based on power vs threshold
    const threshold = Number(monster.threshold) || 0;
    const chance = Math.min(0.95, Math.max(0.05, (power / (threshold || 1)))); // normalized chance
    const roll = Math.random();
    const success = roll <= chance;

    // Update cooldown and records
    await sequelize.transaction(async (t) => {
      await HuntCooldown.upsert({ userId, monsterTier: chosenTier, lastHuntAt: now }, { transaction: t });

      const [rec, created] = await HuntRecord.findOrCreate({
        where: { userId, monsterTier: chosenTier },
        defaults: { userId, monsterTier: chosenTier, kills: 0 },
        transaction: t
      });

      if (success) {
        rec.kills = (rec.kills || 0) + 1;
        await rec.save({ transaction: t });

        // Reward: gems (monster.gems) and some bronze/silver
        const gemsReward = Number(monster.gems) || 0;
        const bronzeReward = Math.max(1, Math.floor((threshold || 10) / 10));
        const silverReward = Math.max(0, Math.floor((threshold || 10) / 20));

        let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!player) {
          player = await Player.create({ userId }, { transaction: t });
        }
        player.gems = (player.gems || 0) + gemsReward;
        player.bronze = (player.bronze || 0) + bronzeReward;
        player.silver = (player.silver || 0) + silverReward;
        await player.save({ transaction: t });

        return; // transaction continues to outer return
      } else {
        // On failure, maybe give small consolation
        const bronzeConsolation = 1;
        let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!player) {
          player = await Player.create({ userId }, { transaction: t });
        }
        player.bronze = (player.bronze || 0) + bronzeConsolation;
        await player.save({ transaction: t });
        return;
      }
    });

    // Re-fetch player rewards to return a consistent response
    const playerAfter = await Player.findByPk(userId);
    return ok({
      monster: { id: monster.id, name: monster.name, tier: monster.tier, threshold: monster.threshold },
      success,
      balance: { bronze: playerAfter.bronze, silver: playerAfter.silver, gems: playerAfter.gems }
    });
  } catch (err) {
    console.error('hunt failed:', err);
    return fail(err.message || 'hunt error');
  }
}

/* ======================
   Auction helpers (simple)
   ====================== */

async function createAuction(sellerId, itemName, startingBid = 0) {
  try {
    if (!sellerId || !itemName) return fail('sellerId and itemName required', 'InvalidInput');
    const auc = await Auction.create({ sellerId, itemName, startingBid, highestBid: startingBid, highestBidder: null });
    return ok({ auction: auc });
  } catch (err) {
    console.error('createAuction failed:', err);
    return fail(err.message || 'createAuction error');
  }
}

async function listAuctions() {
  try {
    const rows = await Auction.findAll({ order: [['createdAt', 'DESC']] });
    return ok({ auctions: rows });
  } catch (err) {
    console.error('listAuctions failed:', err);
    return fail(err.message);
  }
}

/* ======================
   Utility / Admin convenience
   ====================== */

async function syncModels() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    return ok({ synced: true });
  } catch (err) {
    console.error('syncModels failed:', err);
    return fail(err.message || 'sync error');
  }
}

/* ======================
   Exports
   ====================== */

module.exports = {
  // sequelize & models
  sequelize,
  Player,
  Inventory,
  HuntRecord,
  HuntCooldown,
  Auction,
  DailyClaim,
  WorkSession,
  ServerAdmin,

  // catalogs
  weapons,
  gear,
  monsters,

  // lookups
  getWeaponById,
  getGearById,
  getMonsterById,
  getMonstersByTier,

  // index helpers
  buildTierIndex,
  refreshMonsterIndex,
  getBestTier,
  getEligibleMonsters,

  // base helpers
  ensurePlayer,
  ensurePlayerOrThrow,
  getBalance,
  addCurrency,
  adjustCurrency,
  addPrestige,

  // server admin
  addServerAdmin,
  removeServerAdmin,
  listServerAdmins,
  isServerAdmin,

  // inventory
  giveWeapon,
  giveGear,
  getWeapons,
  getGear,
  removeInventoryCount,

  // equip
  equipWeaponByInventoryId,
  equipGearByInventoryId,
  getEquipped,

  // work
  startWork,
  collectWork,

  // daily
  claimDaily,

  // hunt
  hunt,

  // auctions
  createAuction,
  listAuctions,

  // admin
  adminAdjustCurrency,
  adminGrantItem,

  // utilities
  syncModels
};
