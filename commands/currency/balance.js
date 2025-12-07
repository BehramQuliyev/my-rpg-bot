'use strict';

const { replyFromResult, buildEmbed, DEFAULT_THEME } = require('../../utils/reply');

module.exports = {
  name: 'inventory',
  description: 'List your inventory (weapons & gear)',
  aliases: ['inv'],
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.getWeapons !== 'function' || typeof storage.getGear !== 'function' || typeof storage.getEquipped !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: 'Error'
      });
    }

    try {
      const userId = message.author.id;
      const type = args[0] ? String(args[0]).toLowerCase() : null;

      // Helper to format an item line and mark equipped
      const formatItemLine = (r, equippedId) => {
        const id = r.id ?? r.invId ?? 'N/A';
        const name = r.itemName ?? r.item_name ?? r.catalogId ?? 'Unknown';
        const catalog = r.catalogId ?? 'N/A';
        const atk = r.attack ?? 0;
        const def = r.defense ?? r.def ?? 0;
        const isEquipped = equippedId != null && String(equippedId) === String(id);
        const badge = isEquipped ? '✅ Equipped' : '';
        const stats = r.attack != null ? `ATK:${atk}` : `DEF:${def}`;
        return `ID:${id} • **${name}** (${catalog}) • ${stats} ${badge}`.trim();
      };

      // If a specific type is requested, show paginated list for that type
      if (type === 'weapon' || type === 'gear') {
        const res = type === 'weapon' ? await storage.getWeapons(userId) : await storage.getGear(userId);
        if (!res || res.success === false) {
          return replyFromResult(message, res || { success: false, error: `Failed to fetch ${type}`, reason: 'Error' }, {
            label: 'Inventory',
            errorTitle: 'Error'
          });
        }

        const rows = res.data?.items || [];
        if (!Array.isArray(rows) || rows.length === 0) {
          return replyFromResult(message, { success: true, data: { items: [] } }, {
            label: 'Inventory',
            successTitle: 'Inventory',
            successDescription: () => `No ${type} found in your inventory.`
          });
        }

        // Get equipped to mark items
        const eqRes = await storage.getEquipped(userId);
        const equippedId = eqRes && eqRes.success && eqRes.data ? type === 'weapon' ? eqRes.data.weapon?.id : eqRes.data.gear?.id : null;

        // Sort so equipped items appear first
        const sorted = [...rows].sort((a, b) => {
          const aId = String(a.id ?? a.invId ?? '');
          const bId = String(b.id ?? b.invId ?? '');
          if (String(equippedId) === aId) return -1;
          if (String(equippedId) === bId) return 1;
          return 0;
        });

        return sendPaginatedList(message, sorted, {
          titleBase: type === 'weapon' ? 'Weapons' : 'Gear',
          pageSize: 10,
          formatLine: (r) => formatItemLine(r, equippedId),
          footerHint: 'Quick actions: .equip <id> weapon | .equip <id> gear'
        });
      }

      // No type specified: fetch weapons, gear, and equipped in parallel
      const [wRes, gRes, eqRes] = await Promise.all([
      storage.getWeapons(userId),
      storage.getGear(userId),
      storage.getEquipped(userId)]
      );

      if (wRes && wRes.success === false || gRes && gRes.success === false || eqRes && eqRes.success === false) {
        const failed = wRes && wRes.success === false ? wRes : gRes && gRes.success === false ? gRes : eqRes;
        return replyFromResult(message, failed || { success: false, error: 'Failed to fetch inventory', reason: 'Error' }, {
          label: 'Inventory',
          errorTitle: 'Error'
        });
      }

      const weapons = wRes?.data?.items || [];
      const gear = gRes?.data?.items || [];
      const equipped = eqRes?.data || {}; // expected shape: { weapon, gear, power, ... }

      // Mark equipped ids
      const equippedWeaponId = equipped.weapon?.id ?? null;
      const equippedGearId = equipped.gear?.id ?? null;

      // Move equipped items to top of lists
      const sortWithEquippedFirst = (arr, eqId) => {
        return [...arr].sort((a, b) => {
          const aId = String(a.id ?? a.invId ?? '');
          const bId = String(b.id ?? b.invId ?? '');
          if (String(eqId) === aId) return -1;
          if (String(eqId) === bId) return 1;
          return 0;
        });
      };

      const weaponsSorted = sortWithEquippedFirst(weapons, equippedWeaponId);
      const gearSorted = sortWithEquippedFirst(gear, equippedGearId);

      // Build compact lists (first page only) and include "view all" hint via buttons
      const weaponsList = weaponsSorted.slice(0, 20).map((r) => formatItemLine(r, equippedWeaponId)).join('\n') || '_No weapons_';
      const gearList = gearSorted.slice(0, 20).map((r) => formatItemLine(r, equippedGearId)).join('\n') || '_No gear_';

      const embed = buildEmbed({
        title: 'Inventory',
        description: `Equipped items are highlighted with ✅. Showing up to 20 items per category.\n_Total items: Weapons ${weapons.length} • Gear ${gear.length}_`,
        color: DEFAULT_THEME.COLORS.INFO,
        footer: DEFAULT_THEME.FOOTER,
        theme: DEFAULT_THEME
      });

      // Equipped field visually separated at top
      const equippedWeaponText = equipped.weapon ? `✅ **${equipped.weapon.itemName || equipped.weapon.name || 'Unknown'}** (ID:${equipped.weapon.id ?? 'N/A'})` : 'None';
      const equippedGearText = equipped.gear ? `✅ **${equipped.gear.itemName || equipped.gear.name || 'Unknown'}** (ID:${equipped.gear.id ?? 'N/A'})` : 'None';

      embed.addFields(
        { name: 'Equipped', value: `**Weapon:** ${equippedWeaponText}\n**Gear:** ${equippedGearText}`, inline: false },
        { name: `Weapons (${weapons.length})`, value: weaponsList, inline: false },
        { name: `Gear (${gear.length})`, value: gearList, inline: false }
      );

      // Footer hint for quick actions
      const footerHint = 'Quick actions: .equip <id> weapon | .equip <id> gear';
      embed.setFooter({ text: `${DEFAULT_THEME.FOOTER} • ${footerHint}` });

      // If either category is large, add buttons to open paginated view for that category
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const row = new ActionRowBuilder();
      if (weapons.length > 20) {
        row.addComponents(
          new ButtonBuilder().
          setCustomId('inv_view_weapons_0').
          setLabel('View all Weapons').
          setStyle(ButtonStyle.Primary)
        );
      }
      if (gear.length > 20) {
        row.addComponents(
          new ButtonBuilder().
          setCustomId('inv_view_gear_0').
          setLabel('View all Gear').
          setStyle(ButtonStyle.Primary)
        );
      }

      const sent = await message.reply({
        embeds: [embed],
        components: row.components.length ? [row] : []
      });

      // If no buttons, nothing to paginate
      if (!row.components.length) return sent;

      // Collector to handle local pagination buttons for 2 minutes
      const filter = (i) => i.user.id === message.author.id && (i.customId.startsWith('inv_view_weapons_') || i.customId.startsWith('inv_view_gear_'));
      const collector = sent.createMessageComponentCollector({ filter, time: 120000 });

      collector.on('collect', async (interaction) => {
        try {
          await interaction.deferUpdate();
          const [prefix,, pageStr] = interaction.customId.split('_'); // e.g., inv_view_weapons_0
          const isWeapons = interaction.customId.includes('weapons');
          const page = parseInt(pageStr, 10) || 0;
          const list = isWeapons ? weaponsSorted : gearSorted;
          const eqId = isWeapons ? equippedWeaponId : equippedGearId;
          await updatePaginatedMessage(interaction.message, list, {
            titleBase: isWeapons ? 'Weapons' : 'Gear',
            pageSize: 10,
            page,
            formatLine: (r) => formatItemLine(r, eqId),
            footerHint
          });
        } catch (err) {
          console.error('inventory pagination collect error:', err);
        }
      });

      collector.on('end', () => {
        // disable buttons after collector ends
        try {
          const disabledRow = new ActionRowBuilder();
          row.components.forEach((c) => {
            const btn = ButtonBuilder.from(c).setDisabled(true);
            disabledRow.addComponents(btn);
          });
          sent.edit({ components: [disabledRow] }).catch(() => {});
        } catch (e) {

          // ignore
        }});

      return sent;
    } catch (err) {
      console.error('inventory command error:', err);
      return replyFromResult(message, { success: false, error: err?.message || 'An unexpected error occurred', reason: 'Error' }, {
        label: 'Inventory',
        errorTitle: 'Error'
      });
    }
  }
};

