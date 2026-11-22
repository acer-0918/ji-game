import { BASE_ACTIONS } from '../data.js';
import { getActionData } from '../logic.js';
import { getSilenceGoldActionKeys, hasPowerRelic } from '../powerRelics/index.js';
import { battleRandom, G, withGameState } from '../state.js';
import { randomChoice } from '../utils.js';

const enemyActions = [...Object.keys(BASE_ACTIONS), 'orb_random'];

export function isPlayerActionBlocked(game, key) {
  return key !== 'dev_kill' && !!game.battle?.roundDisabledActions?.includes(key);
}

function playerActionKeys(game) {
  const keys = getSilenceGoldActionKeys(game);
  if (game.devMode) keys.push('dev_kill');
  return keys;
}

function canUseAction(side, key, ignoreRoundDisabled) {
  if (typeof key !== 'string' || !key || !G[side]) return false;
  if (side === 'player') {
    if (!ignoreRoundDisabled && isPlayerActionBlocked(G, key)) return false;
    if (key.startsWith('defense_') && hasPowerRelic(G, 'possibleReunion')) return false;
  }
  const action = getActionData(key, side);
  if (!action || action.disabledByOrbs) return false;
  if (side === 'enemy' && action.type === 'attack' && G.battle?.enemyFrostLockThisRound) return false;
  return (action.cost || 0) <= (G[side].ji || 0);
}

export function canUsePlayerAction(game, key, { ignoreRoundDisabled = false } = {}) {
  return withGameState(game, () => canUseAction('player', key, ignoreRoundDisabled));
}

export function getLegalActions(game, actor) {
  if (actor !== 'player' && actor !== 'enemy') throw new TypeError('Unknown battle actor.');
  if (game.battle?.phase !== 'select' || game.battle.outcome || !game.enemy) return [];
  return withGameState(game, () => {
    const keys = actor === 'player' ? playerActionKeys(game) : enemyActions;
    const available = keys.filter(key => canUseAction(actor, key, false));
    if (actor === 'enemy' && game.battle.enemyMustAttackNextRound) {
      const attacks = available.filter(key => key.startsWith('attack_'));
      if (attacks.length) return attacks;
    }
    return available;
  });
}

export function chooseDelegatedAction(game) {
  return withGameState(game, () => {
    const legal = playerActionKeys(game).filter(key => canUseAction('player', key, true));
    const charge = legal.includes('ji') ? ['ji'] : [];
    const defense = legal.filter(key => key.startsWith('defense_'));
    const attack = legal.filter(key => key.startsWith('attack_'));
    const special = legal.filter(key => !Object.hasOwn(BASE_ACTIONS, key));
    const pick = keys => randomChoice(keys, () => battleRandom('policy'));
    const regions = [charge, defense, attack, special].filter(keys => keys.length);
    if (regions.length === 0) return null;
    const region = pick(regions);
    return region === defense || region === attack ? region.at(-1) : pick(region);
  });
}
