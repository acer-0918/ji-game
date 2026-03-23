/**
 * 战技系统 — 战斗引擎效果注册 & 命中钩子
 */
import { PHASES, ACTOR_SCOPE } from './constants.js';
import { ROUND_START_ORDER } from './order.js';
import {
  registerHitCompareHook,
  registerHitHook,
  registerDamageTotalHook,
} from '../logic.js';
import { recordBossObservedTag } from '../ai.js';
import { G } from '../state.js';
import { TECH_DEFS } from '../battleTechniques.js';
function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

function getTechCounters() {
  if (!G.battle) return null;
  if (!G.battle.techCounters) G.battle.techCounters = {};
  return G.battle.techCounters;
}

// ─── 命中比较钩子 (HIT_COMPARE_HOOK) ────────────────────────────────────────

/** 重击系列：敌方使用同级攻击时，玩家攻击等级 +0.1（仅用于胜负判定） */
function applyHeavyStrikeBonus(ctx) {
  const pa = ctx.playerAction;
  const ea = ctx.enemyAction;
  if (!pa || !pa.techId) return;

  const HEAVY_STRIKE_MAP = {
    atk_1_a: { slotAtk: 1, enemyKey: 'attack_1' },
    atk_2_a: { slotAtk: 2, enemyKey: 'attack_2' },
    atk_3_a: { slotAtk: 3, enemyKey: 'attack_3' },
    atk_4_a: { slotAtk: 4, enemyKey: 'attack_4' },
    atk_5_a: { slotAtk: 5, enemyKey: 'attack_5' },
    atk_6_a: { slotAtk: 6, enemyKey: 'attack_6' },
    atk_7_a: { slotAtk: 7, enemyKey: 'attack_7' },
  };

  const meta = HEAVY_STRIKE_MAP[pa.techId];
  if (!meta) return;

  // Check if enemy action key matches (ea.actionKey set by getActionData)
  if (!ea || ea.actionKey !== meta.enemyKey) return;

  // Both sides are in "互攻" scenario: apply +0.1 to player power for tiebreaking
  const pa_type = pa && pa.type === 'attack';
  const ea_type = ea && ea.type === 'attack';
  if (!pa_type || !ea_type) return;

  // Recalculate power comparison with +0.1 bonus
  const pPower = (pa.atk || 0) + 0.1;
  const ePower = ea.atk || 0;
  if (pPower > ePower && ctx.playerHits === 0 && ctx.enemyHits === 0) {
    // Were tied, now player wins
    ctx.playerHits = 1;
    ctx.enemyHits = 0;
    ctx.msgs.push(`重击特效：与敌方同级对决，攻击等级 +0.1 突破平局，玩家命中。`);
  }
}

/** 冰之盾：使用时自带6防御等级，覆写双方互攻时的命中判定 */
function applyIceShieldHitCheck(ctx) {
  const pa = ctx.playerAction;
  const ea = ctx.enemyAction;
  if (!pa || pa.techId !== 'atk_3_d') return;
  if (!ea || ea.type !== 'attack') return;

  // Override hit compare: player attacks (atk 3), player also defends (def 6)
  const playerHit = (pa.atk || 0) > (ea.atk || 0); // player atk vs enemy atk
  const enemyHit = (ea.atk || 0) > (pa.def || 0);  // enemy atk vs player def(6)

  ctx.playerHits = playerHit ? 1 : 0;
  ctx.enemyHits = enemyHit ? 1 : 0;

  // Clear previous messages and replace
  ctx.msgs.length = 0;
  ctx.msgs.push(
    `冰之盾：玩家攻击等级 ${pa.atk}，冰盾防御等级 ${pa.def}；敌方攻击等级 ${ea.atk}。` +
    (playerHit ? ' 玩家命中。' : ' 玩家未命中。') +
    (enemyHit ? ' 敌方穿破冰盾命中。' : ' 冰盾格挡敌方攻击。')
  );
}

// ─── 命中后钩子 (HIT_HOOK) ───────────────────────────────────────────────────

/** 回旋镖：命中后，下回合开始时 +1 Ji */
function applyBoomerangOnHit(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_1_d') return;
  if (ctx.hitCount <= 0) return;
  const tc = getTechCounters();
  if (!tc) return;
  tc.boomerang_pending = (tc.boomerang_pending || 0) + ctx.hitCount;
}

/** 冰霜新星：命中时，敌人下回合无法使用任何攻击 */
function applyFrostNovaOnHit(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_3_e') return;
  if (ctx.hitCount <= 0) return;
  const tc = getTechCounters();
  if (!tc) return;
  tc.frost_nova_lock = true;
  recordBossObservedTag('enemy_attack_lock'); // Boss 记忆：玩家有冻结能力
  ctx.triggers.push('冰霜新星：敌人下回合将被冻结，无法发动攻击！');
}

