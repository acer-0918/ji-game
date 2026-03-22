import { G } from '../state.js';
import { clampPlayerJiByEquipment } from '../equipment/runtime.js';

function isAttackAction(action) {
  return action && action.type === 'attack';
}

function getAttackHits(action) {
  if (!isAttackAction(action)) return 0;
  return action.hits || 1;
}

function createHitCompareEvent(pa, ea) {
  return {
    playerAction: pa,
    enemyAction: ea,
    playerHits: 0,
    enemyHits: 0,
    msgs: [],
  };
}

function createHitEvent(side, attackAction, defendAction, hitCount) {
  return {
    side,
    attackAction,
    defendAction,
    hitCount,
    damageEvents: [],
    bonusDamage: 0,
    triggers: [],
  };
}

const HIT_COMPARE_HOOKS = [];
const HIT_HOOKS = [];
const DAMAGE_EVENT_HOOKS = [];
const DAMAGE_TOTAL_HOOKS = [];

function runHooks(hooks, context) {
  hooks.forEach((hook) => hook(context));
}

export function registerHitCompareHook(hook) {
  HIT_COMPARE_HOOKS.push(hook);
}

export function registerHitHook(hook) {
  HIT_HOOKS.push(hook);
}

export function registerDamageEventHook(hook) {
  DAMAGE_EVENT_HOOKS.push(hook);
}

export function registerDamageTotalHook(hook) {
  DAMAGE_TOTAL_HOOKS.push(hook);
}

function baseResolveHitCompare(ctx) {
  const pa = ctx.playerAction;
  const ea = ctx.enemyAction;
  const pAtk = isAttackAction(pa);
  const eAtk = isAttackAction(ea);
  const pHits = getAttackHits(pa);
  const eHits = getAttackHits(ea);

  if (!pAtk && !eAtk) {
    ctx.msgs.push('双方都没有发动攻击，本回合无直接伤害。');
    return;
  }

  if (pAtk && !eAtk) {
    const enemyDef = ea.def || 0;
    if ((pa.atk || 0) > enemyDef) {
      ctx.playerHits = 1;
      ctx.msgs.push(`玩家攻击等级 ${pa.atk} 突破敌方防御 ${enemyDef}，命中。`);
    } else {
      ctx.msgs.push(`玩家攻击等级 ${pa.atk} 未高于敌方防御 ${enemyDef}，本次未命中。`);
    }
    return;
  }

  if (!pAtk && eAtk) {
    const playerDef = pa.def || 0;
    if ((ea.atk || 0) > playerDef) {
      ctx.enemyHits = 1;
      ctx.msgs.push(`敌方攻击等级 ${ea.atk} 突破玩家防御 ${playerDef}，命中。`);
    } else {
      ctx.msgs.push(`敌方攻击等级 ${ea.atk} 未高于玩家防御 ${playerDef}，本次未命中。`);
    }
    return;
  }

  const pPower = (pa.atk || 0) * pHits;
  const ePower = (ea.atk || 0) * eHits;
  if (pPower > ePower) {
    ctx.playerHits = 1;
    ctx.msgs.push(`双方互攻：玩家总攻击 ${pPower} 高于敌方 ${ePower}，玩家命中。`);
  } else if (ePower > pPower) {
    ctx.enemyHits = 1;
    ctx.msgs.push(`双方互攻：敌方总攻击 ${ePower} 高于玩家 ${pPower}，敌方命中。`);
  } else {
    ctx.msgs.push(`双方互攻：总攻击相同（${pPower}），双方均未命中。`);
  }
}

function resolveHitPhase(pa, ea) {
  const ctx = createHitCompareEvent(pa, ea);
  baseResolveHitCompare(ctx);
  runHooks(HIT_COMPARE_HOOKS, ctx);
  ctx.playerHits = Math.max(0, Math.floor(ctx.playerHits || 0));
  ctx.enemyHits = Math.max(0, Math.floor(ctx.enemyHits || 0));
  return { playerHits: ctx.playerHits, enemyHits: ctx.enemyHits, msgs: ctx.msgs };
}

function applyDefaultDamageEventOnHit(ctx) {
  for (let i = 0; i < ctx.hitCount; i++) {
    ctx.damageEvents.push({ amount:0 });
  }
}

function applyDefaultDamagePoint(ctx) {
  ctx.damageEvent.amount += 1;
}

