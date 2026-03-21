import { BASE_ACTIONS, ORB_META, ORB_KEYS } from './data.js';
import { clone, randomChoice } from './utils.js';
import {
  G,
  allOrbsGenerated,
  ensureFaultRobotState,
  getDogLuckChance,
  getEnemyStandardChargeGain,
  getPlayerDefenseBonus,
  getPlayerJiRate,
  orbCount,
} from './state.js';

export function getActionData(key, side='player', actorOverride=null) {
  const actor = actorOverride || (side === 'player' ? G.player : G.enemy);
  if (!actor) return null;

  if (side === 'player' && actor.classKey === 'mage' && key === 'mage_release') {
    const canCast = (actor.lightningOrbs || 0) >= 5;
    const atkLevel = G.powerRelics && G.powerRelics.destinedFirstSight ? 7 : 5;
    return {
      type:'attack',
      cost:0,
      orbCost:5,
      def:0,
      atk:atkLevel,
      hits:1,
      damage:1,
      name:'一重释放',
      emoji:'⚡⚡',
      isMageRelease:true,
      disabledByOrbs:!canCast,
    };
  }

  if (side === 'player' && actor.classKey === 'nsyc' && key === 'ekai') {
    const stacks = actor.shaBiStacks || 0;
    return {
      type: 'ekai',
      cost: 0,
      stackCost: 4,
      def: 3,
      atk: 0,
      hits: 0,
      damage: 1,
      name: '厄介',
      emoji: '💢',
      disabledByOrbs: stacks < 4,
    };
  }

  if (side === 'enemy' && actor.id === 'faultRobot' && key === 'orb_random') {
    return {type:'fault_orb', cost:0, def:0, atk:0, hits:0, damage:0, name:'随机充能球', emoji:'🧪'};
  }
  if (side === 'enemy' && actor.id === 'gufu' && key === 'ji') {
    return {type:'gufu_charge', cost:0, def:0, atk:0, hits:0, damage:0, name:'野性之心', emoji:'👑⚡', gain:actor.chargeValue || 1};
  }

  const base = clone(BASE_ACTIONS[key]);
  if (!base) return null;
  if (base.type === 'ji') {
    base.gain = side === 'player' ? getPlayerJiRate() : getEnemyStandardChargeGain(actor);
  }

  if (side === 'player' && key === 'attack_5' && G.shop.enhancedBlade) {
    base.cost = 4;
    base.name = '强化鬼刀';
    base.emoji = '👻⚔';
  }
  if (side === 'player' && key === 'attack_1' && G.shop.enhancedDagger) {
    base.name = '强化小刀';
    base.emoji = '🗡✨';
    base.onHitGainJi = 1;
  }
  if (side === 'player' && key === 'attack_3' && G.shop.enhancedIceBlade) {
    base.name = '强化冰刀';
    base.emoji = '❄️🗡';
    base.damage += 1;
  }
  if (side === 'player' && base.type === 'defense') {
    base.def += getPlayerDefenseBonus();
  }
  if (side === 'player' && base.type === 'attack' && G.powerRelics && G.powerRelics.destinedFirstSight) {
    base.atk = 7;
  }

  if (side === 'enemy' && actor.id === 'faultRobot') {
    ensureFaultRobotState(actor);
    if (base.type === 'defense') {
      base.def += orbCount(actor, 'frost');
    }
    if (base.type === 'attack') {
      base.atk += orbCount(actor, 'lightning');
      base.damage += orbCount(actor, 'dark');
    }
    if (base.type === 'ji') {
      base.gain = getEnemyStandardChargeGain(actor);
    }
  }

  return base;
}

export function isAttack(action) {
  return action && action.type === 'attack';
}

export function describeAttack(action) {
  if (action.isMageRelease) return `等级${action.atk} | 伤害${action.damage} | 耗${action.orbCost}闪电球`;
  const bits = [`等级${action.atk}`];
  if ((action.hits || 1) > 1) bits.push(`${action.hits}连击`);
  bits.push(`伤害${action.damage}`);
  bits.push(`耗${action.cost}Ji`);
  return bits.join(' | ');
}

