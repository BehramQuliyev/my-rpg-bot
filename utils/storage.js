'use strict';

/**
 * storage.js
 * Single-file refactor: models, catalogs, helpers, inventory ops, hunt, daily/work, admin, export, DB init.
 *
 * Requirements:
 *  - Set DATABASE_URL in environment
 *  - Sequelize and pg installed
 *
 * This file provides a consistent helper API used by command handlers.
 */

const { Sequelize, DataTypes, Op } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});

/* ======================
   Configuration constants
   ====================== */

const DAILY_BASE_BRONZE = 50;
const DAILY_STREAK_BONUS = 5;
const DAILY_COOLDOWN_SECONDS = 24 * 60 * 60;
const DAILY_STREAK_WINDOW_SECONDS = 48 * 60 * 60;

const WORK_DURATION_SECONDS = 9 * 60 * 60;
const WORK_COOLDOWN_AFTER_COLLECT_SECONDS = 3 * 60 * 60;
const WORK_REWARD_SILVER = 100;
const WORK_STREAK_WINDOW_SECONDS = 48 * 60 * 60;
const WORK_STREAK_BONUS_PER_DAY = 5;
const WORK_STREAK_BONUS_CAP_DAYS = 30;

const DEFAULT_HUNT_COOLDOWN_SECONDS = 60;

/* ======================
   Models
   ====================== */

const Player = sequelize.define('Player', {
  userId: { type: DataTypes.STRING, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: true },
  displayName: { type: DataTypes.STRING, allowNull: true },
  bronze: { type: DataTypes.INTEGER, defaultValue: 0 },
  silver: { type: DataTypes.INTEGER, defaultValue: 0 },
  gold: { type: DataTypes.INTEGER, defaultValue: 0 },
  gems: { type: DataTypes.INTEGER, defaultValue: 0 },
  prestige: { type: DataTypes.INTEGER, defaultValue: 0 },
  equippedWeaponInvId: { type: DataTypes.INTEGER, allowNull: true },
  equippedGearInvId: { type: DataTypes.INTEGER, allowNull: true },
  workStreak: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastWorkCollectedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  indexes: [{ fields: ['email'] }, { fields: ['displayName'] }],
  timestamps: true
});

const Inventory = sequelize.define('Inventory', {
  userId: { type: DataTypes.STRING, allowNull: false },
  itemType: { type: DataTypes.STRING, allowNull: false }, // 'gear' or 'weapon'
  catalogId: { type: DataTypes.STRING, allowNull: false },
  tier: { type: DataTypes.INTEGER },
  rarity: { type: DataTypes.STRING },
  itemName: { type: DataTypes.STRING },
  attack: { type: DataTypes.INTEGER, defaultValue: 0 },
  defense: { type: DataTypes.INTEGER, defaultValue: 0 },
  count: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  indexes: [
    { unique: true, fields: ['userId', 'catalogId', 'itemType'] },
    { fields: ['userId'] },
    { fields: ['itemType'] },
    { fields: ['catalogId'] }
  ],
  timestamps: true
});

const HuntRecord = sequelize.define('HuntRecord', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  kills: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  indexes: [
    { unique: true, fields: ['userId', 'monsterTier'] },
    { fields: ['userId'] },
    { fields: ['monsterTier'] }
  ],
  timestamps: true
});

const HuntCooldown = sequelize.define('HuntCooldown', {
  userId: { type: DataTypes.STRING },
  monsterTier: { type: DataTypes.INTEGER },
  lastHuntAt: { type: DataTypes.DATE }
}, {
  indexes: [{ fields: ['userId'] }, { fields: ['monsterTier'] }],
  timestamps: true
});

const Auction = sequelize.define('Auction', {
  auctionId: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sellerId: { type: DataTypes.STRING },
  itemName: { type: DataTypes.STRING },
  startingBid: { type: DataTypes.INTEGER },
  highestBid: { type: DataTypes.INTEGER, defaultValue: 0 },
  highestBidder: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true });

const DailyClaim = sequelize.define('DailyClaim', {
  userId: { type: DataTypes.STRING, primaryKey: true },
  lastClaimAt: { type: DataTypes.DATE, allowNull: true },
  streak: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { indexes: [{ fields: ['userId'] }], timestamps: true });

const WorkSession = sequelize.define('WorkSession', {
  userId: { type: DataTypes.STRING },
  startedAt: { type: DataTypes.DATE },
  finishAt: { type: DataTypes.DATE },
  collectedAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'working' } // working | finished | collected | cancelled
}, { indexes: [{ fields: ['userId'] }], timestamps: true });

const ServerAdmin = sequelize.define('ServerAdmin', {
  serverId: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'admin' }
}, {
  indexes: [
    { fields: ['serverId'] },
    { fields: ['userId'] },
    { unique: true, fields: ['serverId', 'userId'] }
  ],
  timestamps: true
});

/* ======================
   Catalogs
   ====================== */

