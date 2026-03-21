let packetSeq = 1;

export const DAMAGE_TYPE = {
  ATTACK: 'attack',
  OTHER: 'other',
};

export const TARGET = {
  PLAYER: 'player',
  ENEMY: 'enemy',
};

function nextPacketId() {
  const id = packetSeq;
  packetSeq += 1;
  return `pkt_${id}`;
}

export function createDamagePacket({
  type = DAMAGE_TYPE.ATTACK,
  source = null,
  target,
  base = 0,
  tags = [],
} = {}) {
  return {
    damageId: nextPacketId(),
    type,
    source,
    target,
    base,
    mulMods: [],
    addMods: [],
    tags: [...tags],
  };
}

export function addMulMod(packet, value, reason = '') {
  if (!packet || typeof value !== 'number' || !Number.isFinite(value)) return;
  packet.mulMods.push({ value, reason });
}

export function addAddMod(packet, value, reason = '') {
  if (!packet || typeof value !== 'number' || !Number.isFinite(value)) return;
  packet.addMods.push({ value, reason });
}

export function evaluatePacketDamage(packet) {
  if (!packet) return 0;
  const base = Number(packet.base || 0);
  const mul = packet.mulMods.reduce((acc, item) => acc * Number(item.value || 0), 1);
  const add = packet.addMods.reduce((acc, item) => acc + Number(item.value || 0), 0);
  return Math.max(0, Math.floor(base * mul + add));
}

export function ensureDamagePackets(ctx) {
  if (!ctx.damagePackets) ctx.damagePackets = [];
  return ctx.damagePackets;
}

export function toResultFromPackets(ctx) {
  const packets = ensureDamagePackets(ctx);
  let pdmg = 0;
  let edmg = 0;
  packets.forEach((packet) => {
    const amount = evaluatePacketDamage(packet);
    if (packet.target === TARGET.PLAYER) pdmg += amount;
    else if (packet.target === TARGET.ENEMY) edmg += amount;
  });
  if (!ctx.result) ctx.result = { pdmg:0, edmg:0, msgs:[], triggers:[] };
  ctx.result.pdmg = pdmg;
  ctx.result.edmg = edmg;
  return ctx.result;
}

export function getDamagePackets(ctx, predicate) {
  const packets = ensureDamagePackets(ctx);
  if (typeof predicate !== 'function') return packets;
  return packets.filter(predicate);
}

