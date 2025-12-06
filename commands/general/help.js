// commands/general/help.js
'use strict';

const { replyInfo, replyError } = require('../../utils/reply');

module.exports = {
  name: 'help',
  description: 'List commands and usage',
  aliases: ['commands', 'h'],
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const cfg = context.config || {};
      const PREFIX = cfg.PREFIX || process.env.PREFIX || '.';
      const DEV_MODE = typeof cfg.DEV_MODE === 'boolean' ? cfg.DEV_MODE : (process.env.DEV_MODE === 'true');

      const p = PREFIX;

      const adminIdsDisplay = Array.isArray(cfg.ADMIN_IDS) && cfg.ADMIN_IDS.length
        ? cfg.ADMIN_IDS.join(', ')
        : (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).join(', ') || 'None configured';

      // Build help sections with emojis and short descriptions
      const lines = [];

      lines.push('**🕹️ Game Commands**');
      lines.push('');
      lines.push(`\`${p}daily\` — Claim your daily bronze reward (24h cooldown).`);
      lines.push(`\`${p}work\` — Start a ${Math.floor(9)}-hour work session (9h).`);
      lines.push(`\`${p}collect\` — Collect finished work rewards (includes streak bonus).`);
      lines.push(`\`${p}hunt [monsterId]\` — Hunt a monster. Omit monsterId to auto-select a suitable target.`);
      lines.push(`\`${p}inventory [weapon|gear]\` — Show your inventory (omit to show both).`);
      lines.push(`\`${p}equip <inventoryId> <weapon|gear>\` — Equip an item by its inventory row id.`);
      lines.push('');
      lines.push('**💰 Currency & Account**');
      lines.push('');
      lines.push(`\`${p}balance\` — Show your bronze, silver, gold and gems balances.`);
      lines.push('');
      lines.push('**📚 Catalogs / Reference**');
      lines.push('');
      lines.push(`\`${p}catalog weapon\` — View available weapons (hidden: Mystical tier).`);
      lines.push(`\`${p}catalog gear\` — View available gear (hidden: Mystical tier).`);
      lines.push(`\`${p}catalog monster\` — View huntable monsters and rewards.`);
      lines.push('');
      lines.push('**🛠️ Admin (server owner or added admins)**');
      if (DEV_MODE) {
        lines.push('');
        lines.push(`(DEV_MODE enabled) Admin commands are available here:`);
        lines.push(`\`${p}grant @user <catalogId> <weapon|gear> [qty]\` — Grant an item to a player.`);
        lines.push(`\`${p}adjust @user <bronze|silver|gold|gems> <amount>\` — Adjust a player's currency.`);
        lines.push(`\`${p}listadmins <list|add|remove>\` — Manage server-specific admins.`);
        lines.push(`\`${p}listadminshelp\` — Explain server admin roles and usage.`);
      } else {
        lines.push('');
        lines.push(`Admin commands are available to server owners and configured server admins.`);
      }

      lines.push('');
      lines.push('**📖 Usage Tips**');
      lines.push('');
      lines.push('- Use `@mention` when specifying users (e.g., `@Alice`).');
      lines.push('- Inventory `ID` values are DB row ids shown by `inventory` — use those with `equip`.');
      lines.push('- For `hunt`, equip 1 weapon and 1 gear to raise your power before attempting tougher monsters.');
      lines.push('');
      lines.push(`**Configured global admins**: ${adminIdsDisplay}`);
      lines.push('');
      lines.push('If you want help for a specific command, run:');
      lines.push(`\`${p}help <command>\` — e.g. \`${p}help hunt\``);

      // If user asked for a specific command, show detailed usage
      const requested = (args[0] || '').toLowerCase();
      if (requested) {
        const detail = getCommandDetail(requested, p, DEV_MODE);
        if (detail) {
          return sendChunkedEmbed(message, `❓ Help: ${requested}`, detail);
        }
      }

      const text = lines.join('\n');
      // Send as multiple embed pages when needed
      return sendChunkedEmbed(message, '📜 Help', text);
    } catch (err) {
      console.error('help command error:', err);
      return replyError(message, 'Failed to show help. Please try again later.', 'Help Error');
    }
  }
};

/**
 * Detailed per-command help text (short).
 * Add or adjust entries here as new commands are added.
 */
function getCommandDetail(cmd, prefix, devMode) {
  const p = prefix;
  const map = {
    daily: `\`${p}daily\` — Claim daily bronze. 24h cooldown. Reward: base bronze + streak bonus.`,
    work: `\`${p}work\` — Start a work session (9 hours). Use \`${p}collect\` after it finishes to receive silver + streak bonus.`,
    collect: `\`${p}collect\` — Collect a finished work session. If you try early you'll see remaining time.`,
    hunt: `\`${p}hunt [monsterId]\` — Hunt a monster. Omit monsterId to auto-select a target based on your equipped power. Requires 1 weapon and 1 gear equipped. Rewards gems and increases kill count for the monster's tier.`,
    inventory: `\`${p}inventory [weapon|gear]\` — List your inventory rows (shows DB row ID, item name, qty, atk/def).`,
    equip: `\`${p}equip <inventoryId> <weapon|gear>\` — Equip an item by its inventory DB id.`,
    balance: `\`${p}balance\` — Show your current bronze, silver, gold and gems.`,
    catalog: `\`${p}catalog <weapon|gear|monster>\` — View available items and monsters. Mystical (tier 11) items are hidden.`,
    help: `\`${p}help [command]\` — Show general help or details for a specific command.`
  };

  // admin-only details if devMode
  if (devMode) {
    map.grant = `\`${p}grant @user <catalogId> <weapon|gear> [qty]\` — Grant a catalog item to a player (DEV_MODE/admin).`;
    map.adjust = `\`${p}adjust @user <bronze|silver|gold|gems> <amount>\` — Adjust player currency (DEV_MODE/admin).`;
    map.listadmins = `\`${p}listadmins <list|add|remove>\` — Manage server-specific admins.`;
  }

  return map[cmd] || null;
}

/* ========== Chunk helpers (preserve full lines inside embeds) ========== */

const CHUNK_SIZE = 1900;

function chunkByLines(text, size = CHUNK_SIZE) {
  if (!text) return [];
  const lines = text.split('\n');
  const parts = [];
  let current = '';

  for (const rawLine of lines) {
    const line = rawLine + '\n';
    if ((current.length + line.length) <= size) {
      current += line;
      continue;
    }

    if (current.length > 0) {
      parts.push(current.trim());
      current = '';
    }

    if (line.length > size) {
      // extremely long single line fallback
      for (let i = 0; i < line.length; i += size) {
        parts.push(line.slice(i, i + size).trim());
      }
      continue;
    }

    current = line;
  }

  if (current.length > 0) parts.push(current.trim());
  return parts;
}

async function sendChunkedEmbed(message, title, fullText) {
  const parts = chunkByLines(fullText);
  if (!parts || parts.length === 0) return;
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.length > 1 ? ` (Page ${i + 1}/${parts.length})` : '';
    await replyInfo(message, parts[i], `${title}${suffix}`);
  }
}
