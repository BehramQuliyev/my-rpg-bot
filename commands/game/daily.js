'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'daily',
  description: 'Claim your daily bronze',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.claimDaily !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Daily claim',
        errorTitle: '❌ Error'
      });
      return;
    }

    const res = await storage.claimDaily(message.author.id);

    await replyFromResult(message, res, {
      label: 'Daily claim',
      successTitle: '🌞 Daily Reward',
      successDescription: (d) => {
        const nextUnix = Math.floor(new Date(d.nextAvailableAt).getTime() / 1000);
        return (
          `🎁 You claimed **${d.reward} bronze**!\n\n` +
          `🏆 Streak: **${d.streak} days**\n` +
          `⏳ Next claim available: <t:${nextUnix}:R>`
        );
      },
      infoTitle: 'ℹ️ Cooldown',
      errorTitle: '❌ Failed'
    });
  }
};
