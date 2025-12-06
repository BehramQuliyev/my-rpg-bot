// commands/game/inventory.js
'use strict';

const { replyInfo, replyError } = require('../../utils/reply');

module.exports = {
  name: 'inventory',
  description: 'List your inventory (weapons & gear)',
  aliases: ['inv'],
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.getWeapons !== 'function' || typeof storage.getGear !== 'function') {
      console.error('storage inventory helpers are not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const type = args[0] ? String(args[0]).toLowerCase() : null;

      let rows = [];
      if (!type) {
        const wRes = await storage.getWeapons(userId);
        const gRes = await storage.getGear(userId);
        if (wRes && wRes.success) rows = rows.concat(wRes.items || []);
        if (gRes && gRes.success) rows = rows.concat(gRes.items || []);
        if ((wRes && wRes.success === false) || (gRes && gRes.success === false)) {
          console.error('One or more inventory fetches failed:', { weapons: wRes, gear: gRes });
        }
      } else if (type === 'weapon') {
        const wRes = await storage.getWeapons(userId);
        if (!wRes || wRes.success === false) {
          console.error('getWeapons failed:', wRes && wRes.error ? wRes.error : wRes);
          return await replyError(message, 'Could not fetch weapons right now. Please try again later.', 'Error');
        }
        rows = wRes.items || [];
      } else if (type === 'gear') {
        const gRes = await storage.getGear(userId);
        if (!gRes || gRes.success === false) {
          console.error('getGear failed:', gRes && gRes.error ? gRes.error : gRes);
          return await replyError(message, 'Could not fetch gear right now. Please try again later.', 'Error');
        }
        rows = gRes.items || [];
      } else {
        return await replyError(message, 'Invalid type. Use `.inventory weapon` or `.inventory gear`.', 'Invalid Type');
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return await replyInfo(message, 'Your inventory is empty.', 'Inventory');
      }

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

      const desc = `${display.join('\n')}\n_Showing ${Math.min(rows.length, 20)} of ${rows.length}_`;
      return await replyInfo(message, desc, 'Inventory');
    } catch (err) {
      console.error('inventory command error:', err);
      return await replyError(message, 'An unexpected error occurred while fetching your inventory. Please try again later.', 'Error');
    }
  }
};