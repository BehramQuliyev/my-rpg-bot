'use strict';

/**
 * utils/storage.js
 *
 * Sequelize-backed storage adapter for my-rpg-bot.
 * - Unified return shape: { success, data, error, reason }
 * - Exports functions used by commands and catalogs arrays (weapons, gear, monsters)
 *
 * NOTE: Adjust connection options and model definitions to match your production DB.
 */

const { Sequelize, DataTypes, Op } = require('sequelize');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || null;
if (!DATABASE_URL) {
  console.warn('No DATABASE_URL provided; storage will attempt to connect with default sqlite in-memory for local dev.');
}

const sequelize = new Sequelize(DATABASE_URL || 'sqlite::memory:', {
  dialect: DATABASE_URL ? 'postgres' : 'sqlite',
  logging: false,
  dialectOptions: DATABASE_URL && DATABASE_URL.startsWith('postgres') ? {} : undefined
});

/* ======================
   Constants
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
function fail(error = 'Error', reason = 'Error', data = null) {
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
  indexes: [{ fields: ['displayName'] }],
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
    { fields: ['itemType'] }
  ],
  timestamps: true
});

const WorkSession = sequelize.define('WorkSession', {
  userId: { type: DataTypes.STRING },
  startedAt: { type: DataTypes.DATE },
  finishAt: { type: DataTypes.DATE },
  collectedAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'working' } // working | finished | collected | cancelled
}, { indexes: [{ fields: ['userId'] }], timestamps: true });

const DailyClaim = sequelize.define('DailyClaim', {
  userId: { type: DataTypes.STRING, primaryKey: true },
  lastClaimAt: { type: DataTypes.DATE, allowNull: true },
  streak: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: true });

const HuntRecord = sequelize.define('HuntRecord', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  kills: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { timestamps: true });

const HuntCooldown = sequelize.define('HuntCooldown', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  lastHuntAt: { type: DataTypes.DATE }
}, { timestamps: true });

const ServerAdmin = sequelize.define('ServerAdmin', {
  serverId: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'admin' }
}, {
  indexes: [
    { unique: true, fields: ['serverId', 'userId'] },
    { fields: ['serverId'] }
  ],
  timestamps: true
});

/* ======================
   Catalogs (exported)
   ====================== */

const weapons = [
  { id: 'w0',  name: 'Training Stick',     tier: 0,  attack: 1,   gems: 0, rarity: 'starter' },
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
  { id: 'w20', name: 'Mythic Soulblade',   tier: 11, attack: 220, gems: 20, rarity: 'mystical' } // hidden
];

const gear = [
  { id: 'g0',  name: 'Ragged Cloth',       tier: 0,  defense: 1,  gems: 0, rarity: 'starter' },
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
  { id: 'g20', name: 'Mystic Wardrobe',    tier: 11, defense: 200,gems: 20, rarity: 'mystical' } // hidden
];

