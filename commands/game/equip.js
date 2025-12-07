'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'equip',
  description: 'Equip a weapon or gear by inventory ID',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.equipItem !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Equip',
        errorTitle: '❌ Error'
      });
      return;
    }

    // Expecting: .equip <id> weapon OR .equip <id> gear
    const [idArg, typeArg] = args;
    if (!idArg || !typeArg) {
      await replyFromResult(message, { success: false, error: 'Usage: .equip <id> weapon|gear', reason: 'InvalidInput' }, {
        label: 'Equip',
        errorTitle: '⚠️ Invalid Input'
      });
      return;
    }

    const id = String(idArg).trim();
    const type = String(typeArg).toLowerCase();

    if (type !== 'weapon' && type !== 'gear') {
      await replyFromResult(message, { success: false, error: 'Type must be weapon or gear', reason: 'InvalidInput' }, {
        label: 'Equip',
        errorTitle: '⚠️ Invalid Input'
      });
      return;
    }

    const res = await storage.equipItem(message.author.id, id, type);

    await replyFromResult(message, res, {
      label: 'Equip',
      successTitle: '🛡️ Equipped',
      successDescription: (d) =>
        `✅ You equipped **${d.itemName || 'Unknown'}** (ID:${d.id}) as your ${type}.\n\n` +
        `⚔️ Current Power: **${d.power ?? 0}**`,
      infoTitle: 'ℹ️ Info',
      errorTitle: '❌ Failed'
    });
  }
};
