import { aiDecide } from './ai.js';
import { BATTLE_OUTCOME } from './battle/constants.js';
import { registerDefaultCombatEffects } from './battle/defaultCombatEffects.js';
import { registerDefaultDeathEffects } from './battle/defaultDeathEffects.js';
import { registerDefaultRoundStartEffects } from './battle/defaultRoundStartEffects.js';
import { registerDefaultResolveEffects } from './battle/defaultResolveEffects.js';
import { createBattleEngine } from './battle/engine.js';
import { createBattleRuntime } from './battle/runtime.js';
import { initMDPPolicies, clearMDPPolicies } from './mdp.js';
import { CLASS_DEFS, COMMON_ABILITY_DEFS, POWER_RELIC_DEFS, SHOP_ITEMS, getAbilityDefsForClass, getPowerRelicDef } from './data.js';
import {
  describeAttack,
  getActionData,
  getActionSubText,
} from './logic.js';
import {
  addLog,
  refreshBars,
  refreshActionLabels,
  renderAbilityTree,
  renderEnemyStateTags,
  renderEquipSlots,
  renderMap,
  renderPassiveTags,
  renderShop,
  resetRoundUI,
} from './render.js';
import { G, initGame, resetRoomJi, ensureFaultRobotState, restoreFromBattleSnapshot } from './state.js';
import { clone, randomChoice } from './utils.js';

const $ = (id) => document.getElementById(id);
let selectedClassKey = null;
const DEV_MODE_LS_KEY = 'ji_game_dev_mode';
const DEV_FRAGMENTS = 999999999;
const BATTLE_TIMINGS = {
  REVEAL_DELAY_MS: 120,
  RESOLVE_DELAY_MS: 180,
  OUTCOME_DELAY_MS: 0,
};
let developerModeEnabled = false;
const battleEngine = createBattleEngine();
registerDefaultCombatEffects(battleEngine);
registerDefaultRoundStartEffects(battleEngine);
registerDefaultResolveEffects(battleEngine);
registerDefaultDeathEffects(battleEngine);
const battleRuntime = createBattleRuntime({
  engine: battleEngine,
  addLog,
  refreshBars,
  getPlayerActionKeysForSilence,
  sampleDistinctKeys,
});

try {
  developerModeEnabled = window.localStorage.getItem(DEV_MODE_LS_KEY) === '1';
} catch (_) {
  developerModeEnabled = false;
}

function persistDeveloperMode() {
  try {
    window.localStorage.setItem(DEV_MODE_LS_KEY, developerModeEnabled ? '1' : '0');
  } catch (_) {
    // ignore storage failures
  }
}

function keepDeveloperResources() {
  if (!G.devMode || !G.player) return;
  G.player.fragments = DEV_FRAGMENTS;
}

function refreshDeveloperModeButton() {
  const btn = $('btn-toggle-devmode');
  if (!btn) return;
  btn.textContent = `开发者模式：${developerModeEnabled ? '开启' : '关闭'}`;
}

function applyDeveloperModeToGameState() {
  G.devMode = developerModeEnabled;
  keepDeveloperResources();
}

function toggleDeveloperMode() {
  developerModeEnabled = !developerModeEnabled;
  persistDeveloperMode();
  applyDeveloperModeToGameState();
  refreshDeveloperModeButton();
  if ($('screen-map').classList.contains('active')) renderMap();
  if ($('ov-shop').classList.contains('show')) renderShop();
  if (G.enemy) refreshBars();
}

function getRoundBlockedSet() {
  return new Set((G.battle && G.battle.roundDisabledActions) || []);
}

function isDefenseForbiddenByRelic() {
  return !!(G.powerRelics && G.powerRelics.possibleReunion);
}

function isActionBlockedForRound(key) {
  return getRoundBlockedSet().has(key);
}

function getPlayerActionKeysForSilence() {
  const keys = ['ji', 'defense_0', 'defense_1', 'defense_2', 'attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'];
  if (G.player.classKey === 'mage') keys.push('mage_release');
  if (G.player.classKey === 'nsyc') keys.push('ekai');
  return keys;
}

