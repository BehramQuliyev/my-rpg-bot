// commands/game/hunt.js
'use strict';

const { replySuccess, replyError } = require('../../utils/reply');

module.exports = {
  name: 'hunt',
  description: 'Hunt a monster (auto-select or specify id)',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.hunt !== 'function') {
      console.error('storage.hunt is not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const requestedMonsterId = args[0] ? String(args[0]).trim() : null;

      const equipRes = await storage.getEquipped(userId);
      if (!equipRes || equipRes.success === false) {
        console.error('getEquipped failed:', equipRes && equipRes.error ? equipRes.error : equipRes);
        return await replyError(message, 'Could not determine your equipped items. Try again later.', 'Error');
      }
      const { weapon, gear, power } = equipRes;
      if (!weapon || !gear) {
        return await replyError(message, 'Equip 1 weapon and 1 gear before hunting.', 'Not Equipped');
      }

      let targetMonsterId = requestedMonsterId;
      if (!targetMonsterId) {
        const bestRes = await storage.getBestTier(power);
        if (!bestRes || bestRes.success === false) {
          console.error('getBestTier failed:', bestRes && bestRes.error ? bestRes.error : bestRes);
          const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
          if (!fallback) return await replyError(message, 'No monsters available to hunt.', 'Error');
          targetMonsterId = fallback;
        } else {
          const mons = bestRes.monsters || [];
          if (mons.length === 0) {
            const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
            if (!fallback) return await replyError(message, 'No monsters available to hunt.', 'Error');
            targetMonsterId = fallback;
          } else {
            targetMonsterId = mons[0].id;
          }
        }
      }

      const result = await storage.hunt(userId, targetMonsterId);

      if (!result || result.success === false) {
        if (result && result.reason === 'Cooldown') {
          const remaining = result.remaining ?? 0;
          const mins = Math.floor(remaining / 60);
          const secs = Math.floor(remaining % 60);
          return await replyError(message, `You are on cooldown for this tier. Try again in ${mins}m ${secs}s.`, 'Cooldown');
        }
        if (result && result.reason === 'MissingEquipment') {
          return await replyError(message, 'Equip 1 weapon and 1 gear before hunting.', 'Not Equipped');
        }
        if (result && result.reason === 'ThresholdNotMet') {
          const powerNow = result.power ?? 'unknown';
          const needed = result.monster && result.monster.threshold ? result.monster.threshold : 'unknown';
          return await replyError(message, `Your power (${powerNow}) is below the required ${needed} to hunt that monster.`, 'Too Weak');
        }
        console.error('Hunt failed:', result && result.error ? result.error : result);
        return await replyError(message, `Hunt failed: ${result && result.message ? result.message : 'unknown reason'}`, 'Failed');
      }

      const monster = result.monster || {};
      const name = monster.name || targetMonsterId;
      const tier = monster.tier ?? 'unknown';
      const gems = monster.gems ?? 0;
      const newGems = result.newGemBalance ?? 'unknown';
      const kills = result.killsInTier ?? 0;

      return await replySuccess(message, `Hunt success vs **${name}** (tier ${tier})!\n+${gems} gems\nNew gems: **${newGems}**\nKills in tier: **${kills}**.`, 'Hunt Success');
    } catch (err) {
      console.error('hunt command error:', err);
      return await replyError(message, 'An unexpected error occurred while hunting. Please try again later.', 'Error');
    }
  }
};