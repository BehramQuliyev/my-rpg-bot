'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'daily',
  description: 'Claim your daily bronze',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.claimDaily !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Daily claim',
        errorTitle: 'Error'
      });
    }

    const res = await storage.claimDaily(message.author.id);

    await replyFromResult(message, res, {
      label: 'Daily claim',
      successTitle: 'Daily',
      successDescription: (d) => {
        const nextUnix = Math.floor(new Date(d.nextAvailableAt).getTime() / 1000);
        return `**${d.reward} bronze** claimed.\nStreak: **${d.streak}**. Next: <t:${nextUnix}:R>`;
      },
      infoTitle: 'Cooldown',
      errorTitle: 'Failed'
    });
  }
};