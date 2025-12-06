// commands/admin/grant.js
'use strict';

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
      const catalogId = args[1] ? String(args[1]).trim() : null;
      const type = args[2] ? String(args[2]).toLowerCase() : null;
      const qty = args[3] ? parseInt(args[3], 10) : 1;

      if (!targetMention || !catalogId || !type) {
        return message.reply('Usage: `.grant @user <catalogId> <weapon|gear> [qty]`');
      }

      if (!['weapon', 'gear'].includes(type)) {
        return message.reply('Item type must be "weapon" or "gear".');
      }

      if (Number.isNaN(qty) || qty <= 0) {
        return message.reply('Quantity must be a positive integer.');
      }

      const match = targetMention.match(/^<@!?(\d+)>$/);
      if (!match) return message.reply('Please mention the target user (e.g. @User).');
      const targetId = match[1];

      if (!storage || typeof storage.adminGrantItem !== 'function') {
        console.error('storage.adminGrantItem is not available in command context');
        return message.reply('❌ Bot storage is not available. Try again later.');
      }

      const res = await storage.adminGrantItem(targetId, catalogId, type, qty);

      if (!res || res.success === false) {
        console.error('adminGrantItem failed:', res && res.error ? res.error : res);
        return message.reply(`❌ Grant failed: ${res && res.error ? res.error : 'unknown error'}`);
      }

      // If inventory info returned, show item name/count; otherwise show generic success
      const inv = res.inventory || res.rec || null;
      if (inv) {
        const name = inv.itemName || inv.item_name || catalogId;
        const id = inv.id ?? inv.inventoryId ?? 'N/A';
        const count = inv.count ?? qty;
        return message.reply(`✅ Granted ${count}x **${name}** (${type}) to <@${targetId}>. Inventory ID: ${id}.`);
      }

      return message.reply(`✅ Granted ${qty}x ${catalogId} (${type}) to <@${targetId}>.`);
    } catch (err) {
      console.error('Grant command error:', err);
      try {
        await message.reply(`❌ Grant failed: ${err && err.message ? err.message : 'unexpected error'}`);
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