function sampleDistinctKeys(pool, count) {
  const bag = [...pool];
  const out = [];
  while (bag.length && out.length < count) {
    const picked = randomChoice(bag);
    out.push(picked);
    const idx = bag.indexOf(picked);
    if (idx >= 0) bag.splice(idx, 1);
  }
  return out;
}

function getPowerRelicOptions(count=2) {
  const unowned = POWER_RELIC_DEFS.filter((item) => !G.powerRelics[item.key]);
  if (!unowned.length) return [];
  return sampleDistinctKeys(unowned, Math.min(count, unowned.length));
}

function clearRelicChoiceUI() {
  const wrap = $('ov-battle-relic-wrap');
  const options = $('ov-battle-relic-options');
  if (options) options.innerHTML = '';
  if (wrap) wrap.style.display = 'none';
  G.pendingPowerRelicOptions = [];
}

function renderRelicChoiceUI(options) {
  const wrap = $('ov-battle-relic-wrap');
  const container = $('ov-battle-relic-options');
  if (!wrap || !container) return;
  container.innerHTML = '';
  options.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'ab-node-card relic-choice-card';
    card.innerHTML = `
      <div class="ab-icon">${item.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${item.name}</div>
        <div class="ab-desc">${item.desc}</div>
      </div>
      <div class="ab-action">
        <button class="btn-unlock" data-choose-relic="${item.key}">获得</button>
      </div>`;
    container.appendChild(card);
  });
  wrap.style.display = '';
}

function choosePowerRelic(key) {
  const def = getPowerRelicDef(key);
  if (!def || G.powerRelics[key]) return;
  G.powerRelics[key] = true;
  if (Array.isArray(G.pendingPowerRelicOptions)) {
    G.pendingPowerRelicOptions = G.pendingPowerRelicOptions.filter((item) => item.key !== key);
  }
  addLog('log-ab', `🧿 获得强大遗物：${def.name}。`);
  clearRelicChoiceUI();
  if ($('screen-map').classList.contains('active')) renderMap();
  if (G.enemy) refreshBars();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  $(`screen-${id}`).classList.add('active');
}

function openOverlay(id) {
  $(id).classList.add('show');
}

function closeOverlay(id) {
  $(id).classList.remove('show');
}

function setLoadingText(text) {
  const tip = $('loading-tip');
  if (tip) tip.textContent = text || '加载中...';
}

function openLoading(text='机器学习了') {
  setLoadingText(text);
  openOverlay('ov-loading');
}

function closeLoading() {
  closeOverlay('ov-loading');
}

