'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'work',
  description: 'Start a 9-hour work session',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.startWork !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Work start',
        errorTitle: '❌ Error'
      });
      return;
    }

    const res = await storage.startWork(message.author.id);

    await replyFromResult(message, res, {
      label: 'Work start',
      successTitle: '💼 Work Started!',
      successDescription: (d) => {
        const finishUnix = Math.floor(new Date(d.session.finishAt).getTime() / 1000);
        return (
          `🕒 Your work session has begun!\n\n` +
          `⏳ It will finish: <t:${finishUnix}:R>\n` +
          `🏆 Stay consistent to build your streak!`
        );
      },
      infoTitle: 'ℹ️ Info',
      errorTitle: '❌ Error'
    });
  }
};