const weapons = [
  { id: 'hands', name: 'Hands', tier: 0, rarity: 'Brown', attack: 1 },
  { id: 'rustySword', name: 'Rusty Sword', tier: 1, rarity: 'Common', attack: 5 },
  { id: 'woodenSpear', name: 'Wooden Spear', tier: 1, rarity: 'Common', attack: 5 },
  { id: 'stoneAxe', name: 'Stone Axe', tier: 1, rarity: 'Common', attack: 6 },
  { id: 'shortBow', name: 'Short Bow', tier: 1, rarity: 'Common', attack: 5 },
  { id: 'crudeHammer', name: 'Crude Hammer', tier: 1, rarity: 'Common', attack: 6 },
  { id: 'ironDagger', name: 'Iron Dagger', tier: 2, rarity: 'Common', attack: 8 },
  { id: 'ironShortsword', name: 'Iron Shortsword', tier: 2, rarity: 'Common', attack: 9 },
  { id: 'ironHatchet', name: 'Iron Hatchet', tier: 2, rarity: 'Common', attack: 9 },
  { id: 'basicLongbow', name: 'Basic Longbow', tier: 2, rarity: 'Common', attack: 10 },
  { id: 'ironMace', name: 'Iron Mace', tier: 2, rarity: 'Common', attack: 10 },
  { id: 'steelSword', name: 'Steel Sword', tier: 3, rarity: 'Uncommon', attack: 14 },
  { id: 'steelGreatsword', name: 'Steel Greatsword', tier: 3, rarity: 'Uncommon', attack: 16 },
  { id: 'steelAxe', name: 'Steel Axe', tier: 3, rarity: 'Uncommon', attack: 14 },
  { id: 'steelSpear', name: 'Steel Spear', tier: 3, rarity: 'Uncommon', attack: 15 },
  { id: 'reinforcedBow', name: 'Reinforced Bow', tier: 3, rarity: 'Uncommon', attack: 15 },
  { id: 'steelWarhammer', name: 'Steel Warhammer', tier: 3, rarity: 'Uncommon', attack: 16 },
  { id: 'steelLongbow', name: 'Steel Longbow', tier: 4, rarity: 'Uncommon', attack: 17 },
  { id: 'steelPike', name: 'Steel Pike', tier: 4, rarity: 'Uncommon', attack: 17 },
  { id: 'curvedSteelDaggers', name: 'Curved Steel Daggers', tier: 4, rarity: 'Uncommon', attack: 16 },
  { id: 'heavySteelMace', name: 'Heavy Steel Mace', tier: 4, rarity: 'Uncommon', attack: 18 },
  { id: 'crossbow', name: 'Crossbow', tier: 4, rarity: 'Uncommon', attack: 18 },
  { id: 'knightSword', name: 'Knight Sword', tier: 5, rarity: 'Rare', attack: 22 },
  { id: 'crusaderGreatsword', name: 'Crusader Greatsword', tier: 5, rarity: 'Rare', attack: 24 },
  { id: 'warAxe', name: 'War Axe', tier: 5, rarity: 'Rare', attack: 23 },
  { id: 'compositeBow', name: 'Composite Bow', tier: 5, rarity: 'Rare', attack: 22 },
  { id: 'steelPolearm', name: 'Steel Polearm', tier: 5, rarity: 'Rare', attack: 23 },
  { id: 'warhammerValor', name: 'Warhammer of Valor', tier: 5, rarity: 'Rare', attack: 24 },
  { id: 'dragonfangSword', name: 'Dragonfang Sword', tier: 6, rarity: 'Rare', attack: 28 },
  { id: 'dragonboneGreataxe', name: 'Dragonbone Greataxe', tier: 6, rarity: 'Rare', attack: 30 },
  { id: 'reinforcedSpear', name: 'Reinforced Spear', tier: 6, rarity: 'Rare', attack: 28 },
  { id: 'laminatedLongbow', name: 'Laminated Longbow', tier: 6, rarity: 'Rare', attack: 29 },
  { id: 'dragonboneMace', name: 'Dragonbone Mace', tier: 6, rarity: 'Rare', attack: 30 },
  { id: 'katana', name: 'Katana', tier: 7, rarity: 'Epic', attack: 34 },
  { id: 'forgedGreatsword', name: 'Forged Greatsword', tier: 7, rarity: 'Epic', attack: 36 },
  { id: 'doubleAxe', name: 'Double-Edged Axe', tier: 7, rarity: 'Epic', attack: 35 },
  { id: 'heavyCrossbow', name: 'Heavy Crossbow', tier: 7, rarity: 'Epic', attack: 34 },
  { id: 'balancedSpear', name: 'Balanced Spear', tier: 7, rarity: 'Epic', attack: 35 },
  { id: 'forgedMace', name: 'Forged Steel Mace', tier: 7, rarity: 'Epic', attack: 36 },
  { id: 'phoenixBlade', name: 'Phoenix Blade', tier: 8, rarity: 'Epic', attack: 40 },
  { id: 'alloyGreataxe', name: 'Alloy Greataxe', tier: 8, rarity: 'Epic', attack: 42 },
  { id: 'precisionPike', name: 'Precision Pike', tier: 8, rarity: 'Epic', attack: 41 },
  { id: 'compositeBowMkII', name: 'Composite Bow Mk II', tier: 8, rarity: 'Epic', attack: 40 },
  { id: 'alloyWarhammer', name: 'Alloy Warhammer', tier: 8, rarity: 'Epic', attack: 42 },
  { id: 'excalibur', name: 'Hero’s Excalibur', tier: 9, rarity: 'Legendary', attack: 48 },
  { id: 'runedGreatsword', name: 'Runed Greatsword', tier: 9, rarity: 'Legendary', attack: 50 },
  { id: 'celestialBow', name: 'Celestial Bow', tier: 9, rarity: 'Legendary', attack: 48 },
  { id: 'shadowfangDaggers', name: 'Shadowfang Daggers', tier: 9, rarity: 'Legendary', attack: 47 },
  { id: 'titanWarhammer', name: 'Titan Warhammer', tier: 9, rarity: 'Legendary', attack: 50 },
  { id: 'sunforgedBlade', name: 'Sunforged Blade', tier: 10, rarity: 'Legendary', attack: 55 },
  { id: 'eternalFlameSword', name: 'Eternal Flame Sword', tier: 10, rarity: 'Legendary', attack: 57 },
  { id: 'cosmicEdge', name: 'Cosmic Edge', tier: 10, rarity: 'Legendary', attack: 58 },
  { id: 'starbreakerBow', name: 'Starbreaker Bow', tier: 10, rarity: 'Legendary', attack: 55 },
  { id: 'kingsWarhammer', name: 'King’s Warhammer', tier: 10, rarity: 'Legendary', attack: 57 },
  { id: 'bladeOfEternity', name: 'Blade of Eternity', tier: 11, rarity: 'Mystical', attack: 70 },
  { id: 'spearOfCosmos', name: 'Spear of the Cosmos', tier: 11, rarity: 'Mystical', attack: 72 },
  { id: 'staffOfInfinity', name: 'Staff of Infinity', tier: 11, rarity: 'Mystical', attack: 72 },
  { id: 'phoenixGodBow', name: 'Bow of the Phoenix God', tier: 11, rarity: 'Mystical', attack: 70 },
  { id: 'warhammerOfTitans', name: 'Warhammer of Titans', tier: 11, rarity: 'Mystical', attack: 74 },
  { id: 'daggersOfTime', name: 'Daggers of Time', tier: 11, rarity: 'Mystical', attack: 68 }
];

