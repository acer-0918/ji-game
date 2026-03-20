import { G } from './state.js';
import { allOrbsGenerated, orbCount, orbUniqueCount, ensureFaultRobotState } from './state.js';
import { getActionData, getMaxAffordableAttack } from './logic.js';
import { randomChoice } from './utils.js';

function addWeight(bucket, key, weight) {
  if (weight > 0) bucket[key] = (bucket[key] || 0) + weight;
}

function pickWeightedAction(weights, side='enemy', fallback='ji') {
  const actor = side === 'player' ? G.player : G.enemy;
  const pool = [];
  Object.entries(weights).forEach(([key, weight]) => {
    const action = getActionData(key, side, actor);
    if (!action || action.cost > actor.ji || weight <= 0) return;
    for (let i = 0; i < Math.round(weight); i++) pool.push(key);
  });
  if (pool.length) return randomChoice(pool);

  const candidateOrder = [fallback, 'ji', 'defense_0', 'attack_1', 'defense_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7', 'defense_2', 'orb_random'];
  for (const key of candidateOrder) {
    const action = getActionData(key, side, actor);
    if (action && action.cost <= actor.ji) return key;
  }
  return 'defense_0';
}

function buildAiContext(enemy) {
  return {
    round: G.battle.round,
    eJi: enemy.ji,
    eHp: enemy.hp,
    eMaxHp: enemy.maxHp,
    pJi: G.player.ji,
    pHp: G.player.hp,
    pMaxAtk: getMaxAffordableAttack('player', G.player.ji, G.player),
    eMaxAtk: getMaxAffordableAttack('enemy', enemy.ji, enemy),
    playerLikelyCharge: G.player.ji <= 1 || G.battle.lastPlayerAction === 'ji',
    playerLikelyAttack: (G.battle.lastPlayerAction || '').startsWith('attack_'),
    playerHighThreat: getMaxAffordableAttack('player', G.player.ji, G.player) >= 5,
    playerUltraThreat: getMaxAffordableAttack('player', G.player.ji, G.player) >= 7,
    enemyLowHp: enemy.hp <= Math.max(3, Math.ceil(enemy.maxHp / 3)),
    playerLowHp: G.player.hp <= 2,
    lastPlayerAction: G.battle.lastPlayerAction,
    lastEnemyAction: G.battle.lastEnemyAction,
  };
}

function aiJiaxu(enemy) {
  const ctx = buildAiContext(enemy);
  const w = {};

  if (ctx.eJi === 0) {
    addWeight(w, 'ji', ctx.playerHighThreat ? 3 : 5);
    addWeight(w, 'defense_0', ctx.playerHighThreat ? 4 : 2);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 3 : 1);
    return pickWeightedAction(w, 'enemy', ctx.playerLikelyCharge ? 'attack_1' : 'defense_0');
  }

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 5);
  if (ctx.pJi === 0 && ctx.eJi >= 1) addWeight(w, 'attack_1', 3);
  if (ctx.pHp <= 2) addWeight(w, 'attack_1', 3);

  addWeight(w, 'defense_0', ctx.pMaxAtk >= 3 ? 2 : 1);
  if (ctx.eJi >= 1 && ctx.pMaxAtk >= 4) addWeight(w, 'defense_1', 3);
  if (ctx.eJi >= 2 && (ctx.playerUltraThreat || (ctx.enemyLowHp && ctx.pMaxAtk >= 5))) addWeight(w, 'defense_2', 2);

  if (ctx.eJi <= 2) addWeight(w, 'ji', ctx.playerLikelyCharge ? 2 : 4);
  else if (ctx.eJi <= 4 && !ctx.playerHighThreat) addWeight(w, 'ji', 2);

  if (ctx.eJi >= 2) addWeight(w, 'attack_2', ctx.playerLikelyCharge ? 4 : 2);
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', ctx.pJi >= 2 ? 3 : 2);
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', ctx.playerLowHp ? 4 : 2);
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', ctx.pJi >= 4 ? 3 : 2);
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', ctx.playerLowHp ? 4 : 2);
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 5 : 2);

  return pickWeightedAction(w, 'enemy', ctx.playerLikelyCharge ? 'attack_2' : 'attack_3');
}

