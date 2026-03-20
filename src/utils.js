export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
