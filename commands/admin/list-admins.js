// commands/admin/list-admins.js
'use strict';

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
        return message.reply('This command must be used in a server (guild).');
      }

      // Resolve global admin IDs from validated config first, fallback to env
      const GLOBAL_ADMIN_IDS = Array.isArray(config && config.ADMIN_IDS) && config.ADMIN_IDS.length
        ? config.ADMIN_IDS
        : (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

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
        return message.reply('❌ Bot storage is not available. Try again later.');
      }

      // Determine caller privileges
      const callerIsOwner = message.guild.ownerId === callerId;
      const callerIsGlobalAdmin = isGlobalAdminOrOwner(callerId);
      const callerIsServerAdminRes = await storage.isServerAdmin(serverId, callerId);
      const callerIsServerAdmin = !!(callerIsServerAdminRes && callerIsServerAdminRes.isAdmin);

      const canManage = callerIsOwner || callerIsGlobalAdmin || callerIsServerAdmin;

      const action = (args[0] || 'list').toLowerCase();

      // LIST: anyone in the server can view the list (change to restrict if desired)
      if (action === 'list') {
        const rows = await storage.listServerAdmins(serverId);
        if (!rows || rows.length === 0) return message.reply('No server admins configured for this server.');

        // Format lines
        const lines = rows.map(r => {
          const added = r.createdAt ? new Date(r.createdAt).toLocaleString() : 'unknown';
          return `<@${r.userId}> • ${r.role || 'admin'} • added ${added}`;
        });

        // Send in chunks to avoid long messages
        const CHUNK_SIZE = 45; // lines per message
        for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
          const part = lines.slice(i, i + CHUNK_SIZE).join('\n');
          const header = i === 0 ? `Server admins for **${message.guild.name}** (${serverId}):\n` : '';
          if (i === 0) {
            await message.reply(header + part);
          } else {
            await message.channel.send(part);
          }
        }
        return;
      }

      // For add/remove actions, require manage permission
      if (!canManage) {
        return message.reply('❌ You are not authorized to manage server admins. Only the server owner, global admins, or existing server admins can do this.');
      }

      // ADD
      if (action === 'add') {
        const mention = args[1];
        const role = args[2] || 'admin';
        if (!mention) return message.reply('Usage: `.listadmins add @user [role]`');

        const m = mention.match(/^<@!?(\d+)>$/);
        if (!m) return message.reply('Please mention the user to add (e.g., @User).');
        const targetId = m[1];

        if (typeof storage.addServerAdmin !== 'function') {
          console.error('storage.addServerAdmin not available');
          return message.reply('❌ Bot storage is not available. Try again later.');
        }

        try {
          const rec = await storage.addServerAdmin(serverId, targetId, role);
          if (!rec || rec.success === false) {
            console.error('addServerAdmin failed:', rec && rec.error ? rec.error : rec);
            return message.reply(`❌ Failed to add admin: ${rec && rec.error ? rec.error : 'unknown error'}`);
          }
          const assignedRole = rec.role || role;
          return message.reply(`✅ Added <@${targetId}> as **${assignedRole}**.`);
        } catch (err) {
          console.error('addServerAdmin error', err);
          return message.reply(`❌ Failed to add admin: ${err && err.message ? err.message : 'unexpected error'}`);
        }
      }

      // REMOVE
      if (action === 'remove') {
        const mention = args[1];
        if (!mention) return message.reply('Usage: `.listadmins remove @user`');

        const m = mention.match(/^<@!?(\d+)>$/);
        if (!m) return message.reply('Please mention the user to remove (e.g., @User).');
        const targetId = m[1];

        if (typeof storage.removeServerAdmin !== 'function') {
          console.error('storage.removeServerAdmin not available');
          return message.reply('❌ Bot storage is not available. Try again later.');
        }

        try {
          const ok = await storage.removeServerAdmin(serverId, targetId);
          if (ok && ok.success !== false) {
            return message.reply(`✅ Removed <@${targetId}> from server admins.`);
          }
          // If storage returns falsey or indicates not found
          return message.reply(`<@${targetId}> was not a server admin.`);
        } catch (err) {
          console.error('removeServerAdmin error', err);
          return message.reply(`❌ Failed to remove admin: ${err && err.message ? err.message : 'unexpected error'}`);
        }
      }

      return message.reply('Unknown action. Use `list`, `add`, or `remove`.');
    } catch (err) {
      console.error('listadmins command error:', err);
      try {
        await message.reply('❌ An unexpected error occurred while managing server admins. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
