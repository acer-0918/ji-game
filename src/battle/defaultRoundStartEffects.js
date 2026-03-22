import { PHASES, ACTOR_SCOPE, BATTLE_OUTCOME } from './constants.js';
import { ROUND_START_ORDER } from './order.js';
import { G } from '../state.js';
import { clampPlayerJiByEquipment, hasEquippedEquipment } from '../equipment/runtime.js';
import { getSilenceGoldActionKeys, hasPowerRelic } from '../powerRelics/index.js';

function pushLog(ctx, cls, text) {
  if (typeof ctx.addLog === 'function') ctx.addLog(cls, text);
}

function getSilenceActionKeysFromState() {
  return getSilenceGoldActionKeys(G);
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
    condition: () => !!(G.battle && hasPowerRelic(G, 'lever')),
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
    effectId: 'player.relic_delegation_problem_gain',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.RELIC_DELEGATION_PROBLEM_GAIN,
    condition: () => !!(G.battle && hasPowerRelic(G, 'delegationProblem')),
    apply: (ctx) => {
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + 2);
      pushLog(ctx, 'log-ab', '🧾 委托代理问题：代理人到账 +2 Ji。');
    },
  });

  engine.registerEffect({
    effectId: 'player.relic_silence_gold',
    phase: PHASES.ROUND_START,
    actorScope: ACTOR_SCOPE.PLAYER,
    order: ROUND_START_ORDER.RELIC_SILENCE_GOLD,
    condition: () => !!(G.battle && hasPowerRelic(G, 'silenceGold')),
    apply: (ctx) => {
      const actionKeys = typeof ctx.getPlayerActionKeysForSilence === 'function'
        ? ctx.getPlayerActionKeysForSilence()
        : getSilenceActionKeysFromState();
      if (actionKeys.length <= 0) return;

      const alreadyDisabled = new Set((G.battle.roundDisabledActions || []).filter(Boolean));
      // 可能的重逢会全局禁用防守，不应被沉默是金重复抽到
      if (hasPowerRelic(G, 'possibleReunion')) {
        alreadyDisabled.add('defense_0');
        alreadyDisabled.add('defense_1');
        alreadyDisabled.add('defense_2');
      }

      const candidates = actionKeys.filter((key) => !alreadyDisabled.has(key));
      if (candidates.length <= 0) {
        pushLog(ctx, 'log-ab', '🔕 沉默是金：本回合没有可新增禁用的行动。');
        return;
      }

      const disableCount = Math.min(4, candidates.length);
      const picked = typeof ctx.sampleDistinctKeys === 'function'
        ? ctx.sampleDistinctKeys(candidates, disableCount)
        : sampleDistinctKeysLocal(candidates, disableCount);
      const merged = [...new Set([...(G.battle.roundDisabledActions || []), ...picked])];
      G.battle.roundDisabledActions = merged;
      G.player.ji = clampPlayerJiByEquipment(G, G.player.ji + 2);
      pushLog(ctx, 'log-ab', `🔕 沉默是金：本回合禁用 4 个行动（${picked.join('、')}），并获得 2 Ji。`);
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