function runAfter(ms, fn) {
  if (ms > 0) setTimeout(fn, ms);
  else fn();
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function openAbilityTree() {
  renderAbilityTree();
  openOverlay('ov-abtree');
}

function closeAbilityTree() {
  closeOverlay('ov-abtree');
  renderMap();
}

function unlockAbility(key) {
  const ab = getAbilityDefsForClass(G.player.classKey).find((item) => item.key === key);
  if (!ab || G.abilities[key] || (!G.devMode && G.player.fragments < ab.cost)) return;
  if (!G.devMode) G.player.fragments -= ab.cost;
  G.abilities[key] = true;
  if (key === 'mango') {
    G.player.maxHp += 5;
    G.player.hp += 5;
  }
  if (key === 'haruna') {
    G.player.maxHp += 2;
    G.player.hp += 2;
  }
  if (key === 'goodLuck' && G.player.classKey === 'dog') {
    G.player.luck = Math.max(0, (G.player.luck || 0) + 20);
  }
  keepDeveloperResources();
  renderAbilityTree();
  renderMap();
}

function buyShopItem(key) {
  const item = SHOP_ITEMS.find((entry) => entry.key === key);
  if (!item || G.shop[key] || (!G.devMode && G.player.fragments < item.cost)) return;
  if (item.slot === 'gear' && G.equippedGear && G.equippedGear !== key) return;
  if (!G.devMode) G.player.fragments -= item.cost;
  G.shop[key] = true;
  if (item.slot === 'gear') G.equippedGear = key;
  keepDeveloperResources();
  renderShop();
  renderMap();
  if (G.enemy) refreshBars();
}

function unequipGear() {
  const equippedKey = G.equippedGear;
  if (!equippedKey) return;
  const item = SHOP_ITEMS.find((entry) => entry.key === equippedKey);
  const itemName = item ? item.name : '当前装备';
  const ok = window.confirm(`是否卸下【${itemName}】？卸下后需要重新购买才能再次装备。`);
  if (!ok) return;
  G.shop[equippedKey] = false;
  G.equippedGear = null;
  renderMap();
  if ($('ov-shop').classList.contains('show')) renderShop();
  if (G.enemy) refreshBars();
}

function leaveShop() {
  if (G.devMode) {
    closeOverlay('ov-shop');
    renderMap();
    return;
  }
  resetRoomJi();
  G.nodes[G.nodeIdx].done = true;
  G.nodeIdx += 1;
  closeOverlay('ov-shop');
  renderMap();
}

function askSurrender() {
  openOverlay('ov-surrender');
}

function closeSurrender() {
  closeOverlay('ov-surrender');
}

function doSurrender() {
  closeOverlay('ov-surrender');
  confirmBackToMenu();
}

function startGame() {
  if (!selectedClassKey) return;
  document.querySelectorAll('.overlay').forEach((overlay) => overlay.classList.remove('show'));
  clearMDPPolicies();
  initGame(selectedClassKey);
  applyDeveloperModeToGameState();
  updateHardBadge(false);
  showScreen('map');
  renderMap();
}

async function startHardGame() {
  if (!selectedClassKey) return;
  document.querySelectorAll('.overlay').forEach((overlay) => overlay.classList.remove('show'));
  const btn = $('btn-hard-start');
  if (btn) { btn.disabled = true; btn.textContent = '准备中...'; }
  openLoading('机器学习了');
  await nextPaint();
  try {
    await initMDPPolicies(selectedClassKey);
  } finally {
    closeLoading();
    if (btn) { btn.disabled = false; btn.textContent = '困难模式 (MDP)'; }
  }
  initGame(selectedClassKey);
  applyDeveloperModeToGameState();
  G.hardMode = true;
  updateHardBadge(true);
  showScreen('map');
  renderMap();
}

function updateHardBadge(show) {
  const badge = $('hard-badge');
  if (badge) badge.style.display = show ? '' : 'none';
}

function restartRun() {
  if (G.hardMode) startHardGame();
  else startGame();
}

function enterNode(index) {
  const node = G.nodes[index];
  if (!node) return;
  if (!G.devMode && (node.done || index !== G.nodeIdx)) return;
  resetRoomJi();
  if (node.type === 'shop') {
    renderShop();
    renderMap();
    openOverlay('ov-shop');
    return;
  }
  if (node.type === 'camp') {
    const heal = 3;
    const before = G.player.hp;
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + heal);
    if (!G.devMode) {
      G.nodes[G.nodeIdx].done = true;
      G.nodeIdx += 1;
    }
    renderMap();
    const actual = G.player.hp - before;
    window.alert(`🔥 篝火休整：回复 ${actual} 点生命。`);
    return;
  }
  G.currentNode = clone(node);
  startBattle(node);
}

function restartBattle() {
  if (!G.battleEntrySnapshot) return;
  const snap = clone(G.battleEntrySnapshot);
  restoreFromBattleSnapshot(snap);
  G.battleEntrySnapshot = clone(snap);
  startBattle(clone(G.currentNode), true);
}

