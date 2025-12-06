// main.js
'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Validate environment early
const { validateEnv } = require('./env-validate');
const envCheck = validateEnv();
if (!envCheck.success) {
  console.error('Environment validation failed:\n', envCheck.errors.join('\n'));
  process.exit(1);
}
const ENV = envCheck.config;

// Import storage (refactored storage.js)
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

// Recursively load command files (skips /admin when DEV_MODE=false)
function loadCommands(folder) {
  for (const entry of fs.readdirSync(folder)) {
    const full = path.join(folder, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      if (!DEV_MODE && entry.toLowerCase() === 'admin') {
        console.log('Skipping admin commands (DEV_MODE=false)');
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

// Graceful shutdown for the Discord client (complements storage.setupGracefulShutdown)
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
      // Ensure storage shutdown hook is invoked (it will close DB)
      if (typeof storage.setupGracefulShutdown === 'function') {
        storage.setupGracefulShutdown();
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

// Wire client ready handler
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag} | DEV_MODE=${DEV_MODE}`);
});

// Message handler: dispatch commands
client.on('messageCreate', async (message) => {
  try {
    if (!message.content || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    // Provide storage, ENV and DEV_MODE to commands so they can call refactored helpers
    await command.execute(message, args, { client, DEV_MODE, storage, config: ENV });
  } catch (error) {
    console.error('Command execution error:', error);
    try {
      if (message && message.channel) await message.reply('❌ There was an error executing that command.');
    } catch (replyErr) {
      console.error('Failed to send error reply:', replyErr);
    }
  }
});

// Start sequence: init DB then login
(async () => {
  try {
    // Initialize DB (safe defaults). Adjust syncOptions as needed.
    const initRes = await storage.initDb({ syncOptions: {} });
    if (!initRes || !initRes.success) {
      console.error('Database initialization failed:', initRes);
      process.exit(1);
    }

    // Hook client shutdown handlers
    setupClientShutdown();

    // Login Discord client using validated token
    const token = ENV.DISCORD_TOKEN;
    if (!token) {
      console.error('DISCORD_TOKEN not set in environment');
      process.exit(1);
    }

    await client.login(token);
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
})();