const monsters = [
  { id: 'm0',  name: 'Field Mouse',      tier: 0,  threshold: 0,    gems: 1 },
  { id: 'm1',  name: 'Rat',              tier: 1,  threshold: 15,   gems: 2 },
  { id: 'm2',  name: 'Wild Boar',        tier: 1,  threshold: 15,   gems: 2 },
  { id: 'm3',  name: 'Giant Spider',     tier: 2,  threshold: 40,   gems: 3 },
  { id: 'm4',  name: 'Forest Wolf',      tier: 2,  threshold: 40,   gems: 3 },
  { id: 'm5',  name: 'Bandit',           tier: 3,  threshold: 75,   gems: 5 },
  { id: 'm6',  name: 'Ogre Brute',       tier: 3,  threshold: 75,   gems: 5 },
  { id: 'm7',  name: 'Stone Golem',      tier: 4,  threshold: 120,  gems: 7 },
  { id: 'm8',  name: 'Warg Rider',       tier: 4,  threshold: 120,  gems: 7 },
  { id: 'm9',  name: 'Harpy',            tier: 5,  threshold: 175,  gems: 10 },
  { id: 'm10', name: 'Troll',            tier: 5,  threshold: 175,  gems: 10 },
  { id: 'm11', name: 'Wyvern',           tier: 6,  threshold: 240,  gems: 14 },
  { id: 'm12', name: 'Ironclad Knight',  tier: 6,  threshold: 240,  gems: 14 },
  { id: 'm13', name: 'Basilisk',         tier: 7,  threshold: 315,  gems: 19 },
  { id: 'm14', name: 'Fire Drake',       tier: 7,  threshold: 315,  gems: 19 },
  { id: 'm15', name: 'Storm Elemental',  tier: 8,  threshold: 400,  gems: 22 },
  { id: 'm16', name: 'Titan Warden',     tier: 8,  threshold: 400,  gems: 22 },
  { id: 'm17', name: 'Leviathan Spawn',  tier: 9,  threshold: 495,  gems: 26 },
  { id: 'm18', name: 'Void Reaver',      tier: 9,  threshold: 495,  gems: 26 },
  { id: 'm19', name: 'Ancient Colossus', tier:10,  threshold: 600,  gems: 30 },
  { id: 'm20', name: 'Mythic Seraph',    tier:11,  threshold: 715,  gems: 50 } // hidden
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
async function getMonsterById(id) {
   return monsters.find(m => m.id === id) || null;
 }
 function getMonstersByTier(tier) {
   return monsters.filter(m => m.tier === tier);
 }

/* ======================
Starter grant helpers
====================== */

async function hasAnyEquipment(userId) {
  try {
    const w = await Inventory.findOne({ where: { userId, itemType: 'weapon' } });
    const g = await Inventory.findOne({ where: { userId, itemType: 'gear' } });
    return !!(w || g);
  } catch (err) {
    console.error('hasAnyEquipment failed:', err);
    return false;
  }
}

/**
 * Grant starter items (w0/g0) if the player has none.
 * Optionally auto-equip the newly granted items.
 */
async function grantStarterIfNeeded(userId, { autoEquip = true } = {}) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');

    const already = await hasAnyEquipment(userId);
    if (already) return ok({ granted: false });

    // Give starter weapon and gear
    const wRes = await giveWeapon(userId, 'w0', 1);
    const gRes = await giveGear(userId, 'g0', 1);

    // Auto-equip if requested and inventory rows returned
    let equipped = { weapon: null, gear: null };
    if (autoEquip) {
        if (wRes && wRes.success && wRes.data && wRes.data.inventory && wRes.data.inventory.id) {
        await equipWeaponByInventoryId(userId, wRes.data.inventory.id);
        equipped.weapon = wRes.data.inventory.id;
      } else {
        const wRow = await Inventory.findOne({ where: { userId, itemType: 'weapon', catalogId: 'w0' } });
        if (wRow) {
          await equipWeaponByInventoryId(userId, wRow.id);
          equipped.weapon = wRow.id;
        }
      }

      if (gRes && gRes.success && gRes.data && gRes.data.inventory && gRes.data.inventory.id) {
        await equipGearByInventoryId(userId, gRes.data.inventory.id);
        equipped.gear = gRes.data.inventory.id;
      } else {
        const gRow = await Inventory.findOne({ where: { userId, itemType: 'gear', catalogId: 'g0' } });
        if (gRow) {
          await equipGearByInventoryId(userId, gRow.id);
          equipped.gear = gRow.id;
        }
      }
    }

    return ok({ granted: true, equipped });
  } catch (err) {
    console.error('grantStarterIfNeeded failed:', err);
    return fail('Failed to grant starter items', 'Error');
  }
}

