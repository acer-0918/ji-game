export const BASE_ACTIONS = {
  ji:        {type:'ji',      cost:0, def:0, atk:0, name:'蓄力',    emoji:'⚡', gain:0},
  defense_0: {type:'defense', cost:0, def:3, atk:0, name:'防',      emoji:'🛡', hits:0, damage:0},
  defense_1: {type:'defense', cost:1, def:6, atk:0, name:'超防',    emoji:'🛡🛡', hits:0, damage:0},
  defense_2: {type:'defense', cost:2, def:7, atk:0, name:'无敌防',  emoji:'🛡🛡🛡', hits:0, damage:0},
  attack_1:  {type:'attack',  cost:1, def:0, atk:1, name:'攻击1',   emoji:'⚔', hits:1, damage:1},
  attack_2:  {type:'attack',  cost:2, def:0, atk:2, name:'攻击2',   emoji:'⚔', hits:1, damage:1},
  attack_3:  {type:'attack',  cost:3, def:0, atk:3, name:'攻击3',   emoji:'⚔', hits:1, damage:1},
  attack_4:  {type:'attack',  cost:4, def:0, atk:4, name:'攻击4',   emoji:'⚔⚔', hits:1, damage:1},
  attack_5:  {type:'attack',  cost:5, def:0, atk:5, name:'攻击5',   emoji:'⚔⚔', hits:1, damage:1},
  attack_6:  {type:'attack',  cost:6, def:0, atk:6, name:'攻击6',   emoji:'⚔⚔', hits:1, damage:1},
  attack_7:  {type:'attack',  cost:7, def:0, atk:7, name:'攻击7',   emoji:'⚔⚔⚔', hits:1, damage:1},
};

export const ORB_META = {
  plasma:    {icon:'🔵', name:'等离子充能球'},
  frost:     {icon:'❄️', name:'冰霜充能球'},
  lightning: {icon:'⚡', name:'闪电充能球'},
  dark:      {icon:'🌑', name:'黑暗充能球'},
  glass:     {icon:'🔷', name:'玻璃充能球'},
};

export const ORB_KEYS = Object.keys(ORB_META);

export const COMMON_ABILITY_DEFS = [
  {key:'mango',       icon:'🥭',  name:'芒果',       cost:1, desc:'生命值上限 +5，且当前生命同步 +5。'},
  {key:'happyFlower', icon:'🌼',  name:'开心小花',   cost:1, desc:'每三个回合开始时，获得 1 Ji。'},
  {key:'smoothStone', icon:'🪨',  name:'光滑的石头', cost:1, desc:'你在使用任何等级的防御时，获得防御等级 +2。'},
];

export const CLASS_DEFS = {
  assassin: {
    key: 'assassin',
    icon: '🗡️',
    name: '刺客',
    baseHp: 3,
    baseJiRate: 3,
    abilityDefs: [
      {key:'fireBlade',    icon:'💥',  name:'暴击',     cost:1, desc:'当你的攻击比对手的防御或攻击等级高出至少 3 级时，本次攻击造成的伤害 +1。'},
      {key:'savedByBlade', icon:'🗡️', name:'名刀司命', cost:1, desc:'全局仅一次，当你死亡时，回复至 1 生命且继续本局游戏。'},
      {key:'oneVsFour',    icon:'⚡',  name:'一抵四',   cost:1, desc:'你的回费效率 +1。'},
    ],
  },
  tank: {
    key: 'tank',
    icon: '🛡️',
    name: '坦克',
    baseHp: 10,
    baseJiRate: 1,
    abilityDefs: [
      {key:'popcorn',     icon:'🍿', name:'爆米',       cost:1, desc:'若你在该回合受到伤害，则下一回合开始时你获得 2 Ji。'},
      {key:'smallPotion', icon:'🧪', name:'小血瓶',     cost:1, desc:'每场战斗开始时回复 1 生命。'},
      {key:'tigerTank',   icon:'🐯', name:'虎式坦克',   cost:1, desc:'每当进入 Boss 时，生命上限立刻永久 +3，且当前生命同步 +3。'},
    ],
  },
  mage: {
    key: 'mage',
    icon: '🔮',
    name: '法师',
    baseHp: 3,
    baseJiRate: 2,
    abilityDefs: [
      {key:'focus',          icon:'🎯', name:'集中',     cost:1, desc:'如果【一重释放】命中了敌人，则造成伤害 +1。'},
      {key:'storm',          icon:'⛈️', name:'雷暴',     cost:1, desc:'每场战斗开始时获得 2 闪电球。'},
      {key:'electrodynamics',icon:'⚙️', name:'电动力学', cost:1, desc:'如果【一重释放】命中了敌人，则获得 3 闪电球。'},
    ],
  },
};

