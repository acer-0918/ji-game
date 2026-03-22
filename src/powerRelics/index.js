export const POWER_RELIC_DEFS = [
  {key:'lever', icon:'🪜', name:'杠杆', desc:'每个回合开始时随机将你的 Ji 翻倍或重置为 2。'},
  {key:'silenceGold', icon:'🔕', name:'沉默是金', desc:'每个回合开始时随机禁用你的4个行动，获得2个 Ji。'},
  {key:'destinedFirstSight', icon:'📕', name:'既定的初见', desc:'你的攻击等级固定为 7。当你受到伤害时，你死亡。'},
  {key:'possibleReunion', icon:'🕊️', name:'可能的重逢', desc:'你无法再使用防守。敌人每使用 1 次超防，使你在这场战斗中造成的所有伤害 +1。'},
  {key:'deification', icon:'🔱', name:'神化', desc:'我已启动。'},
  {key:'delegationProblem', icon:'🧾', name:'委托代理问题', desc:'每回合开始时 +2Ji，但你的代理人会挥霍。'},
];

export function getPowerRelicDef(key) {
  return POWER_RELIC_DEFS.find((item) => item.key === key) || null;
}

export function hasPowerRelic(game, key) {
  return !!(game && game.powerRelics && game.powerRelics[key]);
}

export function getSilenceGoldActionKeys(game) {
  const keys = ['ji', 'defense_0', 'defense_1', 'defense_2', 'attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'];
  const classKey = game && game.player ? game.player.classKey : '';
  if (classKey === 'mage') keys.push('mage_release');
  if (classKey === 'nsyc') keys.push('ekai');
  if (hasPowerRelic(game, 'deification')) keys.push('perfect_core');
  return keys;
}
