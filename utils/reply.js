'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * reply.js
 * Lightweight reply helpers for commands.
 * - No top-level await or async initialization
 * - Exports: replyEmbed, replySuccess, replyError, replyInfo, replyFromResult, buildEmbed, DEFAULT_THEME, formatResultMessage, formatDuration
 */

/**
 * Default theme values. These can be overridden by passing a `theme` object.
 */
const DEFAULT_THEME = {
  COLORS: {
    INFO: 0x3498db,
    SUCCESS: 0x57f287,
    ERROR: 0xed4245
  },
  EMOJIS: {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '⚠️'
  },
  FOOTER: '⚔️ Powered by Funtan Bot'
};

/* ======================
   Internal utils
   ====================== */

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(plural(h, 'hour'));
  if (m) parts.push(plural(m, 'minute'));
  if (sec || (!h && !m)) parts.push(plural(sec, 'second'));
  return parts.join(', ');
}

/* ======================
   Core embed helpers
   ====================== */

/**
 * Safely send an embed reply. Tries message.reply first, falls back to channel.send.
 * Always awaits and returns void (commands should not rely on returned value).
 */
async function safeSendEmbed(message, embed) {
  try {
    await message.reply({ embeds: [embed] });
    return;
  } catch (err1) {
    try {
      if (message.channel && typeof message.channel.send === 'function') {
        await message.channel.send({ embeds: [embed] });
        return;
      }
    } catch (err2) {
      console.error('Failed to send embed (reply & channel.send failed):', err1?.message, err2?.message);
      return;
    }
    console.error('Failed to send embed (no fallback available):', err1?.message);
    return;
  }
}

/**
 * Build an embed with sensible defaults and optional theme overrides.
 */
function buildEmbed({ title, description, color, footer, timestamp = true, theme = {} } = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const FOOTER = footer || theme.FOOTER || DEFAULT_THEME.FOOTER;

  const embed = new EmbedBuilder()
    .setColor(typeof color === 'number' ? color : COLORS.INFO)
    .setDescription(typeof description === 'function' ? description() : (description || ''));

  if (title) embed.setTitle(title);
  if (FOOTER) embed.setFooter({ text: FOOTER });
  if (timestamp) embed.setTimestamp();

  return embed;
}

/* ======================
   Public reply helpers
   ====================== */

async function replyEmbed(message, opts = {}) {
  const embed = buildEmbed(opts);
  await safeSendEmbed(message, embed);
}

async function replySuccess(message, description, title = 'Success', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.SUCCESS} ${title}`,
    description,
    color: COLORS.SUCCESS,
    theme
  });
  await safeSendEmbed(message, embed);
}

async function replyError(message, description, title = 'Error', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.ERROR} ${title}`,
    description,
    color: COLORS.ERROR,
    theme
  });
  await safeSendEmbed(message, embed);
}

async function replyInfo(message, description, title = 'Info', theme = {}) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;
  const embed = buildEmbed({
    title: `${EMOJIS.INFO} ${title}`,
    description,
    color: COLORS.INFO,
    theme
  });
  await safeSendEmbed(message, embed);
}

/* ======================
   Result-aware helpers (for storage.js unified shape)
   ====================== */

/**
 * Render a cooldown message using res.reason === 'Cooldown' and res.data.remaining.
 */
function formatCooldownMessage(actionLabel, remainingSeconds) {
  const durationText = formatDuration(remainingSeconds);
  return `${actionLabel} is on cooldown.\nPlease wait ${durationText}.`;
}

/**
 * Map result reason to user-facing message. Keep concise and actionable.
 * Expects shape: { success, data, error, reason }
 */
function formatResultMessage(res, context = {}) {
  const label = context.label || 'Action';
  if (res && res.success) return `${label} succeeded.`;

  if (!res) return 'Something went wrong.';

  switch (res.reason) {
    case 'Cooldown':
      return formatCooldownMessage(label, res?.data?.remaining ?? 0);
    case 'CooldownAfterCollect':
      return formatCooldownMessage('Work collect', res?.data?.remaining ?? 0);
    case 'AlreadyWorking':
      return 'You already have an active work session.';
    case 'StillWorking':
      return `Work is still in progress.\nRemaining: ${formatDuration(res?.data?.remaining ?? 0)}.`;
    case 'AlreadyCollected':
      return `You’ve already collected.\nNext collect available in ${formatDuration(res?.data?.remaining ?? 0)}.`;
    case 'NoSession':
      return 'No active work session found.';
    case 'NoFinishedSession':
      return 'No finished work session to collect.';
    case 'MissingEquipment':
      return 'Equip 1 weapon and 1 gear before hunting.';
    case 'ThresholdNotMet': {
      const power = res?.data?.power ?? 0;
      const monsterName = res?.data?.monster?.name || 'target';
      const threshold = res?.data?.monster?.threshold ?? 0;
      return `Power too low for ${monsterName}.\nYour power: ${power} | Required: ${threshold}.`;
    }
    case 'InvalidInput':
      return 'Invalid input provided.';
    case 'InvalidCurrencyType':
      return 'Invalid currency type.';
    case 'InvalidUser':
      return 'Invalid user.';
    case 'NotFound':
      return 'Requested resource was not found.';
    case 'Forbidden':
      return 'That item does not belong to you.';
    case 'Error':
    default:
      return res.error || 'Something went wrong.';
  }
}

/**
 * Reply using the unified result from storage.js.
 * Automatically picks success/info/error styling.
 * Always awaits and returns void.
 */
async function replyFromResult(
  message,
  res,
  {
    successTitle = 'Success',
    infoTitle = 'Info',
    errorTitle = 'Error',
    theme = {},
    label = 'Action',
    successDescription
  } = {}
) {
  const COLORS = theme.COLORS ? { ...DEFAULT_THEME.COLORS, ...theme.COLORS } : DEFAULT_THEME.COLORS;
  const EMOJIS = theme.EMOJIS ? { ...DEFAULT_THEME.EMOJIS, ...theme.EMOJIS } : DEFAULT_THEME.EMOJIS;

  if (res && res.success) {
    const description =
      typeof successDescription === 'function'
        ? successDescription(res.data)
        : successDescription || formatResultMessage(res, { label });
    const embed = buildEmbed({
      title: `${EMOJIS.SUCCESS} ${successTitle}`,
      description,
      color: COLORS.SUCCESS,
      theme
    });
    await safeSendEmbed(message, embed);
    return;
  }

  const description = formatResultMessage(res, { label });
  const isInfoReason = res && (res.reason === 'Cooldown' || res.reason === 'StillWorking' || res.reason === 'AlreadyCollected');
  const embed = buildEmbed({
    title: `${isInfoReason ? EMOJIS.INFO : EMOJIS.ERROR} ${isInfoReason ? infoTitle : errorTitle}`,
    description,
    color: isInfoReason ? COLORS.INFO : COLORS.ERROR,
    theme
  });
  await safeSendEmbed(message, embed);
  return;
}

module.exports = {
  // core
  replyEmbed,
  replySuccess,
  replyError,
  replyInfo,
  DEFAULT_THEME,
  buildEmbed,
  // result-aware
  replyFromResult,
  formatResultMessage,
  formatDuration
};
