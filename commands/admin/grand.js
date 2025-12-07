'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'grant',
  description: 'Admin: grant an item to a player',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage, config } = context;

      // Resolve admin IDs from validated config first, fallback to env
      const ADMIN_IDS = Array.isArray(config && config.ADMIN_IDS) && config.ADMIN_IDS.length
        ? config.ADMIN_IDS
        : (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

      const callerId = message.author.id;
      function isAdmin(callerIdLocal) {
        if (ADMIN_IDS.includes(callerIdLocal)) return true;
        if (message.guild && message.guild.ownerId === callerIdLocal) return true;
        return false;
      }

      if (!isAdmin(callerId)) {
        await replyFromResult(message, { success: false, error: 'You are not authorized to use this command.', reason: 'Forbidden' }, {
          label: 'Grant',
          errorTitle: '🚫 Unauthorized'
        });
        return;
      }

      const targetMention = args[0];
      const catalogId = args[1] ? String(args[1]).trim() : null;
      const type = args[2] ? String(args[2]).toLowerCase() : null;
      const qty = args[3] ? parseInt(args[3], 10) : 1;

      if (!targetMention || !catalogId || !type) {
        await replyFromResult(message, { success: false, error: 'Usage: `.grant @user <catalogId> <weapon|gear> [qty]`', reason: 'InvalidInput' }, {
          label: 'Grant',
          errorTitle: '⚠️ Invalid Usage'
        });
        return;
      }

      if (!['weapon', 'gear'].includes(type)) {
        await replyFromResult(message, { success: false, error: 'Item type must be "weapon" or "gear".', reason: 'InvalidInput' }, {
          label: 'Grant',
          errorTitle: '⚠️ Invalid Type'
        });
        return;
      }

      if (Number.isNaN(qty) || qty <= 0) {
        await replyFromResult(message, { success: false, error: 'Quantity must be a positive integer.', reason: 'InvalidInput' }, {
          label: 'Grant',
          errorTitle: '⚠️ Invalid Quantity'
        });
        return;
      }

      const match = targetMention.match(/^<@!?(\d+)>$/);
      if (!match) {
        await replyFromResult(message, { success: false, error: 'Please mention the target user (e.g. @User).', reason: 'InvalidInput' }, {
          label: 'Grant',
          errorTitle: '⚠️ Invalid Target'
        });
        return;
      }
      const targetId = match[1];

      if (!storage || typeof storage.adminGrantItem !== 'function') {
        console.error('storage.adminGrantItem is not available in command context');
        await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
          label: 'Grant',
          errorTitle: '❌ Error'
        });
        return;
      }

      const res = await storage.adminGrantItem(targetId, catalogId, type, qty);

      await replyFromResult(message, res, {
        label: 'Grant',
        successTitle: '🎁 Item Granted',
        successDescription: (d) => {
          const inv = d.inventory || d.rec || d.data?.inventory || null;
          if (inv) {
            const name = inv.itemName || inv.item_name || catalogId;
            const id = inv.id ?? inv.inventoryId ?? 'N/A';
            const count = inv.count ?? qty;
            return (
              `✅ Granted **${count}x ${name}** (${type}) to <@${targetId}>.\n\n` +
              `📦 Inventory ID: **${id}**`
            );
          }
          return `✅ Granted **${qty}x ${catalogId}** (${type}) to <@${targetId}>.`;
        },
        errorTitle: '❌ Failed'
      });
    } catch (err) {
      console.error('Grant command error:', err);
      await replyFromResult(message, { success: false, error: err?.message || 'Unexpected error', reason: 'Error' }, {
        label: 'Grant',
        errorTitle: '❌ Error'
      });
    }
  }
};
