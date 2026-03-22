export const EQUIPMENT_SLOT_COUNT = 2;

export const EQUIPMENT_DEFS = [
  {
    id: 'equi_1',
    icon: '🏹',
    name: '狩猎律动',
    cost: 2,
    desc: '基础攻击/战技命中后，可在当前回合消耗 Ji 追加同款攻击。',
  },
  {
    id: 'equi_2',
    icon: '🛡️',
    name: '霸王血铠',
    cost: 2,
    desc: '你的攻击与技能造成伤害时，额外造成 floor(最大生命*30%) 伤害。',
  },
  {
    id: 'equi_3',
    icon: '🧱',
    name: '壁垒',
    cost: 2,
    desc: '本回合使用防御且未受伤，下回合防御基础值 +3。',
  },
  {
    id: 'equi_4',
    icon: '🥊',
    name: '蓄意轰拳',
    cost: 2,
    desc: '完全防御敌方攻击可积累豪意值；下次攻击命中时按豪意值追加伤害。',
  },
  {
    id: 'equi_5',
    icon: '🍖',
    name: '大胃袋',
    cost: 2,
    desc: '击败敌人时，按敌方最大生命的一半提升生命上限并回复（上限 5）。',
  },
  {
    id: 'equi_6',
    icon: '🌼',
    name: '开心小花',
    cost: 2,
    desc: '战斗第 3n 回合开始时额外获得 1 Ji。',
  },
  {
    id: 'equi_7',
    icon: '🥭',
    name: '芒果',
    cost: 2,
    desc: '装备时生命上限 +5，当前生命同步 +5。',
  },
  {
    id: 'equi_8',
    icon: '🪨',
    name: '光滑的石头',
    cost: 2,
    desc: '使用任意防御时，防御等级 +2。',
  },
];

export const EQUIPMENT_DEF_MAP = Object.fromEntries(EQUIPMENT_DEFS.map((item) => [item.id, item]));

export function getEquipmentDef(id) {
  return EQUIPMENT_DEF_MAP[id] || null;
}