/* ======================
Base helpers
====================== */
async function ensurePlayer(userId, opts = {}) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    let player = await Player.findByPk(userId);
    let created = false;
    if (!player) {
      player = await Player.create({
        userId,
        email: opts.email || null,
        displayName: opts.displayName || null
      });
      created = true;
    }

    // If we just created the player, ensure they receive starter items.
    // Best-effort: do not fail player creation if starter grant fails.
    if (created) {
      try {
        await grantStarterIfNeeded(userId, { autoEquip: true });
      } catch (e) {
        console.error('grantStarterIfNeeded error (non-fatal):', e);
      }
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


/* ======================
   Account / Currency
   ====================== */

async function getBalance(userId) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const p = res.data.player;
    return ok({ balance: { bronze: p.bronze, silver: p.silver, gold: p.gold, gems: p.gems } });
  } catch (err) {
    console.error('getBalance failed:', err);
    return fail('Failed to get balance', 'Error');
  }
}

async function addCurrency(userId, type, amount) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.data.player;
    if (player[type] === undefined) return fail('Invalid currency type', 'InvalidCurrencyType');
    player[type] = Math.max(0, (player[type] || 0) + Number(amount || 0));
    await player.save();
    return ok({ newValue: player[type] });
  } catch (err) {
    console.error('addCurrency failed:', err);
    return fail('Failed to add currency', 'Error');
  }
}

/* ======================
   Daily
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

      const last = claim.lastClaimAt ? new Date(claim.lastClaimAt) : null;
      if (last) {
        const secondsSince = Math.floor((now.getTime() - last.getTime()) / 1000);
        if (secondsSince < DAILY_COOLDOWN_SECONDS) {
          const remaining = DAILY_COOLDOWN_SECONDS - secondsSince;
          return fail('Daily on cooldown', 'Cooldown', { remaining });
        }
      }

      // compute streak
      let streak = 1;
      if (claim.lastClaimAt) {
        const secondsSince = Math.floor((now.getTime() - new Date(claim.lastClaimAt).getTime()) / 1000);
        if (secondsSince <= DAILY_STREAK_WINDOW_SECONDS) {
          streak = Math.min((claim.streak || 0) + 1, 365);
        }
      }

      const reward = DAILY_BASE_BRONZE + (Math.max(0, streak - 1) * DAILY_STREAK_BONUS);

      // ensure player and add currency
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) {
        player = await Player.create({ userId }, { transaction: t });
      }
      player.bronze = (player.bronze || 0) + reward;
      await player.save({ transaction: t });

      claim.lastClaimAt = now;
      claim.streak = streak;
      await claim.save({ transaction: t });

      return ok({ reward, streak, nextAvailableAt: Math.floor((now.getTime() + DAILY_COOLDOWN_SECONDS * 1000) / 1000) });
    });

    return res;
  } catch (err) {
    console.error('claimDaily failed:', err);
    return fail('Failed to claim daily', 'Error');
  }
}

/* ======================
   Work session
   ====================== */

async function startWork(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const now = new Date();

    const res = await sequelize.transaction(async (t) => {
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) {
        player = await Player.create({ userId }, { transaction: t });
      }

      // check active session
      const active = await WorkSession.findOne({ where: { userId, status: 'working' }, transaction: t, lock: t.LOCK.UPDATE });
      if (active) return fail('Already working', 'AlreadyWorking', { session: active });

      // check cooldown after collect
      if (player.lastWorkCollectedAt) {
        const secondsSinceCollect = Math.floor((now.getTime() - new Date(player.lastWorkCollectedAt).getTime()) / 1000);
        if (secondsSinceCollect < WORK_COOLDOWN_AFTER_COLLECT_SECONDS) {
          const remaining = WORK_COOLDOWN_AFTER_COLLECT_SECONDS - secondsSinceCollect;
          return fail('Cooldown after collect', 'CooldownAfterCollect', { remaining });
        }
      }

      const finishAt = new Date(now.getTime() + WORK_DURATION_SECONDS * 1000);
      const session = await WorkSession.create({ userId, startedAt: now, finishAt, status: 'working' }, { transaction: t });

      return ok({ session });
    });

    return res;
  } catch (err) {
    console.error('startWork failed:', err);
    return fail('Failed to start work', 'Error');
  }
}

