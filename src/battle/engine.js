import { ACTOR_BUCKET, ACTOR_SCOPE } from './constants.js';

function normalizeEffect(effect) {
  if (!effect || !effect.phase || !effect.effectId || typeof effect.apply !== 'function') {
    throw new Error('Invalid battle effect registration.');
  }
  return {
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 5000,
    condition: null,
    ...effect,
  };
}

function effectSort(a, b) {
  const bucketA = ACTOR_BUCKET[a.actorScope] ?? ACTOR_BUCKET[ACTOR_SCOPE.SYSTEM];
  const bucketB = ACTOR_BUCKET[b.actorScope] ?? ACTOR_BUCKET[ACTOR_SCOPE.SYSTEM];
  if (bucketA !== bucketB) return bucketA - bucketB;
  if (a.order !== b.order) return a.order - b.order;
  return String(a.effectId).localeCompare(String(b.effectId));
}

export function createBattleEngine() {
  const effectsByPhase = new Map();

  function registerEffect(effect) {
    const normalized = normalizeEffect(effect);
    const phase = normalized.phase;
    if (!effectsByPhase.has(phase)) effectsByPhase.set(phase, []);
    effectsByPhase.get(phase).push(normalized);
    return normalized;
  }

  function getEffects(phase) {
    const list = effectsByPhase.get(phase) || [];
    return [...list].sort(effectSort);
  }

  function runPhase(phase, ctx = {}) {
    if (!Array.isArray(ctx.phaseTrace)) ctx.phaseTrace = [];
    const list = getEffects(phase);
    for (const effect of list) {
      if (ctx.stopPhase) break;
      if (effect.condition && !effect.condition(ctx)) continue;
      effect.apply(ctx);
      ctx.phaseTrace.push({ phase, effectId: effect.effectId });
    }
    return ctx;
  }

  return {
    registerEffect,
    getEffects,
    runPhase,
  };
}
