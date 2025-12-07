'use strict';

const { replyFromResult, buildEmbed, DEFAULT_THEME } = require('../../utils/reply');

module.exports = {
  name: 'inventory',
  description: 'List your inventory (weapons & gear)',
  aliases: ['inv'],
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.getWeapons !== 'function' || typeof storage.getGear !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: '❌ Error'
      });
      return;
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
          const failed = wRes && wRes.success === false ? wRes : gRes;
          await replyFromResult(message, failed, { label: 'Inventory', errorTitle: '❌ Error' });
          return;
        }
      } else if (type === 'weapon') {
        const wRes = await storage.getWeapons(userId);
        if (!wRes || wRes.success === false) {
          await replyFromResult(message, wRes || { success: false, error: 'Failed to fetch weapons', reason: 'Error' }, { label: 'Inventory', errorTitle: '❌ Error' });
          return;
        }
        rows = wRes.data?.items || [];
      } else if (type === 'gear') {
        const gRes = await storage.getGear(userId);
        if (!gRes || gRes.success === false) {
          await replyFromResult(message, gRes || { success: false, error: 'Failed to fetch gear', reason: 'Error' }, { label: 'Inventory', errorTitle: '❌ Error' });
          return;
        }
        rows = gRes.data?.items || [];
      } else {
        await replyFromResult(message, { success: false, error: 'Invalid type. Use `.inventory weapon` or `.inventory gear`.', reason: 'InvalidInput' }, { label: 'Inventory', errorTitle: '⚠️ Invalid Type' });
        return;
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        await replyFromResult(message, { success: true, data: { items: [] }, reason: 'Empty' }, {
          label: 'Inventory',
          successTitle: '📦 Inventory',
          successDescription: () => 'Your inventory is empty.'
        });
        return;
      }

      // Build display lines (limit 20)
      const display = rows.slice(0, 20).map((r) => {
        const id = r.id ?? r.invId ?? 'N/A';
        const name = r.itemName ?? r.item_name ?? r.catalogId ?? 'Unknown';
        const catalog = r.catalogId ?? 'N/A';
        const itemType = r.itemType ?? (r.attack ? '⚔️ Weapon' : '🛡️ Gear');
        const count = r.count ?? 1;
        const atk = r.attack ?? 0;
        const def = r.defense ?? r.def ?? 0;
        return `🔹 ID:${id} • **${name}** (${catalog}) • ${itemType} • x${count} • ⚔️ ATK:${atk} 🛡️ DEF:${def}`;
      });

      const desc = `${display.join('\n')}\n_Showing ${Math.min(rows.length, 20)} of ${rows.length}_`;

      const embed = buildEmbed({
        title: '📦 Inventory',
        description: desc,
        color: DEFAULT_THEME.COLORS.INFO,
        footer: `${DEFAULT_THEME.FOOTER} • Quick actions: .equip <id> weapon | .equip <id> gear`,
        theme: DEFAULT_THEME
      });

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('inventory command error:', err);
      await replyFromResult(message, { success: false, error: err?.message || 'An unexpected error occurred', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: '❌ Error'
      });
    }
  }
};
