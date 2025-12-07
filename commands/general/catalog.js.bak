'use strict';

const { replyFromResult, buildEmbed, DEFAULT_THEME } = require('../../utils/reply');
const { weapons, gear, monsters } = require('../../utils/storage');

module.exports = {
  name: 'catalog',
  description: 'Show item/monster catalogs (.catalog weapon|gear|monster)',
  aliases: ['catalogs'],
  async execute(message, args = [], context = {}) {
    try {
      const sub = (args[0] || '').toLowerCase();
      const map = {
        weapon: 'weapon', weapons: 'weapon',
        gear: 'gear', gears: 'gear',
        monster: 'monster', monsters: 'monster'
      };
      const type = map[sub];

      if (!type) {
        const description = `
**Usage:** \`.catalog <type>\`

Available catalog types:
• \`.catalog weapon\` — View available weapons
• \`.catalog gear\` — View available armor/gear
• \`.catalog monster\` — View huntable monsters

Note: Tier 11 Mystical items are hidden for compact display.
        `.trim();

        return replyFromResult(message, { success: true, data: {} }, {
          label: 'Catalog Help',
          successTitle: '📚 Catalog Help',
          successDescription: () => description
        });
      }

      if (type === 'weapon') return await sendWeaponCatalogPaginated(message, context);
      if (type === 'gear') return await sendGearCatalogPaginated(message, context);
      if (type === 'monster') return await sendMonsterCatalog(message);
    } catch (err) {
      console.error('Catalog command error:', err);
      return replyFromResult(message, { success: false, error: err?.message || 'An error occurred' }, {
        label: 'Catalog',
        errorTitle: 'Catalog Error'
      });
    }
  }
};

async function sendWeaponCatalogPaginated(message, context) {
  const filtered = (Array.isArray(weapons) ? weapons : []).filter(w => w.tier !== 11);
  const byTier = {};
  filtered.forEach(w => {
    byTier[w.tier] = byTier[w.tier] || [];
    byTier[w.tier].push(w);
  });

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  const pages = [];

  for (let i = 0; i < tiers.length; i += 2) {
    const pageTiers = tiers.slice(i, i + 2);
    let description = `⚔️ **Weapons** — ${filtered.length} items\n\n`;
    for (const tier of pageTiers) {
      description += `**🔰 Tier ${tier}**\n`;
      byTier[tier].forEach(w => {
        description += `• **${w.name}** ⚔️ — _${w.rarity}_ • ATK: **${w.attack}**\n`;
      });
      description += '\n';
    }
    pages.push(description.trim());
  }

  if (pages.length === 0) {
    return replyFromResult(message, { success: false, error: 'No weapons found' }, {
      label: 'Weapon Catalog',
      errorTitle: 'Catalog Error'
    });
  }

  if (pages.length === 1) {
    return replyFromResult(message, { success: true, data: {} }, {
      label: 'Weapon Catalog',
      successTitle: `⚔️ Weapon Catalog (${filtered.length})`,
      successDescription: () => pages[0]
    });
  }

  return sendPaginatedEmbed(message, `⚔️ Weapon Catalog (${filtered.length})`, pages, 0);
}

async function sendGearCatalogPaginated(message, context) {
  const filtered = (Array.isArray(gear) ? gear : []).filter(g => g.tier !== 11);
  const byTier = {};
  filtered.forEach(g => {
    byTier[g.tier] = byTier[g.tier] || [];
    byTier[g.tier].push(g);
  });

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  const pages = [];

  for (let i = 0; i < tiers.length; i += 2) {
    const pageTiers = tiers.slice(i, i + 2);
    let description = `🛡️ **Gear** — ${filtered.length} items\n\n`;
    for (const tier of pageTiers) {
      description += `**🔰 Tier ${tier}**\n`;
      byTier[tier].forEach(g => {
        description += `• **${g.name}** 🛡️ — _${g.rarity}_ • DEF: **${g.defense}**\n`;
      });
      description += '\n';
    }
    pages.push(description.trim());
  }

  if (pages.length === 0) {
    return replyFromResult(message, { success: false, error: 'No gear found' }, {
      label: 'Gear Catalog',
      errorTitle: 'Catalog Error'
    });
  }

  if (pages.length === 1) {
    return replyFromResult(message, { success: true, data: {} }, {
      label: 'Gear Catalog',
      successTitle: `🛡️ Gear Catalog (${filtered.length})`,
      successDescription: () => pages[0]
    });
  }

  return sendPaginatedEmbed(message, `🛡️ Gear Catalog (${filtered.length})`, pages, 0);
}

async function sendMonsterCatalog(message) {
  const filtered = (Array.isArray(monsters) ? monsters : []).filter(m => m.tier !== 11);
  const sorted = [...filtered].sort((a, b) => a.tier - b.tier || a.threshold - b.threshold);

  let description = `👹 **Monsters** — ${sorted.length} creatures\n\n`;
  let currentTier = null;
  sorted.forEach(m => {
    if (m.tier !== currentTier) {
      description += `**🔰 Tier ${m.tier}**\n`;
      currentTier = m.tier;
    }
    description += `• **${m.name}** 👹 — ⚡ Threshold: **${m.threshold}** • 💎 Reward: **${m.gems}**\n`;
  });

  return replyFromResult(message, { success: true, data: {} }, {
    label: 'Monster Catalog',
    successTitle: `👹 Monster Catalog (${sorted.length})`,
    successDescription: () => description.trim()
  });
}

async function sendPaginatedEmbed(message, title, pages, currentPage) {
  const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

  const embed = buildEmbed({
    title: `${title} (Page ${currentPage + 1}/${pages.length})`,
    description: pages[currentPage],
    color: DEFAULT_THEME.COLORS.INFO,
    footer: DEFAULT_THEME.FOOTER,
    theme: DEFAULT_THEME
  });

  const row = new ActionRowBuilder();

  if (currentPage > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`catalog_prev_${currentPage - 1}`)
        .setLabel('← Previous')
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (currentPage < pages.length - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`catalog_next_${currentPage + 1}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Primary)
    );
  }

  try {
    await message.reply({
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    console.error('Failed to send paginated embed:', err);
  }
}