function startBattle(node, keepSnapshot=false) {
  G.currentNode = clone(node);
  let tigerTriggered = false;
  if (!keepSnapshot && G.abilities.tigerTank && node.type === 'boss') {
    G.player.maxHp += 3;
    G.player.hp += 3;
    tigerTriggered = true;
  }
  if (!keepSnapshot) {
    G.battleEntrySnapshot = clone(G);
  }

  G.enemy = clone(node.enemy);
  ensureFaultRobotState(G.enemy);
  resetRoomJi();
  G.enemy.ji = 0;
  G.roomFlags.playerDamagedInBattle = false;
  G.battle = {
    round:1,
    phase:'select',
    pAction:null,
    eAction:null,
    lastPlayerAction:null,
    lastEnemyAction:null,
    popcornPending:false,
    ekaiPending:false,
    roundDisabledActions:[],
    reunionDamageBonus:0,
    killedByDestinedFirstSight:false,
  };
  G.ui = {mainSel:null, actionKey:null};

  if (G.abilities.smallPotion && G.player.hp < G.player.maxHp) {
    G.player.hp += 1;
  }
  if (G.player.classKey === 'mage' && G.abilities.storm) {
    G.player.lightningOrbs = (G.player.lightningOrbs || 0) + 2;
  }

  $('b-enemy-emoji').textContent = G.enemy.emoji || '👹';
  $('b-enemy-name').textContent = G.enemy.name;
  $('b-player-name').textContent = `${G.player.classIcon || ''} ${G.player.name}`;
  $('b-portrait-player-name').textContent = G.player.name;
  $('b-portrait-enemy-name').textContent = G.enemy.name;

  // 动态加载立绘（有图片则显示，否则回退到 emoji）
  function loadPortrait(frameId, imgId, src) {
    const frame = $(frameId);
    const img = $(imgId);
    frame.classList.remove('has-art');
    img.onload  = () => frame.classList.add('has-art');
    img.onerror = () => frame.classList.remove('has-art');
    img.src = src;
  }
  loadPortrait('b-player-portrait', 'b-player-portrait-img',
    `assets/portraits/player_${G.player.classKey}.png`);
  loadPortrait('b-enemy-portrait', 'b-enemy-portrait-img',
    `assets/portraits/enemy_${G.enemy.id.toLowerCase()}.png`);

  renderEnemyStateTags();
  renderPassiveTags('battle-passive-tags');
  renderEquipSlots('battle-equip-slots');
  clearRelicChoiceUI();

  $('battle-log').innerHTML = '';
  addLog('rnd', '▶ 回合 1');
  addLog('', `战斗开始！对手：${G.enemy.emoji} ${G.enemy.name}`);
  addLog('', '进入新房间，双方 Ji 已清零。');
  if (tigerTriggered) addLog('log-ab', '🐯 虎式坦克触发：进入 Boss，生命上限 +3 且当前生命同步 +3。');
  if (G.abilities.smallPotion) addLog('log-ab', '🧪 小血瓶触发：战斗开始时回复 1 生命。');
  if (G.player.classKey === 'mage' && G.abilities.storm) addLog('log-ab', '⛈️ 雷暴触发：战斗开始时获得 2 闪电球。');
  if (G.player.classKey === 'nsyc') addLog('log-ab', '🤬 傻逼被动：每回合开始自动累计【傻逼】层数，满4层可释放【厄介】。');
  if (G.player.classKey === 'dog') addLog('log-ab', `🐶 小狗出战：当前幸运值 ${G.player.luck || 0}。`);
  if (G.enemy.id === 'jiaxu') {
    addLog('log-ab', '🌫️ 贾诩展开了【无知之幕】：双方 Ji 数量都被隐藏。');
  } else if (G.enemy.id === 'gufu') {
    addLog('log-ab', '👑 古夫大帝的【野性之心】会不断成长。');
  } else if (G.enemy.id === 'faultRobot') {
    addLog('log-ab', '🤖 故障机器人会随机生成 5 类充能球；当五类都已出现后，再次启动会直接消灭玩家。');
  }
  if (G.hardMode) {
    addLog('log-ab', '⚡ 困难模式：此 Boss 使用马尔可夫最优策略（MDP），根据你当前的 Ji 状态动态决策。');
  }
  applyRoundStartEffects();
  updateHardBadge(G.hardMode);

  $('round-num').textContent = '1';
  refreshActionLabels();
  resetRoundUI();
  refreshBars();
  showScreen('battle');
}