export const DEFAULT_CLASS_KEY = 'assassin';

export const SHOP_ITEMS = [
  {key:'enhancedDagger',  icon:'🗡✨', name:'强化小刀',       cost:2, desc:'替换攻击 1。强化小刀命中时，获得 1 Ji。', slot:'weapon'},
  {key:'enhancedIceBlade', icon:'❄️🗡', name:'强化冰刀',       cost:2, desc:'替换攻击 3。强化冰刀命中时造成伤害 +1。', slot:'weapon'},
  {key:'enhancedBlade',    icon:'👻⚔', name:'强化鬼刀',       cost:2, desc:'替换攻击 5。攻击等级仍为 5，但只消耗 4 Ji。', slot:'weapon'},
  {key:'powerEquip',       icon:'🧰',  name:'磨刀石',   cost:2, desc:'装备。造成任何伤害时，伤害 +1。', slot:'gear'},
  {key:'vitalityEquip',    icon:'❤️‍🩹', name:'不朽馈赠', cost:2, desc:'装备。若通过战斗房间且未受到伤害，生命上限 +1 且当前生命 +1。', slot:'gear'},
];

export const POWER_RELIC_DEFS = [
  {key:'lever', icon:'🪜', name:'杠杆', desc:'每个回合开始时随机将你的 Ji 翻倍或重置为 2。'},
  {key:'silenceGold', icon:'🔕', name:'沉默是金', desc:'每个回合开始时随机禁用你的随机个行动，获得等量的 Ji。'},
  {key:'destinedFirstSight', icon:'📕', name:'既定的初见', desc:'你的攻击等级固定为 7。当你受到伤害时，你死亡。'},
  {key:'possibleReunion', icon:'🕊️', name:'可能的重逢', desc:'你无法再使用防守。敌人每使用 1 次超防，使你在这场战斗中造成的所有伤害 +1。'},
];

export function getPowerRelicDef(key) {
  return POWER_RELIC_DEFS.find((item) => item.key === key) || null;
}

export function getAbilityDefsForClass(classKey) {
  const selected = CLASS_DEFS[classKey] || CLASS_DEFS[DEFAULT_CLASS_KEY];
  return [...selected.abilityDefs, ...COMMON_ABILITY_DEFS];
}

export const MAP_TEMPLATE = [
  {type:'shop', icon:'🛒', label:'商店'},
  {type:'boss', icon:'🕶️', label:'Boss I', reward:0, dropPowerRelic:true, enemy:{id:'jiaxu', name:'贾诩', emoji:'🕶️', hp:10, maxHp:10, ji:0, jiRate:3, hideJi:true}},
  {type:'boss', icon:'👑', label:'Boss II', reward:0, enemy:{id:'gufu', name:'古夫大帝', emoji:'👑', hp:10, maxHp:10, ji:0, jiRate:3, chargeValue:1}},
  {type:'boss', icon:'🤖', label:'Boss III', reward:0, finalBoss:true, enemy:{id:'faultRobot', name:'故障机器人', emoji:'🤖', hp:15, maxHp:15, ji:0, jiRate:3, orbs:{plasma:0,frost:0,lightning:0,dark:0,glass:0}}},
];

export const MAX_JI_DISPLAY = 12;
