// commands/utils/reply.js
'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Default theme values. These can be overridden by passing a `theme` object
 * into the helper functions (useful for tests or runtime config).
 */
const DEFAULT_THEME = {
  COLORS: {
    INFO: 0x3498db,
    SUCCESS: 0x2ecc71,
    ERROR: 0xe74c3c
  },
  EMOJIS: {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '⚠️'
  },
  FOOTER: '⚔️ Powered by Funtan Bot'
};

/**
 * Safely send an embed reply. Tries message.reply first, falls back to
 * message.channel.send if reply fails (for example, in DMs or permission issues).
 *
 * @param {Message} message - discord.js Message instance
 * @param {EmbedBuilder} embed - prepared embed
 */
async function safeSendEmbed(message, embed) {
  try {
    // Prefer reply to keep threading/mentions consistent
    return await message.reply({ embeds: [embed] });
  } catch (err1) {
    // Only fall back to channel.send if reply truly failed
    try {
      if (message.channel && typeof message.channel.send === 'function') {
        return await message.channel.send({ embeds: [embed] });
      }
    } catch (err2) {
      // Both failed; log but do NOT try to send plain text (avoids triple replies)
      console.error('Failed to send embed (reply & channel.send both failed):', err1.message, err2.message);
      return null;
    }
    // If channel.send not available, just log
    console.error('Failed to send embed (no fallback available):', err1.message);
    return null;
  }
}

/**
 * Build an embed with sensible defaults and optional theme overrides.
 *
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {number|string} options.color
 * @param {string} options.footer
 * @param {boolean} options.timestamp
 * @param {Object} options.theme - optional theme overrides { COLORS, EMOJIS, FOOTER }
 * @returns {EmbedBuilder}
 */
function buildEmbed({ title, description, color, footer, timestamp = true, theme = {} } = {}) {
  const COLORS = (theme.COLORS) ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const FOOTER = footer || theme.FOOTER || DEFAULT_THEME.FOOTER;

  const embed = new EmbedBuilder()
    .setColor(typeof color === 'number' ? color : COLORS.INFO)
    .setDescription(description || '');

  if (title) embed.setTitle(title);
  if (FOOTER) embed.setFooter({ text: FOOTER });
  if (timestamp) embed.setTimestamp();

  return embed;
}

/**
 * Generic embed reply
 *
 * @param {Message} message
 * @param {Object} opts - { title, description, color, footer, timestamp, theme }
 */
async function replyEmbed(message, opts = {}) {
  const embed = buildEmbed(opts);
  return safeSendEmbed(message, embed);
}

/**
 * Success embed
 *
 * @param {Message} message
 * @param {string} description
 * @param {string} title
 * @param {Object} theme - optional theme overrides
 */
async function replySuccess(message, description, title = 'Success', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.SUCCESS} ${title}`,
    description,
    color: COLORS.SUCCESS,
    theme
  });
  return safeSendEmbed(message, embed);
}

/**
 * Error embed
 *
 * @param {Message} message
 * @param {string} description
 * @param {string} title
 * @param {Object} theme - optional theme overrides
 */
async function replyError(message, description, title = 'Error', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.ERROR} ${title}`,
    description,
    color: COLORS.ERROR,
    theme
  });
  return safeSendEmbed(message, embed);
}

/**
 * Info embed
 *
 * @param {Message} message
 * @param {string} description
 * @param {string} title
 * @param {Object} theme - optional theme overrides
 */
async function replyInfo(message, description, title = 'Info', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.INFO} ${title}`,
    description,
    color: COLORS.INFO,
    theme
  });
  return safeSendEmbed(message, embed);
}

module.exports = {
  replyEmbed,
  replySuccess,
  replyError,
  replyInfo,
  // Export defaults so other modules can reuse or override them
  DEFAULT_THEME,
  buildEmbed
};
