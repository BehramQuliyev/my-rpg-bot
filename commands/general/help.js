// commands/general/help.js
'use strict';

const { replyInfo } = require('../../utils/reply');

module.exports = {
  name: 'help',
  description: 'List all commands and usage',
  aliases: ['commands'],
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

      const lines = [
        '**Available commands**',
        '',
        '**Game**',
        `\`${p}daily\` — Claim your daily bronze reward.`,
        `\`${p}work\` — Start a 9-hour work session.`,
        `\`${p}collect\` — Collect finished work reward.`,
        `\`${p}hunt [monsterId]\` — Hunt a monster. Omit monsterId to auto-select a suitable target.`,
        `\`${p}inventory [weapon|gear]\` — Show your inventory (omit to show both).`,
        `\`${p}equip <inventoryId> <weapon|gear>\` — Equip an item by its inventory row id.`,
        '',
        '**Currency**',
        `\`${p}balance\` — Show your bronze, silver, gold and gems balances.`,
        ''
      ];

      if (DEV_MODE) {
        lines.push(
          '**Admin (DEV_MODE only)**',
          `\`${p}grant @user <catalogId> <weapon|gear> [qty]\` — Grant an item to a player.`,
          `\`${p}adjust @user <bronze|silver|gold|gems> <amount>\` — Adjust a player's currency.`,
          `\`${p}listadmins\` — Manage server-specific admins (subcommands: list | add | remove).`,
          `\`${p}listadminshelp\` — Explain server admin roles and how listadmins works.`,
          ''
        );
      }

      lines.push(
        '**General**',
        `\`${p}help\` — Show this help message.`,
        '',
        '**Notes**',
        '- Use `@mention` when specifying users (e.g., `@Alice`).',
        ...(DEV_MODE
          ? ['- Admin commands require you to be the server owner, listed in `ADMIN_IDS`, or added via `.listadmins add`.']
          : []),
        '- Inventory `ID` values are the DB row ids shown by the inventory command; use those with `.equip`.',
        '',
        `**Configured global admins**: ${adminIdsDisplay}`,
        '',
        'If you want a shorter list, or help for a specific command, say which command and I will show usage examples.'
      );

      const text = lines.join('\n');
      const CHUNK_SIZE = 1900;

      // Send first chunk as an embed for readability, subsequent chunks as plain messages
      let first = true;
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const part = text.slice(i, i + CHUNK_SIZE);
        if (first) {
          await replyInfo(message, part, '📜 Help');
          first = false;
        } else {
          await message.channel.send(part);
        }
      }
    } catch (err) {
      console.error('help command error:', err);
      try {
        await message.reply('❌ Failed to show help. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
