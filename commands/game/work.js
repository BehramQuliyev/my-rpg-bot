// commands/game/work.js
'use strict';

const { replySuccess, replyError } = require('../../utils/reply');

module.exports = {
  name: 'work',
  description: 'Start a 9-hour work session',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.startWork !== 'function') {
      console.error('storage.startWork is not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const res = await storage.startWork(userId);

      if (!res || res.success === false) {
        if (res && res.reason === 'AlreadyWorking') {
          const session = res.session;
          const finishAtMs = session && session.finishAt ? new Date(session.finishAt).getTime() : null;
          const remaining = finishAtMs ? Math.max(0, Math.floor((finishAtMs - Date.now()) / 1000)) : null;
          if (remaining !== null) {
            const hrs = Math.floor(remaining / 3600);
            const mins = Math.floor((remaining % 3600) / 60);
            return await replyError(message, `You are already working. Time left: ${hrs}h ${mins}m.`, 'Already Working');
          }
          return await replyError(message, 'You are already working. Please wait until your current session finishes.', 'Already Working');
        }
        if (res && res.reason === 'CooldownAfterCollect') {
          const remaining = res.remaining ?? 0;
          const hrs = Math.ceil(remaining / 3600);
          return await replyError(message, `You recently collected work. Wait ${hrs}h before starting again.`, 'Cooldown');
        }
        console.error('startWork failed:', res && res.error ? res.error : res);
        return await replyError(message, `Could not start work: ${res && res.reason ? res.reason : 'unknown error'}`, 'Error');
      }

      const session = res.session;
      const finishAt = session && session.finishAt ? Math.floor(new Date(session.finishAt).getTime() / 1000) : null;
      const finishText = finishAt ? `You will be able to collect after <t:${finishAt}:R>.` : 'You will be able to collect after the session finishes.';
      return await replySuccess(message, finishText, 'Work Started');
    } catch (err) {
      console.error('work command error:', err);
      return await replyError(message, 'Could not start work right now. Please try again later.', 'Error');
    }
  }
};