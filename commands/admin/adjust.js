// commands/admin/adjust.js
'use strict';

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
      const ADMIN_IDS = Array.isArray(config && config.ADMIN_IDS) && config.ADMIN_IDS.length
        ? config.ADMIN_IDS
        : (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

      const callerId = message.author.id;

      function isAdmin(callerIdLocal) {
        if (ADMIN_IDS.includes(callerIdLocal)) return true;
        if (message.guild && message.guild.ownerId === callerIdLocal) return true;
        return false;
      }

      if (!isAdmin(callerId)) {
        return message.reply('❌ You are not authorized to use this command.');
      }

      const targetMention = args[0];
      const currency = args[1] ? String(args[1]).toLowerCase() : null;
      const amount = args[2] ? parseInt(args[2], 10) : NaN;

      if (!targetMention || !currency || Number.isNaN(amount)) {
        return message.reply('Usage: `.adjust @user <bronze|silver|gold|gems> <amount>`');
      }

      const match = targetMention.match(/^<@!?(\d+)>$/);
      if (!match) return message.reply('Please mention the target user (e.g. @User).');
      const targetId = match[1];

      if (!storage || typeof storage.adminAdjustCurrency !== 'function') {
        console.error('storage.adminAdjustCurrency is not available in command context');
        return message.reply('❌ Bot storage is not available. Try again later.');
      }

      const res = await storage.adminAdjustCurrency(targetId, { [currency]: amount });

      if (!res || res.success === false) {
        console.error('adminAdjustCurrency failed:', res && res.error ? res.error : res);
        return message.reply(`❌ Adjust failed: ${res && res.error ? res.error : 'unknown error'}`);
      }

      const balance = res.balance || {};
      const bronze = balance.bronze ?? 'N/A';
      const silver = balance.silver ?? 'N/A';
      const gold = balance.gold ?? 'N/A';
      const gems = balance.gems ?? 'N/A';

      return message.reply(
        `✅ Adjusted **${currency}** by **${amount}** for <@${targetId}>.\nNew balances — Bronze: **${bronze}**, Silver: **${silver}**, Gold: **${gold}**, Gems: **${gems}**.`
      );
    } catch (err) {
      console.error('Adjust command error:', err);
      try {
        await message.reply(`❌ Adjust failed: ${err && err.message ? err.message : 'unexpected error'}`);
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
