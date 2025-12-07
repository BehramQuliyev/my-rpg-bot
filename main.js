'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

console.log('Starting bot, NODE_ENV=', process.env.NODE_ENV);
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('DISCORD_TOKEN present:', !!process.env.DISCORD_TOKEN);

process.on('uncaughtException', err => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', err => {
  console.error('unhandledRejection:', err);
});

storage.sequelize.authenticate()
  .then(() => console.log('Database connected'))
  .catch(err => console.error('Database connection failed:', err));

// Validate environment early
const { validateEnv } = require('./env-validate');
const envCheck = validateEnv();
if (!envCheck.success) {
  console.error('Environment validation failed:\n', envCheck.errors.join('\n'));
  process.exit(1);
}
const ENV = envCheck.config;

// Import storage (unified return shape)
const storage = require('./utils/storage');

// Use validated values
const PREFIX = ENV.PREFIX || '.';
const DEV_MODE = ENV.DEV_MODE === true;

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Prepare commands collection
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

// Ensure commands folder exists
if (!fs.existsSync(commandsPath)) {
  console.error('Commands folder not found:', commandsPath);
  process.exit(1);
}

/* ======================
   Command loader
   ====================== */

function loadCommands(folder) {
  for (const entry of fs.readdirSync(folder)) {
    const full = path.join(folder, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (!DEV_MODE && entry.toLowerCase() === 'admin') {
        console.log('Skipping admin commands (DEV_MODE=false):', full);
        continue;
      }
      loadCommands(full);
      continue;
    }

    if (!entry.endsWith('.js')) continue;

    try {
      const command = require(full);

      // Validate shape
      if (!command || typeof command.name !== 'string' || typeof command.execute !== 'function') {
        console.warn(`Skipping invalid command file (missing name/execute): ${full}`);
        continue;
      }

      // Register primary name
      client.commands.set(command.name, command);

      // Register aliases if provided
      if (Array.isArray(command.aliases)) {
        for (const a of command.aliases) {
          if (typeof a === 'string' && !client.commands.has(a)) {
            client.commands.set(a, command);
          }
        }
      }

      console.log(`Loaded command: ${command.name} (${full})`);
    } catch (err) {
      console.error(`Failed to load command file ${full}:`, err);
    }
  }
}

loadCommands(commandsPath);

/* ======================
   Graceful shutdown
   ====================== */

let _clientShutdownHooked = false;
function setupClientShutdown() {
  if (_clientShutdownHooked) return;
  _clientShutdownHooked = true;

  const close = async () => {
    try {
      console.log('Shutting down: logging out Discord client...');
      if (client && client.isReady()) {
        await client.destroy();
        console.log('Discord client logged out');
      }
      // Close DB connection gracefully
      try {
        await storage.sequelize.close();
        console.log('Database connection closed');
      } catch (dbErr) {
        console.error('Error closing DB connection:', dbErr);
      }
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await close();
  });
  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
  });
}

/* ======================
   Ready event
   ====================== */

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag} | id=${client.user.id} | PID=${process.pid} | DEV_MODE=${DEV_MODE}`);
});

/* ======================
   Message handler
   ====================== */

client.on('messageCreate', async (message) => {
  try {
    if (!message.content || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName);
    if (!command) return;

    // Debug: log invocation
    console.log(`> Command invoked: ${command.name} (alias: ${commandName}) by ${message.author.tag} [${message.author.id}]`);

    // Build a consistent context object for commands
    const ctx = {
      client,
      DEV_MODE,
      storage,
      config: ENV,
      prefix: PREFIX,
      authorId: message.author.id,
      channelId: message.channel?.id,
      guildId: message.guild?.id
    };

    try {
      // Execute the command
      await command.execute(message, args, ctx);
      // NOTE: commands themselves should call replyFromResult or message.reply.
      // We no longer auto-reply here to avoid duplicate responses.
      console.log(`< Command executed OK: ${command.name} for ${message.author.tag}`);
    } catch (cmdErr) {
      console.error(`< Command ${command.name} threw:`, cmdErr?.stack || cmdErr);
      try {
        await message.reply('❌ There was an internal error executing that command.');
      } catch (err) {
        console.error('Fallback reply failed:', err);
      }
    }
  } catch (error) {
    console.error('messageCreate top-level error:', error?.stack || error);
  }
});

/* ======================
   Interaction handler (catalog pagination)
   ====================== */

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('catalog_')) return;

    const [, direction, pageStr] = interaction.customId.split('_');
    const page = parseInt(pageStr, 10);
    if (Number.isNaN(page)) return;

    const { weapons, gear } = require('./utils/storage');

    // Detect whether this embed is for weapon or gear
    const isWeapon = interaction.message.embeds[0]?.title?.includes('Weapon');

    // Filter out mystical tier if you want to keep pagination tight
    const filtered = isWeapon
      ? weapons.filter(w => w.tier !== 11)
      : gear.filter(g => g.tier !== 11);

    const byTier = {};
    filtered.forEach(item => {
      byTier[item.tier] = byTier[item.tier] || [];
      byTier[item.tier].push(item);
    });

    const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
    const pages = [];

    for (let i = 0; i < tiers.length; i += 2) {
      const pageTiers = tiers.slice(i, i + 2);
      let description = isWeapon
        ? `⚔️ **Weapons** — ${filtered.length} items\n\n`
        : `🛡️ **Gear** — ${filtered.length} items\n\n`;

      for (const tier of pageTiers) {
        description += `**🔰 Tier ${tier}**\n`;
        byTier[tier].forEach(item => {
          if (isWeapon) {
            description += `• **${item.name}** ⚔️ — _${item.rarity}_ • ATK: **${item.attack}**\n`;
          } else {
            description += `• **${item.name}** 🛡️ — _${item.rarity}_ • DEF: **${item.defense}**\n`;
          }
        });
        description += '\n';
      }
      pages.push(description.trim());
    }

    if (page >= 0 && page < pages.length) {
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`${interaction.message.embeds[0].title.split(' (Page')[0]} (Page ${page + 1}/${pages.length})`)
        .setDescription(pages[page])
        .setFooter({ text: '⚔️ Powered by Funtan Bot' })
        .setTimestamp();

      const row = new ActionRowBuilder();

      if (page > 0) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`catalog_prev_${page - 1}`)
            .setLabel('← Previous')
            .setStyle(ButtonStyle.Primary)
        );
      }

      if (page < pages.length - 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`catalog_next_${page + 1}`)
            .setLabel('Next →')
            .setStyle(ButtonStyle.Primary)
        );
      }

      await interaction.update({
        embeds: [embed],
        components: [row]
      });
    }
  } catch (err) {
    console.error('Catalog button interaction error:', err?.stack || err);
  }
});

// Hook shutdown handlers before login
setupClientShutdown();

// Attempt login and log any failure
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('client.login resolved (login attempt finished)');
  })
  .catch(err => {
    console.error('Discord client failed to login:', err);
    // keep process alive briefly so PM2 logs show the error, then exit if needed
    setTimeout(() => process.exit(1), 2000);
  });
