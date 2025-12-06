// commands/game/work.js
'use strict';

module.exports = {
  name: 'work',
  description: 'Start a 9-hour work session',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage } = context;
      if (!storage || typeof storage.startWork !== 'function') {
        console.error('storage.startWork is not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      const res = await storage.startWork(userId);

      if (!res || res.success === false) {
        // Already working
        if (res && res.reason === 'AlreadyWorking') {
          const session = res.session;
          const finishAtMs = session && session.finishAt ? new Date(session.finishAt).getTime() : null;
          const remaining = finishAtMs ? Math.max(0, Math.floor((finishAtMs - Date.now()) / 1000)) : null;
          if (remaining !== null) {
            const hrs = Math.floor(remaining / 3600);
            const mins = Math.floor((remaining % 3600) / 60);
            return message.reply(`⏳ You are already working. Time left: ${hrs}h ${mins}m.`);
          }
          return message.reply('⏳ You are already working. Please wait until your current session finishes.');
        }

        // Cooldown after collect
        if (res && res.reason === 'CooldownAfterCollect') {
          const remaining = res.remaining ?? 0; // seconds
          const hrs = Math.ceil(remaining / 3600);
          return message.reply(`⏳ You recently collected work. Wait ${hrs}h before starting again.`);
        }

        // Generic failure
        console.error('startWork failed:', res && res.error ? res.error : res);
        return message.reply(`❌ Could not start work: ${res && res.reason ? res.reason : 'unknown error'}`);
      }

      // Success
      const session = res.session;
      const finishAt = session && session.finishAt ? Math.floor(new Date(session.finishAt).getTime() / 1000) : null;
      if (finishAt) {
        return message.reply(`✅ Work started. You will be able to collect after <t:${finishAt}:R>.`);
      }

      // Fallback success message
      return message.reply('✅ Work started. You will be able to collect after the session finishes.');
    } catch (err) {
      console.error('work command error:', err);
      try {
        await message.reply('❌ An unexpected error occurred while starting work. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
