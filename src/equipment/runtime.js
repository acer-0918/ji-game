import { EQUIPMENT_DEFS, EQUIPMENT_SLOT_COUNT, getEquipmentDef } from './defs.js';
import { getEquipmentTagDef, rollEquipmentTagId } from './tags.js';

function toEquipmentState(input) {
  if (!input) return null;
  if (input.records && Array.isArray(input.slots)) return input;
  if (input.equipment && input.equipment.records && Array.isArray(input.equipment.slots)) return input.equipment;
  return null;
}

function clampSlotIndex(slotIndex) {
  const n = Number(slotIndex);
  if (!Number.isFinite(n)) return -1;
  return Math.max(0, Math.min(EQUIPMENT_SLOT_COUNT - 1, Math.floor(n)));
}

function ensureRecord(state, equipmentId) {
  if (!state || !equipmentId) return null;
  if (!state.records[equipmentId]) {
    state.records[equipmentId] = {
      tagId: undefined,
      removedFromPool: false,
    };
  }
  return state.records[equipmentId];
}

function randomDistinctFrom(pool, count, rng = Math.random) {
  const bag = [...pool];
  const out = [];
  while (bag.length > 0 && out.length < count) {
    const idx = Math.floor(rng() * bag.length);
    out.push(bag[idx]);
    bag.splice(idx, 1);
  }
  return out;
}

export function createEquipmentState() {
  const records = {};
  EQUIPMENT_DEFS.forEach((item) => {
    records[item.id] = {
      tagId: undefined,
      removedFromPool: false,
    };
  });
  return {
    slots: Array(EQUIPMENT_SLOT_COUNT).fill(null),
    records,
    shopOfferIds: [],
  };
}

export function createBattleEquipmentState() {
  return {
    barrierReady: false,
    barrierActive: false,
    usedDefense: false,
    tookDamage: false,
    haoYi: 0,
    huntRhythmPlannedExtraCount: 0,
  };
}

export function ensureBattleEquipmentState(game) {
  if (!game || !game.battle) return null;
  if (!game.battle.equipment) game.battle.equipment = createBattleEquipmentState();
  return game.battle.equipment;
}

export function getEquippedEquipmentIds(input) {
  const state = toEquipmentState(input);
  if (!state) return [];
  return state.slots.filter(Boolean);
}

export function getEquipmentIdInSlot(input, slotIndex) {
  const state = toEquipmentState(input);
  if (!state) return null;
  const idx = clampSlotIndex(slotIndex);
  if (idx < 0) return null;
  return state.slots[idx] || null;
}

export function hasEquippedEquipment(input, equipmentId) {
  if (!equipmentId) return false;
  const ids = getEquippedEquipmentIds(input);
  return ids.includes(equipmentId);
}

export function ensureEquipmentTagAssigned(input, equipmentId, rng = Math.random) {
  const state = toEquipmentState(input);
  if (!state || !equipmentId) return null;
  const record = ensureRecord(state, equipmentId);
  if (record.tagId === undefined) {
    record.tagId = rollEquipmentTagId(rng);
  }
  return record.tagId ?? null;
}

export function getEquipmentTagId(input, equipmentId) {
  const state = toEquipmentState(input);
  if (!state || !equipmentId) return null;
  const record = ensureRecord(state, equipmentId);
  if (record.tagId === undefined) return null;
  return record.tagId;
}

export function getEquipmentTagDefForItem(input, equipmentId) {
  const tagId = getEquipmentTagId(input, equipmentId);
  if (!tagId) return null;
  return getEquipmentTagDef(tagId);
}

export function removeEquipmentTag(input, equipmentId) {
  const state = toEquipmentState(input);
  if (!state || !equipmentId) return false;
  const record = ensureRecord(state, equipmentId);
  if (record.tagId === undefined || record.tagId === null) return false;
  record.tagId = null;
  return true;
}

export function rerollEquipmentTag(input, equipmentId, rng = Math.random) {
  const state = toEquipmentState(input);
  if (!state || !equipmentId) return null;
  const record = ensureRecord(state, equipmentId);
  record.tagId = rollEquipmentTagId(rng);
  return record.tagId;
}

