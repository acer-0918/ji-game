import { PHASES, ACTOR_SCOPE } from './constants.js';
import { DAMAGE_ORDER } from './order.js';
import {
  addAddMod,
  getDamagePackets,
  TARGET,
  toResultFromPackets,
} from './damagePipeline.js';
import { G, allOrbsGenerated, allPlayerCoreOrbsGenerated, getDogLuckChance } from '../state.js';
import { hasPowerRelic } from '../powerRelics/index.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

export function registerDefaultResolveEffects(engine) {
  engine.registerEffect({
    effectId: 'system.apply_hp_change',
    phase: PHASES.APPLY_DAMAGE,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: DAMAGE_ORDER.SYSTEM_APPLY_HP_CHANGE,
    condition: (ctx) => !!ctx.result,
    apply: (ctx) => {
      G.player.hp = Math.max(0, G.player.hp - (ctx.result.pdmg || 0));
      G.enemy.hp = Math.max(0, G.enemy.hp - (ctx.result.edmg || 0));
    },
  });

  engine.registerEffect({
    effectId: 'system.log_applied_damage',
    phase: PHASES.APPLY_DAMAGE,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: DAMAGE_ORDER.SYSTEM_APPLY_HP_CHANGE + 1,
    condition: (ctx) => !!ctx.result,
    apply: (ctx) => {
      if ((ctx.result.pdmg || 0) > 0) pushLog(ctx, 'log-dmg', `玩家受到 ${ctx.result.pdmg} 点伤害！`);
      if ((ctx.result.edmg || 0) > 0) pushLog(ctx, 'log-dmg', `敌方受到 ${ctx.result.edmg} 点伤害！`);
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_possible_reunion_charge',
    phase: PHASES.DAMAGE_RESOLVE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_POSSIBLE_REUNION_CHARGE,
    condition: (ctx) => !!(
      G.powerRelics &&
      hasPowerRelic(G, 'possibleReunion') &&
      G.battle &&
      G.battle.eAction === 'defense_1' &&
      ctx.result
    ),
    apply: (ctx) => {
      G.battle.reunionDamageBonus = (G.battle.reunionDamageBonus || 0) + 1;
      pushLog(ctx, 'log-ab', `🕊️ 可能的重逢：敌方使用了超防，本战斗你的伤害加成提升至 +${G.battle.reunionDamageBonus}。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_possible_reunion_bonus_damage',
    phase: PHASES.DAMAGE_RESOLVE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_POSSIBLE_REUNION_BONUS_DAMAGE,
    condition: (ctx) => !!(
      hasPowerRelic(G, 'possibleReunion') &&
      ctx.result &&
      ctx.result.edmg > 0 &&
      (G.battle && (G.battle.reunionDamageBonus || 0) > 0)
    ),
    apply: (ctx) => {
      const bonus = G.battle.reunionDamageBonus || 0;
      const packets = getDamagePackets(ctx, (packet) =>
        packet.target === TARGET.ENEMY && packet.source === TARGET.PLAYER && packet.type === 'attack'
      );
      if (!packets.length) return;
      packets.forEach((packet) => addAddMod(packet, bonus, 'possible_reunion'));
      toResultFromPackets(ctx);
      pushLog(ctx, 'log-ab', `🕊️ 可能的重逢：本回合额外造成 ${bonus} 点伤害。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_destined_first_sight',
    phase: PHASES.TAKE_DAMAGE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.RELIC_DESTINED_FIRST_SIGHT,
    condition: (ctx) => !!(
      ctx.result &&
      ctx.result.pdmg > 0 &&
      hasPowerRelic(G, 'destinedFirstSight') &&
      G.battle
    ),
    apply: (ctx) => {
      G.battle.killedByDestinedFirstSight = true;
      G.player.hp = 0;
      pushLog(ctx, 'log-dmg', '📕 既定的初见：你受到了伤害，立刻死亡。');
    },
  });

  engine.registerEffect({
    effectId: 'player.on_damaged_common',
    phase: PHASES.TAKE_DAMAGE,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.ON_DAMAGED_COMMON,
    condition: (ctx) => !!(ctx.result && ctx.result.pdmg > 0),
    apply: (ctx) => {
      const p = G.player;
      G.roomFlags.playerDamagedInBattle = true;
      if (G.abilities.popcorn && G.battle) G.battle.popcornPending = true;

      if (p.classKey !== 'dog') return;
      const gainBase = ctx.result.pdmg;
      const gain = gainBase * (G.abilities.standFirm ? 2 : 1);
      p.luck = Math.max(0, (p.luck || 0) + gain);
      pushLog(ctx, 'log-ab', `🐶 小狗被动：受伤后幸运值 +${gain}（当前 ${p.luck}）。`);

      const chance = getDogLuckChance();
      if (Math.random() * 100 < chance) {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        if (p.hp > before) pushLog(ctx, 'log-ab', `🍀 幸运回复触发（${chance}%）：回复 1 点生命。`);
        else pushLog(ctx, 'log-ab', `🍀 幸运回复触发（${chance}%）：已满血，回复未生效。`);
      } else {
        pushLog(ctx, 'log-ab', `🍀 幸运回复未触发（${chance}%）。`);
      }
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_deification_overload_round_end',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DAMAGE_ORDER.BOSS_FAULT_ROBOT_OVERLOAD_ROUND_END - 10,
    condition: () => !!(
      G.enemy &&
      hasPowerRelic(G, 'deification') &&
      !G.player.coreOverloadTriggered &&
      allPlayerCoreOrbsGenerated(G.player)
    ),
    apply: (ctx) => {
      G.player.coreOverloadTriggered = true;
      G.enemy.hp = 0;
      pushLog(ctx, 'log-dmg', '☠️ 完美核心触发【过载终焉】！敌方被直接消灭。');
    },
  });

  engine.registerEffect({
    effectId: 'boss.fault_robot_overload_round_end',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.BOSS,
    order: DAMAGE_ORDER.BOSS_FAULT_ROBOT_OVERLOAD_ROUND_END,
    condition: () => !!(
      G.enemy &&
      G.enemy.id === 'faultRobot' &&
      !G.enemy.overloadTriggered &&
      allOrbsGenerated(G.enemy)
    ),
    apply: (ctx) => {
      G.enemy.overloadTriggered = true;
      G.player.hp = 0;
      pushLog(ctx, 'log-dmg', '☠️ 过载终焉发动！玩家被直接消灭。');
    },
  });
}