const gear = [
  { id: 'pants', name: 'Pants', tier: 0, rarity: 'Brown', defense: 0 },
  { id: 'leatherVest', name: 'Leather Vest', tier: 1, rarity: 'Common', defense: 5 },
  { id: 'clothTunic', name: 'Cloth Tunic', tier: 1, rarity: 'Common', defense: 4 },
  { id: 'bronzeChestplate', name: 'Bronze Chestplate', tier: 1, rarity: 'Common', defense: 5 },
  { id: 'travelerCloak', name: 'Traveler’s Cloak', tier: 1, rarity: 'Common', defense: 4 },
  { id: 'apprenticeRobes', name: 'Apprentice Robes', tier: 1, rarity: 'Common', defense: 4 },
  { id: 'initiatePlate', name: 'Initiate Plate', tier: 1, rarity: 'Common', defense: 5 },
  { id: 'ironVest', name: 'Iron Vest', tier: 2, rarity: 'Common', defense: 8 },
  { id: 'ironChainShirt', name: 'Iron Chain Shirt', tier: 2, rarity: 'Common', defense: 9 },
  { id: 'ironChestplate', name: 'Iron Chestplate', tier: 2, rarity: 'Common', defense: 10 },
  { id: 'scoutCloak', name: 'Scout Cloak', tier: 2, rarity: 'Common', defense: 8 },
  { id: 'adeptRobes', name: 'Adept Robes', tier: 2, rarity: 'Common', defense: 9 },
  { id: 'ironPlate', name: 'Iron Plate', tier: 2, rarity: 'Common', defense: 10 },
  { id: 'steelVest', name: 'Steel Vest', tier: 3, rarity: 'Uncommon', defense: 14 },
  { id: 'steelChainmail', name: 'Steel Chainmail', tier: 3, rarity: 'Uncommon', defense: 15 },
  { id: 'steelChestplate', name: 'Steel Chestplate', tier: 3, rarity: 'Uncommon', defense: 16 },
  { id: 'rangerCloak', name: 'Ranger Cloak', tier: 3, rarity: 'Uncommon', defense: 13 },
  { id: 'battleRobes', name: 'Battle Robes', tier: 3, rarity: 'Uncommon', defense: 14 },
  { id: 'steelPlate', name: 'Steel Plate', tier: 3, rarity: 'Uncommon', defense: 16 },
  { id: 'reinforcedSteelVest', name: 'Reinforced Steel Vest', tier: 4, rarity: 'Uncommon', defense: 17 },
  { id: 'steelChainmailCoat', name: 'Steel Chainmail Coat', tier: 4, rarity: 'Uncommon', defense: 18 },
  { id: 'steelBreastplate', name: 'Steel Breastplate', tier: 4, rarity: 'Uncommon', defense: 19 },
  { id: 'scoutRangerCloak', name: 'Scout Ranger Cloak', tier: 4, rarity: 'Uncommon', defense: 16 },
  { id: 'reinforcedRobes', name: 'Reinforced Robes', tier: 4, rarity: 'Uncommon', defense: 17 },
  { id: 'crusaderPlate', name: 'Crusader Plate', tier: 4, rarity: 'Uncommon', defense: 19 },
  { id: 'knightArmor', name: 'Knight Armor', tier: 5, rarity: 'Rare', defense: 22 },
  { id: 'crusaderChainmail', name: 'Crusader Chainmail', tier: 5, rarity: 'Rare', defense: 23 },
  { id: 'heavySteelPlate', name: 'Heavy Steel Plate', tier: 5, rarity: 'Rare', defense: 24 },
  { id: 'rangersCloak', name: 'Ranger’s Cloak', tier: 5, rarity: 'Rare', defense: 21 },
  { id: 'warRobes', name: 'War Robes', tier: 5, rarity: 'Rare', defense: 22 },
  { id: 'valorPlate', name: 'Valor Plate', tier: 5, rarity: 'Rare', defense: 24 },
  { id: 'dragonhideArmor', name: 'Dragonhide Armor', tier: 6, rarity: 'Rare', defense: 28 },
  { id: 'reinforcedChainmail', name: 'Reinforced Chainmail', tier: 6, rarity: 'Rare', defense: 29 },
  { id: 'dragonbonePlate', name: 'Dragonbone Plate', tier: 6, rarity: 'Rare', defense: 30 },
  { id: 'eliteCloak', name: 'Elite Cloak', tier: 6, rarity: 'Rare', defense: 27 },
  { id: 'arcaneRobes', name: 'Arcane Robes', tier: 6, rarity: 'Rare', defense: 28 },
  { id: 'dragonPlate', name: 'Dragon Plate', tier: 6, rarity: 'Rare', defense: 30 },
  { id: 'forgedSteelArmor', name: 'Forged Steel Armor', tier: 7, rarity: 'Epic', defense: 34 },
  { id: 'doubleLayerChainmail', name: 'Double-Layer Chainmail', tier: 7, rarity: 'Epic', defense: 35 },
  { id: 'forgedPlate', name: 'Forged Plate', tier: 7, rarity: 'Epic', defense: 36 },
  { id: 'epicCloak', name: 'Epic Cloak', tier: 7, rarity: 'Epic', defense: 33 },
  { id: 'epicBattleRobes', name: 'Epic Battle Robes', tier: 7, rarity: 'Epic', defense: 34 },
  { id: 'forgedWarPlate', name: 'Forged War Plate', tier: 7, rarity: 'Epic', defense: 36 },
  { id: 'alloyArmor', name: 'Alloy Armor', tier: 8, rarity: 'Epic', defense: 40 },
  { id: 'alloyChainmail', name: 'Alloy Chainmail', tier: 8, rarity: 'Epic', defense: 41 },
  { id: 'alloyPlate', name: 'Alloy Plate', tier: 8, rarity: 'Epic', defense: 42 },
  { id: 'epicRangerCloak', name: 'Epic Ranger Cloak', tier: 8, rarity: 'Epic', defense: 39 },
  { id: 'epicMageRobes', name: 'Epic Mage Robes', tier: 8, rarity: 'Epic', defense: 40 },
  { id: 'alloyWarPlate', name: 'Alloy War Plate', tier: 8, rarity: 'Epic', defense: 42 },
  { id: 'excaliburArmor', name: 'Excalibur Armor', tier: 9, rarity: 'Legendary', defense: 48 },
  { id: 'runedChainmail', name: 'Runed Chainmail', tier: 9, rarity: 'Legendary', defense: 49 },
  { id: 'celestialPlate', name: 'Celestial Plate', tier: 9, rarity: 'Legendary', defense: 50 },
  { id: 'legendaryCloak', name: 'Legendary Cloak', tier: 9, rarity: 'Legendary', defense: 47 },
  { id: 'celestialRobes', name: 'Celestial Robes', tier: 9, rarity: 'Legendary', defense: 48 },
  { id: 'titanPlate', name: 'Titan Plate', tier: 9, rarity: 'Legendary', defense: 50 },
  { id: 'sunforgedArmor', name: 'Sunforged Armor', tier: 10, rarity: 'Legendary', defense: 55 },
  { id: 'eternalChainmail', name: 'Eternal Chainmail', tier: 10, rarity: 'Legendary', defense: 56 },
  { id: 'cosmicPlate', name: 'Cosmic Plate', tier: 10, rarity: 'Legendary', defense: 57 },
  { id: 'legendaryCloakMkII', name: 'Legendary Cloak Mk II', tier: 10, rarity: 'Legendary', defense: 54 },
  { id: 'eternalRobes', name: 'Eternal Robes', tier: 10, rarity: 'Legendary', defense: 55 },
  { id: 'kingsPlate', name: 'King’s Plate', tier: 10, rarity: 'Legendary', defense: 57 },
  { id: 'armorOfEternity', name: 'Armor of Eternity', tier: 11, rarity: 'Mystical', defense: 70 },
  { id: 'chainmailOfInfinity', name: 'Chainmail of Infinity', tier: 11, rarity: 'Mystical', defense: 71 },
  { id: 'plateOfCosmos', name: 'Plate of Cosmos', tier: 11, rarity: 'Mystical', defense: 72 },
  { id: 'cloakOfTime', name: 'Cloak of Time', tier: 11, rarity: 'Mystical', defense: 69 },
  { id: 'robesOfInfinity', name: 'Robes of Infinity', tier: 11, rarity: 'Mystical', defense: 70 },
  { id: 'warPlateOfTitans', name: 'War Plate of Titans', tier: 11, rarity: 'Mystical', defense: 74 }
];

