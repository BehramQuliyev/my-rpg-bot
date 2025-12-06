// commands/game/daily.js
'use strict';

const { replySuccess, replyError } = require('../../utils/reply');

module.exports = {
  name: 'daily',
  description: 'Claim your daily bronze',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.claimDaily !== 'function') {
      console.error('daily: storage.claimDaily is not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const res = await storage.claimDaily(userId);

      if (!res) {
        console.error('daily: claimDaily returned falsy result', { userId, res });
        return await replyError(message, 'Could not claim daily right now. Please try again later.', 'Error');
      }

      if (res.success === false) {
        if (typeof res.remaining === 'number') {
          const hrs = Math.floor(res.remaining / 3600);
          const mins = Math.floor((res.remaining % 3600) / 60);
          return await replyError(message, `You are on cooldown. Try again in ${hrs}h ${mins}m.`, 'Cooldown');
        }
        if (res.reason || res.message) {
          console.warn('daily: claimDaily returned failure reason', { userId, reason: res.reason, message: res.message });
          return await replyError(message, res.reason || res.message, 'Failed');
        }
        console.error('daily: claimDaily failed without details', { userId, res });
        return await replyError(message, 'Could not claim daily right now. Please try again later.', 'Error');
      }

      const reward = (typeof res.reward === 'number') ? res.reward : 0;
      const streak = (typeof res.streak === 'number') ? res.streak : 0;
      let nextText = '';
      if (res.nextAvailableAt instanceof Date) {
        const nextAtUnix = Math.floor(res.nextAvailableAt.getTime() / 1000);
        nextText = ` Next: <t:${nextAtUnix}:R>`;
      }

      return await replySuccess(message, `**${reward} bronze** claimed.\nStreak: **${streak}**.${nextText}`, 'Daily Claimed');
    } catch (err) {
      console.error('daily command error:', err);
      return await replyError(message, 'Could not claim daily right now. Please try again later.', 'Error');
    }
  }
};