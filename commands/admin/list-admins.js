'use strict';

const { replyFromResult, buildEmbed, DEFAULT_THEME } = require('../../utils/reply');

module.exports = {
  name: 'listadmins',
  description: 'Manage server-specific admins: list | add | remove',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage, config } = context;

      // Ensure guild context
      if (!message.guild) {
        return replyFromResult(message, { success: false, error: 'This command must be used in a server (guild).', reason: 'InvalidContext' }, {
          label: 'List Admins',
          errorTitle: 'Invalid Context'
        });
      }

      // Resolve global admin IDs from validated config first, fallback to env
      const GLOBAL_ADMIN_IDS = Array.isArray(config && config.ADMIN_IDS) && config.ADMIN_IDS.length ?
      config.ADMIN_IDS :
      (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

      const serverId = message.guild.id;
      const callerId = message.author.id;

      // Helper: check global admin or server owner
      function isGlobalAdminOrOwner(id) {
        if (GLOBAL_ADMIN_IDS.includes(id)) return true;
        if (message.guild && message.guild.ownerId === id) return true;
        return false;
      }

      // Check storage availability for server admin helpers
      if (!storage || typeof storage.isServerAdmin !== 'function' || typeof storage.listServerAdmins !== 'function') {
        console.error('storage server-admin helpers are not available in command context');
        return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
          label: 'List Admins',
          errorTitle: 'Error'
        });
      }

      // Determine caller privileges (storage.isServerAdmin may return a result shape or a plain object)
      const callerIsOwner = message.guild.ownerId === callerId;
      const callerIsGlobalAdmin = isGlobalAdminOrOwner(callerId);

      const callerIsServerAdminRes = await storage.isServerAdmin(serverId, callerId);
      const callerIsServerAdmin = !!(
      callerIsServerAdminRes && callerIsServerAdminRes.isAdmin ||
      callerIsServerAdminRes && callerIsServerAdminRes.success && (callerIsServerAdminRes.data?.isAdmin || callerIsServerAdminRes.data?.is_admin));


      const canManage = callerIsOwner || callerIsGlobalAdmin || callerIsServerAdmin;

      const action = (args[0] || 'list').toLowerCase();

      // LIST: anyone in the server can view the list (change to restrict if desired)
      if (action === 'list') {
        const rowsRaw = await storage.listServerAdmins(serverId);
        // support both legacy array and result shape
        const rows = Array.isArray(rowsRaw) ? rowsRaw : rowsRaw && rowsRaw.success ? rowsRaw.data?.rows || rowsRaw.data || [] : rowsRaw || [];

        if (!rows || rows.length === 0) {
          return replyFromResult(message, { success: true, data: { rows: [] } }, {
            label: 'List Admins',
            successTitle: 'Server Admins',
            successDescription: () => 'No server admins configured for this server.'
          });
        }

        // Build pages of up to 25 entries per embed
        const CHUNK_SIZE = 25;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const embed = buildEmbed({
            title: `Server admins for ${message.guild.name}`,
            description: `Server ID: ${serverId}`,
            color: DEFAULT_THEME.COLORS.INFO,
            footer: DEFAULT_THEME.FOOTER,
            theme: DEFAULT_THEME
          });

          const lines = chunk.map((r) => {
            const added = r.createdAt ? new Date(r.createdAt).toLocaleString() : r.addedAt ? new Date(r.addedAt).toLocaleString() : 'unknown';
            const role = r.role || r.roleName || 'admin';
            const userId = r.userId || r.user_id || r.id || 'unknown';
            return `• <@${userId}> — ${role} • added ${added}`;
          });

          embed.addFields({ name: `Admins (${Math.min(CHUNK_SIZE, rows.length - i)})`, value: lines.join('\n'), inline: false });

          if (i === 0) {
            await message.reply({ embeds: [embed] });
          } else {
            await message.channel.send({ embeds: [embed] });
          }
        }

        return;
      }

      // For add/remove actions, require manage permission
      if (!canManage) {
        return replyFromResult(message, { success: false, error: 'You are not authorized to manage server admins. Only the server owner, global admins, or existing server admins can do this.', reason: 'Forbidden' }, {
          label: 'List Admins',
          errorTitle: 'Unauthorized'
        });
      }

      // ADD
      if (action === 'add') {
        const mention = args[1];
        const role = args[2] || 'admin';
        if (!mention) return replyFromResult(message, { success: false, error: 'Usage: `.listadmins add @user [role]`', reason: 'InvalidInput' }, { label: 'List Admins', errorTitle: 'Invalid Usage' });

        const m = mention.match(/^<@!?(\d+)>$/);
        if (!m) return replyFromResult(message, { success: false, error: 'Please mention the user to add (e.g., @User).', reason: 'InvalidInput' }, { label: 'List Admins', errorTitle: 'Invalid Target' });
        const targetId = m[1];

        if (typeof storage.addServerAdmin !== 'function') {
          console.error('storage.addServerAdmin not available');
          return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, { label: 'List Admins', errorTitle: 'Error' });
        }

        try {
          const rec = await storage.addServerAdmin(serverId, targetId, role);
          return replyFromResult(message, rec, {
            label: 'List Admins',
            successTitle: 'Added',
            successDescription: (d) => {
              const assignedRole = d.role || d.data?.role || role;
              return `✅ Added <@${targetId}> as **${assignedRole}**.`;
            },
            errorTitle: 'Failed'
          });
        } catch (err) {
          console.error('addServerAdmin error', err);
          return replyFromResult(message, { success: false, error: err?.message || 'Failed to add admin', reason: 'Error' }, { label: 'List Admins', errorTitle: 'Error' });
        }
      }

      // REMOVE
      if (action === 'remove') {
        const mention = args[1];
        if (!mention) return replyFromResult(message, { success: false, error: 'Usage: `.listadmins remove @user`', reason: 'InvalidInput' }, { label: 'List Admins', errorTitle: 'Invalid Usage' });

        const m = mention.match(/^<@!?(\d+)>$/);
        if (!m) return replyFromResult(message, { success: false, error: 'Please mention the user to remove (e.g., @User).', reason: 'InvalidInput' }, { label: 'List Admins', errorTitle: 'Invalid Target' });
        const targetId = m[1];

        if (typeof storage.removeServerAdmin !== 'function') {
          console.error('storage.removeServerAdmin not available');
          return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, { label: 'List Admins', errorTitle: 'Error' });
        }

        try {
          const ok = await storage.removeServerAdmin(serverId, targetId);
          // support both result shape and boolean-like responses
          if (ok && ok.success === false) {
            return replyFromResult(message, ok, { label: 'List Admins', errorTitle: 'Failed' });
          }
          if (ok && (ok.success === true || ok.removed || ok.deleted)) {
            return replyFromResult(message, { success: true, data: {} }, { label: 'List Admins', successTitle: 'Removed', successDescription: () => `✅ Removed <@${targetId}> from server admins.` });
          }
          // fallback: if storage returned falsy or indicates not found
          return replyFromResult(message, { success: false, error: `<@${targetId}> was not a server admin.`, reason: 'NotFound' }, { label: 'List Admins', errorTitle: 'Not Found' });
        } catch (err) {
          console.error('removeServerAdmin error', err);
          return replyFromResult(message, { success: false, error: err?.message || 'Failed to remove admin', reason: 'Error' }, { label: 'List Admins', errorTitle: 'Error' });
        }
      }

      return replyFromResult(message, { success: false, error: 'Unknown action. Use `list`, `add`, or `remove`.', reason: 'InvalidInput' }, {
        label: 'List Admins',
        errorTitle: 'Invalid Action'
      });
    } catch (err) {
      console.error('listadmins command error:', err);
      return replyFromResult(message, { success: false, error: 'An unexpected error occurred while managing server admins. Please try again later.', reason: 'Error' }, {
        label: 'List Admins',
        errorTitle: 'Error'
      });
    }
  }
};