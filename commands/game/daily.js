// commands/game/daily.js
'use strict';

module.exports = {
  name: 'daily',
  description: 'Claim your daily bronze',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage } = context;

      // Defensive: ensure storage helper exists
      if (!storage || typeof storage.claimDaily !== 'function') {
        console.error('daily: storage.claimDaily is not available in command context', {
          storageAvailable: !!storage,
          claimDailyType: storage ? typeof storage.claimDaily : 'n/a'
        });
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      // Call storage and guard against it throwing
      let res;
      try {
        res = await storage.claimDaily(userId);
      } catch (innerErr) {
        console.error('daily: storage.claimDaily threw an exception', innerErr);
        return message.reply('❌ Could not claim daily right now (internal error). Please try again later.');
      }

      // If storage returns falsy or an unexpected shape, log it
      if (!res) {
        console.error('daily: claimDaily returned falsy result', { userId, res });
        return message.reply('❌ Could not claim daily right now. Please try again later.');
      }

      // If storage indicates failure via success flag
      if (res.success === false) {
        // If cooldown info provided, format it (res.remaining is expected in seconds)
        if (typeof res.remaining === 'number') {
          const hrs = Math.floor(res.remaining / 3600);
          const mins = Math.floor((res.remaining % 3600) / 60);
          return message.reply(`⏳ You are on cooldown. Try again in ${hrs}h ${mins}m.`);
        }

        // If storage provides a reason/message, surface it
        if (res.reason || res.message) {
          console.warn('daily: claimDaily returned failure reason', { userId, reason: res.reason, message: res.message });
          return message.reply(`❌ Could not claim daily: ${res.reason || res.message}`);
        }

        // Generic failure
        console.error('daily: claimDaily failed without details', { userId, res });
        return message.reply('❌ Could not claim daily right now. Please try again later.');
      }

      // Success path: normalize values
      // Accept either direct fields or nested payloads
      const reward = (typeof res.reward === 'number') ? res.reward : (res.payload && typeof res.payload.reward === 'number' ? res.payload.reward : 0);
      const streak = (typeof res.streak === 'number') ? res.streak : (res.payload && typeof res.payload.streak === 'number' ? res.payload.streak : 0);

      // nextAvailableAt may be a Date, ISO string, or timestamp (seconds or ms)
      let nextAtUnix = null;
      if (res.nextAvailableAt instanceof Date) {
        nextAtUnix = Math.floor(res.nextAvailableAt.getTime() / 1000);
      } else if (typeof res.nextAvailableAt === 'string') {
        const d = new Date(res.nextAvailableAt);
        if (!Number.isNaN(d.getTime())) nextAtUnix = Math.floor(d.getTime() / 1000);
      } else if (typeof res.nextAvailableAt === 'number') {
        // Heuristic: if value looks like seconds (<= 1e11) treat as seconds, else ms
        nextAtUnix = res.nextAvailableAt > 1e11 ? Math.floor(res.nextAvailableAt / 1000) : Math.floor(res.nextAvailableAt);
      } else if (res.payload && res.payload.nextAvailableAt) {
        const v = res.payload.nextAvailableAt;
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) nextAtUnix = Math.floor(d.getTime() / 1000);
      }

      const nextText = nextAtUnix ? ` Next: <t:${nextAtUnix}:R>` : '';

      return message.reply(`✅ Daily claimed: **${reward} bronze**. Streak: **${streak}**.${nextText}`);
    } catch (err) {
      // Top-level catch: log full error and return friendly message
      console.error('daily command error (unexpected):', err);
      try {
        await message.reply('❌ An unexpected error occurred while claiming daily. Please try again later.');
      } catch (replyErr) {
        console.error('daily: failed to send error reply:', replyErr);
      }
    }
  }
};
