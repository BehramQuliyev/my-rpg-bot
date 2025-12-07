'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'hunt',
  description: 'Hunt a monster (auto-select or specify id)',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.hunt !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Hunt',
        errorTitle: '❌ Error'
      });
      return;
    }

    const userId = message.author.id;
    const requestedMonsterId = args[0] ? String(args[0]).trim().toLowerCase() : null;

    // Check equipment and power
    const equipRes = await storage.getEquipped(userId);
    if (!equipRes.success) {
      await replyFromResult(message, equipRes, { label: 'Hunt', errorTitle: '❌ Error' });
      return;
    }
    const { weapon, gear, power } = equipRes.data;
    if (!weapon || !gear) {
      await replyFromResult(message, { success: false, error: 'Equip 1 weapon and 1 gear before hunting.', reason: 'MissingEquipment' }, {
        label: 'Hunt',
        errorTitle: '⚠️ Not Equipped'
      });
      return;
    }

    // Determine target monster
    let targetMonsterId = requestedMonsterId;
    if (!targetMonsterId) {
      const bestRes = await storage.getBestTier(power);
      if (!bestRes.success) {
        const fallback = Array.isArray(storage.monsters) && storage.monsters.length ? storage.monsters[0].id : null;
        if (!fallback) {
          await replyFromResult(message, { success: false, error: 'No monsters available to hunt.', reason: 'NotFound' }, { label: 'Hunt' });
          return;
        }
        targetMonsterId = fallback;
      } else {
        const mons = bestRes.data?.monsters || [];
        targetMonsterId = mons.length ? mons[0].id : storage.monsters[0]?.id || null;
        if (!targetMonsterId) {
          await replyFromResult(message, { success: false, error: 'No monsters available to hunt.', reason: 'NotFound' }, { label: 'Hunt' });
          return;
        }
      }
    }

    // Execute hunt
    const res = await storage.hunt(userId, targetMonsterId);

    await replyFromResult(message, res, {
      label: 'Hunt',
      successTitle: '🗡️ Hunt Success!',
      successDescription: (d) =>
        `👹 You defeated **${d.monster.name}**!\n\n` +
        `💎 Gems earned: **${d.gemsAwarded}**\n` +
        `⚔️ Kills in tier: **${d.killsInTier}**\n` +
        `📈 New gem balance: **${d.newGemBalance}**`,
      infoTitle: 'ℹ️ Info',
      errorTitle: '❌ Failed'
    });
  }
};
