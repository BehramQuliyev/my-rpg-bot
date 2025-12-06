// commands/game/equip.js
'use strict';

module.exports = {
  name: 'equip',
  description: 'Equip an inventory item by inventory id',
  /**
   * execute(message, args, context)
   * context: { client, DEV_MODE, storage, config }
   */
  async execute(message, args = [], context = {}) {
    try {
      const { storage } = context;
      if (!storage || (typeof storage.equipWeaponByInventoryId !== 'function' && typeof storage.equipGearByInventoryId !== 'function')) {
        console.error('storage equip helpers are not available in command context');
        return await message.reply('❌ Bot storage is not available. Try again later.');
      }

      const userId = message.author.id;
      const inventoryId = Number.parseInt(args[0], 10);
      const slot = args[1] ? String(args[1]).toLowerCase() : null;

      if (!inventoryId || Number.isNaN(inventoryId) || !slot) {
        return message.reply('Usage: `.equip <inventoryId> <weapon|gear>`');
      }

      if (!['weapon', 'gear'].includes(slot)) {
        return message.reply('Slot must be "weapon" or "gear".');
      }

      if (slot === 'weapon') {
        const res = await storage.equipWeaponByInventoryId(userId, inventoryId);
        if (!res || res.success === false) {
          console.error('equipWeaponByInventoryId failed:', res && res.error ? res.error : res);
          return message.reply(`❌ Failed to equip weapon: ${res && res.error ? res.error : 'unknown error'}`);
        }
        const inv = res.inventory;
        const name = inv && inv.itemName ? inv.itemName : `ID ${inventoryId}`;
        const id = inv && inv.id ? inv.id : inventoryId;
        return message.reply(`✅ Equipped weapon: **${name}** (ID ${id}).`);
      } else {
        const res = await storage.equipGearByInventoryId(userId, inventoryId);
        if (!res || res.success === false) {
          console.error('equipGearByInventoryId failed:', res && res.error ? res.error : res);
          return message.reply(`❌ Failed to equip gear: ${res && res.error ? res.error : 'unknown error'}`);
        }
        const inv = res.inventory;
        const name = inv && inv.itemName ? inv.itemName : `ID ${inventoryId}`;
        const id = inv && inv.id ? inv.id : inventoryId;
        return message.reply(`✅ Equipped gear: **${name}** (ID ${id}).`);
      }
    } catch (err) {
      console.error('equip command error:', err);
      try {
        await message.reply(`❌ Failed to equip: ${err && err.message ? err.message : 'unexpected error'}`);
      } catch (replyErr) {
        console.error('Failed to send error reply:', replyErr);
      }
    }
  }
};
