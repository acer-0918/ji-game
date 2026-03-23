export const EQUIPMENT_TAG_DEFS = {
  equi_tag_ng_a_1: { id: 'equi_tag_ng_a_1', name: '穷困', icon: '💸', polarity: 'ng', tier: 'a', desc: '每场战斗结束后，金币 -10。' },
  equi_tag_ng_a_2: { id: 'equi_tag_ng_a_2', name: '负重', icon: '⛓️', polarity: 'ng', tier: 'a', desc: '战斗中 Ji 上限为 10。' },
  equi_tag_ng_a_3: { id: 'equi_tag_ng_a_3', name: '笨拙', icon: '🫠', polarity: 'ng', tier: 'a', desc: '【无敌防】消耗 Ji +1。' },

  equi_tag_ng_b_1: { id: 'equi_tag_ng_b_1', name: '迟缓', icon: '🐢', polarity: 'ng', tier: 'b', desc: 'Ji 回复效率 -1。' },
  equi_tag_ng_b_2: { id: 'equi_tag_ng_b_2', name: '软弱', icon: '🪶', polarity: 'ng', tier: 'b', desc: '你的攻击等级 -0.1。' },
  equi_tag_ng_b_3: { id: 'equi_tag_ng_b_3', name: '破产', icon: '🧾', polarity: 'ng', tier: 'b', desc: '每场战斗结束后，金币 -50。' },
  equi_tag_ng_b_4: { id: 'equi_tag_ng_b_4', name: '内伤', icon: '🩸', polarity: 'ng', tier: 'b', desc: '每场战斗结束后，生命 -1（最低至 1）。' },

  equi_tag_po_a_1: { id: 'equi_tag_po_a_1', name: '勤劳', icon: '🪙', polarity: 'po', tier: 'a', desc: '每场战斗结束后，金币 +10。' },
  equi_tag_po_a_2: { id: 'equi_tag_po_a_2', name: '坚忍', icon: '🧷', polarity: 'po', tier: 'a', desc: '【超防】【无敌防】防御等级 +1。' },

  equi_tag_po_b_1: { id: 'equi_tag_po_b_1', name: '迅捷',   icon: '💨', polarity: 'po', tier: 'b', desc: 'Ji 回复效率 +1。' },
  equi_tag_po_b_2: { id: 'equi_tag_po_b_2', name: '暴富',   icon: '💰', polarity: 'po', tier: 'b', desc: '每场战斗结束后，金币 +50。' },
  equi_tag_po_b_3: { id: 'equi_tag_po_b_3', name: '愈合',   icon: '🌿', polarity: 'po', tier: 'b', desc: '每场战斗结束后，生命 +1。' },
  equi_tag_po_b_4: { id: 'equi_tag_po_b_4', name: '力大无穷', icon: '💪', polarity: 'po', tier: 'b', desc: '你的所有【重】战技消耗的 Ji -1（最低为 1）。' },
  equi_tag_po_b_5: { id: 'equi_tag_po_b_5', name: '轻便灵巧', icon: '🐾', polarity: 'po', tier: 'b', desc: '你的所有【轻】战技消耗的 Ji -1（最低为 1）。' },
};

export const EQUIP_TAGPOOL_NG_A = ['equi_tag_ng_a_1', 'equi_tag_ng_a_2', 'equi_tag_ng_a_3'];
export const EQUIP_TAGPOOL_NG_B = ['equi_tag_ng_b_1', 'equi_tag_ng_b_2', 'equi_tag_ng_b_3', 'equi_tag_ng_b_4'];
export const EQUIP_TAGPOOL_PO_A = ['equi_tag_po_a_1', 'equi_tag_po_a_2'];
export const EQUIP_TAGPOOL_PO_B = ['equi_tag_po_b_1', 'equi_tag_po_b_2', 'equi_tag_po_b_3', 'equi_tag_po_b_4', 'equi_tag_po_b_5'];

function pickUniform(pool, rng = Math.random) {
  if (!Array.isArray(pool) || pool.length <= 0) return null;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx] || null;
}

export function rollEquipmentTagId(rng = Math.random) {
  const polarity = rng() < 0.7 ? 'ng' : 'po';
  const tier = rng() < 0.9 ? 'a' : 'b';
  const poolKey = `${polarity}_${tier}`;
  if (poolKey === 'ng_a') return pickUniform(EQUIP_TAGPOOL_NG_A, rng);
  if (poolKey === 'ng_b') return pickUniform(EQUIP_TAGPOOL_NG_B, rng);
  if (poolKey === 'po_a') return pickUniform(EQUIP_TAGPOOL_PO_A, rng);
  return pickUniform(EQUIP_TAGPOOL_PO_B, rng);
}

export function getEquipmentTagDef(tagId) {
  return EQUIPMENT_TAG_DEFS[tagId] || null;
}
