// commands/currency/balance.js
'use strict';

const { replyInfo } = require('../../utils/reply');

module.exports = {
  name: 'balance',
  description: 'Check your balance',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args, context = {}) {
    try {
      const { storage } = context;
      if (!storage || typeof storage.getBalance !== 'function') {
        console.error('storage.getBalance is not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const res = await storage.getBalance(message.author.id);
      if (!res || res.success === false) {
        console.error('getBalance failed:', res && res.error ? res.error : res);
        return await message.reply('❌ Could not fetch your balance right now. Please try again later.');
      }

      const b = res.balance || { bronze: 0, silver: 0, gold: 0, gems: 0 };
      const content = `Bronze: **${b.bronze}**\nSilver: **${b.silver}**\nGold: **${b.gold}**\nGems: **${b.gems}**`;

      await replyInfo(message, content, '💰 Balance');
    } catch (err) {
      console.error('balance command error', err);
      try {
        await message.reply('❌ Could not fetch your balance right now. Please try again later.');
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