export function countActiveTag(input, tagId) {
  const state = toEquipmentState(input);
  if (!state || !tagId) return 0;
  return getEquippedEquipmentIds(state).reduce((sum, equipmentId) => {
    const record = ensureRecord(state, equipmentId);
    return sum + (record.tagId === tagId ? 1 : 0);
  }, 0);
}

export function getActiveTagIds(input) {
  const state = toEquipmentState(input);
  if (!state) return [];
  return getEquippedEquipmentIds(state)
    .map((equipmentId) => {
      const record = ensureRecord(state, equipmentId);
      return record.tagId;
    })
    .filter((tagId) => typeof tagId === 'string');
}

function getOfferPool(state) {
  if (!state) return [];
  const equippedSet = new Set(getEquippedEquipmentIds(state));
  return EQUIPMENT_DEFS
    .filter((item) => {
      const record = ensureRecord(state, item.id);
      return !record.removedFromPool && !equippedSet.has(item.id);
    })
    .map((item) => item.id);
}

function compactAndRefillOffers(state, count, rng = Math.random) {
  const candidateSet = new Set(getOfferPool(state));
  const existing = (state.shopOfferIds || []).filter((id) => candidateSet.has(id));
  const need = Math.max(0, count - existing.length);
  const leftovers = [...candidateSet].filter((id) => !existing.includes(id));
  const refill = randomDistinctFrom(leftovers, need, rng);
  state.shopOfferIds = [...existing, ...refill];
  state.shopOfferIds.forEach((equipmentId) => {
    ensureEquipmentTagAssigned(state, equipmentId, rng);
  });
}

export function ensureEquipmentShopOffers(input, count = 3, rng = Math.random) {
  const state = toEquipmentState(input);
  if (!state) return [];
  compactAndRefillOffers(state, Math.max(0, Number(count) || 0), rng);
  return [...state.shopOfferIds];
}

export function clearEquipmentShopOffers(input) {
  const state = toEquipmentState(input);
  if (!state) return;
  state.shopOfferIds = [];
}

export function equipEquipment(game, equipmentId, rng = Math.random) {
  if (!game || !game.player) return { ok: false, reason: 'invalid_game' };
  const state = toEquipmentState(game);
  if (!state) return { ok: false, reason: 'invalid_state' };
  const def = getEquipmentDef(equipmentId);
  if (!def) return { ok: false, reason: 'unknown_equipment' };
  if (state.slots.includes(equipmentId)) return { ok: false, reason: 'already_equipped' };

  const record = ensureRecord(state, equipmentId);
  if (record.removedFromPool) return { ok: false, reason: 'removed_from_pool' };

  const slotIndex = state.slots.findIndex((id) => !id);
  if (slotIndex < 0) return { ok: false, reason: 'slot_full' };

  ensureEquipmentTagAssigned(state, equipmentId, rng);
  state.slots[slotIndex] = equipmentId;
  state.shopOfferIds = (state.shopOfferIds || []).filter((id) => id !== equipmentId);

  if (equipmentId === 'equi_7') {
    game.player.maxHp += 5;
    game.player.hp += 5;
  }

  return { ok: true, slotIndex, def };
}

export function unequipEquipment(game, slotIndex) {
  if (!game || !game.player) return { ok: false, reason: 'invalid_game' };
  const state = toEquipmentState(game);
  if (!state) return { ok: false, reason: 'invalid_state' };
  const idx = clampSlotIndex(slotIndex);
  if (idx < 0) return { ok: false, reason: 'invalid_slot' };

  const equipmentId = state.slots[idx];
  if (!equipmentId) return { ok: false, reason: 'empty_slot' };

  state.slots[idx] = null;
  const record = ensureRecord(state, equipmentId);
  record.removedFromPool = true;
  state.shopOfferIds = (state.shopOfferIds || []).filter((id) => id !== equipmentId);

  if (equipmentId === 'equi_7') {
    game.player.maxHp = Math.max(1, game.player.maxHp - 5);
    game.player.hp = Math.min(game.player.hp, game.player.maxHp);
  }

  return { ok: true, equipmentId, def: getEquipmentDef(equipmentId), slotIndex: idx };
}

export function getPlayerJiCapFromEquipment(input) {
  return countActiveTag(input, 'equi_tag_ng_a_2') > 0 ? 10 : Number.POSITIVE_INFINITY;
}

