'use strict';

const { buildEmbed, DEFAULT_THEME, replyFromResult } = require('../../utils/reply');

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

      const embed = buildEmbed({
        title: 'Server Admins — Roles & Permissions',
        description: `Configured global admins: **${adminIds}**`,
        color: DEFAULT_THEME.COLORS.INFO,
        footer: DEFAULT_THEME.FOOTER,
        theme: DEFAULT_THEME
      });

      embed.addFields(
        { name: 'Who can manage server admins', value: '- **Server owner**: always allowed to add/remove server admins for their server.\n- **Global admins**: users listed in ADMIN_IDS can manage admins across servers.\n- **Server admins**: users added via `.listadmins add` (stored in DB) can manage admins if granted that ability.', inline: false },
        { name: 'Roles', value: '- `admin` — full management rights for game commands and admin actions on this server.\n- `mod` — limited rights (future use).\n- `owner` — reserved for the server owner.', inline: false },
        { name: 'Commands (usage examples)', value: '- `.listadmins` or `.listadmins list` — show configured server admins.\n- `.listadmins add @user [role]` — add a server admin. Example: `.listadmins add @Alice admin`.\n- `.listadmins remove @user` — remove a server admin. Example: `.listadmins remove @Alice`.', inline: false },
        { name: 'Notes & best practices', value: '- Use `add`/`remove` in the server where you want to manage admins (command requires a guild).\n- Global admins (ADMIN_IDS) and the server owner bypass the DB check and can always manage admins.\n- To enforce different permission levels, we can extend checks to require specific roles (e.g., only `admin` can grant items).', inline: false },
        { name: 'Customization', value: 'If you want role-specific enforcement (for example, `mod` cannot grant items), tell me which commands should be restricted and I will update the checks.', inline: false }
      );

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('list-admins-help command error:', err);
      return replyFromResult(message, { success: false, error: 'Failed to show admin help. Please try again later.', reason: 'Error' }, {
        label: 'Admin Help',
        errorTitle: 'Error'
      });
    }
  }
};