/** 壶大炮：命中时，敌人下回合 Ji -3 */
function applyPotCannonOnHit(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_7_d') return;
  if (ctx.hitCount <= 0) return;
  const tc = getTechCounters();
  if (!tc) return;
  tc.pot_cannon_pending = (tc.pot_cannon_pending || 0) + 3;
  recordBossObservedTag('enemy_ji_drain'); // Boss 记忆：玩家有Ji压制能力
  ctx.triggers.push('壶大炮：敌人下回合开始时将失去 3 Ji！');
}

// ─── 总伤害钩子 (DAMAGE_TOTAL_HOOK) ─────────────────────────────────────────

/** 概率伤害加成（30% / 60% / 90%）*/
function applyProbDamageBonus(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.hitCount <= 0) return;

  const PROB_MAP = {
    atk_1_b: 0.30, atk_1_c: 0.60,
    atk_2_b: 0.30, atk_2_c: 0.60,
    atk_3_b: 0.30, atk_3_c: 0.60,
    atk_4_b: 0.30, atk_4_c: 0.60, atk_4_e: 0.90,
    atk_5_b: 0.30, atk_5_c: 0.60,
    atk_6_b: 0.30, atk_6_c: 0.60,
    atk_7_b: 0.30, atk_7_c: 0.60,
  };

  const prob = PROB_MAP[ctx.attackAction.techId];
  if (!prob) return;

  if (Math.random() < prob) {
    ctx.bonusDamage += 1;
    const pct = Math.round(prob * 100);
    ctx.triggers.push(`${ctx.attackAction.name}（${pct}%概率触发）：命中后伤害 +1`);
  }
}

/** 重甲破击（坦克能力）：重战技命中时额外 +1 伤害 */
function applyHeavyTechBoost(ctx) {
  if (ctx.side !== 'player') return;
  if (!G.abilities || !G.abilities.heavyTechBoost) return;
  if (!ctx.attackAction || ctx.hitCount <= 0) return;
  const techId = ctx.attackAction.techId;
  if (!techId) return;
  const def = TECH_DEFS[techId];
  if (!def || def.weight !== 'heavy') return;
  ctx.bonusDamage += 1;
  ctx.triggers.push(`重甲破击：重战技命中，额外造成 1 点伤害。`);
}

/** 太刀：20% 概率递归追加 */
function applyTachiFollowUp(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_2_d') return;
  if (ctx.hitCount <= 0) return;

  let followUps = 0;
  while (Math.random() < 0.2) {
    followUps += 1;
    if (followUps > 20) break; // safety cap
  }
  if (followUps > 0) {
    // Each follow-up deals same base damage (atk=2, damage=1)
    ctx.bonusDamage += followUps * (ctx.attackAction.damage || 1);
    ctx.triggers.push(`太刀【登龙！】×${followUps}：追加 ${followUps} 次攻击，额外造成 ${followUps * (ctx.attackAction.damage || 1)} 点伤害`);
  }
}

/** 火焰流星雨：连续3回合后，命中时追加3次 */
function applyMeteorFollowUp(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_4_d') return;
  if (ctx.hitCount <= 0) return;

  const tc = getTechCounters();
  if (!tc) return;
  // streak is incremented in ROUND_END; check previous-round streak
  if ((tc.meteor_streak || 0) < 3) return;

  const extra = 3;
  ctx.bonusDamage += extra * (ctx.attackAction.damage || 1);
  ctx.triggers.push(`火焰流星雨：连续使用满3回合，追加3次攻击，额外造成 ${extra} 点伤害！`);
}

// ─── 引擎注册：ROUND_START 效果 ─────────────────────────────────────────────