async function collectWork(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const now = new Date();

    const res = await sequelize.transaction(async (t) => {
      const session = await WorkSession.findOne({ where: { userId, status: 'working' }, transaction: t, lock: t.LOCK.UPDATE });
      if (!session) {
        // maybe already finished and waiting collect
        const finished = await WorkSession.findOne({ where: { userId, status: 'finished' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!finished) return fail('No finished work session to collect', 'NoFinishedSession');
        // treat finished as collectible
        session = finished;
      }

      const secondsUntilFinish = Math.floor((new Date(session.finishAt).getTime() - now.getTime()) / 1000);
      if (secondsUntilFinish > 0) {
        return fail('Work still in progress', 'StillWorking', { remaining: secondsUntilFinish });
      }

      // compute reward and streak
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) player = await Player.create({ userId }, { transaction: t });

      // update streak
      const lastCollected = player.lastWorkCollectedAt ? new Date(player.lastWorkCollectedAt) : null;
      let streak = 1;
      if (lastCollected) {
        const secondsSince = Math.floor((now.getTime() - lastCollected.getTime()) / 1000);
        if (secondsSince <= WORK_STREAK_WINDOW_SECONDS) {
          streak = Math.min((player.workStreak || 0) + 1, WORK_STREAK_BONUS_CAP_DAYS);
        }
      }
      player.workStreak = streak;
      player.lastWorkCollectedAt = now;

      // reward calculation
      const base = WORK_REWARD_SILVER;
      const bonus = Math.min(WORK_STREAK_BONUS_PER_DAY * (streak - 1), WORK_REWARD_SILVER);
      const reward = base + bonus;
      player.silver = (player.silver || 0) + reward;

      // mark session collected
      session.status = 'collected';
      session.collectedAt = now;
      await session.save({ transaction: t });
      await player.save({ transaction: t });

      return ok({ reward, streak });
    });

    return res;
  } catch (err) {
    console.error('collectWork failed:', err);
    return fail('Failed to collect work', 'Error');
  }
}

/* ======================
   Inventory & equipment
   ====================== */

async function giveWeapon(userId, weaponId, qty = 1) {
  try {
    if (!userId || !weaponId) return fail('userId and weaponId required', 'InvalidInput');
    const weapon = getWeaponById(weaponId);
    if (!weapon) return fail('Weapon not found', 'NotFound');

    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv = null;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'weapon', catalogId: weapon.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (existing) {
        existing.count += Number(qty || 1);
        await existing.save({ transaction: t });
        inv = existing;
      } else {
        inv = await Inventory.create({
          userId,
          itemType: 'weapon',
          catalogId: weapon.id,
          tier: weapon.tier,
          rarity: weapon.rarity,
          itemName: weapon.name,
          attack: weapon.attack,
          defense: 0,
          count: Number(qty || 1)
        }, { transaction: t });
      }
    });

    return ok({ inventory: inv });
  } catch (err) {
    console.error('giveWeapon failed:', err);
    return fail('Failed to grant weapon', 'Error');
  }
}

async function giveGear(userId, gearId, qty = 1) {
  try {
    if (!userId || !gearId) return fail('userId and gearId required', 'InvalidInput');
    const item = getGearById(gearId);
    if (!item) return fail('Gear not found', 'NotFound');

    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv = null;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'gear', catalogId: item.id },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (existing) {
        existing.count += Number(qty || 1);
        await existing.save({ transaction: t });
        inv = existing;
      } else {
        inv = await Inventory.create({
          userId,
          itemType: 'gear',
          catalogId: item.id,
          tier: item.tier,
          rarity: item.rarity,
          itemName: item.name,
          attack: 0,
          defense: item.defense,
          count: Number(qty || 1)
        }, { transaction: t });
      }
    });

    return ok({ inventory: inv });
  } catch (err) {
    console.error('giveGear failed:', err);
    return fail('Failed to grant gear', 'Error');
  }
}

