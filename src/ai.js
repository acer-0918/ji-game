import { G } from './state.js';
import { allOrbsGenerated, orbCount, orbUniqueCount, ensureFaultRobotState } from './state.js';
import { getActionData, getMaxAffordableAttack } from './logic.js';
import { randomChoice } from './utils.js';

// ─── 效果标签定义 ────────────────────────────────────────────────────────────
// Boss 不直接读取玩家配置，而是通过「效果标签」感知玩家的战斗风格。
// 标签来源：① 运行时观察（壶大炮扣Ji、冰霜新星冻结等由 techEffects/effects 写入）
//           ② 从战技/装备配置静态推断（多回合行为归纳）

const TECH_EFFECT_TAGS = {
  atk_1_d: ['resource_gain'],       // 回旋镖：下回合+Ji
  atk_1_e: ['burst_buildup'],       // 连珠箭：第5连击免费
  atk_2_d: ['chain_attack'],        // 太刀：20%追击
  atk_3_d: ['defense_twist'],       // 冰之盾：攻击3但带防御6判定
  atk_3_e: ['enemy_attack_lock'],   // 冰霜新星：冻结敌方
  atk_4_d: ['burst_buildup'],       // 火焰流星雨：连3回合触发三连追
  atk_6_d: ['resource_gain'],       // 掷骰：1-6 Ji
  atk_7_d: ['enemy_ji_drain'],      // 壶大炮：敌方-3 Ji
};

const EQUIP_EFFECT_TAGS = {
  equi_1: ['chain_attack'],         // 狩猎律动：命中追加攻击
  equi_2: ['hp_scaling'],           // 霸王血铠：血量越高伤害越高
  equi_3: ['burst_buildup'],        // 壁垒：防御累积盾
  equi_4: ['burst_buildup'],        // 蓄意轰拳：防御转豪意→爆发
  equi_8: ['defense_twist'],        // 光滑的石头：防御+2
};

// ─── 标签反应表 ───────────────────────────────────────────────────────────────
// sensitivity: Boss 对该标签的灵敏度（0.2=迟钝/骨夫，1.4=敏锐/甲虚）
const TAG_REACTIONS = {
  enemy_ji_drain: (w, s) => {
    // 被扣Ji：别蓄Ji，尽快花掉
    w.ji = (w.ji || 1) * Math.max(0.1, 1 - s * 0.7);
  },
  enemy_attack_lock: (w, s) => {
    // 冰霜新星：尽早行动，避免被锁时浪费Ji
    w.ji = (w.ji || 1) * Math.max(0.2, 1 - s * 0.5);
  },
  chain_attack: (w, s) => {
    // 连击：被命中后会被追打，提高防御偏好
    w.defense_1 = (w.defense_1 || 0) + s * 2;
    w.defense_2 = (w.defense_2 || 0) + s * 1.5;
  },
  burst_buildup: (w, s) => {
    // 蓄力爆发：玩家防御期也可能有威胁，整体警戒上调
    w._burst_alert = (w._burst_alert || 0) + s;
  },
  defense_twist: (w, s) => {
    // 冰之盾/光滑石头：攻3可能带防判定，降低攻3权重
    w.attack_3 = (w.attack_3 || 1) * Math.max(0.3, 1 - s * 0.5);
  },
  resource_gain: (w, s) => {
    // 资源增益：玩家Ji持续增长，略提高防御意识
    w.defense_0 = (w.defense_0 || 0) + s * 0.5;
  },
  hp_scaling: (w, _s) => {
    // 血量增伤：由 context 层处理，此处仅标记
    w._hp_scaling = true;
  },
};

// ─── Boss 战斗记忆 ────────────────────────────────────────────────────────────

function initBossMemory() {
  return {
    detectedTags: {},           // { [tag]: true } — 普通对象，JSON 安全
    consecutiveDefenseCount: 0,
  };
}

/**
 * 供 techEffects.js / equipment/effects.js 在效果触发时调用。
 * 将 Boss 观察到的运行时效果记录为标签。
 */
export function recordBossObservedTag(tag) {
  if (!G.battle) return;
  if (!G.battle.bossMemory) G.battle.bossMemory = initBossMemory();
  G.battle.bossMemory.detectedTags[tag] = true;
}

