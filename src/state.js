import { CLASS_DEFS, DEFAULT_CLASS_KEY, MAP_TEMPLATE, ORB_KEYS, getAbilityDefsForClass } from './data.js';
import { clone } from './utils.js';

export let G = {};

function createAbilityState(classKey) {
  const abilityState = {savedByBladeUsed:false};
  getAbilityDefsForClass(classKey).forEach((ab) => {
    abilityState[ab.key] = false;
  });
  return abilityState;
}

export function initGame(classKey = DEFAULT_CLASS_KEY) {
  const cls = CLASS_DEFS[classKey] || CLASS_DEFS[DEFAULT_CLASS_KEY];
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
      fragments: 7,
    },
    abilities: createAbilityState(cls.key),
    shop: {enhancedDagger:false, enhancedIceBlade:false, enhancedBlade:false, powerEquip:false, vitalityEquip:false},
    nodes: clone(MAP_TEMPLATE),
    nodeIdx: 0,
    currentNode: null,
    enemy: null,
    battle: {round:1, phase:'select', pAction:null, eAction:null, lastPlayerAction:null, lastEnemyAction:null},
    ui: {mainSel:null, actionKey:null},
    roomFlags: {playerDamagedInBattle:false},
    equippedGear: null,
    battleEntrySnapshot: null,
    hardMode: false,
  };
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
  return (G.player.baseJiRate || 0) + (G.abilities.oneVsFour ? 1 : 0);
}

export function getPlayerDefenseBonus() {
  return G.abilities.smoothStone ? 2 : 0;
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
  if (G.enemy) G.enemy.ji = 0;
}

export function restoreFromBattleSnapshot(snapshot) {
  G = clone(snapshot);
}