function mainSelect(category) {
  // 'atk' is the combined attack card; a1/a2/a3 kept for legacy compatibility
  const panelMap = {def:'sp-def', atk:'sp-atk', a1:'sp-atk', a2:'sp-atk', a3:'sp-atk', sp:'sp-special'};
  const btnMap   = {ji:'mb-ji', def:'mb-def', atk:'mb-atk', a1:'mb-atk', a2:'mb-atk', a3:'mb-atk', sp:'mb-sp'};

  if (category === 'ji') {
    if (isActionBlockedForRound('ji')) return;
    G.ui.mainSel = 'ji';
    G.ui.actionKey = 'ji';
    document.querySelectorAll('.action-card-btn').forEach((btn) => btn.classList.remove('sel'));
    $('mb-ji').classList.add('sel');
    document.querySelectorAll('.sub-panel').forEach((panel) => panel.classList.remove('show'));
    document.querySelectorAll('.sub-btn').forEach((btn) => btn.classList.remove('sel'));
    const action = getActionData('ji', 'player');
    $('pc-emoji').textContent = action.emoji;
    $('pc-main').textContent = action.name;
    $('pc-sub').textContent = `+${action.gain}Ji`;
    $('sel-preview-text').textContent = `⚡ 蓄力 (+${action.gain}Ji)`;
    $('btn-confirm').disabled = false;
    return;
  }

  if (category === 'def' && isDefenseForbiddenByRelic()) return;

  if (category === 'sp') {
    if (G.player.classKey !== 'mage' && G.player.classKey !== 'nsyc') return;
    if (isActionBlockedForRound('mage_release')) return;
  }

  document.querySelectorAll('.action-card-btn').forEach((btn) => btn.classList.remove('sel'));
  document.querySelectorAll('.sub-panel').forEach((panel) => panel.classList.remove('show'));

  if (G.ui.mainSel === category) {
    G.ui.mainSel = null;
    return;
  }

  G.ui.mainSel = category;
  $(btnMap[category]).classList.add('sel');
  $(panelMap[category]).classList.add('show');
}

function subSelect(key) {
  if (isDefenseForbiddenByRelic() && key.startsWith('defense_')) return;
  if (isActionBlockedForRound(key)) return;
  const action = getActionData(key, 'player');
  if (!action || action.disabledByOrbs || action.cost > G.player.ji) return;
  G.ui.actionKey = key;

  document.querySelectorAll('.sub-card, .sub-btn').forEach((btn) => btn.classList.remove('sel'));
  const button = document.querySelector(`.sub-card[data-action="${key}"], .sub-btn[data-action="${key}"]`);
  if (button) button.classList.add('sel');

  $('pc-emoji').textContent = action.emoji;
  $('pc-main').textContent = action.name;
  if (action.type === 'defense') $('pc-sub').textContent = `防御${action.def} | 耗${action.cost}Ji`;
  else if (action.type === 'ekai') $('pc-sub').textContent = getActionSubText(action);
  else $('pc-sub').textContent = describeAttack(action);

  const costLabel = action.isMageRelease ? `${action.orbCost}闪电球` : action.type === 'ekai' ? `4层傻逼` : `${action.cost}Ji`;
  let preview = `${action.emoji} ${action.name} (${costLabel})`;
  if (action.type === 'defense') preview += ` 防御${action.def}`;
  if (action.type === 'attack') preview += ` 攻击${action.atk} / ${action.damage}伤害`;
  if (action.type === 'ekai') preview += ` 消耗4层傻逼·下回合必定命中`;
  $('sel-preview-text').textContent = preview;
  $('btn-confirm').disabled = false;
}

