import { PHASES, ACTOR_SCOPE } from '../battle/constants.js';
import { COMBAT_ORDER, DAMAGE_ORDER, ROUND_START_ORDER } from '../battle/order.js';
import {
  addAddMod,
  createDamagePacket,
  DAMAGE_TYPE,
  getDamagePackets,
  TARGET,
  toResultFromPackets,
} from '../battle/damagePipeline.js';
import { G } from '../state.js';
import {
  clampPlayerJiByEquipment,
  createBattleEquipmentState,
  ensureBattleEquipmentState,
  hasEquippedEquipment,
} from './runtime.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

function getPlayerAttackPackets(ctx) {
  return getDamagePackets(ctx, (packet) =>
    packet.source === TARGET.PLAYER && packet.target === TARGET.ENEMY
  );
}

function askFollowUpCount(maxCount) {
  if (maxCount <= 0) return 0;
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return 0;
  const raw = window.prompt(`【狩猎律动】请选择追加攻击次数（0~${maxCount}）`, '0');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(maxCount, Math.floor(parsed)));
}

export function registerEquipmentEffects(engine) {
  engine.registerEffect({
    effectId: 'player.equipment_round_setup',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 10,
    condition: () => !!G.battle,
    apply: (ctx) => {
      const st = ensureBattleEquipmentState(G) || createBattleEquipmentState();
      st.usedDefense = false;
      st.tookDamage = false;
      st.barrierActive = hasEquippedEquipment(G, 'equi_3') && !!st.barrierReady;
      if (st.barrierActive) {
        pushLog(ctx, 'log-ab', '🧱 壁垒：本回合防御基础等级 +3。');
      }
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_happy_flower',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.HAPPY_FLOWER_GAIN,
    condition: () => !!(
      G.battle &&
      hasEquippedEquipment(G, 'equi_6') &&
      G.battle.round % 3 === 0
    ),
    apply: (ctx) => {
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + 1);
      pushLog(ctx, 'log-ab', '🌼 开心小花：第 3n 回合开始，额外获得 1 Ji。');
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_track_defense_usage',
    phase: PHASES.ACTION_COMPARE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: COMBAT_ORDER.RESOLVE_SELECTED_ACTIONS + 10,
    condition: (ctx) => !!(
      G.battle &&
      hasEquippedEquipment(G, 'equi_3') &&
      ctx.pChosen
    ),
    apply: (ctx) => {
      const st = ensureBattleEquipmentState(G);
      if (!st) return;
      st.usedDefense = st.usedDefense || ctx.pChosen.type === 'defense';
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_track_damage_taken',
    phase: PHASES.TAKE_DAMAGE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.ON_DAMAGED_COMMON + 10,
    condition: (ctx) => !!(
      G.battle &&
      hasEquippedEquipment(G, 'equi_3') &&
      ctx.result &&
      ctx.result.pdmg > 0
    ),
    apply: () => {
      const st = ensureBattleEquipmentState(G);
      if (!st) return;
      st.tookDamage = true;
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_hunt_rhythm',
    phase: PHASES.DAMAGE_RESOLVE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_POSSIBLE_REUNION_CHARGE + 20,
    condition: (ctx) => !!(
      hasEquippedEquipment(G, 'equi_1') &&
      ctx.pChosen &&
      ctx.pChosen.type === 'attack' &&
      !ctx.pChosen.isMageRelease &&
      ctx.hitCheck &&
      (ctx.hitCheck.playerHits || 0) > 0 &&
      (ctx.pChosen.cost || 0) > 0 &&
      G.player.ji >= (ctx.pChosen.cost || 0)
    ),
    apply: (ctx) => {
      const maxExtra = Math.floor(G.player.ji / (ctx.pChosen.cost || 1));
      if (maxExtra <= 0) return;
      const extraCount = askFollowUpCount(maxExtra);
      if (extraCount <= 0) return;

      const spend = extraCount * (ctx.pChosen.cost || 0);
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji - spend);

      const basePerCast = Math.max(1, Math.floor((ctx.result && ctx.result.edmg) || 0));
      const followUpBase = basePerCast * extraCount;
      if (followUpBase <= 0) return;

      const followUpPacket = createDamagePacket({
        type: DAMAGE_TYPE.ATTACK,
        source: TARGET.PLAYER,
        target: TARGET.ENEMY,
        base: followUpBase,
        tags: ['equip_hunt_rhythm'],
      });
      if (!Array.isArray(ctx.damagePackets)) ctx.damagePackets = [];
      ctx.damagePackets.push(followUpPacket);
      toResultFromPackets(ctx);
      pushLog(ctx, 'log-ab', `🏹 狩猎律动：追加 ${extraCount} 次同款攻击（消耗 ${spend} Ji）。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_blood_armor',
    phase: PHASES.DAMAGE_RESOLVE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_POSSIBLE_REUNION_BONUS_DAMAGE + 20,
    condition: () => hasEquippedEquipment(G, 'equi_2'),
    apply: (ctx) => {
      const bonus = Math.floor((G.player.maxHp || 0) * 0.3);
      if (bonus <= 0) return;
      const packets = getPlayerAttackPackets(ctx);
      if (!packets.length) return;
      packets.forEach((packet) => addAddMod(packet, bonus, 'equip_blood_armor'));
      toResultFromPackets(ctx);
      pushLog(ctx, 'log-ab', `🛡️ 霸王血铠：本回合造成伤害额外 +${bonus}。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_haoyi_gain',
    phase: PHASES.HIT_CHECK,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: 2000,
    condition: (ctx) => !!(
      G.battle &&
      hasEquippedEquipment(G, 'equi_4') &&
      ctx.pResult &&
      ctx.eResult &&
      ctx.hitCheck &&
      ctx.pResult.action &&
      ctx.pResult.action.type === 'defense' &&
      ctx.eResult.action &&
      ctx.eResult.action.type === 'attack'
    ),
    apply: (ctx) => {
      const st = ensureBattleEquipmentState(G);
      if (!st) return;
      if ((ctx.hitCheck.playerHits || 0) > 0 || (ctx.hitCheck.enemyHits || 0) > 0) return;
      const pDef = Number(ctx.pResult.action.def || 0);
      const eAtk = Number(ctx.eResult.action.atk || 0);
      if (pDef < eAtk) return;
      st.haoYi = (st.haoYi || 0) + eAtk;
      pushLog(ctx, 'log-ab', `🥊 蓄意轰拳：完全防御成功，豪意值 +${eAtk}（当前 ${st.haoYi}）。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_haoyi_consume',
    phase: PHASES.DAMAGE_RESOLVE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_POSSIBLE_REUNION_BONUS_DAMAGE + 30,
    condition: (ctx) => !!(
      G.battle &&
      hasEquippedEquipment(G, 'equi_4') &&
      ctx.pChosen &&
      ctx.pChosen.type === 'attack'
    ),
    apply: (ctx) => {
      const st = ensureBattleEquipmentState(G);
      if (!st) return;
      const haoYi = Number(st.haoYi || 0);
      if (haoYi <= 0) return;

      const playerHits = (ctx.hitCheck && ctx.hitCheck.playerHits) || 0;
      if (playerHits > 0) {
        const bonus = Math.floor(haoYi * 0.5);
        if (bonus > 0) {
          const packets = getPlayerAttackPackets(ctx);
          if (packets.length > 0) {
            addAddMod(packets[0], bonus, 'equip_haoyi');
            toResultFromPackets(ctx);
            pushLog(ctx, 'log-ab', `🥊 蓄意轰拳：消耗豪意值 ${haoYi}，额外造成 ${bonus} 点伤害。`);
          }
        } else {
          pushLog(ctx, 'log-ab', `🥊 蓄意轰拳：消耗豪意值 ${haoYi}，但额外伤害为 0。`);
        }
      } else {
        pushLog(ctx, 'log-ab', `🥊 蓄意轰拳：本次攻击未命中，豪意值 ${haoYi} 归零。`);
      }

      st.haoYi = 0;
    },
  });

  engine.registerEffect({
    effectId: 'player.equipment_barrier_round_end',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.BOSS_FAULT_ROBOT_OVERLOAD_ROUND_END - 20,
    condition: () => !!(G.battle && hasEquippedEquipment(G, 'equi_3')),
    apply: (ctx) => {
      const st = ensureBattleEquipmentState(G);
      if (!st) return;
      if (st.usedDefense && !st.tookDamage) {
        st.barrierReady = true;
        pushLog(ctx, 'log-ab', '🧱 壁垒：本回合满足条件，下回合获得防御基础 +3。');
      } else {
        st.barrierReady = false;
      }
    },
  });
}
