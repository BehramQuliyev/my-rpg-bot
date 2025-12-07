'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'collect',
  description: 'Collect finished work reward',
  async execute(message, args, context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.collectWork !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Work collect',
        errorTitle: '❌ Error'
      });
      return;
    }

    const res = await storage.collectWork(message.author.id);

    await replyFromResult(message, res, {
      label: 'Work collect',
      successTitle: '🎉 Rewards Collected!',
      successDescription: (d) =>
        `✨ You’ve claimed your reward!\n\n` +
        `💰 **Total Silver:** **${d.totalReward}**\n` +
        `⚔️ Base: **${d.baseReward}**\n` +
        `🔥 Bonus: **${d.bonus}**\n\n` +
        `📈 New Balance: **${d.newSilver} silver**\n` +
        `🏆 Streak: **${d.streak} days**`,
      infoTitle: 'ℹ️ Info',
      errorTitle: '❌ Error'
    });
  }
};