/* ======================
   Pagination helpers
   ====================== */

async function sendPaginatedList(message, items, { titleBase = 'Items', pageSize = 10, formatLine = (r) => String(r), footerHint = '' } = {}) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  return sendPage(message, items, 0, { titleBase, pageSize, formatLine, footerHint, totalPages });
}

async function sendPage(message, items, page, { titleBase, pageSize, formatLine, footerHint, totalPages }) {
  const start = page * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const description = pageItems.length ? pageItems.map(formatLine).join('\n') : '_No items_';

  const embed = buildEmbed({
    title: `${titleBase} (Page ${page + 1}/${totalPages})`,
    description,
    color: DEFAULT_THEME.COLORS.INFO,
    footer: `${DEFAULT_THEME.FOOTER} • ${footerHint}`,
    theme: DEFAULT_THEME
  });

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  if (page > 0) {
    row.addComponents(
      new ButtonBuilder().
      setCustomId(`inv_${titleBase.toLowerCase()}_prev_${page - 1}`).
      setLabel('← Previous').
      setStyle(ButtonStyle.Primary)
    );
  }
  if (page < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder().
      setCustomId(`inv_${titleBase.toLowerCase()}_next_${page + 1}`).
      setLabel('Next →').
      setStyle(ButtonStyle.Primary)
    );
  }

  const sent = await message.reply({
    embeds: [embed],
    components: row.components.length ? [row] : []
  });

  if (!row.components.length) return sent;

  // Collector for this paginated message
  const filter = (i) => i.user.id === message.author.id && i.customId.startsWith(`inv_${titleBase.toLowerCase()}`);
  const collector = sent.createMessageComponentCollector({ filter, time: 120000 });

  collector.on('collect', async (interaction) => {
    try {
      await interaction.deferUpdate();
      const parts = interaction.customId.split('_'); // inv_<title>_prev|next_<page>
      const newPage = parseInt(parts[parts.length - 1], 10) || 0;
      // update the same message (edit) with new page content
      await updatePaginatedMessage(sent, items, {
        titleBase,
        pageSize,
        page: newPage,
        formatLine,
        footerHint,
        totalPages
      });
    } catch (err) {
      console.error('pagination collect error:', err);
    }
  });

  collector.on('end', () => {
    try {
      const disabledRow = new ActionRowBuilder();
      row.components.forEach((c) => {
        const btn = ButtonBuilder.from(c).setDisabled(true);
        disabledRow.addComponents(btn);
      });
      sent.edit({ components: [disabledRow] }).catch(() => {});
    } catch (e) {

      // ignore
    }});

  return sent;
}