function getBossMemory() {
  if (!G.battle.bossMemory) G.battle.bossMemory = initBossMemory();
  return G.battle.bossMemory;
}

function updateBossMemory(chosenAction) {
  const mem = getBossMemory();
  if (chosenAction.startsWith('defense_')) {
    mem.consecutiveDefenseCount = (mem.consecutiveDefenseCount || 0) + 1;
  } else {
    mem.consecutiveDefenseCount = 0;
  }
}

// ─── 玩家标签收集 ─────────────────────────────────────────────────────────────

function getAllPlayerTags() {
  const tags = {};
  // ① 运行时观察到的标签（由 effect 文件写入）
  const mem = getBossMemory();
  Object.keys(mem.detectedTags).forEach(t => { tags[t] = true; });
  // ② 从战技配置推断
  if (G.techniques) {
    for (let slot = 1; slot <= 7; slot++) {
      const id = G.techniques[slot];
      if (id && TECH_EFFECT_TAGS[id]) {
        TECH_EFFECT_TAGS[id].forEach(t => { tags[t] = true; });
      }
    }
  }
  // ③ 从装备配置推断
  if (G.equipment && G.equipment.slots) {
    G.equipment.slots.forEach(id => {
      if (id && EQUIP_EFFECT_TAGS[id]) {
        EQUIP_EFFECT_TAGS[id].forEach(t => { tags[t] = true; });
      }
    });
  }
  return tags;
}

function applyTagReactions(weights, sensitivity) {
  const tags = getAllPlayerTags();
  for (const tag of Object.keys(tags)) {
    if (TAG_REACTIONS[tag]) TAG_REACTIONS[tag](weights, sensitivity);
  }
}

// ─── Context 构建 ─────────────────────────────────────────────────────────────

