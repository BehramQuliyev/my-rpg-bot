'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'adjust',
  description: 'Admin: adjust player currency',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage, config } = context;

      // Resolve admin IDs from validated config first, fallback to env
      const ADMIN_IDS = Array.isArray(config && config.ADMIN_IDS) && config.ADMIN_IDS.length ?
      config.ADMIN_IDS :
      (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

      const callerId = message.author.id;

      function isAdmin(callerIdLocal) {
        if (ADMIN_IDS.includes(callerIdLocal)) return true;
        if (message.guild && message.guild.ownerId === callerIdLocal) return true;
        return false;
      }

      if (!isAdmin(callerId)) {
        return replyFromResult(message, { success: false, error: 'You are not authorized to use this command.', reason: 'Forbidden' }, {
          label: 'Adjust',
          errorTitle: 'Unauthorized'
        });
      }

      const targetMention = args[0];
      const currency = args[1] ? String(args[1]).toLowerCase() : null;
      const amount = args[2] ? parseInt(args[2], 10) : NaN;

      if (!targetMention || !currency || Number.isNaN(amount)) {
        return replyFromResult(message, { success: false, error: 'Usage: `.adjust @user <bronze|silver|gold|gems> <amount>`', reason: 'InvalidInput' }, {
          label: 'Adjust',
          errorTitle: 'Invalid Usage'
        });
      }

      const match = targetMention.match(/^<@!?(\d+)>$/);
      if (!match) {
        return replyFromResult(message, { success: false, error: 'Please mention the target user (e.g. @User).', reason: 'InvalidInput' }, {
          label: 'Adjust',
          errorTitle: 'Invalid Target'
        });
      }
      const targetId = match[1];

      if (!storage || typeof storage.adminAdjustCurrency !== 'function') {
        console.error('storage.adminAdjustCurrency is not available in command context');
        return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
          label: 'Adjust',
          errorTitle: 'Error'
        });
      }

      // Validate currency keys if config provides CURRENCIES
      if (config && config.CURRENCIES) {
        const allowed = Object.keys(config.CURRENCIES).map((k) => k.toLowerCase());
        if (!allowed.includes(currency)) {
          return replyFromResult(message, { success: false, error: `Invalid currency type. Allowed: ${allowed.join(', ')}`, reason: 'InvalidCurrencyType' }, {
            label: 'Adjust',
            errorTitle: 'Invalid Currency'
          });
        }
      }

      const res = await storage.adminAdjustCurrency(targetId, { [currency]: amount });

      // Use replyFromResult to handle errors; on success provide a custom successDescription
      await replyFromResult(message, res, {
        label: 'Adjust',
        successTitle: 'Adjusted',
        successDescription: (d) => {
          const balance = d.balance || {};
          const bronze = balance.bronze ?? 'N/A';
          const silver = balance.silver ?? 'N/A';
          const gold = balance.gold ?? 'N/A';
          const gems = balance.gems ?? 'N/A';
          return `✅ Adjusted **${currency}** by **${amount}** for <@${targetId}>.\nNew balances — Bronze: **${bronze}**, Silver: **${silver}**, Gold: **${gold}**, Gems: **${gems}**.`;
        },
        errorTitle: 'Failed'
      });
    } catch (err) {
      console.error('Adjust command error:', err);
      return replyFromResult(message, { success: false, error: err?.message || 'unexpected error', reason: 'Error' }, {
        label: 'Adjust',
        errorTitle: 'Error'
      });
    }
  }
};