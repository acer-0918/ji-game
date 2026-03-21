import { PHASES } from './constants.js';

export const PHASE_CHAIN = {
  ROUND_START: [
    PHASES.ROUND_START,
    PHASES.DEATH_CHECK,
  ],
  RESOLVE: [
    PHASES.ACTION_COMPARE,
    PHASES.HIT_CHECK,
    PHASES.ON_HIT,
    PHASES.DAMAGE_RESOLVE,
    PHASES.APPLY_DAMAGE,
    PHASES.TAKE_DAMAGE,
    PHASES.DEATH_CHECK,
    PHASES.ROUND_END,
  ],
  DEATH_CHECK: [PHASES.DEATH_CHECK],
};

export function runPhaseChain(engine, phases, ctx = {}) {
  if (!engine || typeof engine.runPhase !== 'function') return ctx;
  for (const phase of phases) {
    if (ctx.stopFlow) break;
    engine.runPhase(phase, ctx);
  }
  return ctx;
}
