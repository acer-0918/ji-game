import { PHASES, ACTOR_SCOPE, BATTLE_OUTCOME } from './constants.js';
import { DEATH_ORDER } from './order.js';
import { G } from '../state.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

export function registerDefaultDeathEffects(engine) {
  engine.registerEffect({
    effectId: 'player.saved_by_blade',
    phase: PHASES.DEATH_CHECK,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: DEATH_ORDER.SAVED_BY_BLADE,
    condition: () => !!(
      G.battle &&
      G.player &&
      G.player.hp <= 0 &&
      !G.battle.killedByDestinedFirstSight &&
      G.abilities.savedByBlade &&
      !G.abilities.savedByBladeUsed
    ),
    apply: (ctx) => {
      G.abilities.savedByBladeUsed = true;
      G.player.hp = 1;
      if (typeof ctx.refreshBars === 'function') ctx.refreshBars();
      pushLog(ctx, 'log-ab', '🗡️ 名刀司命触发！你回复至 1 生命并继续战斗。');
      // Keep legacy precedence: once revived, skip win/lose checks this tick and go next round.
      ctx.outcome = BATTLE_OUTCOME.CONTINUE;
      ctx.resolved = true;
      ctx.forceNextRound = true;
      ctx.stopPhase = true;
    },
  });

  engine.registerEffect({
    effectId: 'system.default_death_resolution',
    phase: PHASES.DEATH_CHECK,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: DEATH_ORDER.DEFAULT_DEATH_RESOLUTION,
    condition: (ctx) => !ctx.forceNextRound,
    apply: (ctx) => {
      if (G.player.hp <= 0) {
        ctx.outcome = BATTLE_OUTCOME.LOSE;
        ctx.resolved = true;
        return;
      }
      if (G.enemy && G.enemy.hp <= 0) {
        ctx.outcome = BATTLE_OUTCOME.WIN;
        ctx.resolved = true;
        return;
      }
      ctx.outcome = BATTLE_OUTCOME.CONTINUE;
      ctx.resolved = true;
    },
  });
}