const monsters = [
  { id: 'slime', name: 'Slime', tier: 0, threshold: 1, gems: 1 },
  { id: 'rat', name: 'Sewer Rat', tier: 0, threshold: 2, gems: 1 },
  { id: 'goblin', name: 'Goblin', tier: 1, threshold: 5, gems: 2 },
  { id: 'skeleton', name: 'Skeleton', tier: 1, threshold: 6, gems: 2 },
  { id: 'zombie', name: 'Zombie', tier: 2, threshold: 10, gems: 3 },
  { id: 'bandit', name: 'Bandit', tier: 2, threshold: 12, gems: 3 },
  { id: 'orc', name: 'Orc', tier: 3, threshold: 16, gems: 4 },
  { id: 'ogre', name: 'Ogre', tier: 3, threshold: 18, gems: 4 },
  { id: 'troll', name: 'Troll', tier: 4, threshold: 22, gems: 5 },
  { id: 'harpy', name: 'Harpy', tier: 4, threshold: 24, gems: 5 },
  { id: 'wyvern', name: 'Wyvern', tier: 5, threshold: 28, gems: 6 },
  { id: 'basilisk', name: 'Basilisk', tier: 5, threshold: 30, gems: 6 },
  { id: 'golem', name: 'Stone Golem', tier: 6, threshold: 34, gems: 8 },
  { id: 'banshee', name: 'Banshee', tier: 6, threshold: 36, gems: 8 },
  { id: 'vampire', name: 'Vampire', tier: 7, threshold: 40, gems: 10 },
  { id: 'werewolf', name: 'Werewolf', tier: 7, threshold: 42, gems: 10 },
  { id: 'lich', name: 'Lich', tier: 8, threshold: 46, gems: 12 },
  { id: 'chimera', name: 'Chimera', tier: 8, threshold: 48, gems: 12 },
  { id: 'dragon', name: 'Dragon', tier: 9, threshold: 52, gems: 15 },
  { id: 'hydra', name: 'Hydra', tier: 9, threshold: 54, gems: 15 },
  { id: 'phoenix', name: 'Phoenix', tier: 10, threshold: 58, gems: 18 },
  { id: 'leviathan', name: 'Leviathan', tier: 10, threshold: 60, gems: 18 },
  { id: 'titan', name: 'Titan', tier: 11, threshold: 65, gems: 20 },
  { id: 'voidbeast', name: 'Void Beast', tier: 11, threshold: 70, gems: 25 }
];

/* ======================
   Lookup helpers
   ====================== */

function getWeaponById(id) {
  return weapons.find(w => w.id === id) || null;
}
function getGearById(id) {
  return gear.find(g => g.id === id) || null;
}
function getMonsterById(id) {
  return monsters.find(m => m.id === id) || null;
}
function getMonstersByTier(tier) {
  return monsters.filter(m => m.tier === tier);
}

/* ======================
   Tier index helpers
   ====================== */

function buildTierIndex(monstersList = []) {
  try {
    if (!Array.isArray(monstersList) || monstersList.length === 0) {
      return { success: true, index: { tiers: [], tiersMap: {}, minThresholdByTier: {} } };
    }
    const tiersMap = {};
    for (const m of monstersList) {
      const t = Number(m.tier) || 0;
      tiersMap[t] = tiersMap[t] || [];
      tiersMap[t].push(m);
    }
    const tiers = Object.keys(tiersMap).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    const minThresholdByTier = {};
    for (const t of tiers) {
      const arr = tiersMap[t];
      const thresholds = arr.map(x => Number(x.threshold) || 0);
      minThresholdByTier[t] = thresholds.length ? Math.min(...thresholds) : 0;
    }
    return { success: true, index: { tiers, tiersMap, minThresholdByTier } };
  } catch (err) {
    console.error('buildTierIndex failed:', err);
    return { success: false, error: err.message || 'Index build failed' };
  }
}