function buildAiContext(enemy) {
  const playerClass        = G.player.classKey || 'assassin';
  const playerLightningOrbs = G.player.lightningOrbs || 0;
  const playerShaBiStacks  = G.player.shaBiStacks  || 0;
  const playerJiSpentTotal  = G.player.jiSpentTotal  || 0;
  const amaneProgress       = playerJiSpentTotal % 8; // 天音触发进度（nsyc 内部状态）

  const pMaxAtk = getMaxAffordableAttack('player', G.player.ji, G.player);

  // Ji 威胁：Ji 是攻防两用资源，对所有职业都有参考价值
  // 法师例外：几乎不用Ji输出，Ji威胁直接归零
  const jiThreat = (playerClass === 'mage' || G.player.ji === 0)
    ? 0
    : pMaxAtk / 7;

  // 进攻性资源威胁 0~1（与 Ji 无关的特殊爆发来源）
  let offensiveThreat = 0;
  if (playerClass === 'mage') {
    // 法师：完全基于电球，5球前威胁极低，4球给预警，5球拉满
    if      (playerLightningOrbs >= 5) offensiveThreat = 1.0;
    else if (playerLightningOrbs >= 4) offensiveThreat = 0.5;  // Boss 开始准备高防
    else                               offensiveThreat = playerLightningOrbs * 0.05;
  } else if (playerClass === 'nsyc') {
    // nsyc：厄介必中，Boss防御无效，不用"威胁"维度
    // offensiveThreat 保持0，纯读Ji威胁即可
    // 傻逼层数 >= 4 用「暴露」维度处理（见下方 nsycExposed）
  }
  // 其他职业（assassin/tank/dog）：offensiveThreat 保持 0，完全基于 Ji

  const overallThreat = Math.max(jiThreat, offensiveThreat);

  return {
    round:   G.battle.round,
    eJi:     enemy.ji,
    eHp:     enemy.hp,
    eMaxHp:  enemy.maxHp,
    pJi:     G.player.ji,
    pHp:     G.player.hp,
    pMaxAtk,
    eMaxAtk: getMaxAffordableAttack('enemy', enemy.ji, enemy),
    playerLikelyCharge: G.player.ji <= 1 || G.battle.lastPlayerAction === 'ji',
    playerLikelyAttack: (G.battle.lastPlayerAction || '').startsWith('attack_'),
    playerHighThreat:   overallThreat > 0.6,
    playerUltraThreat:  overallThreat >= 1.0 || pMaxAtk >= 7,
    playerLowHp:  G.player.hp <= 2,
    enemyLowHp:   enemy.hp <= Math.max(3, Math.ceil(enemy.maxHp / 3)),
    lastPlayerAction: G.battle.lastPlayerAction,
    lastEnemyAction:  G.battle.lastEnemyAction,
    playerClass,
    playerLightningOrbs,
    playerShaBiStacks,
    amaneProgress,
    offensiveThreat,
    jiThreat,
    overallThreat,
    // 玩家无任何威胁来源 → Boss 防御完全无意义
    // 法师：无球（或球少）即无威胁；nsyc/常规：无Ji且无进攻资源
    playerHasNoThreat: overallThreat < 0.15,
    playerIsMage:   playerClass === 'mage',
    mageCanRelease: playerClass === 'mage' && playerLightningOrbs >= 5,
    playerIsGeneralClass: ['assassin', 'tank', 'dog'].includes(playerClass),
    // nsyc 暴露维度：傻逼层数 ≥ 4 时玩家即将释放厄介（必中但防御无效）
    // Boss 无法阻止，但玩家此时专注于释放，可大胆低攻击骚扰
    nsycExposed: playerClass === 'nsyc' && playerShaBiStacks >= 4,
    consecutiveBossDefense: getBossMemory().consecutiveDefenseCount || 0,
  };
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function addWeight(bucket, key, weight) {
  if (weight > 0) bucket[key] = (bucket[key] || 0) + weight;
}

const ATTACK_KEYS = ['attack_1','attack_2','attack_3','attack_4','attack_5','attack_6','attack_7'];

function pickWeightedAction(weights, side = 'enemy', fallback = 'ji', blockedActions = []) {
  const actor   = side === 'player' ? G.player : G.enemy;
  const blocked = new Set(blockedActions);
  const pool    = [];
  Object.entries(weights).forEach(([key, weight]) => {
    if (key.startsWith('_')) return; // 内部标记字段跳过
    if (blocked.has(key)) return;
    const action = getActionData(key, side, actor);
    if (!action || action.cost > actor.ji || weight <= 0) return;
    for (let i = 0; i < Math.round(weight); i++) pool.push(key);
  });
  if (pool.length) return randomChoice(pool);

  const candidateOrder = [
    fallback, 'ji', 'defense_0', 'attack_1', 'defense_1',
    'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7',
    'defense_2', 'orb_random',
  ];
  for (const key of candidateOrder) {
    if (blocked.has(key)) continue;
    const action = getActionData(key, side, actor);
    if (action && action.cost <= actor.ji) return key;
  }
  return 'defense_0';
}

/**
 * getBlockedActions(ctx)
 * 返回本回合 Boss 不可选的动作列表。
 * 同时被权重池和 fallback candidateOrder 检查，确保彻底封堵。
 */
function getBlockedActions(ctx) {
  const blocked = [];

  // 冰霜新星：本回合敌方无法发动任何攻击
  if (G.battle && G.battle.enemyFrostLockThisRound) {
    ATTACK_KEYS.forEach(k => blocked.push(k));
  }

  if (ctx) {
    // nsyc 暴露（厄介必中）→ 防御完全无用，全部封堵
    if (ctx.nsycExposed) {
      blocked.push('defense_0', 'defense_1', 'defense_2');
    } else {
      // ─── 防御等级管线：只选「刚好够用」的防御，过高等级一律封堵 ───────────
      // 玩家有效最高攻击（含法师电球释放）
      let effectiveMaxAtk = ctx.pMaxAtk;
      if (ctx.mageCanRelease) effectiveMaxAtk = Math.max(effectiveMaxAtk, 5);

      // 「不够用」的低防封堵：defense_0（防3）挡不住攻4+
      if (effectiveMaxAtk >= 4) {
        // defense_0 无法防住，不封堵（让它自然被低权重淘汰）
        // 但法师释放时明确封堵 defense_0
        if (ctx.mageCanRelease) blocked.push('defense_0');
      }

      // 「过剩」的高防封堵：玩家打不到那么高，出高防是浪费 Ji
      if (effectiveMaxAtk <= 3) {
        // defense_0（防3）足够，封堵 defense_1 和 defense_2
        blocked.push('defense_1', 'defense_2');
      } else if (effectiveMaxAtk <= 6) {
        // defense_1（防6）足够，封堵 defense_2
        blocked.push('defense_2');
      }
      // effectiveMaxAtk = 7：defense_2 才有意义，不封堵
    }
  }

  return blocked;
}

/**
 * 权重层兜底：playerHasNoThreat 时清零防御权重。
 * （blockedActions 已封堵 fallback，此处保持权重池干净）
 */
function suppressDefenseIfNoThreat(ctx, weights) {
  if (!ctx.playerHasNoThreat) return;
  weights.defense_0 = 0;
  weights.defense_1 = 0;
  weights.defense_2 = 0;
}

/** 连续防御 ≥ 2 次且玩家威胁不极端 → 额外压制高防（权重层，fallback 层由 blocked 管） */
function suppressDefenseIfTooConsecutive(ctx, weights) {
  if (ctx.consecutiveBossDefense < 2 || ctx.playerUltraThreat) return;
  weights.defense_1 = 0;
  weights.defense_2 = 0;
  if (ctx.consecutiveBossDefense >= 3) weights.defense_0 = 0;
}

/** 法师可释放时 defense_0 权重清零（blocked 已封堵，此处保持权重干净） */
function suppressWeakDefenseVsMage(ctx, weights) {
  if (!ctx.mageCanRelease) return;
  weights.defense_0 = 0;
}

// ─── 精英 AI ──────────────────────────────────────────────────────────────────

/** 激进型精英：持续压攻，几乎不防御 */
function aiEliteAggressive(ctx, blockedActions) {
  const w = {};
  if (ctx.eJi === 0) {
    addWeight(w, 'ji', 5);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 2 : 1);
    return pickWeightedAction(w, 'enemy', 'ji', blockedActions);
  }
  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 5);
  if (ctx.nsycExposed) addWeight(w, 'attack_1', 5); // nsyc 暴露时低攻骚扰
  addWeight(w, 'ji', ctx.eJi <= 2 ? 4 : 1);
  if (ctx.eJi >= 2) addWeight(w, 'attack_2', 4);
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 4);
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 3);
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 3);
  // 激进型只在法师可释放时才考虑防御（且必须是高防）
  if (ctx.mageCanRelease && ctx.eJi >= 1) addWeight(w, 'defense_1', 3);
  suppressWeakDefenseVsMage(ctx, w);
  suppressDefenseIfTooConsecutive(ctx, w);
  return pickWeightedAction(w, 'enemy', 'attack_2', blockedActions);
}

