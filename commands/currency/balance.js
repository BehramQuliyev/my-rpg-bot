'use strict';

const { buildEmbed, DEFAULT_THEME, replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'balance',
  description: 'Show your currency balances',
  aliases: ['bal'],
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.getBalance !== 'function') {
      await replyFromResult(message, { success: false, error: 'Bot storage is not available.', reason: 'Error' }, {
        label: 'Balance',
        errorTitle: 'Error'
      });
      return;
    }

    try {
      const res = await storage.getBalance(message.author.id);

      if (!res || res.success === false) {
        await replyFromResult(message, res || { success: false, error: 'Failed to fetch balance', reason: 'Error' }, {
          label: 'Balance',
          errorTitle: 'Error'
        });
        return;
      }

      const bal = res.data?.balance || { bronze: 0, silver: 0, gold: 0, gems: 0 };

      // Build a styled embed similar to inventory.js
      const embed = buildEmbed({
        title: '💰 Your Balance',
        description: 'Here are your current currency holdings:',
        color: DEFAULT_THEME.COLORS.INFO,
        footer: `${DEFAULT_THEME.FOOTER} • Use .work, .daily, or .hunt to earn more!`,
        theme: DEFAULT_THEME
      });

      embed.addFields(
        { name: '🪙 Bronze', value: String(bal.bronze), inline: true },
        { name: '🥈 Silver', value: String(bal.silver), inline: true },
        { name: '🥇 Gold', value: String(bal.gold), inline: true },
        { name: '💎 Gems', value: String(bal.gems), inline: true }
      );

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('balance command error:', err);
      await replyFromResult(message, { success: false, error: err?.message || 'An unexpected error occurred', reason: 'Error' }, {
        label: 'Balance',
        errorTitle: 'Error'
      });
    }
  }
};
