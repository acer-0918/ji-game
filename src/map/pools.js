import { TECH_DEFS } from '../battleTechniques.js';

export const MOB_POOL = ['mob_1', 'mob_2'];
export const ELITE_POOL = ['elite_1', 'elite_2', 'elite_3'];
export const BOSS_POOL = ['jiaxu', 'gufu', 'faultRobot'];
export const EVENT_POOL = ['event_1', 'event_2', 'event_3', 'event_4', 'event_5'];

export const TECHNIQUE_POOL = Object.keys(TECH_DEFS);

const BOSS_DEFS = {
  jiaxu: { id:'jiaxu', name:'贾诩', emoji:'🕶️', hp:10, maxHp:10, ji:0, jiRate:3, hideJi:true },
  gufu: { id:'gufu', name:'古夫大帝', emoji:'👑', hp:10, maxHp:10, ji:0, jiRate:3, chargeValue:1 },
  faultRobot: {
    id:'faultRobot',
    name:'故障机器人',
    emoji:'🤖',
    hp:15,
    maxHp:15,
    ji:0,
    jiRate:3,
    orbs:{plasma:0,frost:0,lightning:0,dark:0,glass:0},
  },
};

function floorHP(base, ratio, floor) {
  return base + Math.floor(floor * ratio);
}

export function createMobById(mobId, floor) {
  if (mobId === 'mob_1') {
    const hp = floorHP(3, 0.5, floor);
    return { id:`mob_1_f${floor}`, name:'小怪A', emoji:'👹', hp, maxHp:hp, ji:0, jiRate:1 };
  }
  const hp = floorHP(1, 0.4, floor);
  return { id:`mob_2_f${floor}`, name:'小怪B', emoji:'🐾', hp, maxHp:hp, ji:0, jiRate:2 };
}

export function createEliteById(eliteId, floor) {
  if (eliteId === 'elite_1') {
    const hp = floorHP(7, 0.7, floor);
    return { id:`elite_1_f${floor}`, name:'精英A', emoji:'⚔️', hp, maxHp:hp, ji:0, jiRate:1 };
  }
  if (eliteId === 'elite_2') {
    const hp = floorHP(4, 0.6, floor);
    return { id:`elite_2_f${floor}`, name:'精英B', emoji:'🛡️', hp, maxHp:hp, ji:0, jiRate:2 };
  }
  const hp = floorHP(3, 0.5, floor);
  return { id:`elite_3_f${floor}`, name:'精英C', emoji:'🗡️', hp, maxHp:hp, ji:0, jiRate:3 };
}

export function createBossById(bossId) {
  const src = BOSS_DEFS[bossId] || BOSS_DEFS.jiaxu;
  return JSON.parse(JSON.stringify(src));
}

export function createRoomLabel(type, payload) {
  if (type === 'battle') return '普通战斗';
  if (type === 'elite') return '精英战斗';
  if (type === 'event') return '事件';
  if (type === 'camp') return '篝火';
  if (type === 'shop') return '商店';
  if (type === 'boss') return 'BOSS';
  if (type === 'mystery') return '?';
  if (payload && payload.enemy && payload.enemy.name) return payload.enemy.name;
  return '房间';
}