/** 保守型精英：平衡攻防，威胁高时优先防御 */
function aiEliteConservative(ctx, blockedActions) {
  const w = {};
  if (ctx.eJi === 0) {
    addWeight(w, 'ji', ctx.playerHighThreat ? 3 : 5);
    addWeight(w, 'defense_0', ctx.playerHighThreat ? 4 : 1);
    return pickWeightedAction(w, 'enemy', 'ji', blockedActions);
  }
  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 4);
  if (ctx.nsycExposed) addWeight(w, 'attack_1', 5); // nsyc 暴露时进攻
  addWeight(w, 'ji', ctx.eJi <= 2 ? 3 : 1);
  // 法师：只信任高防（defense_1+），不出 defense_0
  if (ctx.mageCanRelease) {
    if (ctx.eJi >= 1) addWeight(w, 'defense_1', 5);
    if (ctx.eJi >= 2) addWeight(w, 'defense_2', 3);
  } else if (!ctx.nsycExposed) {
    if (ctx.eJi >= 1 && ctx.playerHighThreat)  addWeight(w, 'defense_0', 3);
    if (ctx.eJi >= 1 && ctx.playerHighThreat)  addWeight(w, 'defense_1', 3);
    if (ctx.eJi >= 2 && ctx.playerUltraThreat) addWeight(w, 'defense_2', 2);
  }
  if (ctx.eJi >= 2) addWeight(w, 'attack_2', 2);
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2);
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 2);
  suppressWeakDefenseVsMage(ctx, w);
  suppressDefenseIfTooConsecutive(ctx, w);
  return pickWeightedAction(w, 'enemy', 'ji', blockedActions);
}