let _monsterIndexCache = null;
function refreshMonsterIndex(monstersList = monsters) {
  const res = buildTierIndex(monstersList);
  if (res.success) {
    _monsterIndexCache = res.index;
    return { success: true, index: _monsterIndexCache };
  }
  return res;
}

function getBestTier(power, monstersList = monsters, index = null) {
  try {
    const p = Number(power) || 0;
    const list = Array.isArray(monstersList) ? monstersList : [];
    if ((!index || Object.keys(index).length === 0) && _monsterIndexCache) index = _monsterIndexCache;
    const idx = index || buildTierIndex(list).index;
    if (!idx || !Array.isArray(idx.tiers) || idx.tiers.length === 0) return { success: true, tier: 0, monsters: [] };
    let best = 0;
    for (const t of idx.tiers) {
      const minThreshold = Number(idx.minThresholdByTier[t] || 0);
      if (p >= minThreshold) best = t;
      else break;
    }
    const resultMonsters = Array.isArray(idx.tiersMap[best]) ? [...idx.tiersMap[best]] : [];
    resultMonsters.sort((a, b) => (Number(a.threshold) - Number(b.threshold)) || (a.id - b.id));
    return { success: true, tier: best, monsters: resultMonsters };
  } catch (err) {
    console.error('getBestTier failed:', err);
    return { success: false, error: err.message || 'getBestTier error' };
  }
}

function getEligibleMonsters(power, monstersList = monsters, index = null) {
  try {
    const p = Number(power) || 0;
    const list = Array.isArray(monstersList) ? monstersList : [];
    if ((!index || Object.keys(index).length === 0) && _monsterIndexCache) index = _monsterIndexCache;
    const idx = index || buildTierIndex(list).index;
    if (!idx || !Array.isArray(idx.tiers) || idx.tiers.length === 0) return { success: true, eligible: {} };
    const out = {};
    for (const t of idx.tiers) {
      const arr = (idx.tiersMap[t] || []).filter(m => (Number(m.threshold) || 0) <= p);
      if (arr.length > 0) {
        arr.sort((a, b) => (Number(a.threshold) - Number(b.threshold)) || (a.id - b.id));
        out[t] = arr;
      }
    }
    return { success: true, eligible: out };
  } catch (err) {
    console.error('getEligibleMonsters failed:', err);
    return { success: false, error: err.message || 'getEligibleMonsters error' };
  }
}

/* ======================
   Base helpers
   ====================== */

async function ensurePlayer(userId, opts = {}) {
  try {
    let player = await Player.findByPk(userId);
    if (!player) {
      player = await Player.create({
        userId,
        email: opts.email || null,
        displayName: opts.displayName || null
      });
    }
    return { success: true, player };
  } catch (err) {
    console.error('Failed to ensure player:', err);
    return { success: false, error: err.message };
  }
}

async function ensurePlayerOrThrow(userId, opts = {}) {
  const res = await ensurePlayer(userId, opts);
  if (!res || !res.success) throw new Error(res && res.error ? res.error : 'Failed to load player');
  return res.player;
}

async function getBalance(userId) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.player;
    return { success: true, balance: { bronze: player.bronze, silver: player.silver, gold: player.gold, gems: player.gems } };
  } catch (err) {
    console.error('Failed to get balance:', err);
    return { success: false, error: err.message };
  }
}

async function addCurrency(userId, type, amount) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.player;
    if (player[type] !== undefined) {
      player[type] += amount;
      await player.save();
      return { success: true, newValue: player[type] };
    }
    return { success: false, error: 'Invalid currency type' };
  } catch (err) {
    console.error('Failed to add currency:', err);
    return { success: false, error: err.message };
  }
}

async function adjustCurrency(userId, deltas = {}) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.player;
    const allowed = ['bronze', 'silver', 'gold', 'gems'];
    for (const k of Object.keys(deltas)) {
      if (!allowed.includes(k)) continue;
      player[k] = Math.max(0, (player[k] || 0) + deltas[k]);
    }
    await player.save();
    return { success: true, balance: { bronze: player.bronze, silver: player.silver, gold: player.gold, gems: player.gems } };
  } catch (err) {
    console.error('Failed to adjust currency:', err);
    return { success: false, error: err.message };
  }
}

async function addPrestige(userId) {
  try {
    const res = await ensurePlayer(userId);
    if (!res.success) return res;
    const player = res.player;
    player.prestige += 1;
    await player.save();
    return { success: true, prestige: player.prestige };
  } catch (err) {
    console.error('Failed to add prestige:', err);
    return { success: false, error: err.message };
  }
}

/* ======================
   ServerAdmin helpers
   ====================== */

async function addServerAdmin(serverId, userId, role = 'admin') {
  if (!serverId || !userId) return { success: false, error: 'serverId and userId required' };
  try {
    const [rec, created] = await ServerAdmin.findOrCreate({
      where: { serverId, userId },
      defaults: { serverId, userId, role }
    });
    if (!created && rec.role !== role) {
      rec.role = role;
      await rec.save();
    }
    return { success: true, rec };
  } catch (err) {
    console.error('Failed to add server admin:', err);
    return { success: false, error: err.message };
  }
}

async function removeServerAdmin(serverId, userId) {
  if (!serverId || !userId) return { success: false, error: 'serverId and userId required' };
  try {
    const deleted = await ServerAdmin.destroy({ where: { serverId, userId } });
    return { success: true, removed: deleted > 0 };
  } catch (err) {
    console.error('Failed to remove server admin:', err);
    return { success: false, error: err.message };
  }
}

async function listServerAdmins(serverId) {
  if (!serverId) return { success: false, error: 'serverId required' };
  try {
    const rows = await ServerAdmin.findAll({ where: { serverId }, order: [['createdAt', 'ASC']] });
    const admins = rows.map(r => ({ userId: r.userId, role: r.role, createdAt: r.createdAt }));
    return { success: true, admins };
  } catch (err) {
    console.error('Failed to list server admins:', err);
    return { success: false, error: err.message };
  }
}

