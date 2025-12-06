// commands/game/hunt.js
'use strict';

module.exports = {
  name: 'hunt',
  description: 'Hunt a monster (auto-select or specify id)',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage } = context;
      if (!storage || typeof storage.hunt !== 'function') {
        console.error('storage.hunt is not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      const requestedMonsterId = args[0] ? String(args[0]).trim() : null;

      // Ensure player has equipment
      const equipRes = await storage.getEquipped(userId);
      if (!equipRes || equipRes.success === false) {
        console.error('getEquipped failed:', equipRes && equipRes.error ? equipRes.error : equipRes);
        return message.reply('❌ Could not determine your equipped items. Try again later.');
      }
      const { weapon, gear, power } = equipRes;
      if (!weapon || !gear) {
        return message.reply('⚠️ Equip 1 weapon and 1 gear before hunting.');
      }

      // Determine target monster
      let targetMonsterId = requestedMonsterId;
      if (!targetMonsterId) {
        const bestRes = await storage.getBestTier(power);
        if (!bestRes || bestRes.success === false) {
          console.error('getBestTier failed:', bestRes && bestRes.error ? bestRes.error : bestRes);
          // Fallback to first monster in catalog if available
          const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
          if (!fallback) return message.reply('❌ No monsters available to hunt.');
          targetMonsterId = fallback;
        } else {
          const mons = bestRes.monsters || [];
          if (mons.length === 0) {
            const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
            if (!fallback) return message.reply('❌ No monsters available to hunt.');
            targetMonsterId = fallback;
          } else {
            targetMonsterId = mons[0].id;
          }
        }
      }

      // Perform hunt
      const result = await storage.hunt(userId, targetMonsterId);

      if (!result || result.success === false) {
        // Known failure reasons
        if (result && result.reason === 'Cooldown') {
          const remaining = result.remaining ?? 0;
          const mins = Math.floor(remaining / 60);
          const secs = Math.floor(remaining % 60);
          return message.reply(`⏳ You are on cooldown for this tier. Try again in ${mins}m ${secs}s.`);
        }

        if (result && result.reason === 'MissingEquipment') {
          return message.reply('⚠️ Equip 1 weapon and 1 gear before hunting.');
        }

        if (result && result.reason === 'ThresholdNotMet') {
          const powerNow = result.power ?? 'unknown';
          const needed = result.monster && result.monster.threshold ? result.monster.threshold : 'unknown';
          return message.reply(`❌ Your power (${powerNow}) is below the required ${needed} to hunt that monster.`);
        }

        // Generic failure message
        console.error('Hunt failed:', result && result.error ? result.error : result);
        return message.reply(`❌ Hunt failed: ${result && result.message ? result.message : 'unknown reason'}`);
      }

      // Success
      const monster = result.monster || {};
      const name = monster.name || targetMonsterId;
      const tier = monster.tier ?? 'unknown';
      const gems = monster.gems ?? 0;
      const newGems = result.newGemBalance ?? 'unknown';
      const kills = result.killsInTier ?? 0;

      return message.reply(
        `🗡️ Hunt success vs **${name}** (tier ${tier})! +${gems} gems. New gems: **${newGems}**. Kills in tier: **${kills}**.`
      );
    } catch (err) {
      console.error('Hunt command error:', err);
      try {
        await message.reply('❌ An unexpected error occurred while hunting. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