export function getActionSubText(action) {
  if (!action) return '';
  if (action.type === 'ji' || action.type === 'gufu_charge') return `+${action.gain}Ji`;
  if (action.type === 'fault_orb') return '0Ji | 随机生成充能球';
  if (action.type === 'orb_buff') return '充能完成';
  if (action.type === 'ekai') return '消耗4层【傻逼】 | 本回合待机 | 下回合必定命中';
  if (action.type === 'defense') return `防御${action.def} | 耗${action.cost}Ji`;
  if (action.type === 'attack') {
    const costText = action.isMageRelease ? `${action.orbCost}闪电球` : `${action.cost}Ji`;
    const parts = [`等级${action.atk}`, `${action.damage}伤害`, costText];
    if ((action.hits || 1) > 1) parts.splice(1, 0, `${action.hits}次`);
    return parts.join(' | ');
  }
  return '';
}

export function formatSingleAction(action) {
  if (!action) return '—';
  if (action.type === 'ji' || action.type === 'gufu_charge') return `${action.emoji}${action.name}`;
  if (action.type === 'fault_orb' || action.type === 'orb_buff' || action.type === 'doom' || action.type === 'ekai') return `${action.emoji}${action.name}`;
  if (action.type === 'defense') return `${action.emoji}${action.name}(防${action.def})`;
  if (action.type === 'attack') return `${action.emoji}${action.name}(攻${action.atk}${action.hits > 1 ? ` ×${action.hits}` : ''})`;
  return `${action.emoji}${action.name}`;
}

function resolveInstantGlassHit(actor, count) {
  return {
    type:'attack',
    cost:0,
    atk:1 + orbCount(actor, 'lightning'),
    hits:count,
    damage:1 + orbCount(actor, 'dark'),
    name:'玻璃充能球',
    emoji:'🔷⚔',
  };
}

