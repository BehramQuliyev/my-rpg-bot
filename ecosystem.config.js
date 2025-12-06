module.exports = {
  apps: [
    {
      name: 'my-rpg-bot',
      script: './main.js',
      cwd: __dirname,
      watch: ['commands', 'utils', 'general', 'game', 'main.js', 'config.js'],
      ignore_watch: ['node_modules', '.git', 'logs', '.env'],
      watch_delay: 1000,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};