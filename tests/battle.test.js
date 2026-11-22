import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createBattle, getBattleRecording, getBattleResult, getLegalActions, replayBattle,
  resolveBattleChoice, resolveTurn, snapshotBattle, startBattleRecording,
} from '../src/battle/core.js';
import { G } from '../src/state.js';

const readFixture = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const browserBaseline = readFixture('warlock-baseline.json');
const engineBaseline = readFixture('engine-baseline.json');

function values(state) {
  return {
    round: state.battle.round,
    playerHp: state.player.hp,
    playerJi: state.player.ji,
    enemyHp: state.enemy.hp,
    enemyJi: state.enemy.ji,
    curseStacks: state.enemy.curseStacks || 0,
  };
}

function phaseTrace(turn) {
  return [turn.resolution, turn.death, turn.nextRound]
    .filter(Boolean).flatMap(step => step.phaseTrace.map(entry => entry.phase + '/' + entry.effectId));
}

function turnLogs(turn) {
  return [turn.resolution, turn.death, turn.nextRound]
    .filter(Boolean).flatMap(step => step.logs.map(entry => entry.text));
}

test('replays three moves recorded through the frozen browser UI', () => {
  const state = structuredClone(browserBaseline.initial);
  for (const { actions, expected } of browserBaseline.turns) {
    const turn = resolveTurn(state, ...actions);
    assert.deepEqual({
      ...values(state),
      phase: state.battle.phase,
      playerAction: state.battle.lastPlayerAction,
      enemyAction: state.battle.lastEnemyAction,
      logs: [...turnLogs(turn), '▶ 回合 ' + state.battle.round],
    }, expected);
  }
});

for (const { name, setup, actions, expected } of engineBaseline.cases) {
  test('frozen engine: ' + name, t => {
    t.mock.method(Math, 'random', () => engineBaseline.randomSample);
    const state = structuredClone(browserBaseline.initial);
    for (const [key, values] of Object.entries(setup)) Object.assign(state[key], structuredClone(values));
    const turn = resolveTurn(state, ...actions);
    assert.deepEqual({
      state: {
        ...values(state),
        soulReturnUsed: state.abilities.soulReturnUsed,
        pendingHunt: state.battle.huntRhythmPending || null,
      },
      damage: turn.resolution.result,
      outcome: turn.outcome,
      logs: turnLogs(turn),
      phases: phaseTrace(turn),
    }, expected);
    if (turn.pending === 'hunt') {
      assert.equal(resolveBattleChoice(state, 'hit').pending, 'hunt');
      assert.equal(state.player.ji, expected.state.playerJi - 1);
      assert.equal(state.enemy.hp, expected.state.enemyHp - 1);
      resolveBattleChoice(state, 'finish');
      assert.equal(state.battle.round, 2);
      assert.equal(state.battle.huntRhythmPending, null);
    }
  });
}

test('same seed and actions reproduce snapshots, battle events and RNG progression', t => {
  t.mock.method(Math, 'random', () => { throw new Error('Unexpected unseeded battle draw'); });
  const config = {
    classKey: 'dog', enemy: 'faultRobot',
    abilities: { openMind: true, hardWorkLuck: true },
    powerRelics: { lever: true },
  };
  const run = seed => {
    const state = createBattle(config, seed);
    startBattleRecording(state);
    for (let round = 0; round < 3 && getBattleResult(state) === 'CONTINUE'; round++) {
      resolveTurn(state, 'ji', 'orb_random');
    }
    return { state: snapshotBattle(state), recording: getBattleRecording(state) };
  };
  const first = run(42);
  assert.deepEqual(run(42), first);
  assert.notDeepEqual(run(773).state.enemy.orbs, first.state.enemy.orbs);
  const portable = JSON.parse(JSON.stringify(first.recording));
  const replay = replayBattle(portable);
  assert.deepEqual(replay.state, first.state);
  assert.deepEqual(replay.recording, first.recording);
  portable.steps[0].result.enemyAction = 'ji';
  assert.throws(() => replayBattle(portable), /diverged at step 1/);
});

test('battle sessions can be interleaved and reject illegal actions without advancing', () => {
  const before = G;
  const first = createBattle({ classKey: 'warlock', powerRelics: { possibleReunion: true } }, 71);
  const second = createBattle({ classKey: 'mage', enemy: 'mob_1' }, 17);
  assert.equal(G, before);
  assert.deepEqual(getLegalActions(first, 'player'), ['ji']);
  const initial = snapshotBattle(first);
  assert.throws(() => resolveTurn(first, 'defense_0', 'ji'), /Illegal player action/);
  assert.throws(() => resolveTurn(first, 'ji', 'not_a_key'), /Illegal enemy action/);
  assert.deepEqual(snapshotBattle(first), initial);
  startBattleRecording(second);
  resolveTurn(second, 'ji');
  resolveTurn(first, 'ji', 'ji');
  resolveTurn(second, 'defense_0');
  assert.deepEqual(replayBattle(getBattleRecording(second)).state, snapshotBattle(second));
  assert.equal(G, before);
  assert.equal(first.battle.round, 2);
  assert.equal(second.battle.round, 3);
  assert.equal(second.player.lightningOrbs, 1);
});

test('delegation draws replay when a turn also has silence and reunion', () => {
  const state = createBattle({
    classKey: 'warlock', enemy: 'mob_1',
    powerRelics: { delegationProblem: true, silenceGold: true, possibleReunion: true },
  }, 340);
  startBattleRecording(state);
  const turn = resolveTurn(state, null, 'ji');
  assert.ok(turn.actions.playerAction);
  assert.ok(getLegalActions(state, 'player').every(key => !key.startsWith('defense_')));
  assert.deepEqual(replayBattle(getBattleRecording(state)).state, snapshotBattle(state));
});
