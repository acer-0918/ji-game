import { BATTLE_OUTCOME } from './constants.js';
import { PHASE_CHAIN, runPhaseChain } from './flow.js';

function emitResolveResultLogs(addLog, result) {
  if (typeof addLog !== 'function' || !result) return;
  result.msgs.forEach((msg) => addLog(result.edmg > 0 || result.pdmg > 0 ? 'log-dmg' : 'log-blk', msg));
  result.triggers.forEach((trigger) => addLog('log-ab', `✨ ${trigger}`));
  if (result.pdmg > 0) addLog('log-dmg', `玩家受到 ${result.pdmg} 点伤害！`);
  if (result.edmg > 0) addLog('log-dmg', `敌方受到 ${result.edmg} 点伤害！`);
}

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
      outcome:null,
    };
    runPhaseChain(engine, PHASE_CHAIN.ROUND_START, ctx);
    return ctx;
  }

  function runResolvePhase() {
    const ctx = { addLog, refreshBars };
    runPhaseChain(engine, PHASE_CHAIN.RESOLVE, ctx);
    emitResolveResultLogs(addLog, ctx.result);
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
