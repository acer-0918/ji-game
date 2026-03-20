import { BASE_ACTIONS, ORB_META, ORB_KEYS } from './data.js';
import { clone, randomChoice } from './utils.js';
import {
  G,
  allOrbsGenerated,
  ensureFaultRobotState,
  getEnemyStandardChargeGain,
  getPlayerDefenseBonus,
  getPlayerJiRate,
  orbCount,
} from './state.js';

export function getActionData(key, side='player', actorOverride=null) {
  const actor = actorOverride || (side === 'player' ? G.player : G.enemy);
  if (!actor) return null;

  if (side === 'enemy' && actor.id === 'faultRobot' && key === 'orb_random') {
    return {type:'fault_orb', cost:0, def:0, atk:0, hits:0, damage:0, name:'随机充能球', emoji:'🧪'};
  }
  if (side === 'enemy' && actor.id === 'gufu' && key === 'ji') {
    return {type:'gufu_charge', cost:0, def:0, atk:0, hits:0, damage:0, name:'帝王蓄力', emoji:'👑⚡', gain:actor.chargeValue || 1};
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
  if (side === 'player' && base.type === 'defense' && G.shop.smoothStone) {
    base.def += getPlayerDefenseBonus();
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
  if (action.type === 'defense') return `防御${action.def} | 耗${action.cost}Ji`;
  if (action.type === 'attack') {
    const parts = [`等级${action.atk}`, `${action.damage}伤害`, `${action.cost}Ji`];
    if ((action.hits || 1) > 1) parts.splice(1, 0, `${action.hits}次`);
    return parts.join(' | ');
  }
  return '';
}

export function formatSingleAction(action) {
  if (!action) return '—';
  if (action.type === 'ji' || action.type === 'gufu_charge') return `${action.emoji}${action.name}`;
  if (action.type === 'fault_orb' || action.type === 'orb_buff' || action.type === 'doom') return `${action.emoji}${action.name}`;
  if (action.type === 'defense') return `${action.emoji}${action.name}(防${action.def})`;
  if (action.type === 'attack') return `${action.emoji}${action.name}(攻${action.atk}${action.hits > 1 ? ` ×${action.hits}` : ''})`;
  return `${action.emoji}${action.name}`;
}

function resolveInstantGlassHit(actor, count) {
  return {
    type:'attack',
    cost:0,
    atk:2 + orbCount(actor, 'lightning'),
    hits:count,
    damage:1 + orbCount(actor, 'dark'),
    name:'玻璃充能球',
    emoji:'🔷⚔',
  };
}

export function resolveAction(side, key) {
  const actor = side === 'player' ? G.player : G.enemy;
  const base = getActionData(key, side, actor);
  const logs = [];
  let action = clone(base);
  let instantKill = null;

  if (base.type === 'ji') {
    actor.ji += base.gain;
  } else if (base.type === 'gufu_charge') {
    const gain = actor.chargeValue || 1;
    actor.ji += gain;
    action.gain = gain;
    actor.chargeValue = gain + 1;
    logs.push(`👑 古夫大帝的帝王蓄力成长了，下次将获得 +${actor.chargeValue}Ji。`);
  } else if (base.type === 'fault_orb') {
    ensureFaultRobotState(actor);
    if (allOrbsGenerated(actor)) {
      instantKill = side === 'enemy' ? 'player' : 'enemy';
      action = {type:'doom', cost:0, name:'过载终焉', emoji:'☠️', hits:0, damage:0};
      logs.push('☠️ 五类充能球已全部出现！故障机器人启动过载终焉，直接消灭玩家。');
    } else {
      const orbKey = randomChoice(ORB_KEYS);
      actor.orbs[orbKey] = (actor.orbs[orbKey] || 0) + 1;
      const count = actor.orbs[orbKey];
      const meta = ORB_META[orbKey];
      logs.push(`${meta.icon} 故障机器人生成了【${meta.name}】（当前 ${count} 个）。`);
      if (orbKey === 'plasma') {
        logs.push(`⚡ 之后它的蓄力将额外获得 ${orbCount(actor, 'plasma')} Ji。`);
        action = {type:'orb_buff', cost:0, name:meta.name, emoji:meta.icon, hits:0, damage:0};
      } else if (orbKey === 'frost') {
        logs.push(`🛡 之后它的防御等级额外 +${orbCount(actor, 'frost')}。`);
        action = {type:'orb_buff', cost:0, name:meta.name, emoji:meta.icon, hits:0, damage:0};
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
        logs.push(`💥 玻璃充能球在生成时立刻发动：视为发起 ${count} 次【攻击2】。`);
      }
    }
  } else {
    actor.ji -= base.cost;
  }

  actor.ji = Math.max(0, actor.ji);
  return {action, logs, instantKill};
}

export function calcDamage(pa, ea) {
  const out = {pdmg:0, edmg:0, msgs:[], triggers:[]};
  const pAtk = isAttack(pa);
  const eAtk = isAttack(ea);

  if (!pAtk && !eAtk) {
    out.msgs.push('双方都没有发动攻击，本回合无直接伤害。');
    return out;
  }

  if (pAtk && !eAtk) {
    const enemyDef = ea.def || 0;
    if (pa.atk > enemyDef) {
      out.edmg += (pa.hits || 1) * (pa.damage || 1);
      out.msgs.push(`玩家攻击等级 ${pa.atk} 突破敌方防御 ${enemyDef}，${pa.hits || 1} 次命中。`);
      if (G.abilities.fireBlade && pa.atk - enemyDef >= 3) {
        out.edmg += 1;
        out.triggers.push('刀刀烈火刀刀爆——高出至少 3 级，伤害 +1');
      }
    } else {
      out.msgs.push(`玩家攻击等级 ${pa.atk} 未高于敌方防御 ${enemyDef}，所有攻击都被防御。`);
    }
  } else if (!pAtk && eAtk) {
    const playerDef = pa.def || 0;
    if (ea.atk > playerDef) {
      out.pdmg += (ea.hits || 1) * (ea.damage || 1);
      out.msgs.push(`敌方攻击等级 ${ea.atk} 突破玩家防御 ${playerDef}，${ea.hits || 1} 次命中。`);
    } else {
      out.msgs.push(`敌方攻击等级 ${ea.atk} 未高于玩家防御 ${playerDef}，所有攻击都被防御。`);
    }
  } else {
    const pHits = pa.hits || 1;
    const eHits = ea.hits || 1;
    if (pHits === 1 && eHits === 1) {
      if (pa.atk > ea.atk) {
        out.edmg += pa.damage || 1;
        out.msgs.push(`双方互攻！玩家攻击 ${pa.atk} 高于敌方 ${ea.atk}。`);
        if (G.abilities.fireBlade && pa.atk - ea.atk >= 3) {
          out.edmg += 1;
          out.triggers.push('刀刀烈火刀刀爆——高出至少 3 级，伤害 +1');
        }
      } else if (ea.atk > pa.atk) {
        out.pdmg += ea.damage || 1;
        out.msgs.push(`双方互攻！敌方攻击 ${ea.atk} 高于玩家 ${pa.atk}。`);
      } else {
        out.msgs.push(`双方互攻！攻击等级相同（${pa.atk}），相互抵消。`);
      }
    } else {
      const cancelled = Math.min(pHits, eHits);
      const pRemain = pHits - cancelled;
      const eRemain = eHits - cancelled;
      if (cancelled > 0) out.msgs.push(`双方攻击相互抵消了 ${cancelled} 次。`);
      if (pRemain > 0) {
        out.edmg += pRemain * (pa.damage || 1);
        out.msgs.push(`玩家仍有 ${pRemain} 次攻击穿过，造成 ${pRemain * (pa.damage || 1)} 点伤害。`);
        if (G.abilities.fireBlade && pa.atk - ea.atk >= 3) {
          out.edmg += 1;
          out.triggers.push('刀刀烈火刀刀爆——高出至少 3 级，伤害 +1');
        }
      }
      if (eRemain > 0) {
        out.pdmg += eRemain * (ea.damage || 1);
        out.msgs.push(`敌方仍有 ${eRemain} 次攻击穿过，造成 ${eRemain * (ea.damage || 1)} 点伤害。`);
      }
      if (cancelled > 0 && pRemain === 0 && eRemain === 0) out.msgs.push('所有攻击都在碰撞中被抵消了。');
    }
  }

  if (G.shop.powerEquip && out.edmg > 0) {
    out.edmg += 1;
    out.triggers.push('一个强化装备——造成伤害时，额外 +1');
  }

  return out;
}

export function getMaxAffordableAttack(side='enemy', jiOverride=null, actorOverride=null) {
  const actor = actorOverride || (side === 'player' ? G.player : G.enemy);
  const ji = jiOverride == null ? actor.ji : jiOverride;
  for (let lvl = 7; lvl >= 1; lvl--) {
    const action = getActionData(`attack_${lvl}`, side, actor);
    if (action && action.cost <= ji) return action.atk;
  }
  return 0;
}
