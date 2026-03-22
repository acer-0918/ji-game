import { CLASS_DEFS, DEFAULT_CLASS_KEY, ORB_KEYS, POWER_RELIC_DEFS, getAbilityDefsForClass } from './data.js';
import { clone } from './utils.js';
import { createTechniquesState, createTechCounters } from './battleTechniques.js';
import { createMapState } from './map/runtime.js';
import {
  createEquipmentState,
  getDefenseTagBonus,
  getJiRateTagModifier,
  hasEquippedEquipment,
} from './equipment/runtime.js';

export let G = {};

function createAbilityState(classKey) {
  const abilityState = {savedByBladeUsed:false};
  getAbilityDefsForClass(classKey).forEach((ab) => {
    abilityState[ab.key] = false;
  });
  return abilityState;
}

function createPowerRelicState() {
  const relicState = {};
  POWER_RELIC_DEFS.forEach((item) => {
    relicState[item.key] = false;
  });
  return relicState;
}

export function initGame(classKey = DEFAULT_CLASS_KEY, hardMode = false) {
  const cls = CLASS_DEFS[classKey] || CLASS_DEFS[DEFAULT_CLASS_KEY];
  const map = createMapState({ hardMode });
  G = {
    player: {
      classKey: cls.key,
      classIcon: cls.icon,
      name: cls.name,
      hp: cls.baseHp,
      maxHp: cls.baseHp,
      ji: 0,
      baseJiRate: cls.baseJiRate,
      lightningOrbs: 0,
      shaBiStacks: 0,
      jiSpentTotal: 0,
      luck: 0,
      fragments: 0,
      gold: 50,
    },
    abilities: createAbilityState(cls.key),
    powerRelics: createPowerRelicState(),
    shop: {enhancedDagger:false, enhancedIceBlade:false, enhancedBlade:false},
    equipment: createEquipmentState(),
    map,
    runWon: false,
    currentNode: null,
    enemy: null,
    battle: {round:1, phase:'select', pAction:null, eAction:null, lastPlayerAction:null, lastEnemyAction:null, techCounters: createTechCounters(), enemyFrostLockThisRound: false},
    ui: {mainSel:null, actionKey:null},
    roomFlags: {playerDamagedInBattle:false},
    techniques: createTechniquesState(),
    battleEntrySnapshot: null,
    pendingPowerRelicOptions: [],
    pendingEventRelicOptions: [],
    pendingEventRelicSelectedKey: null,
    pendingEventEquipmentChoiceKey: null,
    pendingBattleReward: null,
    hardMode: false,
    devMode: false,
  };
  G.player.luck = cls.key === 'dog' ? 50 : 0;
}

export function ensureFaultRobotState(enemy) {
  if (!enemy || enemy.id !== 'faultRobot') return;
  enemy.orbs = enemy.orbs || {plasma:0, frost:0, lightning:0, dark:0, glass:0};
  enemy.overloadTriggered = !!enemy.overloadTriggered;
  ORB_KEYS.forEach(k => {
    enemy.orbs[k] = enemy.orbs[k] || 0;
  });
}

export function orbCount(enemy, key) {
  if (!enemy || !enemy.orbs) return 0;
  return enemy.orbs[key] || 0;
}

export function orbUniqueCount(enemy) {
  if (!enemy || !enemy.orbs) return 0;
  return ORB_KEYS.filter(k => (enemy.orbs[k] || 0) > 0).length;
}

export function allOrbsGenerated(enemy) {
  return enemy && enemy.id === 'faultRobot' && ORB_KEYS.every(k => orbCount(enemy, k) > 0);
}

export function getPlayerJiRate() {
  const rate = (G.player.baseJiRate || 0)
    + (G.abilities.oneVsFour ? 1 : 0)
    + (G.abilities.haruna ? 1 : 0)
    + getJiRateTagModifier(G);
  return Math.max(0, rate);
}

export function getDogLuckValue() {
  if (!G.player || G.player.classKey !== 'dog') return 0;
  let luck = Number(G.player.luck || 0);
  if (G.abilities && G.abilities.openMind) {
    luck = Math.floor(Math.random() * 101);
    G.player.luck = luck;
  }
  return Math.max(0, luck);
}

export function getDogLuckChance() {
  return Math.min(100, getDogLuckValue());
}

export function getPlayerDefenseBonus(actionKey='') {
  if (!String(actionKey).startsWith('defense_')) return 0;
  let bonus = 0;
  if (hasEquippedEquipment(G, 'equi_8')) bonus += 2;
  if (
    hasEquippedEquipment(G, 'equi_3') &&
    G.battle &&
    G.battle.equipment &&
    G.battle.equipment.barrierActive
  ) {
    bonus += 3;
  }
  bonus += getDefenseTagBonus(G, actionKey);
  return bonus;
}

export function getEnemyStandardChargeGain(enemy) {
  if (!enemy) return 0;
  ensureFaultRobotState(enemy);
  let gain = enemy.jiRate || 0;
  if (enemy.id === 'faultRobot') gain += orbCount(enemy, 'plasma');
  return gain;
}

export function isJiHiddenBattle() {
  return !!(G.enemy && G.enemy.hideJi);
}

export function resetRoomJi() {
  G.player.ji = 0;
  G.player.lightningOrbs = 0;
  G.player.shaBiStacks = 0;
  G.player.jiSpentTotal = 0;
  if (G.enemy) G.enemy.ji = 0;
  // Reset per-battle technique counters
  if (G.battle) {
    G.battle.techCounters = createTechCounters();
    G.battle.enemyFrostLockThisRound = false;
    G.battle.bossMemory = null; // 每场战斗重置 Boss 记忆
  }
}

export function restoreFromBattleSnapshot(snapshot) {
  G = clone(snapshot);
}