async function getWeapons(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const rows = await Inventory.findAll({
      where: { userId, itemType: 'weapon' },
      order: [['createdAt', 'ASC']]
    });
    return ok({ items: rows });
  } catch (err) {
    console.error('getWeapons failed:', err);
    return fail('Failed to fetch weapons', 'Error');
  }
}

async function getGear(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const rows = await Inventory.findAll({
      where: { userId, itemType: 'gear' },
      order: [['createdAt', 'ASC']]
    });
    return ok({ items: rows });
  } catch (err) {
    console.error('getGear failed:', err);
    return fail('Failed to fetch gear', 'Error');
  }
}

async function inventory(userId) {
  try {
    if (!userId) return fail('userId required', 'InvalidInput');
    const rows = await Inventory.findAll({
      where: { userId },
      order: [['createdAt', 'ASC']]
    });
    return ok({ items: rows });
  } catch (err) {
    console.error('inventory failed:', err);
    return fail('Failed to fetch inventory', 'Error');
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
    return fail(err.message || 'Failed to remove inventory count', 'Error');
  }
}

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
    return fail('Failed to equip weapon', 'Error');
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
    return fail('Failed to equip gear', 'Error');
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
    return fail('Failed to fetch equipped items', 'Error');
  }
}

/* ======================
   Hunt
   ====================== */

async function hunt(userId, monsterId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    // Ensure player and equipped items
    const equipRes = await getEquipped(userId);
    if (!equipRes.success) return equipRes;
    const power = equipRes.data.power || 0;
    if (!monsterId) return fail('monsterId required', 'InvalidInput');

    const monster = getMonsterById(monsterId);
    if (!monster) return fail('Monster not found', 'NotFound');

    if (power < (monster.threshold || 0)) {
      return fail('Power too low', 'ThresholdNotMet', { power, monster, threshold: monster.threshold });
    }

    // Optional: enforce hunt cooldown per tier
    const tier = monster.tier || 0;
    const now = new Date();

    // check cooldown
    const cooldownRec = await HuntCooldown.findOne({ where: { userId, monsterTier: tier } });
    if (cooldownRec) {
      const secondsSince = Math.floor((now.getTime() - new Date(cooldownRec.lastHuntAt).getTime()) / 1000);
      if (secondsSince < DEFAULT_HUNT_COOLDOWN_SECONDS) {
        return fail('Hunt cooldown', 'Cooldown', { remaining: DEFAULT_HUNT_COOLDOWN_SECONDS - secondsSince });
      }
    }

    // award gems and record kill
    const gemsAwarded = monster.gems || 0;

    await sequelize.transaction(async (t) => {
      // update player gems
      let player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) player = await Player.create({ userId }, { transaction: t });
      player.gems = (player.gems || 0) + gemsAwarded;
      await player.save({ transaction: t });

      // update hunt record
      const [rec] = await HuntRecord.findOrCreate({
        where: { userId, monsterTier: tier },
        defaults: { userId, monsterTier: tier, kills: 0 },
        transaction: t
      });
      rec.kills = (rec.kills || 0) + 1;
      await rec.save({ transaction: t });

      // update cooldown
      await HuntCooldown.upsert({ userId, monsterTier: tier, lastHuntAt: now }, { transaction: t });
    });

    return ok({ monster, gemsAwarded });
  } catch (err) {
    console.error('hunt failed:', err);
    return fail('Hunt failed', 'Error');
  }
}

/* ======================
   Admin helpers
   ====================== */