function confirmAction() {
  if (!G.ui.actionKey || G.battle.phase !== 'select') return;
  if (isActionBlockedForRound(G.ui.actionKey)) return;
  G.battle.pAction = G.ui.actionKey;
  G.battle.eAction = aiDecide(G.enemy);
  G.battle.phase = 'reveal';
  $('action-area').style.pointerEvents = 'none';
  $('btn-confirm').disabled = true;
  $('round-phase').textContent = '揭示中...';
  runAfter(BATTLE_TIMINGS.REVEAL_DELAY_MS, doReveal);
}

function doReveal() {
  const enemyAction = getActionData(G.battle.eAction, 'enemy');
  const enemyCard = $('enemy-card');
  enemyCard.className = 'reveal-card revealed-enemy';
  enemyCard.innerHTML = `<div class="ac-emoji">${enemyAction.emoji}</div><div class="ac-name">${enemyAction.name}</div><div class="ac-sub">${getActionSubText(enemyAction)}</div>`;
  $('player-card').className = 'reveal-card revealed-player';
  $('round-phase').textContent = '结算中...';
  runAfter(BATTLE_TIMINGS.RESOLVE_DELAY_MS, doResolve);
}

function doResolve() {
  const resolveCtx = battleRuntime.runResolvePhase();
  if (!resolveCtx.result) return;

  G.battle.lastPlayerAction = G.battle.pAction;
  G.battle.lastEnemyAction = G.battle.eAction;
  refreshBars();

  runAfter(BATTLE_TIMINGS.OUTCOME_DELAY_MS, () => {
    const deathCtx = battleRuntime.runDeathCheckPhase();
    if (deathCtx.outcome === BATTLE_OUTCOME.WIN) {
      endBattle(true);
      return;
    }
    if (deathCtx.outcome === BATTLE_OUTCOME.LOSE) {
      endBattle(false);
      return;
    }
    nextRound();
  });
}

function applyRoundStartEffects() {
  if (!G.battle) return false;
  const phaseCtx = battleRuntime.runRoundStartPhase();
  if (phaseCtx.outcome === BATTLE_OUTCOME.WIN) {
    endBattle(true);
    return true;
  }
  if (phaseCtx.outcome === BATTLE_OUTCOME.LOSE) {
    endBattle(false);
    return true;
  }
  if (phaseCtx.battleEnded) return true;
  return false;
}

function nextRound() {
  G.battle.round += 1;
  G.battle.phase = 'select';
  $('round-num').textContent = String(G.battle.round);
  addLog('rnd', `▶ 回合 ${G.battle.round}`);
  if (applyRoundStartEffects()) return;
  resetRoundUI();
  refreshBars();
}

function endBattle(win) {
  const box = $('ov-battle-box');
  const title = $('ov-battle-title');
  const body = $('ov-battle-body');
  // 清空上次结算文案，避免跨房间复用旧 Boss 名字
  body.innerHTML = '';
  clearRelicChoiceUI();
  G.pendingPowerRelicOptions = [];

  resetRoomJi();

  if (win) {
    box.className = 'overlay-box green';
    title.textContent = '战斗胜利！';
    const node = G.currentNode;
    const reward = node.reward || 0;
    G.player.fragments += reward;
    G.nodes[G.nodeIdx].done = true;
    G.nodeIdx += 1;
    if (G.equippedGear === 'vitalityEquip' && !G.roomFlags.playerDamagedInBattle) {
      G.player.maxHp += 1;
      G.player.hp += 1;
      body.innerHTML = `你击败了 <strong style="color:#e07070">${node.enemy.name}</strong>！<br>🩹 无伤通过战斗，<strong style="color:#8bd48b">生命上限 +1</strong>。`;
    }
    if (node.finalBoss) {
      body.innerHTML = `你击败了 <strong style="color:#e07070">${node.enemy.name}</strong>！`;
    } else if (!body.innerHTML) {
      body.innerHTML = `你击败了 <strong style="color:#e07070">${node.enemy.name}</strong>！<br>继续前进，后面还有更强的敌人。`;
    }

    if (node.dropPowerRelic) {
      const options = getPowerRelicOptions(2);
      if (options.length > 0) {
        G.pendingPowerRelicOptions = options;
        renderRelicChoiceUI(options);
      }
    }
  } else {
    box.className = 'overlay-box red';
    title.textContent = '战斗失败';
    body.textContent = '你的生命归零，旅途就此结束...';
  }

  const logDetails = $('ov-battle-log-details');
  const logSnapshot = $('ov-battle-log-snapshot');
  const battleLog = $('battle-log');
  if (logDetails && logSnapshot) {
    logDetails.open = false;
    logSnapshot.innerHTML = (battleLog && battleLog.innerHTML)
      ? battleLog.innerHTML
      : '<div class="log-item">暂无日志。</div>';
  }

  G.enemy = null;
  openOverlay('ov-battle');
}

