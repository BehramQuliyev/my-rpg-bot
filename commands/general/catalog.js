'use strict';

const { replyInfo, replyError } = require('../../utils/reply');
const { EmbedBuilder } = require('discord.js');
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
• \`.catalog weapon\` - View available weapons
• \`.catalog gear\` - View available armor/gear
• \`.catalog monster\` - View huntable monsters

*Note: Tier 11 Mystical items are hidden.*
        `.trim();
        return replyInfo(message, description, '📚 Catalog Help');
      }

      if (type === 'weapon') return await sendWeaponCatalogPaginated(message, context);
      if (type === 'gear') return await sendGearCatalogPaginated(message, context);
      if (type === 'monster') return await sendMonsterCatalog(message);
    } catch (err) {
      console.error('Catalog command error:', err);
      return replyError(message, err.message || 'An error occurred', 'Catalog Error');
    }
  }
};

async function sendWeaponCatalogPaginated(message, context) {
  const filtered = weapons.filter(w => w.tier !== 11);
  const byTier = {};
  filtered.forEach(w => {
    byTier[w.tier] = byTier[w.tier] || [];
    byTier[w.tier].push(w);
  });

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  const pages = [];

  // Create pages with 2 tiers per page
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

  if (pages.length === 0) return replyError(message, 'No weapons found', 'Catalog Error');
  if (pages.length === 1) return replyInfo(message, pages[0], `⚔️ Weapon Catalog (${filtered.length})`);

  // Send first page with buttons
  return sendPaginatedEmbed(message, `⚔️ Weapon Catalog (${filtered.length})`, pages, 0, context);
}

async function sendGearCatalogPaginated(message, context) {
  const filtered = gear.filter(g => g.tier !== 11);
  const byTier = {};
  filtered.forEach(g => {
    byTier[g.tier] = byTier[g.tier] || [];
    byTier[g.tier].push(g);
  });

  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  const pages = [];

  // Create pages with 2 tiers per page
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

  if (pages.length === 0) return replyError(message, 'No gear found', 'Catalog Error');
  if (pages.length === 1) return replyInfo(message, pages[0], `🛡️ Gear Catalog (${filtered.length})`);

  // Send first page with buttons
  return sendPaginatedEmbed(message, `🛡️ Gear Catalog (${filtered.length})`, pages, 0, context);
}

async function sendMonsterCatalog(message) {
  const filtered = monsters.filter(m => m.tier !== 11);
  const sorted = [...filtered].sort((a, b) => a.tier - b.tier || a.threshold - b.threshold);

  let description = `👹 **Monsters** — ${sorted.length} creatures\n\n`;
  let currentTier = null;
  sorted.forEach(m => {
    if (m.tier !== currentTier) {
      description += `**🔰 Tier ${m.tier}**\n`;
      currentTier = m.tier;
    }
    // Show name once with emoji for duplicate, threshold and reward
    description += `• **${m.name}** 👹 — ⚡ Threshold: **${m.threshold}** • 💎 Reward: **${m.gems}**\n`;
  });

  return replyInfo(message, description.trim(), `👹 Monster Catalog (${sorted.length})`);
}

async function sendPaginatedEmbed(message, title, pages, currentPage, context) {
  const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${title} (Page ${currentPage + 1}/${pages.length})`)
    .setDescription(pages[currentPage])
    .setFooter({ text: '⚔️ Powered by Funtan Bot' })
    .setTimestamp();

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