async function updatePaginatedMessage(messageToEdit, items, { titleBase = 'Items', pageSize = 10, page = 0, formatLine = (r) => String(r), footerHint = '', totalPages = null } = {}) {
  const tp = totalPages ?? Math.max(1, Math.ceil(items.length / pageSize));
  const start = page * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const description = pageItems.length ? pageItems.map(formatLine).join('\n') : '_No items_';

  const embed = buildEmbed({
    title: `${titleBase} (Page ${page + 1}/${tp})`,
    description,
    color: DEFAULT_THEME.COLORS.INFO,
    footer: `${DEFAULT_THEME.FOOTER} • ${footerHint}`,
    theme: DEFAULT_THEME
  });

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder();

  if (page > 0) {
    row.addComponents(
      new ButtonBuilder().
      setCustomId(`inv_${titleBase.toLowerCase()}_prev_${page - 1}`).
      setLabel('← Previous').
      setStyle(ButtonStyle.Primary)
    );
  }
  if (page < tp - 1) {
    row.addComponents(
      new ButtonBuilder().
      setCustomId(`inv_${titleBase.toLowerCase()}_next_${page + 1}`).
      setLabel('Next →').
      setStyle(ButtonStyle.Primary)
    );
  }

  try {
    await messageToEdit.edit({
      embeds: [embed],
      components: row.components.length ? [row] : []
    });
  } catch (err) {
    // If edit fails (message may be ephemeral or missing permissions), try replying instead
    try {
      await messageToEdit.reply({ embeds: [embed], components: row.components.length ? [row] : [] });
    } catch (e) {
      console.error('Failed to update paginated message:', err, e);
    }
  }
}