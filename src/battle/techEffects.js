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

/** 太刀：20% 概率递归追加（聚合激活时 100%） */
function applyTachiFollowUp(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_2_d') return;
  if (ctx.hitCount <= 0) return;

  const tc = getTechCounters();
  const guaranteed = tc && tc.tachiGuaranteedNext;
  if (guaranteed && tc) tc.tachiGuaranteedNext = false; // 消耗一次性保证

  let followUps = 0;
  const prob = guaranteed ? 1.0 : 0.2;
  while (Math.random() < prob) {
    followUps += 1;
    if (followUps > 20) break; // safety cap
  }
  if (followUps > 0) {
    // Each follow-up deals same base damage (atk=2, damage=1)
    ctx.bonusDamage += followUps * (ctx.attackAction.damage || 1);
    ctx.triggers.push(`太刀【登龙！】×${followUps}：追加 ${followUps} 次攻击，额外造成 ${followUps * (ctx.attackAction.damage || 1)} 点伤害`);
  }
}

/** 火焰流星雨：累计使用3次后，命中时可免费追加3次 */
function applyMeteorFollowUp(ctx) {
  if (ctx.side !== 'player') return;
  if (!ctx.attackAction || ctx.attackAction.techId !== 'atk_4_d') return;
  if (ctx.hitCount <= 0) return;

  const tc = getTechCounters();
  if (!tc) return;
  // streak incremented in ROUND_END on use; check if reached 3
  if ((tc.meteor_streak || 0) < 3) return;

  tc.meteor_streak = 0;
  tc.meteor_triggered_this_round = true; // 告知ROUND_END本回合已触发，不重复计入
  const dmgPerHit = ctx.attackAction.damage || 1;
  G.battle.freeFollowUpPending = {
    count: 3,
    dmgPerHit,
    label: '火焰流星雨',
    emoji: '☄️',
    techId: ctx.attackAction.techId,
  };
  ctx.triggers.push(`☄️ 火焰流星雨：已累计3次，命中触发——获得3次免费追加攻击！`);
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

      // 连珠箭 streak（累计，不要求连续回合）
      if (G.techniques && G.techniques[1] === 'atk_1_e') {
        if (pAction === 'attack_1') {
          tc.renzhuJian_streak = (tc.renzhuJian_streak || 0) + 1;
          const remain = Math.max(0, 5 - tc.renzhuJian_streak);
          pushLog(ctx, 'log-ab', `🏹 连珠箭：已累计使用 ${tc.renzhuJian_streak} 次${remain > 0 ? `（再累计 ${remain} 次后消耗归零）` : '，下回合消耗归零！'}。`);
        }
      }

      // 火焰流星雨 streak（累计，不要求连续回合）
      if (G.techniques && G.techniques[4] === 'atk_4_d') {
        if (pAction === 'attack_4') {
          if (tc.meteor_triggered_this_round) {
            // 触发回合不计入下一轮，从0开始
            tc.meteor_triggered_this_round = false;
          } else {
            tc.meteor_streak = (tc.meteor_streak || 0) + 1;
            if (tc.meteor_streak < 3) {
              pushLog(ctx, 'log-ab', `☄️ 火焰流星雨：已累计使用 ${tc.meteor_streak} 次（累计满3次命中后可追加3次）。`);
            } else {
              pushLog(ctx, 'log-ab', `☄️ 火焰流星雨：已累计3次，追加攻击已激活，命中即触发！`);
            }
          }
        }
      }

      // 掷骰：本回合使用后，掷骰（on use）；波尔激活时必得 +3
      if (G.techniques && G.techniques[6] === 'atk_6_d' && pAction === 'attack_6') {
        const isBore = !!(tc.bore_active);
        const roll = isBore ? 3 : Math.ceil(Math.random() * 6);
        tc.dice_pending = (tc.dice_pending || 0) + roll;
        pushLog(ctx, 'log-ab', `🎲 掷骰：本回合掷出 ${roll}${isBore ? '（波尔：必得 +3）' : ''}，下回合开始时将获得 +${roll} Ji。`);
      }

      // 清除本回合的冰封标记（每回合结束都清除，以便下回合不受影响）
      if (G.battle.enemyFrostLockThisRound) {
        G.battle.enemyFrostLockThisRound = false;
      }
    },
  });

  // ── 6. 防御战技：ROUND_START 处理各种 pending 效果 ──
  engine.registerEffect({
    effectId: 'tech.defense_tech_round_start',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS + 90,
    condition: () => !!(G.battle),
    apply: (ctx) => {
      // 清除上一回合的临时修正在 ROUND_END 已完成，此处预留扩展
    },
  });

  // ── 7. 防御战技：ROUND_END 处理使用后的效果 ──
  engine.registerEffect({
    effectId: 'tech.defense_tech_round_end',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 90,
    condition: () => !!(G.battle),
    apply: (ctx) => {
      const tc = getTechCounters();
      if (!tc) return;
      const pAction = G.battle.pAction;
      const pActionData = G.battle.pActionData;

      // 清除上回合的临时修正
      tc.defPenalty_next = 0;
      tc.calmBonus_next = 0;

      if (!pAction || !pAction.startsWith('defense_')) return;

      const defSlotMap = { defense_0: 'd0', defense_1: 'd1', defense_2: 'd2' };
      const defSlot = defSlotMap[pAction];
      const defTechId = defSlot && G.techniques && G.techniques[defSlot];
      if (!defTechId) return;

      // 记录本回合防御等级（供粥还得熬多久使用）
      if (pActionData && pActionData.def !== undefined) {
        tc.lastPlayerDefLevel = pActionData.def;
      }

      // 黄金盾：计使用次数
      if (defTechId === 'defense_1_c') {
        tc.goldenShield_used = (tc.goldenShield_used || 0) + 1;
        const remain = Math.max(0, 6 - tc.goldenShield_used);
        pushLog(ctx, 'log-ab', `🥇 黄金盾：本场战斗已使用 ${tc.goldenShield_used} 次（剩余 ${remain} 次）。`);
      }

      // 丰矿：下回合 -3 惩罚
      if (defTechId === 'defense_0_d') {
        tc.defPenalty_next = 3;
        pushLog(ctx, 'log-ab', `⛏ 丰矿：本回合防御等级 6，下回合防御等级 -3。`);
      }

      // 冷静：下回合 +1 奖励
      if (defTechId === 'defense_0_c') {
        tc.calmBonus_next = 1;
        pushLog(ctx, 'log-ab', `🧘 冷静：下回合额外附带防御等级 +1。`);
      }

      // 塔斯订购：下回合敌方必须攻击
      if (defTechId === 'defense_2_c') {
        G.battle.enemyMustAttackNextRound = true;
        pushLog(ctx, 'log-ab', `📦 塔斯订购：下回合敌方若攻击合法，必定攻击！`);
      }

      // 波尔：本场激活掷骰必得 +3
      if (defTechId === 'defense_2_d') {
        if (!tc.bore_active) {
          tc.bore_active = true;
          pushLog(ctx, 'log-ab', `🎯 波尔：本场战斗中【掷骰】将必定获得 +3 Ji！`);
        }
      }

      // 绘画大盾：使用时回复 1 HP（在 ROUND_END 处理）
      if (defTechId === 'defense_2_a') {
        const oldHp = G.player.hp;
        G.player.hp = Math.min(G.player.maxHp || 15, (G.player.hp || 0) + 1);
        const healed = G.player.hp - oldHp;
        if (healed > 0) pushLog(ctx, 'log-ab', `🎨 绘画大盾：使用时回复 ${healed} 点生命（当前 ${G.player.hp}/${G.player.maxHp || 15}）。`);
      }

      // 塔盾：获得后显示提醒
      if (defTechId === 'defense_2_b' && !tc.taDun_shown) {
        tc.taDun_shown = true;
        pushLog(ctx, 'log-ab', `🏰 塔盾：灌注涌出它非喵`);
      }
    },
  });

  // ── 8. 聚合（defense_1_a）：无敌效果及小圆盾反制 Ji ──
  engine.registerEffect({
    effectId: 'tech.defense_invincible_and_roundshield',
    phase: PHASES.ROUND_END,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: 85,
    condition: () => !!(G.battle),
    apply: (ctx) => {
      const tc = getTechCounters();
      if (!tc) return;
      const pAction = G.battle.pAction;
      if (!pAction || !pAction.startsWith('defense_')) return;

      const defSlotMap = { defense_0: 'd0', defense_1: 'd1', defense_2: 'd2' };
      const defSlot = defSlotMap[pAction];
      const defTechId = defSlot && G.techniques && G.techniques[defSlot];

      // 小圆盾：防御成功时（敌方未命中），扣敌方 Ji
      if (defTechId === 'defense_0_b') {
        const eHit = G.battle.lastRoundEnemyHit;
        if (!eHit) {
          const eAction = G.battle.eActionData;
          const eCost = eAction && eAction.cost ? eAction.cost : 0;
          const drain = eCost * 2;
          if (drain > 0) {
            const actual = Math.min(drain, G.enemy.ji || 0);
            G.enemy.ji = Math.max(0, (G.enemy.ji || 0) - drain);
            pushLog(ctx, 'log-ab', `🔵 小圆盾：防御成功！减少敌方 ${actual} Ji（敌方出招消耗 ${eCost} Ji × 2）。`);
          }
        }
      }

      // 聚合：若本回合被攻击（eHit），下次太刀 100% 追加
      if (defTechId === 'defense_1_a') {
        const eHit = G.battle.lastRoundEnemyHit;
        if (eHit) {
          tc.tachiGuaranteedNext = true;
          pushLog(ctx, 'log-ab', `✨ 聚合：本回合被攻击，下次【太刀】追加概率提升至 100%！`);
        }
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
