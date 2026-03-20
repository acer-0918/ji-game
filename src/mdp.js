/**
 * MDP-based boss policy computation.
 *
 * For each boss we solve an infinite-horizon discounted MDP with value
 * iteration, then extract a stochastic softmax policy (temperature T=1.3)
 * for variety. Q-values are recomputed on the fly at decision time from
 * the stored V table.
 *
 * Two player behaviour models are supported:
 *  - Standard  (assassin / tank): jiRate=3, no lightning-orb state.
 *  - Mage:                        jiRate=2, extra state dim pLO (0..5)
 *                                 tracking lightning-orb accumulation.
 */

import { BASE_ACTIONS } from './data.js';
import { G, orbUniqueCount } from './state.js';

const MAX_JI      = 12;    // Ji values capped in state space
const MAX_LO      = 5;     // lightning orbs tracked for mage (0..MAX_LO)
const GAMMA       = 0.92;  // discount factor
const MAX_ITER    = 400;   // value-iteration cap
const CONV_THRESH = 1e-5;  // convergence threshold
const TEMP        = 1.3;   // softmax temperature (higher = more random)

// ─── localStorage V-table cache ───────────────────────────────────────────────
// Cache key encodes every parameter that affects the result.
// Bump MDP_CACHE_VER whenever the MDP logic or constants change.
const MDP_CACHE_VER = 'v1';

function _cacheKey(label, classKey) {
  return `mdp_${MDP_CACHE_VER}_${label}_${classKey}_ji${MAX_JI}_lo${MAX_LO}_g${GAMMA}_i${MAX_ITER}`;
}

function _saveV(key, V) {
  try {
    const bytes = new Uint8Array(V.buffer);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    localStorage.setItem(key, btoa(bin));
  } catch (_) { /* storage full or unavailable */ }
}

function _loadV(key, expectedLen) {
  try {
    const b64 = localStorage.getItem(key);
    if (!b64) return null;
    const bin = atob(b64);
    if (bin.length !== expectedLen * 8) return null;   // length mismatch → stale
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float64Array(bytes.buffer);
  } catch (_) { return null; }
}

