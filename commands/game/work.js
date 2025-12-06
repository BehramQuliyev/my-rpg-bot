'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'work',
  description: 'Start a 9-hour work session',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.startWork !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Work start',
        errorTitle: 'Error'
      });
    }

    const res = await storage.startWork(message.author.id);

    return replyFromResult(message, res, {
      label: 'Work start',
      successTitle: 'Work started',
      successDescription: (d) => {
        const finishUnix = Math.floor(new Date(d.session.finishAt).getTime() / 1000);
        return `Session started. Finish at: <t:${finishUnix}:R>.`;
      },
      infoTitle: 'Info',
      errorTitle: 'Error'
    });
  }
};
