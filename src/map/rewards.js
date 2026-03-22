import { TECH_DEFS } from '../battleTechniques.js';
import { consumeTechFromMapPool } from './generator.js';
import { EQUIPMENT_DEFS } from '../equipment/defs.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createShopInventoryForRoom(game) {
  if (!game || !game.map) return null;
  const equipmentBag = [...EQUIPMENT_DEFS];
  const equipItems = [];
  while (equipmentBag.length > 0 && equipItems.length < 2) {
    const idx = randInt(0, equipmentBag.length - 1);
    const picked = equipmentBag[idx];
    equipItems.push({
      kind: 'equipment',
      id: picked.id,
      price: randInt(150, 200),
      purchased: false,
    });
    equipmentBag.splice(idx, 1);
  }

  const techIds = consumeTechFromMapPool(game.map, 4);
  const techItems = techIds.map((id) => ({
    kind: 'technique',
    id,
    price: randInt(40, 80),
    purchased: false,
  }));

  const fragmentItem = {
    kind: 'fragment',
    id: 'fragment_1',
    amount: 1,
    price: randInt(30, 60),
    purchased: false,
  };

  return {
    equipment: equipItems,
    techniques: techItems,
    fragment: fragmentItem,
  };
}

export function buildBattleRewardOptions(game, room) {
  const spec = room && room.payload ? room.payload.rewardSpec : null;
  if (!spec) return { gold: 0, pickCount: 0, options: [] };
  const gold = Math.max(0, Number(spec.goldBase || 0) + Number(spec.goldScale || 0));
  const pickCount = Math.max(0, Number(spec.pickCount || 0));
  const pool = Array.isArray(spec.pickPool) ? [...spec.pickPool] : [];
  const techNeed = pool.filter((item) => item === 'technique').length;
  const techIds = consumeTechFromMapPool(game.map, techNeed);
  let techIdx = 0;
  const options = pool.map((kind, idx) => {
    if (kind === 'fragment') {
      return { optionId: `fragment_${idx}`, kind: 'fragment', amount: 1 };
    }
    const techId = techIds[techIdx++] || null;
    return { optionId: `technique_${idx}`, kind: 'technique', id: techId };
  }).filter((item) => item.kind !== 'technique' || !!item.id);
  return { gold, pickCount, options };
}

export function formatRewardPickText(pick) {
  if (!pick) return '未知奖励';
  if (pick.kind === 'fragment') return `能力碎片 +${pick.amount || 1}`;
  if (pick.kind === 'technique') {
    const def = TECH_DEFS[pick.id];
    return def ? `战技：${def.name}` : `战技：${pick.id}`;
  }
  return '未知奖励';
}
