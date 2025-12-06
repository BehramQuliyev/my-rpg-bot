// commands/game/collect.js
'use strict';

const { replySuccess, replyError } = require('../../utils/reply');

module.exports = {
  name: 'collect',
  description: 'Collect finished work reward',
  async execute(message, args, context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.collectWork !== 'function') {
      console.error('storage.collectWork is not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const res = await storage.collectWork(userId);

      if (!res || res.success === false) {
        if (res && res.reason === 'StillWorking') {
          const hrs = Math.floor(res.remaining / 3600);
          const mins = Math.floor((res.remaining % 3600) / 60);
          return await replyError(message, `Still working. Time left: ${hrs}h ${mins}m.`, 'Working');
        }
        if (res && res.reason === 'AlreadyCollected') {
          const hrs = Math.ceil((res.remaining || 0) / 3600);
          return await replyError(message, `You already collected. Cooldown left: ${hrs}h.`, 'Cooldown');
        }
        if (res && res.reason === 'NoSession') {
          return await replyError(message, 'You have no work sessions yet. Start one with the work command.', 'No Session');
        }
        if (res && res.reason === 'NoFinishedSession') {
          return await replyError(message, 'No finished work session found. Start work and wait until it finishes.', 'Not Ready');
        }
        console.error('collectWork failed:', res && res.error ? res.error : res);
        return await replyError(message, 'Could not collect work right now. Please try again later.', 'Error');
      }

      const base = res.baseReward ?? 0;
      const bonus = res.bonus ?? 0;
      const total = res.totalReward ?? (base + bonus);
      const newSilver = res.newSilver ?? 'unknown';
      const streak = res.streak ?? 0;

      return await replySuccess(message, `**${total} silver** collected (base ${base} + bonus ${bonus}).\nNew silver: **${newSilver}**\nStreak: **${streak}**.`, 'Work Collected');
    } catch (err) {
      console.error('collect command error:', err);
      return await replyError(message, 'Could not collect work right now. Please try again later.', 'Error');
    }
  }
};