// scripts/grant-starters.js
const storage = require('../utils/storage');

async function run() {
  await storage.initDatabase();

  const PlayerModel = storage.sequelize.models.Player;
  const players = await PlayerModel.findAll({ attributes: ['userId'] });

  for (const p of players) {
    const userId = p.userId;
    const wRes = await storage.getWeapons(userId);
    const gRes = await storage.getGear(userId);
    const hasWeapon = wRes.success && (wRes.data.items || []).length > 0;
    const hasGear = gRes.success && (gRes.data.items || []).length > 0;

    if (!hasWeapon || !hasGear) {
      console.log('Granting starters to', userId);
      if (!hasWeapon) {
        const giveW = await storage.giveWeapon(userId, 'w0', 1);
        // try to equip the newly created or existing row
        const wId = giveW.success && giveW.data && giveW.data.inventory ? giveW.data.inventory.id : null;
        if (wId) await storage.equipWeaponByInventoryId(userId, wId);
        else {
          const row = await storage.sequelize.models.Inventory.findOne({ where: { userId, itemType: 'weapon', catalogId: 'w0' } });
          if (row) await storage.equipWeaponByInventoryId(userId, row.id);
        }
      }
      if (!hasGear) {
        const giveG = await storage.giveGear(userId, 'g0', 1);
        const gId = giveG.success && giveG.data && giveG.data.inventory ? giveG.data.inventory.id : null;
        if (gId) await storage.equipGearByInventoryId(userId, gId);
        else {
          const row = await storage.sequelize.models.Inventory.findOne({ where: { userId, itemType: 'gear', catalogId: 'g0' } });
          if (row) await storage.equipGearByInventoryId(userId, row.id);
        }
      }
    }
  }

  console.log('Starter grant migration complete');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