function aiElite(enemy) {
  const ctx = buildAiContext(enemy);
  const blockedActions = getBlockedActions(ctx);
  // 第一次进入时随机决定性格，战斗期间不变
  if (!enemy.aiPersonality) {
    enemy.aiPersonality = Math.random() < 0.5 ? 'aggressive' : 'conservative';
  }
  return enemy.aiPersonality === 'aggressive'
    ? aiEliteAggressive(ctx, blockedActions)
    : aiEliteConservative(ctx, blockedActions);
}

// ─── Boss AI ──────────────────────────────────────────────────────────────────

/**
 * 甲虚 — 狡猾型
 * 高灵敏度（1.4），针对每个职业核心资源做专项读取。
 * 越打越难对付：记忆层积累后行为越来越有针对性。
 */
function aiJiaxu(enemy) {
  const ctx = buildAiContext(enemy);
  const blockedActions = getBlockedActions(ctx);
  const SENSITIVITY = 1.4;
  const w = {};

  if (ctx.eJi === 0) {
    addWeight(w, 'ji', ctx.playerHighThreat ? 3 : 5);
    addWeight(w, 'defense_0', ctx.playerHighThreat ? 4 : 2);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 3 : 1);
    applyTagReactions(w, SENSITIVITY);
    suppressDefenseIfNoThreat(ctx, w);
    suppressDefenseIfTooConsecutive(ctx, w);
    return pickWeightedAction(w, 'enemy', ctx.playerLikelyCharge ? 'attack_1' : 'defense_0', blockedActions);
  }

  // 职业专项感知
  if (ctx.playerIsMage) {
    if (ctx.mageCanRelease) {
      addWeight(w, 'defense_1', 6);
      if (ctx.eJi >= 2) addWeight(w, 'defense_2', 3);
    } else if (ctx.playerLightningOrbs >= 4) {
      addWeight(w, 'defense_1', 3);
    }
  }
  if (ctx.nsycExposed) {
    // 玩家即将释放厄介（必中）→ 防御无用，反而大胆骚扰
    // 用最低攻击即可，既省Ji又给压力
    addWeight(w, 'attack_1', 6);
    w.defense_0 = 0; w.defense_1 = 0; w.defense_2 = 0;
  }

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 5);
  if (ctx.pJi === 0 && ctx.eJi >= 1) addWeight(w, 'attack_1', 3);
  if (ctx.playerLowHp) addWeight(w, 'attack_1', 3);

  addWeight(w, 'defense_0', ctx.overallThreat > 0.4 ? 2 : 1);
  if (ctx.eJi >= 1 && ctx.playerHighThreat)  addWeight(w, 'defense_1', 3);
  if (ctx.eJi >= 2 && ctx.playerUltraThreat) addWeight(w, 'defense_2', 2);

  if (ctx.eJi <= 2) addWeight(w, 'ji', ctx.playerLikelyCharge ? 2 : 4);
  else if (ctx.eJi <= 4 && !ctx.playerHighThreat) addWeight(w, 'ji', 2);

  if (ctx.eJi >= 2) addWeight(w, 'attack_2', ctx.playerLikelyCharge ? 4 : 2);
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', ctx.pJi >= 2 ? 3 : 2);
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', ctx.playerLowHp ? 4 : 2);
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 2);
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', ctx.playerLowHp ? 4 : 2);
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 5 : 2);

  applyTagReactions(w, SENSITIVITY);
  suppressWeakDefenseVsMage(ctx, w);
  suppressDefenseIfNoThreat(ctx, w);
  suppressDefenseIfTooConsecutive(ctx, w);
  return pickWeightedAction(w, 'enemy', ctx.playerLikelyCharge ? 'attack_2' : 'attack_3', blockedActions);
}