async function isServerAdmin(serverId, userId) {
  if (!serverId || !userId) return { success: true, isAdmin: false };
  try {
    const rec = await ServerAdmin.findOne({ where: { serverId, userId } });
    return { success: true, isAdmin: !!rec };
  } catch (err) {
    console.error('Failed to check server admin:', err);
    return { success: false, error: err.message, isAdmin: false };
  }
}

/* ======================
   Inventory operations (stacking)
   ====================== */

async function giveWeapon(userId, weaponId, qty = 1) {
  try {
    if (!userId || !weaponId) return { success: false, error: 'userId and weaponId required' };
    const weapon = getWeaponById(weaponId);
    if (!weapon) return { success: false, error: 'Weapon not found in catalog' };
    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'weapon', catalogId: weapon.id },
        transaction: t
      });
      if (existing) {
        existing.count += qty;
        await existing.save({ transaction: t });
        inv = existing;
        return;
      }
      inv = await Inventory.create({
        userId,
        itemType: 'weapon',
        catalogId: weapon.id,
        tier: weapon.tier,
        rarity: weapon.rarity,
        itemName: weapon.name,
        attack: weapon.attack,
        defense: 0,
        count: qty
      }, { transaction: t });
    });

    return { success: true, inventory: inv };
  } catch (err) {
    console.error('giveWeapon failed:', err);
    return { success: false, error: err.message || 'Database error' };
  }
}

async function giveGear(userId, gearId, qty = 1) {
  try {
    if (!userId || !gearId) return { success: false, error: 'userId and gearId required' };
    const item = getGearById(gearId);
    if (!item) return { success: false, error: 'Gear not found in catalog' };
    const ensureRes = await ensurePlayer(userId);
    if (!ensureRes.success) return ensureRes;

    let inv;
    await sequelize.transaction(async (t) => {
      const existing = await Inventory.findOne({
        where: { userId, itemType: 'gear', catalogId: item.id },
        transaction: t
      });
      if (existing) {
        existing.count += qty;
        await existing.save({ transaction: t });
        inv = existing;
        return;
      }
      inv = await Inventory.create({
        userId,
        itemType: 'gear',
        catalogId: item.id,
        tier: item.tier,
        rarity: item.rarity,
        itemName: item.name,
        attack: 0,
        defense: item.defense,
        count: qty
      }, { transaction: t });
    });

    return { success: true, inventory: inv };
  } catch (err) {
    console.error('giveGear failed:', err);
    return { success: false, error: err.message || 'Database error' };
  }
}

async function getWeapons(userId) {
  try {
    if (!userId) return { success: false, error: 'userId required' };
    const rows = await Inventory.findAll({ where: { userId, itemType: 'weapon' } });
    return { success: true, items: rows };
  } catch (err) {
    console.error('getWeapons failed:', err);
    return { success: false, error: err.message };
  }
}

async function getGear(userId) {
  try {
    if (!userId) return { success: false, error: 'userId required' };
    const rows = await Inventory.findAll({ where: { userId, itemType: 'gear' } });
    return { success: true, items: rows };
  } catch (err) {
    console.error('getGear failed:', err);
    return { success: false, error: err.message };
  }
}

async function removeInventoryCount(inventoryId, qty = 1) {
  try {
    if (!inventoryId) return { success: false, error: 'inventoryId required' };
    if (qty <= 0) return { success: false, error: 'qty must be positive' };

    let resultInv = null;
    await sequelize.transaction(async (t) => {
      const inv = await Inventory.findByPk(inventoryId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!inv) throw new Error('Inventory row not found');
      if (inv.count < qty) throw new Error('Not enough items to remove');
      inv.count -= qty;
      if (inv.count <= 0) {
        await inv.destroy({ transaction: t });
        resultInv = null;
      } else {
        await inv.save({ transaction: t });
        resultInv = inv;
      }
    });

    return { success: true, inventory: resultInv };
  } catch (err) {
    console.error('removeInventoryCount failed:', err);
    return { success: false, error: err.message || 'Database error' };
  }
}

/* ======================
   Equip helpers
   ====================== */

async function equipWeaponByInventoryId(userId, inventoryId) {
  try {
    if (!userId || !inventoryId) return { success: false, error: 'userId and inventoryId required' };
    const inv = await Inventory.findByPk(inventoryId);
    if (!inv) return { success: false, error: 'Inventory not found' };
    if (inv.userId !== userId) return { success: false, error: 'Inventory does not belong to user' };
    if (inv.itemType !== 'weapon') return { success: false, error: 'Inventory is not a weapon' };

    const playerRes = await ensurePlayer(userId);
    if (!playerRes.success) return playerRes;
    const player = playerRes.player;
    player.equippedWeaponInvId = inv.id;
    await player.save();
    return { success: true, inventory: inv };
  } catch (err) {
    console.error('equipWeaponByInventoryId failed:', err);
    return { success: false, error: err.message || 'Database error' };
  }
}

async function equipGearByInventoryId(userId, inventoryId) {
  try {
    if (!userId || !inventoryId) return { success: false, error: 'userId and inventoryId required' };
    const inv = await Inventory.findByPk(inventoryId);
    if (!inv) return { success: false, error: 'Inventory not found' };
    if (inv.userId !== userId) return { success: false, error: 'Inventory does not belong to user' };
    if (inv.itemType !== 'gear') return { success: false, error: 'Inventory is not gear' };

    const playerRes = await ensurePlayer(userId);
    if (!playerRes.success) return playerRes;
    const player = playerRes.player;
    player.equippedGearInvId = inv.id;
    await player.save();
    return { success: true, inventory: inv };
  } catch (err) {
    console.error('equipGearByInventoryId failed:', err);
    return { success: false, error: err.message || 'Database error' };
  }
}

