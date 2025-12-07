'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'hunt',
  description: 'Hunt a monster (auto-select or specify id)',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.hunt !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Hunt',
        errorTitle: 'Error'
      });
    }

    const userId = message.author.id;
    const requestedMonsterId = args[0] ? String(args[0]).trim().toLowerCase() : null;

    // Check equipment and power
    const equipRes = await storage.getEquipped(userId);
    if (!equipRes.success) {
      return replyFromResult(message, equipRes, { label: 'Hunt', errorTitle: 'Error' });
    }
    const { weapon, gear, power } = equipRes.data;
    if (!weapon || !gear) {
      return replyFromResult(message, { success: false, error: 'Equip 1 weapon and 1 gear before hunting.', reason: 'MissingEquipment' }, {
        label: 'Hunt',
        errorTitle: 'Not equipped'
      });
    }

    // Determine target monster
    let targetMonsterId = requestedMonsterId;
    if (!targetMonsterId) {
      const bestRes = await storage.getBestTier(power);
      if (!bestRes.success) {
        // Fallback to first catalog entry if available
        const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
        if (!fallback) {
          return replyFromResult(message, { success: false, error: 'No monsters available to hunt.', reason: 'NotFound' }, { label: 'Hunt' });
        }
        targetMonsterId = fallback;
      } else {
        const mons = bestRes.data?.monsters || [];
        targetMonsterId = mons.length ? mons[0].id : storage.monsters[0]?.id || null;
        if (!targetMonsterId) {
          return replyFromResult(message, { success: false, error: 'No monsters available to hunt.', reason: 'NotFound' }, { label: 'Hunt' });
        }
      }
    }

    // Execute hunt
    const res = await storage.hunt(userId, targetMonsterId);

    await replyFromResult(message, res, {
      label: 'Hunt',
      successTitle: 'Hunt success',
      successDescription: (d) => `You defeated ${d.monster.name}! +${d.gemsAwarded} gems. Kills in tier: ${d.killsInTier}. New gems: ${d.newGemBalance}`,
      infoTitle: 'Info',
      errorTitle: 'Failed'
    });
  }
};