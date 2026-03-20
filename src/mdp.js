/**
 * MDP-based boss policy computation.
 *
 * For each boss we solve an infinite-horizon discounted MDP with value
 * iteration, then extract a greedy deterministic policy table.
 *
 * Player model: a fixed probability distribution over actions given the
 * player's current Ji level, calibrated to typical human play.
 *
 * Boss reward signal: E[damage dealt to player] - E[damage received], so
 * the policy maximises net expected damage over the run.
 */

import { BASE_ACTIONS } from './data.js';
import { G, orbUniqueCount } from './state.js';

const MAX_JI        = 12;   // Ji values capped at this in the state space
const PLAYER_JI_RATE = 3;   // default player charge rate (no oneVsFour)
const GAMMA          = 0.92; // discount factor
const MAX_ITER       = 400;  // value-iteration cap
const CONV_THRESH    = 1e-5; // convergence threshold

// ─────────────────────────────────────────────────────────────────────────────
// Player behaviour model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a probability map {actionKey → probability} representing how a
 * typical human player acts given their Ji level.
 */
function playerPolicyProbs(pj) {
  const w = {};

  // Charge probability decreases as Ji grows
  w['ji'] = pj < 3 ? 3.5 : pj < 6 ? 1.0 : 0.3;

  // Defence options — player occasionally defends
  w['defense_0'] = 0.6;
  if (pj >= 1) w['defense_1'] = 0.5;
  if (pj >= 2) w['defense_2'] = 0.2;

  // Attack preference ramps up with Ji; players favour affordable high attacks
  if (pj >= 1) w['attack_1'] = pj <= 2 ? 1.2 : 0.15;
  if (pj >= 2) w['attack_2'] = pj <= 3 ? 1.5 : 0.25;
  if (pj >= 3) w['attack_3'] = pj <= 4 ? 1.8 : 0.45;
  if (pj >= 4) w['attack_4'] = 2.0;
  if (pj >= 5) w['attack_5'] = 1.8;
  if (pj >= 6) w['attack_6'] = 2.2;
  if (pj >= 7) w['attack_7'] = 3.0;

  // Keep only actions the player can afford
  const valid = Object.keys(w).filter(k => BASE_ACTIONS[k] && BASE_ACTIONS[k].cost <= pj);
  const total = valid.reduce((s, k) => s + w[k], 0);
  const probs = {};
  if (total > 0) valid.forEach(k => (probs[k] = w[k] / total));
  else probs['ji'] = 1.0;
  return probs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Actions the boss can afford given its Ji. */
function bossAffordable(bj) {
  return Object.keys(BASE_ACTIONS).filter(k => BASE_ACTIONS[k].cost <= bj);
}

/**
 * Simplified single-round damage calculation (no ability / shop bonuses).
 * pa = player action object, ea = enemy action object.
 * Returns {pdmg, edmg}: damage to player and damage to enemy.
 */
function rawDamage(pa, ea) {
  const pAtk = pa.type === 'attack';
  const eAtk = ea.type === 'attack';
  if (!pAtk && !eAtk) return { pdmg: 0, edmg: 0 };
  if (pAtk && !eAtk)  return { pdmg: 0, edmg: pa.atk > (ea.def || 0) ? (pa.damage || 1) : 0 };
  if (!pAtk && eAtk)  return { pdmg: ea.atk > (pa.def || 0) ? (ea.damage || 1) : 0, edmg: 0 };
  // Both attack
  if (pa.atk > ea.atk) return { pdmg: 0, edmg: pa.damage || 1 };
  if (ea.atk > pa.atk) return { pdmg: ea.damage || 1, edmg: 0 };
  return { pdmg: 0, edmg: 0 };
}

/** Run value iteration, return converged V array. */
function valueIteration(N, bellman) {
  let V = new Float64Array(N);
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const Vnew = new Float64Array(N);
    let maxDelta = 0;
    for (let s = 0; s < N; s++) {
      const val = bellman(s, V);
      maxDelta = Math.max(maxDelta, Math.abs(val - V[s]));
      Vnew[s] = val;
    }
    V = Vnew;
    if (maxDelta < CONV_THRESH) break;
  }
  return V;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard boss MDP  (贾诩 / jiaxu)
// State: (bj, pj)  —  bj = boss Ji, pj = player Ji
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyStandard(bossJiRate) {
  const N = MAX_JI + 1;   // 13
  const NS = N * N;       // 169 states

  function stateIdx(bj, pj) { return bj * N + pj; }

  function bellman(s, V) {
    const bj = Math.floor(s / N);
    const pj = s % N;
    const pProbs = playerPolicyProbs(pj);
    const pActs  = Object.keys(pProbs);
    let bestQ = -Infinity;

    for (const ba of bossAffordable(bj)) {
      const bAction = BASE_ACTIONS[ba];
      let q = 0;
      const newBj = clamp(ba === 'ji' ? bj + bossJiRate : bj - bAction.cost, 0, MAX_JI);
      for (const pa of pActs) {
        const pAction = BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAction, bAction);
        const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
        q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ === -Infinity ? 0 : bestQ;
  }

  const V = valueIteration(NS, bellman);

  // Greedy policy extraction
  const policy = new Array(N).fill(null).map(() => new Array(N).fill('ji'));
  for (let bj = 0; bj < N; bj++) {
    for (let pj = 0; pj < N; pj++) {
      const pProbs = playerPolicyProbs(pj);
      const pActs  = Object.keys(pProbs);
      let bestAct = 'ji', bestQ = -Infinity;
      for (const ba of bossAffordable(bj)) {
        const bAction = BASE_ACTIONS[ba];
        let q = 0;
        const newBj = clamp(ba === 'ji' ? bj + bossJiRate : bj - bAction.cost, 0, MAX_JI);
        for (const pa of pActs) {
          const pAction = BASE_ACTIONS[pa];
          const { pdmg, edmg } = rawDamage(pAction, bAction);
          const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
          q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj)]);
        }
        if (q > bestQ) { bestQ = q; bestAct = ba; }
      }
      policy[bj][pj] = bestAct;
    }
  }

  return {
    decide: (bj, pj) => policy[clamp(bj, 0, MAX_JI)][clamp(pj, 0, MAX_JI)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gufu MDP
// State: (bj, pj, cv)  —  cv = chargeValue (grows by 1 each charge)
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyGufu() {
  const N    = MAX_JI + 1;  // 13
  const MAX_CV = 7;
  const NC   = MAX_CV + 1;  // cv indices 0..7 (we use 1..7)
  const NS   = N * N * NC;

  function stateIdx(bj, pj, cv) { return (bj * N + pj) * NC + cv; }

  function bellman(s, V) {
    const cv = s % NC;
    const rest = Math.floor(s / NC);
    const pj = rest % N;
    const bj = Math.floor(rest / N);
    if (cv === 0) return 0; // unused slot

    const pProbs = playerPolicyProbs(pj);
    const pActs  = Object.keys(pProbs);
    let bestQ = -Infinity;

    for (const ba of bossAffordable(bj)) {
      const bAction = BASE_ACTIONS[ba];
      let newBj, newCv;
      if (ba === 'ji') {
        newBj = clamp(bj + cv, 0, MAX_JI);
        newCv = Math.min(cv + 1, MAX_CV);
      } else {
        newBj = clamp(bj - bAction.cost, 0, MAX_JI);
        newCv = cv;
      }
      let q = 0;
      for (const pa of pActs) {
        const pAction = BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAction, bAction);
        const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
        q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj, newCv)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ === -Infinity ? 0 : bestQ;
  }

  const V = valueIteration(NS, bellman);

  // Greedy policy
  const policy = {};
  for (let bj = 0; bj < N; bj++) {
    policy[bj] = {};
    for (let pj = 0; pj < N; pj++) {
      policy[bj][pj] = {};
      for (let cv = 1; cv <= MAX_CV; cv++) {
        const pProbs = playerPolicyProbs(pj);
        const pActs  = Object.keys(pProbs);
        let bestAct = 'ji', bestQ = -Infinity;
        for (const ba of bossAffordable(bj)) {
          const bAction = BASE_ACTIONS[ba];
          let newBj, newCv;
          if (ba === 'ji') {
            newBj = clamp(bj + cv, 0, MAX_JI);
            newCv = Math.min(cv + 1, MAX_CV);
          } else {
            newBj = clamp(bj - bAction.cost, 0, MAX_JI);
            newCv = cv;
          }
          let q = 0;
          for (const pa of pActs) {
            const pAction = BASE_ACTIONS[pa];
            const { pdmg, edmg } = rawDamage(pAction, bAction);
            const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
            q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj, newCv)]);
          }
          if (q > bestQ) { bestQ = q; bestAct = ba; }
        }
        policy[bj][pj][cv] = bestAct;
      }
    }
  }

  return {
    decide: (bj, pj, cv) =>
      policy[clamp(bj, 0, MAX_JI)]?.[clamp(pj, 0, MAX_JI)]?.[clamp(cv || 1, 1, MAX_CV)] ?? 'ji',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FaultRobot MDP
// State: (bj, pj, uo)  —  uo = unique orb types generated (0..5)
//
// orb_random is always 0-cost.
//   uo = 5 → instant-kill player (terminal, huge reward).
//   uo < 5 → new unique type with prob (5-uo)/5, else existing type.
//   Either way boss Ji doesn't change; player may deal damage.
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyFaultRobot() {
  const N  = MAX_JI + 1;  // 13
  const NO = 6;            // uo: 0..5
  const NS = N * N * NO;
  const KILL_REWARD = 15;  // instant-kill value

  // A passive non-attacking action placeholder for orb_random
  const ORB_PASSIVE = { type: 'orb_buff', def: 0, atk: 0, cost: 0, damage: 0 };

  function stateIdx(bj, pj, uo) { return (bj * N + pj) * NO + uo; }

  function qOrb(bj, pj, uo, V) {
    if (uo === 5) return KILL_REWARD; // terminal instant-kill
    const pProbs = playerPolicyProbs(pj);
    const pInc   = (5 - uo) / 5;
    let q = 0;
    for (const pa of Object.keys(pProbs)) {
      const pAction = BASE_ACTIONS[pa];
      const { pdmg }  = rawDamage(pAction, ORB_PASSIVE);
      const newPj     = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
      const vUp       = V[stateIdx(bj, newPj, Math.min(uo + 1, 5))];
      const vSame     = V[stateIdx(bj, newPj, uo)];
      q += pProbs[pa] * (-pdmg + GAMMA * (pInc * vUp + (1 - pInc) * vSame));
    }
    return q;
  }

  function bellman(s, V) {
    const uo   = s % NO;
    const rest = Math.floor(s / NO);
    const pj   = rest % N;
    const bj   = Math.floor(rest / N);

    const pProbs = playerPolicyProbs(pj);
    let bestQ = qOrb(bj, pj, uo, V);

    for (const ba of bossAffordable(bj)) {
      const bAction = BASE_ACTIONS[ba];
      const newBj   = clamp(ba === 'ji' ? bj + 3 : bj - bAction.cost, 0, MAX_JI);
      let q = 0;
      for (const pa of Object.keys(pProbs)) {
        const pAction = BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAction, bAction);
        const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
        q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj, uo)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ;
  }

  const V = valueIteration(NS, bellman);

  // Greedy policy
  const policy = {};
  for (let bj = 0; bj < N; bj++) {
    policy[bj] = {};
    for (let pj = 0; pj < N; pj++) {
      policy[bj][pj] = {};
      for (let uo = 0; uo < NO; uo++) {
        const pProbs  = playerPolicyProbs(pj);
        let bestAct = 'orb_random';
        let bestQ   = qOrb(bj, pj, uo, V);

        for (const ba of bossAffordable(bj)) {
          const bAction = BASE_ACTIONS[ba];
          const newBj   = clamp(ba === 'ji' ? bj + 3 : bj - bAction.cost, 0, MAX_JI);
          let q = 0;
          for (const pa of Object.keys(pProbs)) {
            const pAction = BASE_ACTIONS[pa];
            const { pdmg, edmg } = rawDamage(pAction, bAction);
            const newPj = clamp(pa === 'ji' ? pj + PLAYER_JI_RATE : pj - pAction.cost, 0, MAX_JI);
            q += pProbs[pa] * ((pdmg - edmg) + GAMMA * V[stateIdx(newBj, newPj, uo)]);
          }
          if (q > bestQ) { bestQ = q; bestAct = ba; }
        }
        policy[bj][pj][uo] = bestAct;
      }
    }
  }

  return {
    decide: (bj, pj, uo) =>
      policy[clamp(bj, 0, MAX_JI)]?.[clamp(pj, 0, MAX_JI)]?.[clamp(uo || 0, 0, 5)] ?? 'orb_random',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let _policies = null;

/** Compute MDP policies for all three bosses (call once at hard-mode start). */
export function initMDPPolicies() {
  console.time('[MDP] compute');
  _policies = {
    jiaxu:      computePolicyStandard(3),
    gufu:       computePolicyGufu(),
    faultRobot: computePolicyFaultRobot(),
  };
  console.timeEnd('[MDP] compute');
}

/** Discard policies (normal mode). */
export function clearMDPPolicies() {
  _policies = null;
}

/**
 * Look up the MDP-optimal action for the given enemy.
 * Returns null if policies are not loaded (falls back to heuristic AI).
 */
export function mdpDecide(enemy) {
  if (!_policies) return null;
  const bj = clamp(Math.floor(enemy.ji || 0), 0, MAX_JI);
  const pj = clamp(Math.floor(G.player.ji || 0), 0, MAX_JI);

  if (enemy.id === 'jiaxu')      return _policies.jiaxu.decide(bj, pj);
  if (enemy.id === 'gufu')       return _policies.gufu.decide(bj, pj, enemy.chargeValue || 1);
  if (enemy.id === 'faultRobot') return _policies.faultRobot.decide(bj, pj, orbUniqueCount(enemy));
  return null;
}