async function getEquipped(userId) {
  try {
    if (!userId) return { success: false, error: 'userId required' };
    const player = await Player.findByPk(userId);
    if (!player) return { success: false, error: 'Player not found' };
    const weapon = player.equippedWeaponInvId ? await Inventory.findByPk(player.equippedWeaponInvId) : null;
    const gearItem = player.equippedGearInvId ? await Inventory.findByPk(player.equippedGearInvId) : null;

    const power = (weapon ? (weapon.attack || 0) : 0) + (gearItem ? (gearItem.defense || 0) : 0);

    return { success: true, weapon, gear: gearItem, power };
  } catch (err) {
    console.error('getEquipped failed:', err);
    return { success: false, error: err.message };
  }
}

/* ======================
   Work session helpers
   ====================== */

async function startWork(userId) {
  try {
    if (!userId) return { success: false, reason: 'InvalidUser' };

    const now = new Date();

    return await sequelize.transaction(async (t) => {
      // Ensure player exists
      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) throw new Error('Player not found');

      // Check for existing active session
      const active = await WorkSession.findOne({
        where: { userId, status: 'working' },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (active) {
        return { success: false, reason: 'AlreadyWorking', session: active };
      }

      // Check cooldown after collect
      if (player.lastWorkCollectedAt) {
        const secondsSinceCollect = Math.floor((now.getTime() - new Date(player.lastWorkCollectedAt).getTime()) / 1000);
        if (secondsSinceCollect < WORK_COOLDOWN_AFTER_COLLECT_SECONDS) {
          const remaining = WORK_COOLDOWN_AFTER_COLLECT_SECONDS - secondsSinceCollect;
          return { success: false, reason: 'CooldownAfterCollect', remaining };
        }
      }

      const finishAt = new Date(now.getTime() + WORK_DURATION_SECONDS * 1000);
      const session = await WorkSession.create({
        userId,
        startedAt: now,
        finishAt,
        status: 'working'
      }, { transaction: t });

      return { success: true, session };
    });
  } catch (err) {
    console.error('startWork failed:', err);
    return { success: false, reason: 'Error', error: err.message || String(err) };
  }
}

async function collectWork(userId) {
  try {
    if (!userId) return { success: false, reason: 'InvalidUser' };

    const now = new Date();

    return await sequelize.transaction(async (t) => {
      const session = await WorkSession.findOne({
        where: { userId, status: { [Op.in]: ['working', 'finished'] } },
        order: [['createdAt', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!session) {
        return { success: false, reason: 'NoSession' };
      }

      // If still working
      if (session.status === 'working') {
        const remaining = Math.max(0, Math.floor((new Date(session.finishAt).getTime() - now.getTime()) / 1000));
        return { success: false, reason: 'StillWorking', remaining };
      }

      // If already collected
      if (session.status === 'collected') {
        // compute cooldown since collected
        const collectedAt = session.collectedAt ? new Date(session.collectedAt) : null;
        if (collectedAt) {
          const secondsSince = Math.floor((now.getTime() - collectedAt.getTime()) / 1000);
          if (secondsSince < WORK_COOLDOWN_AFTER_COLLECT_SECONDS) {
            const remaining = WORK_COOLDOWN_AFTER_COLLECT_SECONDS - secondsSince;
            return { success: false, reason: 'AlreadyCollected', remaining };
          }
        }
      }

      // If finished but not collected
      if (session.status === 'finished') {
        // compute reward and update player
        const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!player) throw new Error('Player not found');

        // Streak logic: if lastWorkCollectedAt within streak window, increment streak
        let newStreak = 1;
        if (player.lastWorkCollectedAt) {
          const secondsSinceLastCollect = Math.floor((now.getTime() - new Date(player.lastWorkCollectedAt).getTime()) / 1000);
          if (secondsSinceLastCollect <= WORK_STREAK_WINDOW_SECONDS) {
            newStreak = (player.workStreak || 0) + 1;
            if (newStreak > WORK_STREAK_BONUS_CAP_DAYS) newStreak = WORK_STREAK_BONUS_CAP_DAYS;
          }
        }

        const bonus = Math.min(WORK_STREAK_BONUS_CAP_DAYS, (newStreak - 1) * WORK_STREAK_BONUS_PER_DAY);
        const baseReward = WORK_REWARD_SILVER;
        const totalReward = baseReward + bonus;

        player.silver = (player.silver || 0) + totalReward;
        player.workStreak = newStreak;
        player.lastWorkCollectedAt = now;
        await player.save({ transaction: t });

        session.status = 'collected';
        session.collectedAt = now;
        await session.save({ transaction: t });

        return {
          success: true,
          totalReward,
          baseReward,
          bonus,
          newSilver: player.silver,
          streak: newStreak
        };
      }

      // If session.status is something else (cancelled etc.)
      return { success: false, reason: 'NoFinishedSession' };
    });
  } catch (err) {
    console.error('collectWork failed:', err);
    return { success: false, reason: 'Error', error: err.message || String(err) };
  }
}

/* ======================
   Daily claim helper
   ====================== */

async function claimDaily(userId) {
  try {
    if (!userId) return { success: false, reason: 'InvalidUser' };

    const result = await sequelize.transaction(async (t) => {
      let daily = await DailyClaim.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!daily) {
        daily = await DailyClaim.create({ userId, lastClaimAt: null, streak: 0 }, { transaction: t });
      }

      const now = new Date();
      const last = daily.lastClaimAt ? new Date(daily.lastClaimAt) : null;
      const secondsSinceLast = last ? Math.floor((now.getTime() - last.getTime()) / 1000) : Number.POSITIVE_INFINITY;

      if (secondsSinceLast < DAILY_COOLDOWN_SECONDS) {
        const remaining = DAILY_COOLDOWN_SECONDS - secondsSinceLast;
        return { success: false, reason: 'Cooldown', remaining };
      }

      let newStreak = 1;
      if (last && secondsSinceLast <= DAILY_STREAK_WINDOW_SECONDS) {
        newStreak = (daily.streak || 0) + 1;
      }

      const bonus = (newStreak - 1) * DAILY_STREAK_BONUS;
      const reward = Math.max(0, DAILY_BASE_BRONZE + bonus);

      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) throw new Error('Player not found during claimDaily');

      player.bronze = (player.bronze || 0) + reward;
      await player.save({ transaction: t });

      daily.lastClaimAt = now;
      daily.streak = newStreak;
      await daily.save({ transaction: t });

      const nextAvailableAt = new Date(now.getTime() + DAILY_COOLDOWN_SECONDS * 1000);

      return { success: true, reward, streak: newStreak, nextAvailableAt };
    });

    return result;
  } catch (err) {
    console.error('claimDaily failed:', err);
    return { success: false, reason: 'Error', error: err.message || String(err) };
  }
}

/* ======================
   Hunt helpers
   ====================== */

async function hunt(userId, monsterId) {
  try {
    if (!userId) return { success: false, message: 'Invalid user' };

    // Determine monster
    const monster = getMonsterById(monsterId);
    if (!monster) return { success: false, message: 'Monster not found' };

    return await sequelize.transaction(async (t) => {
      // Ensure player and equipped items
      const player = await Player.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!player) return { success: false, message: 'Player not found' };

      const weapon = player.equippedWeaponInvId ? await Inventory.findByPk(player.equippedWeaponInvId, { transaction: t }) : null;
      const gearItem = player.equippedGearInvId ? await Inventory.findByPk(player.equippedGearInvId, { transaction: t }) : null;

      if (!weapon || !gearItem) {
        return { success: false, reason: 'MissingEquipment', message: 'Equip 1 weapon and 1 gear before hunting.' };
      }

      const power = (weapon.attack || 0) + (gearItem.defense || 0);

      if (power < (monster.threshold || 0)) {
        return { success: false, reason: 'ThresholdNotMet', message: 'Power below required threshold', power, monster };
      }

      // Check cooldown per tier
      const tier = Number(monster.tier) || 0;
      const cooldownRec = await HuntCooldown.findOne({ where: { userId, monsterTier: tier }, transaction: t, lock: t.LOCK.UPDATE });
      const now = new Date();
      if (cooldownRec && cooldownRec.lastHuntAt) {
        const secondsSince = Math.floor((now.getTime() - new Date(cooldownRec.lastHuntAt).getTime()) / 1000);
        if (secondsSince < DEFAULT_HUNT_COOLDOWN_SECONDS) {
          const remaining = DEFAULT_HUNT_COOLDOWN_SECONDS - secondsSince;
          return { success: false, reason: 'Cooldown', remaining };
        }
      }

      // Award gems
      const gemsAwarded = Number(monster.gems) || 0;
      player.gems = (player.gems || 0) + gemsAwarded;
      await player.save({ transaction: t });

      // Update hunt record
      const [hr] = await HuntRecord.findOrCreate({
        where: { userId, monsterTier: tier },
        defaults: { userId, monsterTier: tier, kills: 0 },
        transaction: t
      });
      hr.kills = (hr.kills || 0) + 1;
      await hr.save({ transaction: t });

      // Update cooldown record
      if (cooldownRec) {
        cooldownRec.lastHuntAt = now;
        await cooldownRec.save({ transaction: t });
      } else {
        await HuntCooldown.create({ userId, monsterTier: tier, lastHuntAt: now }, { transaction: t });
      }

      // Count kills in tier
      const killsInTier = hr.kills;

      return {
        success: true,
        monster,
        gemsAwarded,
        newGemBalance: player.gems,
        killsInTier
      };
    });
  } catch (err) {
    console.error('hunt failed:', err);
    return { success: false, message: err.message || 'Hunt error' };
  }
}

