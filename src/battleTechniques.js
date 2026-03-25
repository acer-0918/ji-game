/**
 * 战技系统 — 定义与状态管理
 * 战技用于替换基础攻击方式（attack_1 ~ attack_7），每个槽位最多一种。
 */

export const TECH_DEFS = {
  // ──────────── 攻击1 ────────────
  atk_1_a: {
    id: 'atk_1_a',
    slot: 1,
    name: '重击α',
    emoji: '👊',
    desc: '【重击α】的力气稍大一些。仅当敌人同时使用【攻击1】时，该次的【重击α】攻击等级+0.1。',
    // Art interface: set artSrc when a card image is available
    // artSrc: 'assets/tech/atk_1_a.png',
  },
  atk_1_b: {
    id: 'atk_1_b',
    slot: 1,
    weight: 'light',
    name: '小刀',
    emoji: '🗡️',
    desc: '【小刀】命中时有30%概率造成伤害+1。',
  },
  atk_1_c: {
    id: 'atk_1_c',
    slot: 1,
    weight: 'light',
    name: '强化小刀',
    emoji: '🗡✨',
    desc: '【强化小刀】命中时有60%概率造成伤害+1。',
  },
  atk_1_d: {
    id: 'atk_1_d',
    slot: 1,
    weight: 'light',
    name: '回旋镖',
    emoji: '🪃',
    desc: '【回旋镖】每命中一次时，下回合开始时+1Ji。',
  },
  atk_1_e: {
    id: 'atk_1_e',
    slot: 1,
    weight: 'light',
    name: '连珠箭',
    emoji: '🏹',
    desc: '若前5回合连续使用【连珠箭】，则该回合使用【连珠箭】的消耗为0。',
  },

  // ──────────── 攻击2 ────────────
  atk_2_a: {
    id: 'atk_2_a',
    slot: 2,
    name: '重击β',
    emoji: '👊💪',
    desc: '【重击β】的力气稍大一些。仅当敌人同时使用【攻击2】时，该次的【重击β】攻击等级+0.1。',
  },
  atk_2_b: {
    id: 'atk_2_b',
    slot: 2,
    weight: 'heavy',
    name: '大刀',
    emoji: '🔪',
    desc: '【大刀】命中时有30%概率造成伤害+1。',
  },
  atk_2_c: {
    id: 'atk_2_c',
    slot: 2,
    weight: 'heavy',
    name: '强化大刀',
    emoji: '🔪✨',
    desc: '【强化大刀】命中时有60%概率造成伤害+1。',
  },
  atk_2_d: {
    id: 'atk_2_d',
    slot: 2,
    weight: 'light',
    name: '太刀',
    emoji: '⚔️🐉',
    desc: '【太刀】每次命中时，有20%概率免费追加一次【太刀】攻击（登龙！）。追加的【太刀】同样有20%概率继续触发。',
  },

  // ──────────── 攻击3 ────────────
  atk_3_a: {
    id: 'atk_3_a',
    slot: 3,
    name: '重击γ',
    emoji: '💥',
    desc: '【重击γ】的力气稍大一些。仅当敌人同时使用【攻击3】时，该次的【重击γ】攻击等级+0.1。',
  },
  atk_3_b: {
    id: 'atk_3_b',
    slot: 3,
    weight: 'light',
    name: '冰刀',
    emoji: '❄️🗡️',
    desc: '【冰刀】命中时有30%概率造成伤害+1。',
  },
  atk_3_c: {
    id: 'atk_3_c',
    slot: 3,
    weight: 'light',
    name: '强化冰刀',
    emoji: '❄️🗡✨',
    desc: '【强化冰刀】命中时有60%概率造成伤害+1。',
  },
  atk_3_d: {
    id: 'atk_3_d',
    slot: 3,
    weight: 'heavy',
    name: '冰之盾',
    emoji: '🛡❄️',
    desc: '使用【冰之盾】时自带6防御等级。',
  },
  atk_3_e: {
    id: 'atk_3_e',
    slot: 3,
    weight: 'light',
    name: '冰霜新星',
    emoji: '❄️💫',
    desc: '【冰霜新星】命中时，敌人下一回合无法使用任何等级的攻击。',
  },

  // ──────────── 攻击4 ────────────
  atk_4_a: {
    id: 'atk_4_a',
    slot: 4,
    name: '重击δ',
    emoji: '🌋',
    desc: '【重击δ】的力气稍大一些。仅当敌人同时使用【攻击4】时，该次的【重击δ】攻击等级+0.1。',
  },
  atk_4_b: {
    id: 'atk_4_b',
    slot: 4,
    weight: 'light',
    name: '火刀',
    emoji: '🔥🗡️',
    desc: '【火刀】命中时有30%概率造成伤害+1。',
  },
  atk_4_c: {
    id: 'atk_4_c',
    slot: 4,
    weight: 'light',
    name: '强化火刀',
    emoji: '🔥🗡✨',
    desc: '【强化火刀】命中时有60%概率造成伤害+1。',
  },
  atk_4_d: {
    id: 'atk_4_d',
    slot: 4,
    weight: 'heavy',
    name: '火焰流星雨',
    emoji: '☄️🔥',
    desc: '若前3回合连续使用【火焰流星雨】，该回合命中后将免费追加3次【火焰流星雨】。',
  },
  atk_4_e: {
    id: 'atk_4_e',
    slot: 4,
    weight: 'heavy',
    name: '日轮刀',
    emoji: '☀️⚔️',
    desc: '【日轮刀】命中时有90%概率造成伤害+1。',
  },

  // ──────────── 攻击5 ────────────
  atk_5_a: {
    id: 'atk_5_a',
    slot: 5,
    name: '重击ε',
    emoji: '💣',
    desc: '【重击ε】的力气稍大一些。仅当敌人同时使用【攻击5】时，该次的【重击ε】攻击等级+0.1。',
  },
  atk_5_b: {
    id: 'atk_5_b',
    slot: 5,
    weight: 'light',
    name: '鬼刀',
    emoji: '👻🗡️',
    desc: '【鬼刀】命中时有30%概率造成伤害+1。',
  },
  atk_5_c: {
    id: 'atk_5_c',
    slot: 5,
    weight: 'light',
    name: '强化鬼刀',
    emoji: '👻🗡✨',
    desc: '【强化鬼刀】命中时有60%概率造成伤害+1。',
  },
  atk_5_d: {
    id: 'atk_5_d',
    slot: 5,
    weight: 'light',
    name: '鬼头刀',
    emoji: '👹⚔️',
    desc: '【鬼头刀】的消耗为4Ji（而非5Ji）。',
    costOverride: 4,
  },

  // ──────────── 攻击6 ────────────
  atk_6_a: {
    id: 'atk_6_a',
    slot: 6,
    name: '重击ζ',
    emoji: '🌪️',
    desc: '【重击ζ】的力气稍大一些。仅当敌人同时使用【攻击6】时，该次的【重击ζ】攻击等级+0.1。',
  },
  atk_6_b: {
    id: 'atk_6_b',
    slot: 6,
    weight: 'heavy',
    name: '六脉神剑',
    emoji: '⚡⚔️',
    desc: '【六脉神剑】命中时有30%概率造成伤害+1。',
  },
  atk_6_c: {
    id: 'atk_6_c',
    slot: 6,
    weight: 'heavy',
    name: '强化六脉神剑',
    emoji: '⚡⚔✨',
    desc: '【强化六脉神剑】命中时有60%概率造成伤害+1。',
  },
  atk_6_d: {
    id: 'atk_6_d',
    slot: 6,
    name: '掷骰',
    emoji: '🎲',
    desc: '使用【掷骰】时，有概率在下回合开始时获得1-6Ji（各概率均为1/6）。',
  },

  // ──────────── 攻击7 ────────────
  atk_7_a: {
    id: 'atk_7_a',
    slot: 7,
    name: '重击η',
    emoji: '🔱',
    desc: '【重击η】的力气稍大一些。仅当敌人同时使用【攻击7】时，该次的【重击η】攻击等级+0.1。',
  },
  atk_7_b: {
    id: 'atk_7_b',
    slot: 7,
    weight: 'heavy',
    name: '大炮',
    emoji: '💣💥',
    desc: '【大炮】命中时有30%概率造成伤害+1。',
  },
  atk_7_c: {
    id: 'atk_7_c',
    slot: 7,
    weight: 'heavy',
    name: '强化大炮',
    emoji: '💣💥✨',
    desc: '【强化大炮】命中时有60%概率造成伤害+1。',
  },
  atk_7_d: {
    id: 'atk_7_d',
    slot: 7,
    weight: 'heavy',
    name: '壶大炮',
    emoji: '🫙💥',
    desc: '【壶大炮】命中时使敌人的Ji数在下回合开始时-3（至多归零）。',
  },

  // ──────────── 防御0 ────────────
  defense_0_b: {
    id: 'defense_0_b',
    slot: 'd0',
    type: 'defense',
    name: '小圆盾',
    emoji: '🔵🛡',
    costOverride: 2,
    defOverride: 4,
    desc: '消耗 2 Ji，防御等级 4。防御成功时，减少敌方 2 倍其出招 Ji 消耗的 Ji（最少归零）。',
  },
  defense_0_c: {
    id: 'defense_0_c',
    slot: 'd0',
    type: 'defense',
    name: '冷静',
    emoji: '🧘🛡',
    defOverride: 1,
    desc: '防御等级 1。下回合额外附带防御等级 +1。',
  },
  defense_0_d: {
    id: 'defense_0_d',
    slot: 'd0',
    type: 'defense',
    name: '丰矿',
    emoji: '⛏🛡',
    defOverride: 6,
    desc: '防御等级 6。下回合防御等级 -3（最低为 0）。',
  },

  // ──────────── 防御1 ────────────
  defense_1_a: {
    id: 'defense_1_a',
    slot: 'd1',
    type: 'defense',
    name: '聚合',
    emoji: '✨🛡',
    costOverride: 3,
    defOverride: 0,
    desc: '消耗 3 Ji，本回合获得"无敌"（免疫所有伤害）。若本回合被攻击，下一次【太刀】追加概率变为 100%。',
  },
  defense_1_c: {
    id: 'defense_1_c',
    slot: 'd1',
    type: 'defense',
    name: '黄金盾',
    emoji: '🥇🛡',
    costOverride: 0,
    defOverride: 5,
    useLimitPerBattle: 6,
    desc: '不消耗 Ji，防御等级 5。每场战斗限使用 6 次。',
  },
  defense_1_d: {
    id: 'defense_1_d',
    slot: 'd1',
    type: 'defense',
    name: '粥还得熬多久',
    emoji: '🍚🛡',
    desc: '复制上回合的防御等级并 +3。',
  },

  // ──────────── 防御2 ────────────
  defense_2_a: {
    id: 'defense_2_a',
    slot: 'd2',
    type: 'defense',
    name: '绘画大盾',
    emoji: '🎨🛡',
    costOverride: 4,
    defOverride: 6,
    desc: '消耗 4 Ji，防御等级 6。使用时回复 1 点生命。',
  },
  defense_2_b: {
    id: 'defense_2_b',
    slot: 'd2',
    type: 'defense',
    name: '塔盾',
    emoji: '🏰🛡',
    acquiredDesc: '灌注涌出它非喵',
    desc: '很神秘的一个盾，被燃烧器炙烤的黢黑。',
  },
  defense_2_c: {
    id: 'defense_2_c',
    slot: 'd2',
    type: 'defense',
    name: '塔斯订购...是的',
    emoji: '📦🛡',
    defOverride: 6,
    desc: '防御等级 6。若下回合敌方攻击合法，则敌方必定攻击。',
  },
  defense_2_d: {
    id: 'defense_2_d',
    slot: 'd2',
    type: 'defense',
    name: '波尔',
    emoji: '🎯🛡',
    desc: '本场战斗中使用后，你的【掷骰】必定获得 +3 Ji。',
  },
};

