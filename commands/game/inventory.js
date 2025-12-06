'use strict';

const { replyFromResult, buildEmbed, DEFAULT_THEME } = require('../../utils/reply');

module.exports = {
  name: 'inventory',
  description: 'List your inventory (weapons & gear)',
  aliases: ['inv'],
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.getWeapons !== 'function' || typeof storage.getGear !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: 'Error'
      });
    }

    try {
      const userId = message.author.id;
      const type = args[0] ? String(args[0]).toLowerCase() : null;

      let rows = [];

      if (!type) {
        const [wRes, gRes] = await Promise.all([storage.getWeapons(userId), storage.getGear(userId)]);
        if (wRes && wRes.success) rows = rows.concat(wRes.data?.items || []);
        if (gRes && gRes.success) rows = rows.concat(gRes.data?.items || []);
        if ((wRes && wRes.success === false) || (gRes && gRes.success === false)) {
          // Let replyFromResult handle user-facing messaging for failures
          const failed = wRes && wRes.success === false ? wRes : gRes;
          return replyFromResult(message, failed, { label: 'Inventory', errorTitle: 'Error' });
        }
      } else if (type === 'weapon') {
        const wRes = await storage.getWeapons(userId);
        if (!wRes || wRes.success === false) return replyFromResult(message, wRes || { success: false, error: 'Failed to fetch weapons', reason: 'Error' }, { label: 'Inventory', errorTitle: 'Error' });
        rows = wRes.data?.items || [];
      } else if (type === 'gear') {
        const gRes = await storage.getGear(userId);
        if (!gRes || gRes.success === false) return replyFromResult(message, gRes || { success: false, error: 'Failed to fetch gear', reason: 'Error' }, { label: 'Inventory', errorTitle: 'Error' });
        rows = gRes.data?.items || [];
      } else {
        return replyFromResult(message, { success: false, error: 'Invalid type. Use `.inventory weapon` or `.inventory gear`.', reason: 'InvalidInput' }, { label: 'Inventory', errorTitle: 'Invalid Type' });
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return replyFromResult(message, { success: true, data: { items: [] }, reason: 'Empty' }, {
          label: 'Inventory',
          successTitle: 'Inventory',
          successDescription: () => 'Your inventory is empty.'
        });
      }

      // Build display lines (limit 20)
      const display = rows.slice(0, 20).map(r => {
        const id = r.id ?? r.invId ?? 'N/A';
        const name = r.itemName ?? r.item_name ?? r.catalogId ?? 'Unknown';
        const catalog = r.catalogId ?? 'N/A';
        const itemType = r.itemType ?? (r.attack ? 'weapon' : 'gear');
        const count = r.count ?? 1;
        const atk = r.attack ?? 0;
        const def = r.defense ?? r.def ?? 0;
        return `ID:${id} • **${name}** (${catalog}) • ${itemType} • x${count} • ATK:${atk} DEF:${def}`;
      });

      const desc = `${display.join('\n')}\n_Showing ${Math.min(rows.length, 20)} of ${rows.length}_`;

      const embed = buildEmbed({
        title: 'Inventory',
        description: desc,
        color: DEFAULT_THEME.COLORS.INFO,
        footer: DEFAULT_THEME.FOOTER,
        theme: DEFAULT_THEME
      });

      // Use replyFromResult pattern but send embed directly for richer output
      return await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('inventory command error:', err);
      return replyFromResult(message, { success: false, error: err?.message || 'An unexpected error occurred', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: 'Error'
      });
    }
  }
};