/* ======================
   Admin helpers
   ====================== */

async function adminAdjustCurrency(targetUserId, deltas = {}) {
  try {
    if (!targetUserId) return { success: false, error: 'targetUserId required' };
    const res = await adjustCurrency(targetUserId, deltas);
    if (!res || res.success === false) return res;
    return { success: true, balance: res.balance };
  } catch (err) {
    console.error('adminAdjustCurrency failed:', err);
    return { success: false, error: err.message || 'Error' };
  }
}

async function adminGrantItem(targetUserId, catalogId, type, qty = 1) {
  try {
    if (!targetUserId || !catalogId || !type) return { success: false, error: 'targetUserId, catalogId and type required' };
    if (!['weapon', 'gear'].includes(type)) return { success: false, error: 'type must be weapon or gear' };
    qty = Number(qty) || 1;
    if (qty <= 0) return { success: false, error: 'qty must be positive' };

    if (type === 'weapon') {
      const res = await giveWeapon(targetUserId, catalogId, qty);
      if (!res || res.success === false) return res;
      return { success: true, inventory: res.inventory };
    } else {
      const res = await giveGear(targetUserId, catalogId, qty);
      if (!res || res.success === false) return res;
      return { success: true, inventory: res.inventory };
    }
  } catch (err) {
    console.error('adminGrantItem failed:', err);
    return { success: false, error: err.message || 'Error' };
  }
}

/* ======================
   DB init / utilities
   ====================== */

async function initDb() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    refreshMonsterIndex();
    return { success: true };
  } catch (err) {
    console.error('initDb failed:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/* ======================
   Exports
   ====================== */

module.exports = {
  // DB & init
  sequelize,
  initDb,

  // catalogs & lookups
  weapons,
  gear,
  monsters,
  getWeaponById,
  getGearById,
  getMonsterById,
  getMonstersByTier,
  refreshMonsterIndex,
  getBestTier,
  getEligibleMonsters,

  // player / currency
  ensurePlayer,
  ensurePlayerOrThrow,
  getBalance,
  addCurrency,
  adjustCurrency,
  addPrestige,

  // inventory
  giveWeapon,
  giveGear,
  getWeapons,
  getGear,
  removeInventoryCount,
  equipWeaponByInventoryId,
  equipGearByInventoryId,
  getEquipped,

  // work / daily
  startWork,
  collectWork,
  claimDaily,

  // hunt
  hunt,

  // admin / server admins
  addServerAdmin,
  removeServerAdmin,
  listServerAdmins,
  isServerAdmin,
  adminAdjustCurrency,
  adminGrantItem,

  // models (expose for advanced use)
  Player,
  Inventory,
  HuntRecord,
  HuntCooldown,
  Auction,
  DailyClaim,
  WorkSession,
  ServerAdmin
};