export function getTechniqueCategoryLabel(defOrId) {
  const def = typeof defOrId === 'string' ? TECH_DEFS[defOrId] : defOrId;
  if (!def) return '未分类';
  if (def.slot === 'd0') return '防御0类';
  if (def.slot === 'd1') return '防御1类';
  if (def.slot === 'd2') return '防御2类';
  if (!Number.isFinite(Number(def.slot))) return '未分类';
  return `攻击${Math.floor(Number(def.slot))}类`;
}

/** 获取某槽位的所有战技定义 */
export function getTechDefsForSlot(slot) {
  return Object.values(TECH_DEFS).filter((t) => t.slot === slot);
}

/** 初始化战技状态（所有槽位为 null，表示使用基础攻击） */
export function createTechniquesState() {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, d0: null, d1: null, d2: null };
}

/** 初始化战斗内战技计数器 */
export function createTechCounters() {
  return {
    // 连珠箭：连续使用次数（包括本回合触发0费那次）
    renzhuJian_streak: 0,
    // 火焰流星雨：连续使用次数
    meteor_streak: 0,
    // 回旋镖：上一回合命中标记，下回合发放Ji
    boomerang_pending: 0,
    // 掷骰：已掷，待发放Ji
    dice_pending: 0,
    // 壶大炮：待扣除敌方Ji
    pot_cannon_pending: 0,
    // 冰霜新星：敌方下回合攻击锁定
    frost_nova_lock: false,
    // 防御战技计数器
    goldenShield_used: 0,
    lastPlayerDefLevel: 0,
    defPenalty_next: 0,
    calmBonus_next: 0,
    bore_active: false,
    tachiGuaranteedNext: false,
    taDun_shown: false,
  };
}

/** 根据 G.techniques[slot] 获取当前槽位的战技定义（若无则返回 null） */
export function getTechForSlot(G, slot) {
  if (!G.techniques) return null;
  const id = G.techniques[slot];
  if (!id) return null;
  return TECH_DEFS[id] || null;
}

/** 给玩家装备战技（slot 由 def.slot 决定） */
export function equipTechnique(G, techId) {
  const def = TECH_DEFS[techId];
  if (!def) return false;
  if (!G.techniques) G.techniques = createTechniquesState();
  G.techniques[def.slot] = techId;
  return true;
}

/** 卸下某槽位的战技，还原为基础攻击 */
export function unequipTechniqueSlot(G, slot) {
  if (!G.techniques) return;
  G.techniques[slot] = null;
}
