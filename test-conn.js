// test-conn.js
require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres', logging: false });
(async () => {
  try { await sequelize.authenticate(); console.log('DB OK'); await sequelize.close(); }
  catch (e) { console.error('DB fail', e.message); process.exit(1); }
})();
