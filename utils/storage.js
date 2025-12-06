'use strict';

/**
 * storage.js (refactored)
 * - Unified return shape: { success, data, error, reason }
 * - Keeps existing Sequelize models, catalogs, and logic
 * - Preserves transactional safety and row-level locks
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

const WORK_DURATION_SECONDS = 9 * 60 * 60;
const WORK_COOLDOWN_AFTER_COLLECT_SECONDS = 3 * 60 * 60;
const WORK_REWARD_SILVER = 100;
const WORK_STREAK_WINDOW_SECONDS = 48 * 60 * 60;
const WORK_STREAK_BONUS_PER_DAY = 5;
const WORK_STREAK_BONUS_CAP_DAYS = 30;

const DEFAULT_HUNT_COOLDOWN_SECONDS = 60;

/* ======================
   Response helper
   ====================== */

function ok(data = null) {
  return { success: true, data, error: null };
}
function fail(error, reason = null, data = null) {
  return { success: false, data, error, reason };
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

const weapons = [/* ...same as your file... */];
const gear = [/* ...same as your file... */];
const monsters = [/* ...same as your file... */];

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
    return ok({ rec });
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
    return ok({ admins });
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

async function collectWork(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const now = new Date();

    const result = await sequelize.transaction(async (t) => {
      const session = await WorkSession.findOne({
        where: { userId, status: { [Op.in]: ['working', 'finished'] } },
        order: [['createdAt', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!session) {
        return fail('No active session', 'NoSession');
      }

      if (session.status === 'working') {
        const remaining = Math.max(0, Math.floor((new Date(session.finishAt).getTime() - now.getTime()) / 1000));
        return fail('Still working', 'StillWorking', { remaining });
      }

      if (session.status === 'collected') {
        const collectedAt = session.collectedAt ? new Date(session.collectedAt) : null;
        if (collectedAt) {
          const secondsSince = Math.floor((now.getTime() - collectedAt.getTime()) / 1000);
          if (secondsSince < WORK_COOLDOWN_AFTER_COLLECT_SECONDS) {
            const remaining = WORK_COOLDOWN_AFTER_COLLECT_SECONDS - secondsSince;
            return fail('Already collected', 'AlreadyCollected', { remaining });
          }
        }
      }

      if (session.status === 'finished') {
        const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!player) throw new Error('Player not found');

        let newStreak = 1;
        if (player.lastWorkCollectedAt) {
          const secondsSinceLastCollect = Math.floor((now.getTime() - new Date(player.lastWorkCollectedAt).getTime()) / 1000);
          if (secondsSinceLastCollect <= WORK_STREAK_WINDOW_SECONDS) {
            newStreak = (player.workStreak || 0) + 1;
            if (newStreak > WORK_STREAK_BONUS_CAP_DAYS) newStreak = WORK_STREAK_BONUS_CAP_DAYS;
          }
        }

        const bonus = Math.min(WORK_STREAK_BONUS_CAP_DAYS, (newStreak - 1) * WORK_STREAK_BONUS_PER_DAY);
        const baseReward = WORK_REWARD_SILVER;
        const totalReward = baseReward + bonus;

        player.silver = (player.silver || 0) + totalReward;
        player.workStreak = newStreak;
        player.lastWorkCollectedAt = now;
        await player.save({ transaction: t });

        session.status = 'collected';
        session.collectedAt = now;
        await session.save({ transaction: t });

        return ok({
          totalReward,
          baseReward,
          bonus,
          newSilver: player.silver,
          streak: newStreak
        });
      }

      return fail('No finished session', 'NoFinishedSession');
    });

    return result;
  } catch (err) {
    console.error('collectWork failed:', err);
    return fail(err.message || String(err), 'Error');
  }
}

/* ======================
   Daily claim helper
   ====================== */

async function claimDaily(userId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const result = await sequelize.transaction(async (t) => {
      let daily = await DailyClaim.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!daily) {
        daily = await DailyClaim.create({ userId, lastClaimAt: null, streak: 0 }, { transaction: t });
      }

      const now = new Date();
      const last = daily.lastClaimAt ? new Date(daily.lastClaimAt) : null;
      const secondsSinceLast = last ? Math.floor((now.getTime() - last.getTime()) / 1000) : Number.POSITIVE_INFINITY;

      if (secondsSinceLast < DAILY_COOLDOWN_SECONDS) {
        const remaining = DAILY_COOLDOWN_SECONDS - secondsSinceLast;
        return fail('Daily on cooldown', 'Cooldown', { remaining });
      }

      let newStreak = 1;
      if (last && secondsSinceLast <= DAILY_STREAK_WINDOW_SECONDS) {
        newStreak = (daily.streak || 0) + 1;
      }

      const bonus = (newStreak - 1) * DAILY_STREAK_BONUS;
      const reward = Math.max(0, DAILY_BASE_BRONZE + bonus);

      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) throw new Error('Player not found during claimDaily');

      player.bronze = (player.bronze || 0) + reward;
      await player.save({ transaction: t });

      daily.lastClaimAt = now;
      daily.streak = newStreak;
      await daily.save({ transaction: t });

      const nextAvailableAt = new Date(now.getTime() + DAILY_COOLDOWN_SECONDS * 1000);

      return ok({ reward, streak: newStreak, nextAvailableAt });
    });

    return result;
  } catch (err) {
    console.error('claimDaily failed:', err);
    return fail(err.message || String(err), 'Error');
  }
}

