import { aiDecide } from '../ai.js';
import { registerEquipmentEffects } from '../equipment/effects.js';
import { hasPowerRelic } from '../powerRelics/index.js';
import { G, withGameState } from '../state.js';
import { clone } from '../utils.js';
import { canUsePlayerAction, chooseDelegatedAction, getLegalActions } from './actions.js';
import { BATTLE_OUTCOME } from './constants.js';
import { registerDefaultCombatEffects } from './defaultCombatEffects.js';
import { registerDefaultDeathEffects } from './defaultDeathEffects.js';
import { registerDefaultResolveEffects } from './defaultResolveEffects.js';
import { registerDefaultRoundStartEffects } from './defaultRoundStartEffects.js';
import { createBattleEngine } from './engine.js';
import { applyFollowUp, getPendingChoice } from './followUps.js';
import { createBattleRuntime } from './runtime.js';
import { createBattleState, snapshotBattle } from './setup.js';
import { registerTechEffects } from './techEffects.js';

export { getLegalActions, snapshotBattle };

// Registration also installs global hit hooks. All sessions share this registry.
const engine = createBattleEngine();
registerDefaultCombatEffects(engine);
registerDefaultRoundStartEffects(engine);
registerDefaultResolveEffects(engine);
registerDefaultDeathEffects(engine);
registerTechEffects(engine);
registerEquipmentEffects(engine);

const recordings = new WeakMap();

export function startBattleRecording(state) {
  const seed = state.battle?.random?.seed;
  if (seed === undefined) throw new Error('A seeded battle is required for recording.');
  const recording = { version: 1, seed, initialState: snapshotBattle(state), steps: [] };
  recordings.set(state, recording);
}

export function getBattleRecording(state) {
  const recording = recordings.get(state);
  return recording ? clone(recording) : null;
}

function record(state, operation, args, result) {
  const recording = recordings.get(state);
  if (recording) {
    const { player, enemy, battle } = state;
    const vitals = [player.hp, player.ji, enemy.hp, enemy.ji];
    recording.steps.push(clone({ operation, args, round: battle.round, vitals, result }));
  }
  return result;
}

function setOutcome(state, outcome) {
  if (!outcome || outcome === BATTLE_OUTCOME.CONTINUE) return;
  state.battle.outcome = outcome;
  if (state.player.classKey === 'warlock' && state.abilities.grudge && state.enemy.curseStacks > 0) {
    state.player.carryCurseStacks = Math.min(3, state.enemy.curseStacks);
  }
}

// The browser uses these steps around its animations. The public turn API
// calls the same steps immediately for simulation and replay.
export function createBattleController({ addLog, refreshBars } = {}) {
  function captureLogs() {
    const logs = [];
    const log = (style, text) => {
      logs.push({ style, text });
      addLog?.(style, text);
    };
    return { logs, log };
  }

  function phase(state, method) {
    const { logs, log } = captureLogs();
    const runtime = createBattleRuntime({ engine, addLog: log, refreshBars });
    const ctx = withGameState(state, runtime[method]);
    return {
      logs, phaseTrace: ctx.phaseTrace || [], outcome: ctx.outcome,
      result: ctx.result || null,
      battleEnded: !!ctx.battleEnded,
    };
  }

  return {
    startRound(state) {
      const result = phase(state, 'runRoundStartPhase');
      setOutcome(state, result.outcome);
      return record(state, 'startRound', [], result);
    },
    chooseDelegatedAction(state) {
      return record(state, 'chooseDelegatedAction', [], chooseDelegatedAction(state));
    },
    selectActions(state, playerAction, enemyAction = null) {
      const { battle } = state;
      state.ui.actionKey = playerAction;
      battle.pAction = playerAction;
      battle.eAction = enemyAction ?? withGameState(state, () => aiDecide(G.enemy));
      if (enemyAction !== null && battle.enemyMustAttackNextRound) battle.enemyMustAttackNextRound = false;
      battle.phase = 'reveal';
      battle.cardsRevealed = false;
      return record(state, 'selectActions', [playerAction, enemyAction], {
        playerAction, enemyAction: battle.eAction,
      });
    },
    resolveActions(state) {
      state.battle.cardsRevealed = true;
      const result = phase(state, 'runResolvePhase');
      if (result.result) {
        state.battle.lastPlayerAction = state.battle.pAction;
        state.battle.lastEnemyAction = state.battle.eAction;
      }
      return record(state, 'resolveActions', [], result);
    },
    prepareHuntRhythm(state) {
      state.battle.huntRhythmPending.extraCount = 0;
      return record(state, 'prepareHuntRhythm', [], true);
    },
    applyFollowUp(state, type, action) {
      const { logs, log } = captureLogs();
      const applied = applyFollowUp(state, type, action, log);
      const result = { applied, logs, enemyHp: state.enemy.hp, playerJi: state.player.ji };
      return record(state, 'applyFollowUp', [type, action], result);
    },
    checkDeath(state) {
      const result = phase(state, 'runDeathCheckPhase');
      setOutcome(state, result.outcome);
      return record(state, 'checkDeath', [], result);
    },
    advanceRound(state) {
      state.battle.round += 1;
      state.battle.phase = 'select';
      state.battle.cardsRevealed = false;
      state.ui = { mainSel: null, actionKey: null };
      return record(state, 'advanceRound', [], { round: state.battle.round });
    },
  };
}

