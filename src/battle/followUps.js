import { TECH_DEFS } from '../battleTechniques.js';
import { clampPlayerJiByEquipment } from '../equipment/runtime.js';

export function getPendingChoice(state) {
  if (state.battle.freeFollowUpPending?.count > 0) return 'free';
  if (state.battle.huntRhythmPending) return 'hunt';
  return null;
}

export function applyFollowUp(state, type, action, log) {
  const field = type === 'free' ? 'freeFollowUpPending' : 'huntRhythmPending';
  const pending = state.battle[field];
  if (!pending) return false;
  if (action === 'finish') {
    if (type === 'free' && pending.count < 3) {
      log('log-ab', `${pending.emoji || '⚔'} ${pending.label}：免费追加结束。`);
    }
    if (type === 'hunt' && pending.extraCount > 0) {
      log('log-ab', `🏹 狩猎律动：共追加 ${pending.extraCount} 次。`);
    }
    state.battle[field] = null;
    return true;
  }
  if (type === 'hunt') {
    if (state.player.ji < pending.cost) return false;
    state.player.ji = clampPlayerJiByEquipment(state, state.player.ji - pending.cost);
    state.enemy.hp = Math.max(0, state.enemy.hp - pending.basePerCast);
    pending.extraCount = (pending.extraCount || 0) + 1;
    log('log-ab', `🏹 狩猎律动：第 ${pending.extraCount} 次追加，造成 ${pending.basePerCast} 伤害。`);
    return true;
  }
  if (pending.count <= 0) return false;
  pending.count -= 1;
  const heavyBoost = state.abilities.heavyTechBoost && TECH_DEFS[pending.techId]?.weight === 'heavy';
  const damage = pending.dmgPerHit + (heavyBoost ? 1 : 0);
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  const extra = heavyBoost ? '（重甲破击 +1）' : '';
  log('log-ab', `${pending.emoji || '⚔'} ${pending.label}：第 ${3 - pending.count} 次追加，造成 ${damage} 点伤害${extra}。`);
  return true;
}
