// commands/game/inventory.js
'use strict';

module.exports = {
  name: 'inventory',
  description: 'List your inventory (weapons & gear)',
  aliases: ['inv'],
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage } = context;
      if (!storage || typeof storage.getWeapons !== 'function' || typeof storage.getGear !== 'function') {
        console.error('storage inventory helpers are not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      const type = args[0] ? String(args[0]).toLowerCase() : null;

      let rows = [];
      if (!type) {
        const wRes = await storage.getWeapons(userId);
        const gRes = await storage.getGear(userId);
        if (wRes && wRes.success) rows = rows.concat(wRes.items || []);
        if (gRes && gRes.success) rows = rows.concat(gRes.items || []);
        // If either call failed, log it
        if ((wRes && wRes.success === false) || (gRes && gRes.success === false)) {
          console.error('One or more inventory fetches failed:', { weapons: wRes, gear: gRes });
        }
      } else if (type === 'weapon') {
        const wRes = await storage.getWeapons(userId);
        if (!wRes || wRes.success === false) {
          console.error('getWeapons failed:', wRes && wRes.error ? wRes.error : wRes);
          return message.reply('❌ Could not fetch weapons right now. Please try again later.');
        }
        rows = wRes.items || [];
      } else if (type === 'gear') {
        const gRes = await storage.getGear(userId);
        if (!gRes || gRes.success === false) {
          console.error('getGear failed:', gRes && gRes.error ? gRes.error : gRes);
          return message.reply('❌ Could not fetch gear right now. Please try again later.');
        }
        rows = gRes.items || [];
      } else {
        return message.reply('Invalid type. Use `.inventory weapon` or `.inventory gear`.');
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return message.reply('Your inventory is empty.');
      }

      // Format output (limit to 20 items)
      const display = rows.slice(0, 20).map(r => {
        const id = r.id ?? r.invId ?? 'N/A';
        const name = r.itemName ?? r.item_name ?? r.catalogId ?? 'Unknown';
        const catalog = r.catalogId ?? 'N/A';
        const itemType = r.itemType ?? (r.attack ? 'weapon' : 'gear');
        const count = r.count ?? 1;
        const atk = r.attack ?? 0;
        const def = r.defense ?? 0;
        return `ID:${id} • ${name} (${catalog}) • ${itemType} • x${count} • atk:${atk} def:${def}`;
      });

      const reply = `**${message.author.username}'s Inventory**\n${display.join('\n')}\n_Showing ${Math.min(rows.length, 20)} of ${rows.length}_`;
      return message.reply(reply);
    } catch (err) {
      console.error('inventory command error:', err);
      try {
        await message.reply('❌ An unexpected error occurred while fetching your inventory. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
