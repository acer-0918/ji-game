import { PHASES, ACTOR_SCOPE, BATTLE_OUTCOME } from './constants.js';
import { ROUND_START_ORDER } from './order.js';
import { G } from '../state.js';
import { clampPlayerJiByEquipment, hasEquippedEquipment } from '../equipment/runtime.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

function getSilenceActionKeysFromState() {
  const keys = ['ji', 'defense_0', 'defense_1', 'defense_2', 'attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'];
  if (G.player.classKey === 'mage') keys.push('mage_release');
  if (G.player.classKey === 'nsyc') keys.push('ekai');
  return keys;
}

function sampleDistinctKeysLocal(pool, count) {
  const bag = [...pool];
  const out = [];
  while (bag.length && out.length < count) {
    const idx = Math.floor(Math.random() * bag.length);
    out.push(bag[idx]);
    bag.splice(idx, 1);
  }
  return out;
}

export function registerDefaultRoundStartEffects(engine) {
  engine.registerEffect({
    effectId: 'system.clear_round_disabled_actions',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.SYSTEM,
    order: ROUND_START_ORDER.CLEAR_DISABLED_ACTIONS,
    condition: () => !!G.battle,
    apply: () => {
      G.battle.roundDisabledActions = [];
    },
  });

  engine.registerEffect({
    effectId: 'player.popcorn_gain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.POPCORN_GAIN,
    condition: () => !!(G.battle && G.abilities.popcorn && G.battle.popcornPending),
    apply: (ctx) => {
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + 2);
      G.battle.popcornPending = false;
      pushLog(ctx, 'log-ab', '🍿 爆米：上回合你受到了伤害，本回合开始获得 2 Ji。');
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_lever',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.RELIC_LEVER,
    condition: () => !!(G.battle && G.powerRelics && G.powerRelics.lever),
    apply: (ctx) => {
      if (Math.random() < 0.5) {
        G.player.ji = clampPlayerJiByEquipment(G, G.player.ji * 2);
        pushLog(ctx, 'log-ab', `🪜 杠杆：本回合开始，Ji 翻倍至 ${G.player.ji}。`);
      } else {
        G.player.ji = clampPlayerJiByEquipment(G, 2);
        pushLog(ctx, 'log-ab', '🪜 杠杆：本回合开始，Ji 被重置为 2。');
      }
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_silence_gold',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.RELIC_SILENCE_GOLD,
    condition: () => !!(G.battle && G.powerRelics && G.powerRelics.silenceGold),
    apply: (ctx) => {
      const actionKeys = typeof ctx.getPlayerActionKeysForSilence === 'function'
        ? ctx.getPlayerActionKeysForSilence()
        : getSilenceActionKeysFromState();
      if (actionKeys.length <= 1) return;
      const maxDisable = Math.max(1, Math.min(3, actionKeys.length - 1));
      const disableCount = 1 + Math.floor(Math.random() * maxDisable);
      const disabled = typeof ctx.sampleDistinctKeys === 'function'
        ? ctx.sampleDistinctKeys(actionKeys, disableCount)
        : sampleDistinctKeysLocal(actionKeys, disableCount);
      G.battle.roundDisabledActions = disabled;
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + disableCount);
      pushLog(ctx, 'log-ab', `🔕 沉默是金：本回合禁用 ${disableCount} 个行动（${disabled.join('、')}），并获得 ${disableCount} Ji。`);
    },
  });

  engine.registerEffect({
    effectId: 'player.nsyc_ekai_pending_damage',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.NSYC_EKAI_PENDING_DAMAGE,
    condition: () => !!(G.battle && G.player.classKey === 'nsyc' && G.battle.ekaiPending),
    apply: (ctx) => {
      const bloodArmorBonus = hasEquippedEquipment(G, 'equi_2')
        ? Math.floor((G.player.maxHp || 0) * 0.3)
        : 0;
      const dmg = 1 + (G.abilities.hazuki ? 1 : 0) + bloodArmorBonus;
      G.battle.ekaiPending = false;
      G.enemy.hp = Math.max(0, G.enemy.hp - dmg);
      const dmgNote = dmg > 1
        ? `（基础1${G.abilities.hazuki ? '+反田叶月1' : ''}${bloodArmorBonus > 0 ? `+霸王血铠${bloodArmorBonus}` : ''}）`
        : '';
      pushLog(ctx, 'log-dmg', `💢 厄介发动！必定命中，对敌方造成 ${dmg} 点伤害！${dmgNote}`);
      if (typeof ctx.refreshBars === 'function') ctx.refreshBars();
      if (G.enemy.hp <= 0) {
        ctx.battleEnded = true;
        ctx.outcome = BATTLE_OUTCOME.WIN;
        ctx.stopPhase = true;
      }
    },
  });

  engine.registerEffect({
    effectId: 'player.nsyc_stack_gain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.NSYC_STACK_GAIN,
    condition: () => !!(G.battle && G.player.classKey === 'nsyc'),
    apply: (ctx) => {
      const gain = 1 + (G.abilities.mitsuna ? 1 : 0);
      G.player.shaBiStacks = (G.player.shaBiStacks || 0) + gain;
      pushLog(ctx, 'log-ab', `🤬 傻逼被动：本回合累计 ${gain} 层【傻逼】，当前共 ${G.player.shaBiStacks} 层。`);
    },
  });
}
