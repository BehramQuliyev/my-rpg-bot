// commands/game/collect.js
'use strict';

module.exports = {
  name: 'collect',
  description: 'Collect finished work reward',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args, context = {}) {
    try {
      const { storage } = context;
      if (!storage || typeof storage.collectWork !== 'function') {
        console.error('storage.collectWork is not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      const res = await storage.collectWork(userId);

      if (!res || res.success === false) {
        // Handle known reasons
        if (res && res.reason === 'StillWorking') {
          // remaining is in seconds
          const hrs = Math.floor(res.remaining / 3600);
          const mins = Math.floor((res.remaining % 3600) / 60);
          return message.reply(`Still working. Time left: ${hrs}h ${mins}m.`);
        }

        if (res && res.reason === 'AlreadyCollected') {
          // remaining is in seconds
          const hrs = Math.ceil((res.remaining || 0) / 3600);
          return message.reply(`You already collected. Cooldown left: ${hrs}h.`);
        }

        // Generic not found or other error
        if (res && res.reason === 'NoSession') {
          return message.reply('You have no work sessions yet. Start one with the work command.');
        }

        if (res && res.reason === 'NoFinishedSession') {
          return message.reply('No finished work session found. Start work and wait until it finishes.');
        }

        // Unexpected error
        console.error('collectWork failed:', res && res.error ? res.error : res);
        return message.reply('❌ Could not collect work right now. Please try again later.');
      }

      // Success
      const base = res.baseReward ?? 0;
      const bonus = res.bonus ?? 0;
      const total = res.totalReward ?? (base + bonus);
      const newSilver = res.newSilver ?? 'unknown';
      const streak = res.streak ?? 0;

      return message.reply(
        `Work collected: **${total} silver** (base ${base} + bonus ${bonus}). New silver: **${newSilver}**. Streak: **${streak}**.`
      );
    } catch (err) {
      console.error('collect command error:', err);
      try {
        await message.reply('❌ An unexpected error occurred while collecting work. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
