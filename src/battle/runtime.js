import { BATTLE_OUTCOME } from './constants.js';
import { PHASE_CHAIN, runPhaseChain } from './flow.js';

export function createBattleRuntime({
  engine,
  addLog,
  refreshBars,
  getPlayerActionKeysForSilence,
  sampleDistinctKeys,
} = {}) {
  function runRoundStartPhase() {
    const ctx = {
      addLog,
      refreshBars,
      getPlayerActionKeysForSilence,
      sampleDistinctKeys,
      battleEnded:false,
      forceNextRound:false,
      resolved:false,
      outcome:null,
    };
    runPhaseChain(engine, PHASE_CHAIN.ROUND_START, ctx);
    return ctx;
  }

  function runResolvePhase() {
    const ctx = {
      addLog,
      refreshBars,
      forceNextRound:false,
      resolved:false,
      outcome:null,
    };
    runPhaseChain(engine, PHASE_CHAIN.RESOLVE, ctx);
    return ctx;
  }

  function runDeathCheckPhase() {
    const ctx = {
      addLog,
      refreshBars,
      forceNextRound:false,
      resolved:false,
      outcome:null,
    };
    runPhaseChain(engine, PHASE_CHAIN.DEATH_CHECK, ctx);
    if (!ctx.outcome) ctx.outcome = BATTLE_OUTCOME.CONTINUE;
    return ctx;
  }

  return {
    runRoundStartPhase,
    runResolvePhase,
    runDeathCheckPhase,
  };
}