function closeBattleOverlay() {
  closeOverlay('ov-battle');
  if (G.player.hp <= 0) {
    showScreen('gameover');
    return;
  }
  const prev = G.nodes[G.nodeIdx - 1];
  if (prev && prev.finalBoss) {
    showScreen('victory');
    return;
  }
  showScreen('map');
  renderMap();
}

function openSettings() {
  refreshDeveloperModeButton();
  openOverlay('ov-settings');
}
function closeSettings() { closeOverlay('ov-settings'); }
function confirmBackToMenu() {
  document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
  document.querySelectorAll('.class-btn').forEach((b) => b.classList.remove('sel'));
  selectedClassKey = null;
  $('btn-start').disabled = true;
  const hb = $('btn-hard-start'); if (hb) hb.disabled = true;
  showScreen('menu');
}

// ── Intro overlay ─────────────────────────────────────────────────────────────
function openIntro(startKey) {
  const classKeys = Object.keys(CLASS_DEFS);

  function renderIntroContent(key) {
    const cls = CLASS_DEFS[key];

    // Tab strip
    $('intro-tabs').innerHTML = classKeys.map((k) => {
      const c = CLASS_DEFS[k];
      return `<button class="intro-tab${k === key ? ' active' : ''}" data-intro-class="${k}">${c.icon} ${c.name}</button>`;
    }).join('');
    $('intro-tabs').querySelectorAll('.intro-tab').forEach((btn) => {
      btn.addEventListener('click', () => renderIntroContent(btn.dataset.introClass));
    });

    // Class header
    let html = `
      <div class="intro-class-header">
        <div class="intro-class-icon">${cls.icon}</div>
        <div>
          <div class="intro-class-title">${cls.name}</div>
          <div class="intro-class-meta">❤ ${cls.baseHp} 血 · +${cls.baseJiRate} Ji/回</div>
          ${cls.trait ? `<span class="class-trait">${cls.trait}</span>` : ''}
        </div>
      </div>`;

    // Passive
    if (cls.passiveDesc) {
      html += `<div class="intro-section">
        <div class="intro-section-title">被 动</div>
        <div class="intro-passive-box">${cls.passiveDesc}</div>
      </div>`;
    }

    // Special skill
    if (cls.spDesc) {
      html += `<div class="intro-section">
        <div class="intro-section-title">专属技能</div>
        <div class="intro-passive-box sp">${cls.spDesc}</div>
      </div>`;
    }

    // Class abilities
    html += `<div class="intro-section"><div class="intro-section-title">专属能力</div>`;
    html += cls.abilityDefs.map((ab) => `
      <div class="intro-ability">
        <div class="intro-ability-icon">${ab.icon}</div>
        <div class="intro-ability-body">
          <div class="intro-ability-name">${ab.name}<span class="intro-ability-cost">✨ ${ab.cost}</span></div>
          <div class="intro-ability-desc">${ab.desc}</div>
        </div>
      </div>`).join('');
    html += `</div>`;

    // Common abilities
    html += `<div class="intro-common-divider">── 通用能力（所有职业可购买）──</div>
      <div class="intro-section">`;
    html += COMMON_ABILITY_DEFS.map((ab) => `
      <div class="intro-ability">
        <div class="intro-ability-icon">${ab.icon}</div>
        <div class="intro-ability-body">
          <div class="intro-ability-name">${ab.name}<span class="intro-ability-cost">✨ ${ab.cost}</span></div>
          <div class="intro-ability-desc">${ab.desc}</div>
        </div>
      </div>`).join('');
    html += `</div>`;

    $('intro-content').innerHTML = html;
  }

  renderIntroContent(startKey || classKeys[0]);
  openOverlay('ov-intro');
}
function closeIntro() { closeOverlay('ov-intro'); }

