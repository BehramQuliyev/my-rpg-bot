'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'collect',
  description: 'Collect finished work reward',
  async execute(message, args, context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.collectWork !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Work collect',
        errorTitle: 'Error'
      });
    }

    const res = await storage.collectWork(message.author.id);

    await replyFromResult(message, res, {
      label: 'Work collect',
      successTitle: 'Rewards collected',
      successDescription: (d) =>
      `**${d.totalReward} silver** collected (base ${d.baseReward} + bonus ${d.bonus}).\n` +
      `New silver: **${d.newSilver}**\nStreak: **${d.streak}**.`,
      infoTitle: 'Info',
      errorTitle: 'Error'
    });
  }
};