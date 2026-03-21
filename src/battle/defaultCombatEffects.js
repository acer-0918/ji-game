import { PHASES, ACTOR_SCOPE } from './constants.js';
import { calcHitCheck, calcOnHitDamage } from './hitResolution.js';
import { COMBAT_ORDER } from './order.js';
import {
  createDamagePacket,
  DAMAGE_TYPE,
  TARGET,
  toResultFromPackets,
} from './damagePipeline.js';
import {
  formatSingleAction,
  getActionData,
  resolveAction,
} from '../logic.js';
import { G } from '../state.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

export function registerDefaultCombatEffects(engine) {
  engine.registerEffect({
    effectId: 'system.resolve_selected_actions',
    phase: PHASES.ACTION_COMPARE,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: COMBAT_ORDER.RESOLVE_SELECTED_ACTIONS,
    condition: () => !!(G.battle && G.battle.pAction && G.battle.eAction),
    apply: (ctx) => {
      ctx.pChosen = getActionData(G.battle.pAction, 'player');
      ctx.eChosen = getActionData(G.battle.eAction, 'enemy');
      ctx.pResult = resolveAction('player', G.battle.pAction);
      ctx.eResult = resolveAction('enemy', G.battle.eAction);

      pushLog(ctx, '', `玩家: ${formatSingleAction(ctx.pChosen)}  |  敌方: ${formatSingleAction(ctx.eChosen)}`);
      ctx.pResult.logs.forEach((text) => pushLog(ctx, 'log-ab', text));
      ctx.eResult.logs.forEach((text) => pushLog(ctx, 'log-ab', text));
    },
  });

  engine.registerEffect({
    effectId: 'system.hit_check',
    phase: PHASES.HIT_CHECK,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: COMBAT_ORDER.HIT_CHECK,
    condition: (ctx) => !!(ctx.pResult && ctx.eResult),
    apply: (ctx) => {
      ctx.hitCheck = calcHitCheck(ctx.pResult.action, ctx.eResult.action);
    },
  });

  engine.registerEffect({
    effectId: 'system.log_hit_check_messages',
    phase: PHASES.HIT_CHECK,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 9000,
    condition: (ctx) => !!(ctx.hitCheck && Array.isArray(ctx.hitCheck.msgs)),
    apply: (ctx) => {
      const hasHit = (ctx.hitCheck.playerHits || 0) > 0 || (ctx.hitCheck.enemyHits || 0) > 0;
      const cls = hasHit ? 'log-dmg' : 'log-blk';
      ctx.hitCheck.msgs.forEach((msg) => pushLog(ctx, cls, msg));
    },
  });

  engine.registerEffect({
    effectId: 'system.on_hit_damage',
    phase: PHASES.ON_HIT,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: COMBAT_ORDER.ON_HIT_DAMAGE,
    condition: (ctx) => !!(ctx.pResult && ctx.eResult && ctx.hitCheck),
    apply: (ctx) => {
      const onHit = calcOnHitDamage(ctx.pResult.action, ctx.eResult.action, ctx.hitCheck);
      ctx.damagePackets = [];
      if (onHit.edmg > 0) {
        ctx.damagePackets.push(createDamagePacket({
          type: DAMAGE_TYPE.ATTACK,
          source: TARGET.PLAYER,
          target: TARGET.ENEMY,
          base: onHit.edmg,
          tags: ['default_attack'],
        }));
      }
      if (onHit.pdmg > 0) {
        ctx.damagePackets.push(createDamagePacket({
          type: DAMAGE_TYPE.ATTACK,
          source: TARGET.ENEMY,
          target: TARGET.PLAYER,
          base: onHit.pdmg,
          tags: ['default_attack'],
        }));
      }
      ctx.result = {
        pdmg:0,
        edmg:0,
        msgs:[...ctx.hitCheck.msgs],
        triggers:[...onHit.triggers],
      };
      toResultFromPackets(ctx);
    },
  });

  engine.registerEffect({
    effectId: 'system.log_on_hit_triggers',
    phase: PHASES.ON_HIT,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 9000,
    condition: (ctx) => !!(ctx.result && Array.isArray(ctx.result.triggers) && ctx.result.triggers.length > 0),
    apply: (ctx) => {
      ctx.result.triggers.forEach((trigger) => pushLog(ctx, 'log-ab', `✨ ${trigger}`));
    },
  });
}