export function registerTechEffects(engine) {
  // ── 1. 回旋镖：上一回合命中，本回合发放 +Ji ──
  engine.registerEffect({
    effectId: 'tech.boomerang_ji_gain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 50,
    condition: () => {
      const tc = getTechCounters();
      return !!(tc && (tc.boomerang_pending || 0) > 0);
    },
    apply: (ctx) => {
      const tc = getTechCounters();
      const gain = tc.boomerang_pending || 0;
      tc.boomerang_pending = 0;
      G.player.ji += gain;
      pushLog(ctx, 'log-ab', `🪃 回旋镖：上回合命中，本回合开始获得 +${gain} Ji。`);
    },
  });

  // ── 2. 掷骰：上一回合使用，本回合发放随机 Ji ──
  engine.registerEffect({
    effectId: 'tech.dice_ji_gain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 60,
    condition: () => {
      const tc = getTechCounters();
      return !!(tc && (tc.dice_pending || 0) > 0);
    },
    apply: (ctx) => {
      const tc = getTechCounters();
      const gain = tc.dice_pending || 0;
      tc.dice_pending = 0;
      G.player.ji += gain;
      pushLog(ctx, 'log-ab', `🎲 掷骰：上回合掷出 ${gain}！本回合开始获得 +${gain} Ji。`);
    },
  });

  // ── 3. 壶大炮：上一回合命中，敌方本回合开始 -3 Ji ──
  engine.registerEffect({
    effectId: 'tech.pot_cannon_enemy_drain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 70,
    condition: () => {
      const tc = getTechCounters();
      return !!(G.enemy && tc && (tc.pot_cannon_pending || 0) > 0);
    },
    apply: (ctx) => {
      const tc = getTechCounters();
      const drain = Math.min(tc.pot_cannon_pending || 0, G.enemy.ji || 0);
      tc.pot_cannon_pending = 0;
      G.enemy.ji = Math.max(0, (G.enemy.ji || 0) - 3);
      pushLog(ctx, 'log-ab', `🫙 壶大炮：敌方本回合开始失去 3 Ji（实际扣除 ${drain}，当前 ${G.enemy.ji}）。`);
    },
  });

  // ── 4. 冰霜新星：本回合敌方攻击被锁定，结束后清除 ──
  engine.registerEffect({
    effectId: 'tech.frost_nova_enemy_attack_lock',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 80,
    condition: () => {
      const tc = getTechCounters();
      return !!(tc && tc.frost_nova_lock);
    },
    apply: (ctx) => {
      const tc = getTechCounters();
      // Mark attack lock in battle state — AI & action validation will check this
      G.battle.enemyFrostLockThisRound = true;
      tc.frost_nova_lock = false;
      pushLog(ctx, 'log-ab', '❄️ 冰霜新星：敌人本回合被冻结，无法发动任何攻击！');
    },
  });

  // ── 5. ROUND_END：连珠箭连击条纹 & 火焰流星雨连击条纹 & 掷骰触发 & 清除敌方冰封 ──
  engine.registerEffect({
    effectId: 'tech.round_end_counters',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 100,
    condition: () => !!(G.battle),
    apply: (ctx) => {
      const tc = getTechCounters();
      if (!tc) return;
      const pAction = G.battle.pAction;

      // 连珠箭 streak
      if (G.techniques && G.techniques[1] === 'atk_1_e') {
        if (pAction === 'attack_1') {
          tc.renzhuJian_streak = (tc.renzhuJian_streak || 0) + 1;
          pushLog(ctx, 'log-ab', `🏹 连珠箭：连续使用 ${tc.renzhuJian_streak} 回合${tc.renzhuJian_streak >= 5 ? '，下回合消耗归零！' : `（再连续 ${5 - tc.renzhuJian_streak} 回合后归零消耗）。`}`);
        } else {
          if ((tc.renzhuJian_streak || 0) > 0) {
            tc.renzhuJian_streak = 0;
            pushLog(ctx, 'log-ab', '🏹 连珠箭：本回合未使用，连击计数重置。');
          }
        }
      }

      // 火焰流星雨 streak
      if (G.techniques && G.techniques[4] === 'atk_4_d') {
        if (pAction === 'attack_4') {
          tc.meteor_streak = (tc.meteor_streak || 0) + 1;
          if (tc.meteor_streak < 3) {
            pushLog(ctx, 'log-ab', `☄️ 火焰流星雨：连续使用 ${tc.meteor_streak} 回合（连续满3回合后命中可追加3次）。`);
          } else {
            pushLog(ctx, 'log-ab', `☄️ 火焰流星雨：连续 ${tc.meteor_streak} 回合，追加攻击已激活！`);
          }
        } else {
          if ((tc.meteor_streak || 0) > 0) {
            tc.meteor_streak = 0;
            pushLog(ctx, 'log-ab', '☄️ 火焰流星雨：本回合未使用，连击计数重置。');
          }
        }
      }

      // 掷骰：本回合使用后，掷骰（on use）
      if (G.techniques && G.techniques[6] === 'atk_6_d' && pAction === 'attack_6') {
        const roll = Math.ceil(Math.random() * 6);
        tc.dice_pending = (tc.dice_pending || 0) + roll;
        pushLog(ctx, 'log-ab', `🎲 掷骰：本回合掷出 ${roll}，下回合开始时将获得 +${roll} Ji。`);
      }

      // 清除本回合的冰封标记（每回合结束都清除，以便下回合不受影响）
      if (G.battle.enemyFrostLockThisRound) {
        G.battle.enemyFrostLockThisRound = false;
      }
    },
  });

  // ── 注册命中钩子（全局一次性注册） ──
  registerHitCompareHook(applyHeavyStrikeBonus);
  registerHitCompareHook(applyIceShieldHitCheck);

  registerHitHook(applyBoomerangOnHit);
  registerHitHook(applyFrostNovaOnHit);
  registerHitHook(applyPotCannonOnHit);

  registerDamageTotalHook(applyHeavyTechBoost);
  registerDamageTotalHook(applyProbDamageBonus);
  registerDamageTotalHook(applyTachiFollowUp);
  registerDamageTotalHook(applyMeteorFollowUp);
}