function aiGufu(enemy) {
  const ctx = buildAiContext(enemy);
  const grow = enemy.chargeValue || 1;
  const w = {};
  const safeToScale = ctx.pMaxAtk <= 4 && !ctx.enemyLowHp;

  if (ctx.eJi === 0) {
    addWeight(w, 'ji', safeToScale ? 6 : 3);
    addWeight(w, 'defense_0', ctx.playerHighThreat ? 4 : 2);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 2 : 1);
    return pickWeightedAction(w, 'enemy', safeToScale ? 'ji' : 'defense_0');
  }

  if (safeToScale) addWeight(w, 'ji', grow <= 3 ? 7 : 4);
  else if (grow >= 4 && ctx.eJi <= 2) addWeight(w, 'ji', 2);

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 4);
  if (ctx.pJi <= 2 && ctx.eJi >= 2) addWeight(w, 'attack_2', 3);
  if (ctx.eJi >= 1 && ctx.pMaxAtk >= 4) addWeight(w, 'defense_1', 3);
  if (ctx.eJi >= 2 && (ctx.playerUltraThreat || (ctx.enemyLowHp && ctx.pMaxAtk >= 5))) addWeight(w, 'defense_2', 2);

  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2 + (grow >= 3 ? 1 : 0));
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 3 + (grow >= 4 ? 1 : 0));
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 3 + (grow >= 5 ? 2 : 0));
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', 2 + (grow >= 5 ? 2 : 0));
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 5 : 3);

  return pickWeightedAction(w, 'enemy', grow <= 3 ? 'ji' : 'attack_4');
}

function aiFaultRobot(enemy) {
  const ctx = buildAiContext(enemy);
  ensureFaultRobotState(enemy);
  const unique = orbUniqueCount(enemy);
  const w = {};
  const safeToOrb = ctx.pMaxAtk <= 4 || ctx.playerLikelyCharge || ctx.eHp >= 9;

  if (allOrbsGenerated(enemy)) {
    addWeight(w, 'orb_random', 25);
    if (ctx.pMaxAtk >= 6) addWeight(w, 'defense_1', 2);
    return pickWeightedAction(w, 'enemy', 'orb_random');
  }

  addWeight(w, 'orb_random', safeToOrb ? 8 : 3);
  if (unique <= 1) addWeight(w, 'orb_random', 3);
  if (unique >= 3 && ctx.playerLowHp) addWeight(w, 'orb_random', 2);
  if (ctx.eJi === 0 && !safeToOrb) addWeight(w, 'defense_0', 3);

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 4);
  if (ctx.eJi >= 1 && ctx.pMaxAtk >= 4) addWeight(w, 'defense_1', 3);
  if (ctx.eJi >= 2 && (ctx.playerUltraThreat || (ctx.enemyLowHp && ctx.pMaxAtk >= 5))) addWeight(w, 'defense_2', 2);

  if (ctx.eJi <= 2) addWeight(w, 'ji', safeToOrb ? 2 : 4);
  else if (!ctx.playerHighThreat && orbCount(enemy, 'plasma') > 0) addWeight(w, 'ji', 2 + orbCount(enemy, 'plasma'));

  if (ctx.eJi >= 2) addWeight(w, 'attack_2', 2 + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2 + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 2 + orbCount(enemy, 'dark') + Math.floor(unique / 2));
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 2 + orbCount(enemy, 'dark') + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', 2 + orbCount(enemy, 'dark'));
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 5 : 2 + orbCount(enemy, 'dark'));

  return pickWeightedAction(w, 'enemy', unique < 3 ? 'orb_random' : 'attack_4');
}

function aiBasic(enemy) {
  const ctx = buildAiContext(enemy);
  const w = {};
  if (ctx.eJi === 0) {
    addWeight(w, 'ji', 5);
    addWeight(w, 'defense_0', ctx.playerHighThreat ? 4 : 2);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 2 : 1);
    return pickWeightedAction(w, 'enemy', 'ji');
  }
  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 5);
  if (ctx.eJi >= 1 && ctx.pMaxAtk >= 4) addWeight(w, 'defense_1', 3);
  if (ctx.eJi >= 2 && ctx.playerUltraThreat) addWeight(w, 'defense_2', 2);
  if (ctx.eJi <= 2) addWeight(w, 'ji', 3);
  if (ctx.eJi >= 2) addWeight(w, 'attack_2', 3);
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2);
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 2);
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 2);
  return pickWeightedAction(w, 'enemy', 'attack_2');
}

export function aiDecide(enemy) {
  if (!enemy) return 'ji';
  if (enemy.id === 'jiaxu') return aiJiaxu(enemy);
  if (enemy.id === 'gufu') return aiGufu(enemy);
  if (enemy.id === 'faultRobot') return aiFaultRobot(enemy);
  return aiBasic(enemy);
}
