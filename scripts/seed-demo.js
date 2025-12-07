// scripts/seed-demo.js
const storage = require('../utils/storage');

async function seed() {
  await storage.initDatabase();
  // create demo player
  await storage.giveWeapon('demo-user', 'w1', 1);
  await storage.giveGear('demo-user', 'g1', 1);
  await storage.adminAdjustCurrency('system', 'demo-user', { bronze: 500, silver: 200, gems: 5 });
  console.log('Seed complete');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