// Proxy action object for mage_release (0 Ji cost, atk 5, type attack)
const MAGE_RELEASE_ACT = { type: 'attack', cost: 0, atk: 5, damage: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// Player behaviour models
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard player model (assassin / tank).
 * Returns probability map {actionKey → prob} given player Ji.
 */
function playerPolicyProbs(pj) {
  const w = {};
  w['ji'] = pj < 3 ? 3.5 : pj < 6 ? 1.0 : 0.3;
  w['defense_0'] = 0.6;
  if (pj >= 1) w['defense_1'] = 0.5;
  if (pj >= 2) w['defense_2'] = 0.2;
  if (pj >= 1) w['attack_1'] = pj <= 2 ? 1.2 : 0.15;
  if (pj >= 2) w['attack_2'] = pj <= 3 ? 1.5 : 0.25;
  if (pj >= 3) w['attack_3'] = pj <= 4 ? 1.8 : 0.45;
  if (pj >= 4) w['attack_4'] = 2.0;
  if (pj >= 5) w['attack_5'] = 1.8;
  if (pj >= 6) w['attack_6'] = 2.2;
  if (pj >= 7) w['attack_7'] = 3.0;
  const valid = Object.keys(w).filter(k => BASE_ACTIONS[k] && BASE_ACTIONS[k].cost <= pj);
  const total = valid.reduce((s, k) => s + w[k], 0);
  const probs = {};
  if (total > 0) valid.forEach(k => (probs[k] = w[k] / total));
  else probs['ji'] = 1.0;
  return probs;
}

/**
 * Mage player model.
 * Defence actions accumulate lightning orbs; mage_release fires at pLO >= MAX_LO.
 * Returns probability map {actionKey → prob} given (pj, pLO).
 */
function playerPolicyProbs_mage(pj, pLO) {
  const w = {};
  // Mage jiRate=2, slower charge → lower charge weight
  w['ji'] = pj < 2 ? 3.0 : pj < 5 ? 0.8 : 0.2;
  // Defence preferred (builds lightning orbs)
  w['defense_0'] = 1.2;
  if (pj >= 1) w['defense_1'] = 1.0;
  if (pj >= 2) w['defense_2'] = 0.4;
  // Mage release — high priority when ready (free + strong)
  if (pLO >= MAX_LO) w['mage_release'] = 4.0;
  // Attacks
  if (pj >= 1) w['attack_1'] = pj <= 2 ? 1.0 : 0.1;
  if (pj >= 2) w['attack_2'] = pj <= 3 ? 1.2 : 0.2;
  if (pj >= 3) w['attack_3'] = pj <= 4 ? 1.5 : 0.4;
  if (pj >= 4) w['attack_4'] = 1.8;
  if (pj >= 5) w['attack_5'] = 1.6;
  if (pj >= 6) w['attack_6'] = 2.0;
  if (pj >= 7) w['attack_7'] = 2.8;
  const valid = Object.keys(w).filter(k => {
    if (k === 'mage_release') return pLO >= MAX_LO;
    return BASE_ACTIONS[k] && BASE_ACTIONS[k].cost <= pj;
  });
  const total = valid.reduce((s, k) => s + w[k], 0);
  const probs = {};
  if (total > 0) valid.forEach(k => (probs[k] = w[k] / total));
  else probs['ji'] = 1.0;
  return probs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player model objects
// Each exposes: probs(pj, plo), transition(pa, pj, plo)→{newPj,newPLO}, ploSize
// ─────────────────────────────────────────────────────────────────────────────

function makeStdModel() {
  return {
    probs:      (pj, _plo) => playerPolicyProbs(pj),
    transition: (pa, pj, _plo) => ({
      newPj:  pa === 'ji'
                ? clamp(pj + 3, 0, MAX_JI)
                : clamp(pj - (BASE_ACTIONS[pa]?.cost || 0), 0, MAX_JI),
      newPLO: 0,
    }),
    ploSize: 1,
  };
}

function makeMageModel() {
  return {
    probs: playerPolicyProbs_mage,
    transition: (pa, pj, plo) => {
      if (pa === 'ji')
        return { newPj: clamp(pj + 2, 0, MAX_JI), newPLO: plo };
      if (pa === 'mage_release')
        return { newPj: pj, newPLO: Math.max(0, plo - MAX_LO) };
      const cost = BASE_ACTIONS[pa]?.cost || 0;
      return {
        newPj:  clamp(pj - cost, 0, MAX_JI),
        newPLO: pa.startsWith('defense_') ? Math.min(plo + 1, MAX_LO) : plo,
      };
    },
    ploSize: MAX_LO + 1,  // indices 0..MAX_LO
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** All boss actions affordable at boss Ji level bj. */
function bossAffordable(bj) {
  return Object.keys(BASE_ACTIONS).filter(k => BASE_ACTIONS[k].cost <= bj);
}

/**
 * Simplified single-round damage.
 * pa = player action, ea = enemy/boss action.
 * Returns {pdmg, edmg}: damage dealt to player / to enemy.
 */
function rawDamage(pa, ea) {
  const pAtk = pa.type === 'attack';
  const eAtk = ea.type === 'attack';
  if (!pAtk && !eAtk) return { pdmg: 0, edmg: 0 };
  if (pAtk && !eAtk)  return { pdmg: 0, edmg: pa.atk > (ea.def || 0) ? (pa.damage || 1) : 0 };
  if (!pAtk && eAtk)  return { pdmg: ea.atk > (pa.def || 0) ? (ea.damage || 1) : 0, edmg: 0 };
  if (pa.atk > ea.atk) return { pdmg: 0, edmg: pa.damage || 1 };
  if (ea.atk > pa.atk) return { pdmg: ea.damage || 1, edmg: 0 };
  return { pdmg: 0, edmg: 0 };
}

/** Run value iteration, return converged V (Float64Array of length N). */
function valueIteration(N, bellman) {
  let V = new Float64Array(N);
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const Vnew = new Float64Array(N);
    let maxDelta = 0;
    for (let s = 0; s < N; s++) {
      const val = bellman(s, V);
      if (Math.abs(val - V[s]) > maxDelta) maxDelta = Math.abs(val - V[s]);
      Vnew[s] = val;
    }
    V = Vnew;
    if (maxDelta < CONV_THRESH) break;
  }
  return V;
}

/**
 * Sample an action from softmax distribution over Q-values.
 * Higher temperature → more uniform sampling.
 */
function sampleSoftmax(qMap, temperature) {
  const keys = Object.keys(qMap);
  if (keys.length === 0) return 'ji';
  let maxQ = -Infinity;
  for (const k of keys) if (qMap[k] > maxQ) maxQ = qMap[k];
  const exps = [];
  let sum = 0;
  for (const k of keys) {
    const e = Math.exp((qMap[k] - maxQ) / temperature);
    exps.push(e);
    sum += e;
  }
  const r = Math.random() * sum;
  let cumul = 0;
  for (let i = 0; i < keys.length; i++) {
    cumul += exps[i];
    if (r <= cumul) return keys[i];
  }
  return keys[keys.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard boss (贾诩 / jiaxu)
// State: (bj, pj, plo)
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyStandard(bossJiRate, pm, cacheLabel, classKey) {
  const N  = MAX_JI + 1;
  const NP = pm.ploSize;
  const NS = N * N * NP;

  function sidx(bj, pj, plo) { return (bj * N + pj) * NP + plo; }

  function bellman(s, V) {
    const plo = s % NP;
    const r   = Math.floor(s / NP);
    const pj  = r % N;
    const bj  = Math.floor(r / N);
    const pProbs = pm.probs(pj, plo);
    let bestQ = -Infinity;
    for (const ba of bossAffordable(bj)) {
      const bAct  = BASE_ACTIONS[ba];
      const newBj = clamp(ba === 'ji' ? bj + bossJiRate : bj - bAct.cost, 0, MAX_JI);
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, newPLO)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ === -Infinity ? 0 : bestQ;
  }

  const key = _cacheKey(cacheLabel, classKey);
  const cached = _loadV(key, NS);
  const V = cached ?? valueIteration(NS, bellman);
  if (!cached) _saveV(key, V);

  function decide(bj0, pj0, plo0 = 0) {
    const bj  = clamp(bj0, 0, MAX_JI);
    const pj  = clamp(pj0, 0, MAX_JI);
    const plo = clamp(plo0, 0, NP - 1);
    const pProbs = pm.probs(pj, plo);
    const qMap = {};
    for (const ba of bossAffordable(bj)) {
      const bAct  = BASE_ACTIONS[ba];
      const newBj = clamp(ba === 'ji' ? bj + bossJiRate : bj - bAct.cost, 0, MAX_JI);
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, newPLO)]);
      }
      qMap[ba] = q;
    }
    return sampleSoftmax(qMap, TEMP);
  }

  return { decide };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gufu
// State: (bj, pj, cv, plo)  —  cv = chargeValue, grows by 1 each time boss charges
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyGufu(pm, classKey) {
  const N     = MAX_JI + 1;
  const MAX_CV = 7;
  const NC    = MAX_CV + 1;   // cv indices 0..7 (cv=0 is unused sentinel)
  const NP    = pm.ploSize;
  const NS    = N * N * NC * NP;

  function sidx(bj, pj, cv, plo) {
    return ((bj * N + pj) * NC + cv) * NP + plo;
  }

  function bellman(s, V) {
    const plo = s % NP;
    const r1  = Math.floor(s / NP);
    const cv  = r1 % NC;
    const r2  = Math.floor(r1 / NC);
    const pj  = r2 % N;
    const bj  = Math.floor(r2 / N);
    if (cv === 0) return 0;

    const pProbs = pm.probs(pj, plo);
    let bestQ = -Infinity;
    for (const ba of bossAffordable(bj)) {
      const bAct = BASE_ACTIONS[ba];
      let newBj, newCv;
      if (ba === 'ji') {
        newBj = clamp(bj + cv, 0, MAX_JI);
        newCv = Math.min(cv + 1, MAX_CV);
      } else {
        newBj = clamp(bj - bAct.cost, 0, MAX_JI);
        newCv = cv;
      }
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, newCv, newPLO)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ === -Infinity ? 0 : bestQ;
  }

  const key = _cacheKey('gufu', classKey);
  const cached = _loadV(key, NS);
  const V = cached ?? valueIteration(NS, bellman);
  if (!cached) _saveV(key, V);

  function decide(bj0, pj0, cv0, plo0 = 0) {
    const bj  = clamp(bj0, 0, MAX_JI);
    const pj  = clamp(pj0, 0, MAX_JI);
    const cv  = clamp(cv0 || 1, 1, MAX_CV);
    const plo = clamp(plo0, 0, NP - 1);
    const pProbs = pm.probs(pj, plo);
    const qMap = {};
    for (const ba of bossAffordable(bj)) {
      const bAct = BASE_ACTIONS[ba];
      let newBj, newCv;
      if (ba === 'ji') {
        newBj = clamp(bj + cv, 0, MAX_JI);
        newCv = Math.min(cv + 1, MAX_CV);
      } else {
        newBj = clamp(bj - bAct.cost, 0, MAX_JI);
        newCv = cv;
      }
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, newCv, newPLO)]);
      }
      qMap[ba] = q;
    }
    return sampleSoftmax(qMap, TEMP);
  }

  return { decide };
}