export function clampPlayerJiByEquipment(input, value) {
  const cap = getPlayerJiCapFromEquipment(input);
  if (!Number.isFinite(cap)) return Math.max(0, Math.floor(value || 0));
  return Math.max(0, Math.min(Math.floor(value || 0), cap));
}

export function getJiRateTagModifier(input) {
  const fast = countActiveTag(input, 'equi_tag_po_b_1');
  const slow = countActiveTag(input, 'equi_tag_ng_b_1');
  return fast - slow;
}

export function getAttackLevelTagModifier(input) {
  const weak = countActiveTag(input, 'equi_tag_ng_b_2');
  return -0.1 * weak;
}

export function getDefenseTagBonus(input, actionKey) {
  if (actionKey !== 'defense_1' && actionKey !== 'defense_2') return 0;
  return countActiveTag(input, 'equi_tag_po_a_2');
}

export function getPostBattleTagModifiers(input) {
  const poor = countActiveTag(input, 'equi_tag_ng_a_1');
  const bankrupt = countActiveTag(input, 'equi_tag_ng_b_3');
  const hardWork = countActiveTag(input, 'equi_tag_po_a_1');
  const rich = countActiveTag(input, 'equi_tag_po_b_2');

  const heal = countActiveTag(input, 'equi_tag_po_b_3');
  const innerInjury = countActiveTag(input, 'equi_tag_ng_b_4');

  return {
    goldDelta: hardWork * 10 + rich * 50 - poor * 10 - bankrupt * 50,
    hpDelta: heal - innerInjury,
    hasInnerInjury: innerInjury > 0,
  };
}

export function applyPostBattleTagModifiers(game, { addLog } = {}) {
  if (!game || !game.player) return { goldDelta: 0, hpDelta: 0 };
  const mods = getPostBattleTagModifiers(game);
  let appliedGoldDelta = 0;
  let appliedHpDelta = 0;

  if (mods.goldDelta !== 0) {
    const before = Number(game.player.gold || 0);
    game.player.gold = Math.max(0, before + mods.goldDelta);
    appliedGoldDelta = game.player.gold - before;
    if (appliedGoldDelta !== 0 && typeof addLog === 'function') {
      const sign = appliedGoldDelta > 0 ? '+' : '';
      addLog('log-ab', `🎒 装备词条：战后金币 ${sign}${appliedGoldDelta}。`);
    }
  }

  if (mods.hpDelta !== 0 && Number(game.player.hp || 0) > 0) {
    const before = Number(game.player.hp || 0);
    if (mods.hpDelta > 0) {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + mods.hpDelta);
    } else if (mods.hasInnerInjury) {
      game.player.hp = Math.max(1, game.player.hp + mods.hpDelta);
    } else {
      game.player.hp = Math.max(0, game.player.hp + mods.hpDelta);
    }
    appliedHpDelta = game.player.hp - before;
    if (appliedHpDelta !== 0 && typeof addLog === 'function') {
      const sign = appliedHpDelta > 0 ? '+' : '';
      addLog('log-ab', `🎒 装备词条：战后生命 ${sign}${appliedHpDelta}。`);
    }
  }

  return {
    goldDelta: appliedGoldDelta,
    hpDelta: appliedHpDelta,
  };
}

export function applyOnWinEquipmentRewards(game, enemyMaxHp = 0, { addLog } = {}) {
  if (!game || !game.player) return { hpGain: 0 };
  if (!hasEquippedEquipment(game, 'equi_5')) return { hpGain: 0 };
  const gain = Math.min(5, Math.max(0, Math.floor(Number(enemyMaxHp || 0) / 2)));
  if (gain <= 0) return { hpGain: 0 };

  game.player.maxHp += gain;
  game.player.hp += gain;
  if (typeof addLog === 'function') {
    addLog('log-ab', `🍖 大胃袋：击败敌人后生命上限 +${gain}，当前生命 +${gain}。`);
  }
  return { hpGain: gain };
}

export function getEquipmentTagText(input, equipmentId) {
  const state = toEquipmentState(input);
  if (!state || !equipmentId) return '随机词条：未知';
  const record = ensureRecord(state, equipmentId);
  if (record.tagId === undefined) return '随机词条：未生成';
  if (record.tagId === null) return '随机词条：无';
  const tagDef = getEquipmentTagDef(record.tagId);
  return tagDef ? `随机词条：${tagDef.name}` : '随机词条：未知';
}
