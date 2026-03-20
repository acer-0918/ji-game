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

export const ABILITY_DEFS = [
  {key:'fireBlade',    icon:'🔥',  name:'刀刀烈火刀刀爆', cost:1, desc:'当你的攻击比对手的防御或攻击等级高出至少 3 级时，本次攻击造成的伤害 +1。'},
  {key:'savedByBlade', icon:'🗡️', name:'名刀司命',       cost:1, desc:'全局仅一次：当你死亡时，回复至 1 生命并继续本局游戏。'},
  {key:'oneVsFour',    icon:'⚡',  name:'一抵四',         cost:1, desc:'你的回费效率 +1。'},
  {key:'mango',        icon:'🥭',  name:'芒果',           cost:1, desc:'生命值上限 +5，且当前生命同步 +5。'},
  {key:'happyFlower',  icon:'🌼',  name:'开心小花',       cost:1, desc:'每 3 个回合获得 1 Ji。'},
];

export const SHOP_ITEMS = [
  {key:'enhancedBlade', icon:'👻⚔', name:'强化鬼刀',     cost:1, desc:'替换攻击 5。攻击等级仍为 5，但只消耗 4 Ji。', slot:'weapon'},
  {key:'powerEquip',    icon:'🧰',  name:'一个强化装备', cost:1, desc:'装备。你造成任何伤害时，额外 +1 伤害。', slot:'gear'},
  {key:'smoothStone',   icon:'🪨',  name:'光滑的石头',   cost:1, desc:'遗物。你的所有防御等级 +2。', slot:'relic'},
];

export const MAP_TEMPLATE = [
  {type:'shop', icon:'🛒', label:'商店'},
  {type:'boss', icon:'🕶️', label:'Boss I', reward:0, enemy:{id:'jiaxu', name:'贾诩', emoji:'🕶️', hp:15, maxHp:15, ji:0, jiRate:3, hideJi:true}},
  {type:'boss', icon:'👑', label:'Boss II', reward:0, enemy:{id:'gufu', name:'古夫大帝', emoji:'👑', hp:15, maxHp:15, ji:0, jiRate:3, chargeValue:1}},
  {type:'boss', icon:'🤖', label:'Boss III', reward:0, finalBoss:true, enemy:{id:'faultRobot', name:'故障机器人', emoji:'🤖', hp:15, maxHp:15, ji:0, jiRate:3, orbs:{plasma:0,frost:0,lightning:0,dark:0,glass:0}}},
];

export const MAX_JI_DISPLAY = 12;