// ─────────────────────────────────────────────────────────────────────────────
// FaultRobot
// State: (bj, pj, uo, plo)  —  uo = unique orb types generated (0..5)
//
// orb_random (0-cost): stochastically increments uo; uo=5 → instant-kill reward.
// Handled separately from regular BASE_ACTIONS loop to model uo transitions.
// ─────────────────────────────────────────────────────────────────────────────

function computePolicyFaultRobot(pm, classKey) {
  const N  = MAX_JI + 1;
  const NO = 6;   // uo: 0..5
  const NP = pm.ploSize;
  const NS = N * N * NO * NP;
  const KILL_REWARD = 15;
  const ORB_PASSIVE = { type: 'orb_buff', def: 0, atk: 0, cost: 0, damage: 0 };

  function sidx(bj, pj, uo, plo) {
    return ((bj * N + pj) * NO + uo) * NP + plo;
  }

  /** Q-value for orb_random action, modelling stochastic uo increase. */
  function qOrb(bj, pj, uo, plo, V) {
    if (uo === 5) return KILL_REWARD;
    const pProbs = pm.probs(pj, plo);
    const pInc   = (5 - uo) / 5;  // prob of gaining a new unique orb type
    let q = 0;
    for (const [pa, prob] of Object.entries(pProbs)) {
      const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
      const { pdmg } = rawDamage(pAct, ORB_PASSIVE);
      const { newPj, newPLO } = pm.transition(pa, pj, plo);
      const vUp   = V[sidx(bj, newPj, Math.min(uo + 1, 5), newPLO)];
      const vSame = V[sidx(bj, newPj, uo, newPLO)];
      q += prob * (-pdmg + GAMMA * (pInc * vUp + (1 - pInc) * vSame));
    }
    return q;
  }

  function bellman(s, V) {
    const plo = s % NP;
    const r1  = Math.floor(s / NP);
    const uo  = r1 % NO;
    const r2  = Math.floor(r1 / NO);
    const pj  = r2 % N;
    const bj  = Math.floor(r2 / N);
    const pProbs = pm.probs(pj, plo);
    // orb_random is handled by qOrb; exclude it from the regular action loop
    let bestQ = qOrb(bj, pj, uo, plo, V);
    for (const ba of bossAffordable(bj)) {
      if (ba === 'orb_random') continue;
      const bAct  = BASE_ACTIONS[ba];
      const newBj = clamp(ba === 'ji' ? bj + 3 : bj - bAct.cost, 0, MAX_JI);
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, uo, newPLO)]);
      }
      if (q > bestQ) bestQ = q;
    }
    return bestQ;
  }

  const key = _cacheKey('faultRobot', classKey);
  const cached = _loadV(key, NS);
  const V = cached ?? valueIteration(NS, bellman);
  if (!cached) _saveV(key, V);

  function decide(bj0, pj0, uo0, plo0 = 0) {
    const bj  = clamp(bj0, 0, MAX_JI);
    const pj  = clamp(pj0, 0, MAX_JI);
    const uo  = clamp(uo0 || 0, 0, 5);
    const plo = clamp(plo0, 0, NP - 1);
    const pProbs = pm.probs(pj, plo);
    const qMap = { orb_random: qOrb(bj, pj, uo, plo, V) };
    for (const ba of bossAffordable(bj)) {
      if (ba === 'orb_random') continue;
      const bAct  = BASE_ACTIONS[ba];
      const newBj = clamp(ba === 'ji' ? bj + 3 : bj - bAct.cost, 0, MAX_JI);
      let q = 0;
      for (const [pa, prob] of Object.entries(pProbs)) {
        const pAct = pa === 'mage_release' ? MAGE_RELEASE_ACT : BASE_ACTIONS[pa];
        const { pdmg, edmg } = rawDamage(pAct, bAct);
        const { newPj, newPLO } = pm.transition(pa, pj, plo);
        q += prob * ((pdmg - edmg) + GAMMA * V[sidx(newBj, newPj, uo, newPLO)]);
      }
      qMap[ba] = q;
    }
    return sampleSoftmax(qMap, TEMP);
  }

  return { decide };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let _policies  = null;