/**
 * 骨夫 — 莽撞型
 * 低灵敏度（0.2），几乎忽略标签，持续压制高攻。
 * 标志性行为：chargeValue 越高攻击越猛，几乎不防御。
 */
function aiGufu(enemy) {
  const ctx = buildAiContext(enemy);
  const blockedActions = getBlockedActions(ctx);
  const SENSITIVITY = 0.7; // 骨夫能感知标签，但反应方式更激进（见下方覆盖）
  const grow = enemy.chargeValue || 1;
  const w = {};
  const safeToScale = ctx.pMaxAtk <= 4 && !ctx.enemyLowHp;

  if (ctx.eJi === 0) {
    addWeight(w, 'ji', safeToScale ? 6 : 3);
    addWeight(w, 'defense_0', ctx.playerUltraThreat ? 3 : 1);
    addWeight(w, 'attack_1', ctx.playerLikelyCharge ? 2 : 1);
    suppressDefenseIfNoThreat(ctx, w);
    return pickWeightedAction(w, 'enemy', safeToScale ? 'ji' : 'defense_0', blockedActions);
  }

  if (safeToScale) addWeight(w, 'ji', grow <= 3 ? 7 : 4);
  else if (grow >= 4 && ctx.eJi <= 2) addWeight(w, 'ji', 2);

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 4);
  if (ctx.pJi <= 2 && ctx.eJi >= 2) addWeight(w, 'attack_2', 3);

  // nsyc 暴露：骨夫本来就莽，更不会防，直接压低攻
  if (ctx.nsycExposed) {
    addWeight(w, 'attack_1', 5);
    w.defense_0 = 0; w.defense_1 = 0; w.defense_2 = 0;
  }

  // 骨夫：只在极端威胁 + 血量危急时才防御
  if (ctx.eJi >= 1 && ctx.playerUltraThreat) addWeight(w, 'defense_1', 2);
  if (ctx.eJi >= 2 && ctx.playerUltraThreat && ctx.enemyLowHp) addWeight(w, 'defense_2', 2);

  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2 + (grow >= 3 ? 1 : 0));
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 3 + (grow >= 4 ? 1 : 0));
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 3 + (grow >= 5 ? 2 : 0));
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', 4 + (grow >= 5 ? 2 : 0));
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 6 : 4);

  applyTagReactions(w, SENSITIVITY);
  // 骨夫性格覆盖：检测到壶大炮时不是「少蓄Ji」，而是「尽快打出去」
  // applyTagReactions 已经压低了 w.ji，同时提高当前Ji对应的攻击权重
  if (getAllPlayerTags()['enemy_ji_drain'] && ctx.eJi >= 2) {
    addWeight(w, `attack_${Math.min(ctx.eJi, 7)}`, 4); // 直接押当前Ji对应最高攻
  }
  suppressWeakDefenseVsMage(ctx, w);
  suppressDefenseIfNoThreat(ctx, w);
  suppressDefenseIfTooConsecutive(ctx, w);
  return pickWeightedAction(w, 'enemy', grow <= 3 ? 'ji' : 'attack_4', blockedActions);
}

/**
 * 故障机器人 — 分析型
 * 标准灵敏度（1.0），有职业专属模板。
 * 标志性行为：前几回合「扫描」（生成球），之后精准应对。
 */
