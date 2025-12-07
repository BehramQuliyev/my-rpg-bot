'use strict';

const { replyFromResult } = require('../../utils/reply');

module.exports = {
  name: 'equip',
  description: 'Equip an inventory item by inventory id',
  async execute(message, args = [], context = {}) {
    const { storage } = context;
    if (!storage || typeof storage.equipWeaponByInventoryId !== 'function' && typeof storage.equipGearByInventoryId !== 'function') {
      return replyFromResult(message, { success: false, error: 'Bot storage is not available. Try again later.', reason: 'Error' }, {
        label: 'Equip',
        errorTitle: 'Error'
      });
    }

    try {
      const userId = message.author.id;
      const inventoryId = Number.parseInt(args[0], 10);
      const slot = args[1] ? String(args[1]).toLowerCase() : null;

      if (!inventoryId || Number.isNaN(inventoryId) || !slot) {
        return replyFromResult(message, { success: false, error: 'Usage: `.equip <inventoryId> <weapon|gear>`', reason: 'InvalidInput' }, {
          label: 'Equip',
          errorTitle: 'Invalid Usage'
        });
      }

      if (!['weapon', 'gear'].includes(slot)) {
        return replyFromResult(message, { success: false, error: 'Slot must be "weapon" or "gear".', reason: 'InvalidInput' }, {
          label: 'Equip',
          errorTitle: 'Invalid Slot'
        });
      }

      if (slot === 'weapon') {
        const res = await storage.equipWeaponByInventoryId(userId, inventoryId);
        return replyFromResult(message, res, {
          label: 'Equip weapon',
          successTitle: 'Equipped',
          successDescription: (d) => {
            const inv = d.inventory || {};
            const name = inv.itemName || `ID ${inventoryId}`;
            const id = inv.id ?? inventoryId;
            return `Equipped weapon: **${name}** (ID ${id}).`;
          },
          errorTitle: 'Failed'
        });
      } else {
        const res = await storage.equipGearByInventoryId(userId, inventoryId);
        return replyFromResult(message, res, {
          label: 'Equip gear',
          successTitle: 'Equipped',
          successDescription: (d) => {
            const inv = d.inventory || {};
            const name = inv.itemName || `ID ${inventoryId}`;
            const id = inv.id ?? inventoryId;
            return `Equipped gear: **${name}** (ID ${id}).`;
          },
          errorTitle: 'Failed'
        });
      }
    } catch (err) {
      console.error('equip command error:', err);
      return replyFromResult(message, { success: false, error: err?.message || 'unexpected error', reason: 'Error' }, {
        label: 'Equip',
        errorTitle: 'Error'
      });
    }
  }
};