let _classKey  = null;

/**
 * Compute MDP policies for all three bosses.
 * Pass classKey so the correct player behaviour model is used.
 * Call once at hard-mode game start.
 */
export function initMDPPolicies(classKey = 'assassin') {
  _classKey = classKey;
  const pm = classKey === 'mage' ? makeMageModel() : makeStdModel();
  console.time('[MDP] compute');
  _policies = {
    jiaxu:      computePolicyStandard(3, pm, 'jiaxu', classKey),
    gufu:       computePolicyGufu(pm, classKey),
    faultRobot: computePolicyFaultRobot(pm, classKey),
  };
  console.timeEnd('[MDP] compute');
}

/** Discard policies (switch to normal mode). */
export function clearMDPPolicies() {
  _policies = null;
  _classKey = null;
}

/**
 * Return a stochastic MDP-sampled action for the given enemy.
 * Returns null if policies are not loaded (falls back to heuristic AI).
 */
export function mdpDecide(enemy) {
  if (!_policies) return null;
  const bj  = clamp(Math.floor(enemy.ji  || 0), 0, MAX_JI);
  const pj  = clamp(Math.floor(G.player.ji || 0), 0, MAX_JI);
  const plo = _classKey === 'mage'
    ? clamp(Math.floor(G.player.lightningOrbs || 0), 0, MAX_LO)
    : 0;

  if (enemy.id === 'jiaxu')      return _policies.jiaxu.decide(bj, pj, plo);
  if (enemy.id === 'gufu')       return _policies.gufu.decide(bj, pj, enemy.chargeValue || 1, plo);
  if (enemy.id === 'faultRobot') return _policies.faultRobot.decide(bj, pj, orbUniqueCount(enemy), plo);
  return null;
}
