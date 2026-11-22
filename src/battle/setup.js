import { createBattleEquipmentState } from '../equipment/runtime.js';
import { createBossById, createEliteById, createMobById, BOSS_POOL, ELITE_POOL, MOB_POOL } from '../map/pools.js';
import { createGameState, ensureFaultRobotState, resetRoomJi, withGameState } from '../state.js';
import { clone } from '../utils.js';
import { createBattleRandomState } from './random.js';

export function snapshotBattle(state) {
  // The restart checkpoint is a separate copy of the preceding map state.
  const { battleEntrySnapshot, ...snapshot } = state;
  return clone(snapshot);
}

export function initializeBattle(state, node, {
  seed = Math.floor(Math.random() * 4294967296), keepSnapshot = false, rememberEntry = false,
} = {}) {
  const random = createBattleRandomState(seed);
  state.currentNode = node;
  state.pendingBattleReward = null;
  const tigerTriggered = !keepSnapshot && !!state.abilities.tigerTank && node.type === 'boss';
  if (tigerTriggered) {
    state.player.maxHp += 3;
    state.player.hp += 3;
  }
  if (rememberEntry && !keepSnapshot) state.battleEntrySnapshot = snapshotBattle(state);

  state.enemy = clone(node.payload.enemy);
  ensureFaultRobotState(state.enemy);
  withGameState(state, resetRoomJi);
  state.enemy.ji = 0;
  state.roomFlags.playerDamagedInBattle = false;
  state.battle = {
    round:1,
    phase:'select',
    pAction:null,
    eAction:null,
    lastPlayerAction:null,
    lastEnemyAction:null,
    popcornPending:false,
    ekaiPending:false,
    roundDisabledActions:[],
    reunionDamageBonus:0,
    killedByDestinedFirstSight:false,
    cardsRevealed:false,
    equipment:createBattleEquipmentState(),
    random,
  };
  state.ui = {mainSel:null, actionKey:null};

  const smallPotionTriggered = !!state.abilities.smallPotion && state.player.hp < state.player.maxHp;
  if (smallPotionTriggered) state.player.hp += 1;
  if (state.player.classKey === 'mage' && state.abilities.storm) state.player.lightningOrbs += 2;
  const carriedCurse = state.player.classKey === 'warlock' && state.abilities.grudge
    ? state.player.carryCurseStacks || 0
    : 0;
  if (carriedCurse > 0) {
    state.enemy.curseStacks = (state.enemy.curseStacks || 0) + carriedCurse;
    state.player.carryCurseStacks = 0;
  }
  return { tigerTriggered, carriedCurse };
}

export function createBattleState(config, seed) {
  const {
    classKey, hardMode = false, devMode = false,
    enemy = 'jiaxu', floor = 1, nodeType, initial = {},
  } = config;
  const game = createGameState(classKey);
  game.hardMode = hardMode;
  game.devMode = devMode;
  for (const key of ['abilities', 'powerRelics', 'shop', 'equipment', 'techniques']) {
    if (config[key]) Object.assign(game[key], clone(config[key]));
  }
  if (config.player) Object.assign(game.player, clone(config.player), { classKey: game.player.classKey });
  const node = { id:'standalone', type: nodeType, payload:{} };
  if (typeof enemy !== 'string') {
    node.type ??= BOSS_POOL.includes(enemy.id) ? 'boss' : 'battle';
    node.payload.enemy = enemy;
  } else if (BOSS_POOL.includes(enemy)) {
    node.type ??= 'boss';
    node.payload.enemy = createBossById(enemy);
  } else if (ELITE_POOL.includes(enemy)) {
    node.type ??= 'elite';
    node.payload.enemy = createEliteById(enemy, floor);
  } else if (MOB_POOL.includes(enemy)) {
    node.type ??= 'battle';
    node.payload.enemy = createMobById(enemy, floor);
  } else {
    throw new RangeError('Unknown enemy: ' + enemy);
  }
  initializeBattle(game, node, { seed });
  for (const key of ['player', 'enemy', 'battle']) {
    if (initial[key]) Object.assign(game[key], clone(initial[key]));
  }
  return game;
}