function applyActionDamageBonus(ctx) {
  const perHitBonus = Math.max(0, (ctx.attackAction.damage || 1) - 1);
  if (perHitBonus > 0) ctx.damageEvent.amount += perHitBonus;
}

function applyFireBladeBonus(ctx) {
  if (ctx.side !== 'player') return;
  const defenseRank = isAttackAction(ctx.defendAction) ? (ctx.defendAction.atk || 0) : (ctx.defendAction.def || 0);
  if (G.abilities.fireBlade && (ctx.attackAction.atk || 0) - defenseRank >= 3) {
    ctx.bonusDamage += 1;
    ctx.triggers.push('暴击——高出至少 3 级，伤害 +1');
  }
}

function applyMageFocusBonus(ctx) {
  if (ctx.side !== 'player' || !ctx.attackAction.isMageRelease) return;
  if (!G.abilities.focus) return;
  ctx.bonusDamage += 1;
  ctx.triggers.push('集中——一重释放命中后，伤害 +1');
}

function applyEnhancedDaggerOnHit(ctx) {
  if (ctx.side !== 'player') return;
  const gainPerHit = ctx.attackAction.onHitGainJi || 0;
  if (gainPerHit <= 0) return;
  const gain = gainPerHit * ctx.hitCount;
  G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + gain);
  ctx.triggers.push(`强化小刀——命中后获得 ${gain} Ji`);
}

function applyMageElectrodynamicsOnHit(ctx) {
  if (ctx.side !== 'player' || !ctx.attackAction.isMageRelease) return;
  if (!G.abilities.electrodynamics) return;
  G.player.lightningOrbs = (G.player.lightningOrbs || 0) + 3;
  ctx.triggers.push('电动力学——一重释放命中后，获得 3 闪电球');
}

function applyDogHardWorkLuckOnHit(ctx) {
  if (ctx.side !== 'player') return;
  if (!G.player || G.player.classKey !== 'dog') return;
  if (!G.abilities.hardWorkLuck) return;
  G.player.luck = Math.max(0, (G.player.luck || 0) + 1);
  ctx.triggers.push('七分打拼——命中后，幸运值 +1');
}

HIT_HOOKS.push(applyDefaultDamageEventOnHit);
HIT_HOOKS.push(applyEnhancedDaggerOnHit);
HIT_HOOKS.push(applyMageElectrodynamicsOnHit);
HIT_HOOKS.push(applyDogHardWorkLuckOnHit);
DAMAGE_EVENT_HOOKS.push(applyDefaultDamagePoint);
DAMAGE_EVENT_HOOKS.push(applyActionDamageBonus);
DAMAGE_TOTAL_HOOKS.push(applyFireBladeBonus);
DAMAGE_TOTAL_HOOKS.push(applyMageFocusBonus);

function resolveDamageFromHits(side, attackAction, defendAction, hitCount) {
  if (hitCount <= 0) return { damage:0, triggers:[] };
  const hitEvent = createHitEvent(side, attackAction, defendAction, hitCount);
  runHooks(HIT_HOOKS, hitEvent);
  hitEvent.damageEvents.forEach((damageEvent, eventIndex) => {
    runHooks(DAMAGE_EVENT_HOOKS, {
      ...hitEvent,
      damageEvent,
      eventIndex,
    });
  });
  runHooks(DAMAGE_TOTAL_HOOKS, hitEvent);
  const baseDamage = hitEvent.damageEvents.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  return { damage: baseDamage + hitEvent.bonusDamage, triggers: hitEvent.triggers };
}

export function calcHitCheck(pa, ea) {
  return resolveHitPhase(pa, ea);
}

export function calcOnHitDamage(pa, ea, hitCheck) {
  const phase = hitCheck || resolveHitPhase(pa, ea);
  const playerDamage = resolveDamageFromHits('player', pa, ea, phase.playerHits);
  const enemyDamage = resolveDamageFromHits('enemy', ea, pa, phase.enemyHits);
  return {
    pdmg: enemyDamage.damage,
    edmg: playerDamage.damage,
    triggers: [...playerDamage.triggers, ...enemyDamage.triggers],
    hitCheck: phase,
  };
}

export function calcDamage(pa, ea) {
  const hitCheck = calcHitCheck(pa, ea);
  const onHit = calcOnHitDamage(pa, ea, hitCheck);
  return {
    pdmg: onHit.pdmg,
    edmg: onHit.edmg,
    msgs: [...hitCheck.msgs],
    triggers: [...onHit.triggers],
  };
}