async function adminAdjustCurrency(adminUserId, targetUserId, deltas = {}) {
  try {
    if (!adminUserId) return fail('Invalid admin user', 'InvalidUser');
    if (!targetUserId) return fail('Invalid target user', 'InvalidInput');

    const allowed = ['bronze', 'silver', 'gold', 'gems'];
    const keys = Object.keys(deltas || {});
    if (keys.length === 0) return fail('No currency deltas provided', 'InvalidInput');

    for (const k of keys) {
      if (!allowed.includes(k)) return fail(`Invalid currency type: ${k}`, 'InvalidCurrencyType');
      if (typeof deltas[k] !== 'number' || !Number.isFinite(deltas[k])) return fail(`Invalid delta for ${k}`, 'InvalidInput');
    }

    const res = await sequelize.transaction(async (t) => {
      let player = await Player.findByPk(targetUserId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) player = await Player.create({ userId: targetUserId }, { transaction: t });

      for (const k of keys) {
        const delta = Number(deltas[k]) || 0;
        player[k] = Math.max(0, (player[k] || 0) + delta);
      }
      await player.save({ transaction: t });

      return { userId: player.userId, balance: { bronze: player.bronze, silver: player.silver, gold: player.gold, gems: player.gems } };
    });

    return ok(res);
  } catch (err) {
    console.error('adminAdjustCurrency failed:', err);
    return fail('Failed to adjust currency', 'Error');
  }
}

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
    return fail('Failed to grant item', 'Error');
  }
}

/* ======================
   Server admin management
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
    console.error('addServerAdmin failed:', err);
    return fail('Failed to add server admin', 'Error');
  }
}

async function removeServerAdmin(serverId, userId) {
  if (!serverId || !userId) return fail('serverId and userId required', 'InvalidInput');
  try {
    const deleted = await ServerAdmin.destroy({ where: { serverId, userId } });
    return ok({ removed: deleted > 0 });
  } catch (err) {
    console.error('removeServerAdmin failed:', err);
    return fail('Failed to remove server admin', 'Error');
  }
}

async function listServerAdmins(serverId) {
  if (!serverId) return fail('serverId required', 'InvalidInput');
  try {
    const rows = await ServerAdmin.findAll({ where: { serverId }, order: [['createdAt', 'ASC']] });
    const admins = rows.map(r => ({ userId: r.userId, role: r.role, createdAt: r.createdAt }));
    return ok({ admins, rows: admins });
  } catch (err) {
    console.error('listServerAdmins failed:', err);
    return fail('Failed to list server admins', 'Error');
  }
}

async function isServerAdmin(serverId, userId) {
  if (!serverId || !userId) return ok({ isAdmin: false });
  try {
    const rec = await ServerAdmin.findOne({ where: { serverId, userId } });
    return ok({ isAdmin: !!rec });
  } catch (err) {
    console.error('isServerAdmin failed:', err);
    return fail('Failed to check server admin', 'Error', { isAdmin: false });
  }
}

/* ======================
   Initialization helper
   ====================== */

async function initDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    // Optionally refresh caches or seed minimal data here
    return ok({ message: 'Database initialized' });
  } catch (err) {
    console.error('initDatabase failed:', err);
    return fail('Failed to initialize database', 'Error');
  }
}

/* ======================
Exports
====================== */

module.exports = {
  // DB handle
  sequelize,
  initDatabase,

  // catalogs
  weapons,
  gear,
  monsters,

  // player helpers
  ensurePlayer,
  ensurePlayerOrThrow,

  // account
  getBalance,
  addCurrency,

  // daily
  claimDaily,

  // work
  startWork,
  collectWork,

  // inventory / equipment
  giveWeapon,
  giveGear,
  getWeapons,
  getGear,
  inventory,
  removeInventoryCount,
  equipWeaponByInventoryId,
  equipGearByInventoryId,
  getEquipped,

  // gameplay
  hunt,

  // admin
  adminAdjustCurrency,
  adminGrantItem,

  // server admin management
  addServerAdmin,
  removeServerAdmin,
  listServerAdmins,
  isServerAdmin,

  // starter helpers
  hasAnyEquipment,
  grantStarterIfNeeded
};
