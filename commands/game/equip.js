// commands/game/equip.js
'use strict';

const { replySuccess, replyError } = require('../../utils/reply');

module.exports = {
  name: 'equip',
  description: 'Equip an inventory item by inventory id',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || (typeof storage.equipWeaponByInventoryId !== 'function' && typeof storage.equipGearByInventoryId !== 'function')) {
      console.error('storage equip helpers are not available in command context');
      return await replyError(message, 'Bot storage is not available. Try again later.', 'Error');
    }

    try {
      const userId = message.author.id;
      const inventoryId = Number.parseInt(args[0], 10);
      const slot = args[1] ? String(args[1]).toLowerCase() : null;

      if (!inventoryId || Number.isNaN(inventoryId) || !slot) {
        return await replyError(message, 'Usage: `.equip <inventoryId> <weapon|gear>`', 'Invalid Usage');
      }
      if (!['weapon', 'gear'].includes(slot)) {
        return await replyError(message, 'Slot must be "weapon" or "gear".', 'Invalid Slot');
      }

      if (slot === 'weapon') {
        const res = await storage.equipWeaponByInventoryId(userId, inventoryId);
        if (!res || res.success === false) {
          console.error('equipWeaponByInventoryId failed:', res && res.error ? res.error : res);
          return await replyError(message, `Failed to equip weapon: ${res && res.error ? res.error : 'unknown error'}`, 'Failed');
        }
        const inv = res.inventory;
        const name = inv && inv.itemName ? inv.itemName : `ID ${inventoryId}`;
        const id = inv && inv.id ? inv.id : inventoryId;
        return await replySuccess(message, `Equipped weapon: **${name}** (ID ${id}).`, 'Equipped');
      } else {
        const res = await storage.equipGearByInventoryId(userId, inventoryId);
        if (!res || res.success === false) {
          console.error('equipGearByInventoryId failed:', res && res.error ? res.error : res);
          return await replyError(message, `Failed to equip gear: ${res && res.error ? res.error : 'unknown error'}`, 'Failed');
        }
        const inv = res.inventory;
        const name = inv && inv.itemName ? inv.itemName : `ID ${inventoryId}`;
        const id = inv && inv.id ? inv.id : inventoryId;
        return await replySuccess(message, `Equipped gear: **${name}** (ID ${id}).`, 'Equipped');
      }
    } catch (err) {
      console.error('equip command error:', err);
      return await replyError(message, `Failed to equip: ${err && err.message ? err.message : 'unexpected error'}`, 'Error');
    }
  }
};