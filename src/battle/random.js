// Mulberry32 with serializable unsigned state for battle snapshots.
export function createBattleRandomState(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('The battle seed must be an unsigned 32-bit integer.');
  }
  return { seed, rules: seed, policy: (seed ^ 0x9e3779b9) >>> 0 };
}

export function nextBattleRandom(random, stream) {
  if (!random) return Math.random();
  const value = random[stream] = (random[stream] + 0x6d2b79f5) >>> 0;
  let mixed = Math.imul(value ^ (value >>> 15), value | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}