function bindStaticEvents() {
  $('btn-start').addEventListener('click', startGame);
  $('btn-hard-start')?.addEventListener('click', startHardGame);
  $('btn-open-abtree').addEventListener('click', openAbilityTree);
  $('btn-abtree-close').addEventListener('click', closeAbilityTree);
  $('btn-leave-shop').addEventListener('click', leaveShop);
  $('btn-ask-surrender').addEventListener('click', askSurrender);
  $('btn-cancel-surrender').addEventListener('click', closeSurrender);
  $('btn-confirm-surrender').addEventListener('click', doSurrender);
  $('btn-restart-battle').addEventListener('click', restartBattle);
  $('btn-battle-continue').addEventListener('click', closeBattleOverlay);
  $('btn-relic-skip')?.addEventListener('click', clearRelicChoiceUI);
  $('btn-confirm').addEventListener('click', confirmAction);
  $('btn-restart-run-from-gameover').addEventListener('click', restartRun);
  $('btn-restart-run-from-victory').addEventListener('click', restartRun);
  // Settings placeholder
  $('btn-to-menu-map')?.addEventListener('click', openSettings);
  $('btn-to-menu-battle')?.addEventListener('click', openSettings);
  $('btn-settings-close')?.addEventListener('click', closeSettings);
  $('btn-toggle-devmode')?.addEventListener('click', toggleDeveloperMode);
  $('btn-intro')?.addEventListener('click', () => openIntro());
  $('btn-intro-close')?.addEventListener('click', closeIntro);
  $('btn-menu-from-gameover')?.addEventListener('click', confirmBackToMenu);
  $('btn-menu-from-victory')?.addEventListener('click', confirmBackToMenu);

  document.querySelectorAll('.action-card-btn[data-main]').forEach((btn) => {
    btn.addEventListener('click', () => mainSelect(btn.dataset.main));
  });

  document.querySelectorAll('.sub-card[data-action], .sub-btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => subSelect(btn.dataset.action));
  });

  $('nodes-wrap').addEventListener('click', (event) => {
    const node = event.target.closest('.map-node.available');
    if (!node) return;
    const index = Number(node.dataset.nodeIndex);
    enterNode(index);
  });

  $('abtree-nodes').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-unlock]');
    if (!button) return;
    unlockAbility(button.dataset.unlock);
  });

  $('shop-items').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-buy]');
    if (!button) return;
    buyShopItem(button.dataset.buy);
  });

  $('ov-battle-relic-options')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-choose-relic]');
    if (!btn) return;
    choosePowerRelic(btn.dataset.chooseRelic);
  });

  ['map-equip-slots', 'battle-equip-slots'].forEach((id) => {
    $(id).addEventListener('click', (event) => {
      const slot = event.target.closest('.equip-slot[data-slot="gear"].filled');
      if (!slot) return;
      unequipGear();
    });
  });

  document.querySelectorAll('.class-btn[data-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedClassKey = btn.dataset.class;
      document.querySelectorAll('.class-btn[data-class]').forEach((item) => item.classList.remove('sel'));
      btn.classList.add('sel');
      $('btn-start').disabled = false;
      const hardBtn = $('btn-hard-start');
      if (hardBtn) hardBtn.disabled = false;
    });
  });
}

function bootstrap() {
  bindStaticEvents();
  initGame();
  applyDeveloperModeToGameState();
  refreshDeveloperModeButton();
}

document.addEventListener('DOMContentLoaded', bootstrap);