export function resolveAction(side, key) {
  const actor = side === 'player' ? G.player : G.enemy;
  const base = getActionData(key, side, actor);
  if (!base) return {action:null, logs:[], instantKill:null};
  const logs = [];
  let action = clone(base);
  let instantKill = null;

  if (base.type === 'ji') {
    actor.ji += base.gain;
    if (side === 'player' && actor.classKey === 'dog') {
      const chance = getDogLuckChance() / 2;
      if (Math.random() * 100 < chance) {
        actor.ji *= 2;
        logs.push(`🐶 幸运蓄力：判定半幸运值 ${chance}%，Ji 翻倍至 ${actor.ji}。`);
      } else {
        logs.push(`🐶 幸运蓄力：判定半幸运值 ${chance}%，本次未触发翻倍。`);
      }
    }
  } else if (base.type === 'gufu_charge') {
    const gain = actor.chargeValue || 1;
    actor.ji += gain;
    action.gain = gain;
    actor.chargeValue = gain + 1;
    logs.push(`👑 古夫大帝的野性之心成长了，下次将获得 +${actor.chargeValue}Ji。`);
  } else if (base.type === 'fault_orb') {
    ensureFaultRobotState(actor);
    if (allOrbsGenerated(actor)) {
      action = {type:'orb_buff', cost:0, name:'过载临界', emoji:'☠️', hits:0, damage:0};
      if (actor.overloadTriggered) logs.push('☠️ 过载终焉已发动过，本局战斗中不会再次触发。');
      else logs.push('☠️ 五类充能球已全部出现！过载终焉将于本回合结算后发动。');
    } else {
      const orbKey = randomChoice(ORB_KEYS);
      actor.orbs[orbKey] = (actor.orbs[orbKey] || 0) + 1;
      const count = actor.orbs[orbKey];
      const meta = ORB_META[orbKey];
      logs.push(`${meta.icon} 故障机器人生成了【${meta.name}】（当前 ${count} 个）。`);
      if (orbKey === 'plasma') {
        logs.push(`⚡ 之后它的蓄力将额外获得 ${orbCount(actor, 'plasma')} Ji。`);
      } else if (orbKey === 'frost') {
        logs.push(`🛡 之后它的防御等级额外 +${orbCount(actor, 'frost')}。`);
      } else if (orbKey === 'lightning') {
        logs.push(`⚔ 之后它的攻击等级额外 +${orbCount(actor, 'lightning')}。`);
        action = {type:'orb_buff', cost:0, name:meta.name, emoji:meta.icon, hits:0, damage:0};
      } else if (orbKey === 'dark') {
        logs.push(`🌑 之后它的攻击伤害额外 +${orbCount(actor, 'dark')}。`);
        action = {type:'orb_buff', cost:0, name:meta.name, emoji:meta.icon, hits:0, damage:0};
      } else if (orbKey === 'glass') {
        action = resolveInstantGlassHit(actor, count);
        action.name = `${meta.name}冲击`;
        action.emoji = '🔷⚔';
        logs.push(`💥 玻璃充能球在生成时立刻发动：视为发起 ${count} 次【攻击1】。`);
      }
    }
  } else if (base.type === 'ekai') {
    actor.shaBiStacks = Math.max(0, (actor.shaBiStacks || 0) - (base.stackCost || 3));
    G.battle.ekaiPending = true;
    logs.push('💢 厄介蓄势：本回合待机蓄力，下回合将必定命中敌方！');
    action = { type:'orb_buff', cost:0, def:0, atk:0, name:'厄介·待机', emoji:'💢', hits:0, damage:0 };
  } else {
    if (side === 'player' && base.isMageRelease) {
      actor.lightningOrbs = Math.max(0, (actor.lightningOrbs || 0) - (base.orbCost || 0));
    } else {
      const jiCost = base.cost || 0;
      actor.ji -= jiCost;
      // Track ji spent for nsyc amane passive (auto-ekai every 8 ji)
      if (side === 'player' && actor.classKey === 'nsyc' && jiCost > 0 && G.abilities.amane) {
        const prevMilestone = Math.floor((actor.jiSpentTotal || 0) / 8);
        actor.jiSpentTotal = (actor.jiSpentTotal || 0) + jiCost;
        const newMilestone = Math.floor(actor.jiSpentTotal / 8);
        if (newMilestone > prevMilestone) {
          G.battle.ekaiPending = true;
          logs.push(`🐍 进藤天音：累计消耗满 ${actor.jiSpentTotal} 点Ji，自动触发一次【厄介】！`);
        }
      }
    }
    if (side === 'player' && actor.classKey === 'mage' && base.type === 'defense') {
      actor.lightningOrbs = (actor.lightningOrbs || 0) + 1;
      logs.push('⚡ 法师被动：本回合使用防御，获得 1 个闪电球。');
    }
  }

  actor.ji = Math.max(0, actor.ji);
  return {action, logs, instantKill};
}

export {
  registerHitCompareHook,
  registerHitHook,
  registerDamageEventHook,
  registerDamageTotalHook,
  calcHitCheck,
  calcOnHitDamage,
  calcDamage,
} from './battle/hitResolution.js';

export function getMaxAffordableAttack(side='enemy', jiOverride=null, actorOverride=null) {
  const actor = actorOverride || (side === 'player' ? G.player : G.enemy);
  if (side === 'player' && actor.classKey === 'mage' && (actor.lightningOrbs || 0) >= 5) {
    return 5;
  }
  const ji = jiOverride == null ? actor.ji : jiOverride;
  for (let lvl = 7; lvl >= 1; lvl--) {
    const action = getActionData(`attack_${lvl}`, side, actor);
    if (action && action.cost <= ji) return action.atk;
  }
  return 0;
}