/* ======================
   Hunt helpers
   ====================== */

async function hunt(userId, monsterId) {
  try {
    if (!userId) return fail('Invalid user', 'InvalidUser');

    const monster = getMonsterById(monsterId);
    if (!monster) return fail('Monster not found', 'NotFound');

    const result = await sequelize.transaction(async (t) => {
      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) return fail('Player not found', 'NotFound');

      const weapon = player.equippedWeaponInvId ? await Inventory.findByPk(player.equippedWeaponInvId, { transaction: t }) : null;
      const gearItem = player.equippedGearInvId ? await Inventory.findByPk(player.equippedGearInvId, { transaction: t }) : null;

      if (!weapon || !gearItem) {
        return fail('Equip 1 weapon and 1 gear before hunting.', 'MissingEquipment');
      }

      const power = (weapon.attack || 0) + (gearItem.defense || 0);
      if (power < (monster.threshold || 0)) {
        return fail('Power below required threshold', 'ThresholdNotMet', { power, monster });
      }

      const tier = Number(monster.tier) || 0;
      const cooldownRec = await HuntCooldown.findOne({
        where: { userId, monsterTier: tier },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const now = new Date();
      if (cooldownRec && cooldownRec.lastHuntAt) {
        const secondsSince = Math.floor((now.getTime() - new Date(cooldownRec.lastHuntAt).getTime()) / 1000);
        if (secondsSince < DEFAULT_HUNT_COOLDOWN_SECONDS) {
          const remaining = DEFAULT_HUNT_COOLDOWN_SECONDS - secondsSince;
          return fail('Hunt on cooldown', 'Cooldown', { remaining });
        }
      }

      const gemsAwarded = Number(monster.gems) || 0;
      player.gems = (player.gems || 0) + gemsAwarded;
      await player.save({ transaction: t });

      const [hr] = await HuntRecord.findOrCreate({
        where: { userId, monsterTier: tier },
        defaults: { userId, monsterTier: tier, kills: 0 },
        transaction: t
      });
      hr.kills = (hr.kills || 0) + 1;
      await hr.save({ transaction: t });

      if (cooldownRec) {
        cooldownRec.lastHuntAt = now;
        await cooldownRec.save({ transaction: t });
      } else {
        await HuntCooldown.create({ userId, monsterTier: tier, lastHuntAt: now }, { transaction: t });
      }

      const killsInTier = hr.kills;

      return ok({
        monster,
        gemsAwarded,
        newGemBalance: player.gems,
        killsInTier
      });
    });

    return result;
  } catch (err) {
    console.error('hunt failed:', err);
    return fail(err.message || 'Hunt error');
  }
}

/* ======================
   Admin helpers
   ====================== */

async function adminAdjustCurrency(targetUserId, deltas = {}) {
  try {
    if (!targetUserId) return fail('targetUserId required', 'InvalidInput');
    const res = await adjustCurrency(targetUserId, deltas);
    if (!res.success) return res;
    return ok({ balance: res.data.balance });
  } catch (err) {
    console.error('adminAdjustCurrency failed:', err);
    return fail(err.message || 'Error');
  }
}

async function adminGrantItem(targetUserId, catalogId, type, qty = 1) {
  try {
    if (!targetUserId || !catalogId || !type) return fail('targetUserId, catalogId and type required', 'InvalidInput');
    if (!['weapon', 'gear'].includes(type)) return fail('type must be weapon or gear', 'InvalidType');
    qty = Number(qty) || 1;
    if (qty <= 0) return fail('qty must be positive', 'InvalidInput');

    if (type === 'weapon') {
      const res = await giveWeapon(targetUserId, catalogId, qty);
      if (!res.success) return res;
      return ok({ inventory: res.data.inventory });
    } else {
      const res = await giveGear(targetUserId, catalogId, qty);
      if (!res.success) return res;
      return ok({ inventory: res.data.inventory });
    }
  } catch (err) {
    console.error('adminGrantItem failed:', err);
    return fail(err.message || 'Error');
  }
}

/* ======================
   DB init / utilities
   ====================== */

async function initDb() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    refreshMonsterIndex();
    return ok();
  } catch (err) {
    console.error('initDb failed:', err);
    return fail(err.message || String(err));
  }
}

/* ======================
   Exports
   ====================== */

module.exports = {
  // DB & init
  sequelize,
  initDb,

  // catalogs & lookups
  weapons,
  gear,
  monsters,
  getWeaponById,
  getGearById,
  getMonsterById,
  getMonstersByTier,
  refreshMonsterIndex,
  getBestTier,
  getEligibleMonsters,

  // player / currency
  ensurePlayer,
  ensurePlayerOrThrow,
  getBalance,
  addCurrency,
  adjustCurrency,
  addPrestige,

  // inventory
  giveWeapon,
  giveGear,
  getWeapons,
  getGear,
  removeInventoryCount,
  equipWeaponByInventoryId,
  equipGearByInventoryId,
  getEquipped,

  // work / daily
  startWork,
  collectWork,
  claimDaily,

  // hunt
  hunt,

  // admin / server admins
  addServerAdmin,
  removeServerAdmin,
  listServerAdmins,
  isServerAdmin,
  adminAdjustCurrency,
  adminGrantItem,

  // models (expose for advanced use)
  Player,
  Inventory,
  HuntRecord,
  HuntCooldown,
  Auction,
  DailyClaim,
  WorkSession,
  ServerAdmin
};