const controller = createBattleController();

export function createBattle(config = {}, seed) {
  const state = createBattleState(config, seed);
  controller.startRound(state);
  return state;
}

export function getBattleResult(state) {
  return state.battle?.outcome || BATTLE_OUTCOME.CONTINUE;
}

function finishTurn(state) {
  const death = controller.checkDeath(state);
  if (getBattleResult(state) !== BATTLE_OUTCOME.CONTINUE) return { death, nextRound: null };
  controller.advanceRound(state);
  return { death, nextRound: controller.startRound(state) };
}

export function resolveTurn(state, playerAction, enemyAction = null) {
  if (state.battle.phase !== 'select' || state.battle.outcome) {
    throw new Error('The battle is not accepting turn actions.');
  }
  if (enemyAction !== null && !getLegalActions(state, 'enemy').includes(enemyAction)) {
    throw new RangeError('Illegal enemy action: ' + enemyAction);
  }
  const delegated = hasPowerRelic(state, 'delegationProblem');
  const selected = delegated && playerAction == null
    ? controller.chooseDelegatedAction(state) || 'ji'
    : playerAction;
  if (!canUsePlayerAction(state, selected, { ignoreRoundDisabled: delegated })) {
    throw new RangeError('Illegal player action: ' + selected);
  }
  const actions = controller.selectActions(state, selected, enemyAction);
  const resolution = controller.resolveActions(state);
  const pending = getPendingChoice(state);
  if (pending === 'hunt' && delegated) {
    const followUp = controller.applyFollowUp(state, 'hunt', 'finish');
    return { actions, resolution, followUp, pending: null, ...finishTurn(state), outcome: getBattleResult(state) };
  }
  if (pending) {
    if (pending === 'hunt') controller.prepareHuntRhythm(state);
    return { actions, resolution, pending, outcome: getBattleResult(state) };
  }
  const turnEnd = finishTurn(state);
  return { actions, resolution, pending: null, ...turnEnd, outcome: getBattleResult(state) };
}

export function resolveBattleChoice(state, action) {
  const pending = getPendingChoice(state);
  if (!pending || state.battle.phase !== 'reveal' || !['hit', 'finish'].includes(action)) {
    throw new Error('The battle is not accepting that follow-up choice.');
  }
  const followUp = controller.applyFollowUp(state, pending, action);
  if (!followUp.applied) throw new RangeError('The follow-up action is unavailable.');
  if (action === 'hit') {
    const exhausted = pending === 'free' && state.battle.freeFollowUpPending.count === 0;
    if (!exhausted && state.enemy.hp > 0) return { followUp, pending, outcome: getBattleResult(state) };
    controller.applyFollowUp(state, pending, 'finish');
  }
  const turnEnd = finishTurn(state);
  return { followUp, ...turnEnd, pending: null, outcome: getBattleResult(state) };
}

const recordedOperations = new Set(Object.keys(controller));

export function replayBattle(recording) {
  if (recording.version !== 1 || recording.initialState?.battle?.random?.seed !== recording.seed) {
    throw new Error('Invalid or unsupported battle recording.');
  }
  const state = clone(recording.initialState);
  startBattleRecording(state);
  const actual = recordings.get(state);
  for (const [index, step] of recording.steps.entries()) {
    if (!recordedOperations.has(step.operation)) throw new Error('Unknown battle operation: ' + step.operation);
    controller[step.operation](state, ...step.args);
    if (JSON.stringify(actual.steps[index]) !== JSON.stringify(step)) {
      throw new Error('Battle replay diverged at step ' + (index + 1) + ' (' + step.operation + ').');
    }
  }
  return { state, recording: getBattleRecording(state), outcome: getBattleResult(state) };
}
