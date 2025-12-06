// commands/admin/list-admins-help.js
'use strict';

/**
 * Help text explaining server admin roles and how to use listadmins commands.
 * Updated to accept the standard command context: (message, args, context)
 * where context: { client, DEV_MODE, storage, config }
 */

module.exports = {
  name: 'listadminshelp',
  description: 'Explain server admin roles and how to use listadmins commands',
  aliases: ['adminhelp', 'adminshelp'],
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const config = context.config || {};
      const adminIds = Array.isArray(config.ADMIN_IDS) && config.ADMIN_IDS.length
        ? config.ADMIN_IDS.join(', ')
        : (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).join(', ') || 'None configured';

      const lines = [
        '**Server Admins — Roles & Permissions**',
        '',
        '**Who can manage server admins**',
        `- **Server owner**: always allowed to add/remove server admins for their server.`,
        `- **Global admins**: users listed in the ADMIN_IDS (configured: ${adminIds}) can manage admins across servers.`,
        `- **Server admins**: users previously added via \`.listadmins add\` (role stored in DB) can manage admins if granted that ability.`,
        '',
        '**Roles**',
        '- `admin` — full management rights for game commands and admin actions on this server (granting items, adjusting currency, etc.).',
        '- `mod` — limited rights (future use). Currently treated the same as `admin` unless you add custom checks.',
        '- `owner` — reserved for the server owner; used for clarity only.',
        '',
        '**Commands (usage examples)**',
        '- `.listadmins` or `.listadmins list` — show configured server admins.',
        '- `.listadmins add @user [role]` — add a server admin. Example: `.listadmins add @Alice admin`.',
        '- `.listadmins remove @user` — remove a server admin. Example: `.listadmins remove @Alice`.',
        '',
        '**Notes & best practices**',
        '- Only use `add`/`remove` in the server where you want to manage admins (command requires a guild).',
        '- Global admins (ADMIN_IDS) and the server owner bypass the DB check and can always manage admins.',
        '- If you want different permission levels for commands, we can extend checks to require specific roles (e.g., only `admin` can grant items, `mod` can only view lists).',
        '',
        'If you want role-specific enforcement (for example, `mod` cannot grant items), tell me which commands should be restricted and I will update the checks.'
      ];

      const text = lines.join('\n');
      const CHUNK_SIZE = 1900;

      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const part = text.slice(i, i + CHUNK_SIZE);
        if (i === 0) {
          await message.reply(part);
        } else {
          await message.channel.send(part);
        }
      }
    } catch (err) {
      console.error('list-admins-help command error:', err);
      try {
        await message.reply('❌ Failed to show admin help. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