function aiFaultRobot(enemy) {
  const ctx = buildAiContext(enemy);
  const blockedActions = getBlockedActions(ctx);
  ensureFaultRobotState(enemy);
  const SENSITIVITY = 1.0;
  const unique = orbUniqueCount(enemy);
  const w = {};
  const safeToOrb = ctx.pMaxAtk <= 4 || ctx.playerLikelyCharge || ctx.eHp >= 9;

  if (allOrbsGenerated(enemy)) {
    addWeight(w, 'orb_random', 25);
    if (ctx.playerHighThreat) addWeight(w, 'defense_1', 2);
    applyTagReactions(w, SENSITIVITY);
    suppressDefenseIfNoThreat(ctx, w);
    return pickWeightedAction(w, 'enemy', 'orb_random', blockedActions);
  }

  addWeight(w, 'orb_random', safeToOrb ? 8 : 3);
  if (unique <= 1) addWeight(w, 'orb_random', 3);
  if (unique >= 3 && ctx.playerLowHp) addWeight(w, 'orb_random', 2);
  if (ctx.eJi === 0 && !safeToOrb) addWeight(w, 'defense_0', 3);

  // 分析型：职业专属感知模板
  if (ctx.playerIsMage) {
    // 法师：Ji量意义不大，电球才是真正威胁
    if (ctx.mageCanRelease) {
      addWeight(w, 'defense_1', 6);
      if (ctx.eJi >= 2) addWeight(w, 'defense_2', 4);
    } else if (ctx.playerLightningOrbs >= 4) {
      addWeight(w, 'defense_1', 3);
    }
  } else if (ctx.nsycExposed) {
    // nsyc 暴露：厄介必中，防御无效，直接压最低攻击骚扰
    addWeight(w, 'attack_1', 5);
    w.defense_0 = 0; w.defense_1 = 0; w.defense_2 = 0;
  } else if (ctx.playerClass === 'nsyc') {
    // nsyc 层数未满：正常读Ji威胁
    if (ctx.playerHighThreat  && ctx.eJi >= 1) addWeight(w, 'defense_1', 3);
    if (ctx.playerUltraThreat && ctx.eJi >= 2) addWeight(w, 'defense_2', 2);
  } else {
    // 常规职业（assassin/tank/dog）：Ji威胁读法
    if (ctx.playerHighThreat  && ctx.eJi >= 1) addWeight(w, 'defense_1', 3);
    if (ctx.playerUltraThreat && ctx.eJi >= 2) addWeight(w, 'defense_2', 2);
  }

  if (ctx.playerLikelyCharge) addWeight(w, 'attack_1', 4);
  if (ctx.playerLikelyAttack) {
    addWeight(w, 'defense_0', 3);
    addWeight(w, 'attack_1', 2);
  }

  if (ctx.eJi <= 2) addWeight(w, 'ji', safeToOrb ? 2 : 4);
  else if (!ctx.playerHighThreat && orbCount(enemy, 'plasma') > 0) {
    addWeight(w, 'ji', 2 + orbCount(enemy, 'plasma'));
  }

  if (ctx.eJi >= 2) addWeight(w, 'attack_2', 2 + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 3) addWeight(w, 'attack_3', 2 + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 4) addWeight(w, 'attack_4', 2 + orbCount(enemy, 'dark') + Math.floor(unique / 2));
  if (ctx.eJi >= 5) addWeight(w, 'attack_5', 2 + orbCount(enemy, 'dark') + orbCount(enemy, 'lightning'));
  if (ctx.eJi >= 6) addWeight(w, 'attack_6', 2 + orbCount(enemy, 'dark'));
  if (ctx.eJi >= 7) addWeight(w, 'attack_7', ctx.playerLowHp ? 5 : 2 + orbCount(enemy, 'dark'));

  applyTagReactions(w, SENSITIVITY);
  suppressWeakDefenseVsMage(ctx, w);
  suppressDefenseIfNoThreat(ctx, w);
  suppressDefenseIfTooConsecutive(ctx, w);
  return pickWeightedAction(w, 'enemy', unique < 3 ? 'orb_random' : 'attack_4', blockedActions);
}

// ─── 入口 ─────────────────────────────────────────────────────────────────────

export function aiDecide(enemy) {
  if (!enemy) return 'ji';
  if (G.abilities && G.abilities.taunt && Number(enemy.ji || 0) === 1) {
    const attack1 = getActionData('attack_1', 'enemy', enemy);
    const frozen = !!(G.battle && G.battle.enemyFrostLockThisRound);
    if (attack1 && (attack1.cost || 0) <= Number(enemy.ji || 0) && !frozen) {
      updateBossMemory('attack_1');
      return 'attack_1';
    }
  }

  let action;
  if      (enemy.id === 'jiaxu')      action = aiJiaxu(enemy);
  else if (enemy.id === 'gufu')       action = aiGufu(enemy);
  else if (enemy.id === 'faultRobot') action = aiFaultRobot(enemy);
  else                                action = aiElite(enemy);

  updateBossMemory(action);
  return action;
}
