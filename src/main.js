import { aiDecide } from './ai.js';
import { initMDPPolicies, clearMDPPolicies } from './mdp.js';
import { SHOP_ITEMS, getAbilityDefsForClass } from './data.js';
import {
  calcDamage,
  describeAttack,
  formatSingleAction,
  getActionData,
  getActionSubText,
  resolveAction,
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
import { G, initGame, resetRoomJi, ensureFaultRobotState, restoreFromBattleSnapshot, allOrbsGenerated } from './state.js';
import { clone } from './utils.js';

const $ = (id) => document.getElementById(id);
let selectedClassKey = null;

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
  if (!ab || G.abilities[key] || G.player.fragments < ab.cost) return;
  G.player.fragments -= ab.cost;
  G.abilities[key] = true;
  if (key === 'mango') {
    G.player.maxHp += 5;
    G.player.hp += 5;
  }
  renderAbilityTree();
  renderMap();
}

function buyShopItem(key) {
  const item = SHOP_ITEMS.find((entry) => entry.key === key);
  if (!item || G.shop[key] || G.player.fragments < item.cost) return;
  if (item.slot === 'gear' && G.equippedGear && G.equippedGear !== key) return;
  G.player.fragments -= item.cost;
  G.shop[key] = true;
  if (item.slot === 'gear') G.equippedGear = key;
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
  restartRun();
}

function startGame() {
  if (!selectedClassKey) return;
  document.querySelectorAll('.overlay').forEach((overlay) => overlay.classList.remove('show'));
  clearMDPPolicies();
  initGame(selectedClassKey);
  updateHardBadge(false);
  showScreen('map');
  renderMap();
}

function startHardGame() {
  if (!selectedClassKey) return;
  document.querySelectorAll('.overlay').forEach((overlay) => overlay.classList.remove('show'));
  const btn = $('btn-hard-start');
  if (btn) { btn.disabled = true; btn.textContent = '计算中...'; }
  // Synchronous computation — typically <150 ms
  initMDPPolicies(selectedClassKey);
  if (btn) { btn.disabled = false; btn.textContent = '困难模式 (MDP)'; }
  initGame(selectedClassKey);
  G.hardMode = true;
  updateHardBadge(true);
  showScreen('map');
  renderMap();
  setTimeout(() => {
    if (G.nodeIdx === 0 && G.nodes[0] && G.nodes[0].type === 'shop') {
      enterNode(0);
    }
  }, 0);
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
  if (!node || node.done || index !== G.nodeIdx) return;
  resetRoomJi();
  if (node.type === 'shop') {
    renderShop();
    renderMap();
    openOverlay('ov-shop');
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
  G.battle = {round:1, phase:'select', pAction:null, eAction:null, lastPlayerAction:null, lastEnemyAction:null, popcornPending:false};
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

  $('battle-log').innerHTML = '';
  addLog('rnd', '▶ 回合 1');
  addLog('', `战斗开始！对手：${G.enemy.emoji} ${G.enemy.name}`);
  addLog('', '进入新房间，双方 Ji 已清零。');
  if (tigerTriggered) addLog('log-ab', '🐯 虎式坦克触发：进入 Boss，生命上限 +3 且当前生命同步 +3。');
  if (G.abilities.smallPotion) addLog('log-ab', '🧪 小血瓶触发：战斗开始时回复 1 生命。');
  if (G.player.classKey === 'mage' && G.abilities.storm) addLog('log-ab', '⛈️ 雷暴触发：战斗开始时获得 2 闪电球。');
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

  if (category === 'sp' && G.player.classKey !== 'mage') return;

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
  const action = getActionData(key, 'player');
  if (!action || action.disabledByOrbs || action.cost > G.player.ji) return;
  G.ui.actionKey = key;

  document.querySelectorAll('.sub-card, .sub-btn').forEach((btn) => btn.classList.remove('sel'));
  const button = document.querySelector(`.sub-card[data-action="${key}"], .sub-btn[data-action="${key}"]`);
  if (button) button.classList.add('sel');

  $('pc-emoji').textContent = action.emoji;
  $('pc-main').textContent = action.name;
  if (action.type === 'defense') $('pc-sub').textContent = `防御${action.def} | 耗${action.cost}Ji`;
  else $('pc-sub').textContent = describeAttack(action);

  const costLabel = action.isMageRelease ? `${action.orbCost}闪电球` : `${action.cost}Ji`;
  let preview = `${action.emoji} ${action.name} (${costLabel})`;
  if (action.type === 'defense') preview += ` 防御${action.def}`;
  if (action.type === 'attack') preview += ` 攻击${action.atk} / ${action.damage}伤害`;
  $('sel-preview-text').textContent = preview;
  $('btn-confirm').disabled = false;
}

function confirmAction() {
  if (!G.ui.actionKey || G.battle.phase !== 'select') return;
  G.battle.pAction = G.ui.actionKey;
  G.battle.eAction = aiDecide(G.enemy);
  G.battle.phase = 'reveal';
  $('action-area').style.pointerEvents = 'none';
  $('btn-confirm').disabled = true;
  $('round-phase').textContent = '揭示中...';
  setTimeout(doReveal, 260);
}

function doReveal() {
  const enemyAction = getActionData(G.battle.eAction, 'enemy');
  const enemyCard = $('enemy-card');
  enemyCard.className = 'reveal-card revealed-enemy';
  enemyCard.innerHTML = `<div class="ac-emoji">${enemyAction.emoji}</div><div class="ac-name">${enemyAction.name}</div><div class="ac-sub">${getActionSubText(enemyAction)}</div>`;
  $('player-card').className = 'reveal-card revealed-player';
  $('round-phase').textContent = '结算中...';
  setTimeout(doResolve, 480);
}

function doResolve() {
  const pChosen = getActionData(G.battle.pAction, 'player');
  const eChosen = getActionData(G.battle.eAction, 'enemy');
  const pResult = resolveAction('player', G.battle.pAction);
  const eResult = resolveAction('enemy', G.battle.eAction);
  const p = G.player;
  const e = G.enemy;

  addLog('', `玩家: ${formatSingleAction(pChosen)}  |  敌方: ${formatSingleAction(eChosen)}`);
  pResult.logs.forEach((text) => addLog('log-ab', text));
  eResult.logs.forEach((text) => addLog('log-ab', text));

  const result = calcDamage(pResult.action, eResult.action);
  p.hp = Math.max(0, p.hp - result.pdmg);
  e.hp = Math.max(0, e.hp - result.edmg);
  if (result.pdmg > 0) {
    G.roomFlags.playerDamagedInBattle = true;
    if (G.abilities.popcorn) G.battle.popcornPending = true;
  }
  result.msgs.forEach((msg) => addLog(result.edmg > 0 || result.pdmg > 0 ? 'log-dmg' : 'log-blk', msg));
  result.triggers.forEach((trigger) => addLog('log-ab', `✨ ${trigger}`));
  if (result.pdmg > 0) addLog('log-dmg', `玩家受到 ${result.pdmg} 点伤害！`);
  if (result.edmg > 0) addLog('log-dmg', `敌方受到 ${result.edmg} 点伤害！`);

  // 过载机制：在双方行动结算后立即检查；每场战斗仅触发一次。
  if (e && e.id === 'faultRobot' && !e.overloadTriggered && allOrbsGenerated(e)) {
    e.overloadTriggered = true;
    p.hp = 0;
    addLog('log-dmg', '☠️ 过载终焉发动！玩家被直接消灭。');
  }

  G.battle.lastPlayerAction = G.battle.pAction;
  G.battle.lastEnemyAction = G.battle.eAction;
  refreshBars();

  setTimeout(() => {
    if (p.hp <= 0) {
      if (G.abilities.savedByBlade && !G.abilities.savedByBladeUsed) {
        G.abilities.savedByBladeUsed = true;
        p.hp = 1;
        refreshBars();
        addLog('log-ab', '🗡️ 名刀司命触发！你回复至 1 生命并继续战斗。');
        nextRound();
        return;
      }
      endBattle(false);
      return;
    }
    if (e.hp <= 0) {
      endBattle(true);
      return;
    }
    nextRound();
  }, 620);
}

function applyRoundStartEffects() {
  if (G.abilities.popcorn && G.battle.popcornPending) {
    G.player.ji += 2;
    G.battle.popcornPending = false;
    addLog('log-ab', '🍿 爆米：上回合你受到了伤害，本回合开始获得 2 Ji。');
  }
  if (G.abilities.happyFlower && G.battle.round % 3 === 0) {
    G.player.ji += 1;
    addLog('log-ab', `🌼 开心小花：第 ${G.battle.round} 回合开始，获得 1 Ji。`);
  }
}

function nextRound() {
  G.battle.round += 1;
  G.battle.phase = 'select';
  $('round-num').textContent = String(G.battle.round);
  addLog('rnd', `▶ 回合 ${G.battle.round}`);
  applyRoundStartEffects();
  resetRoundUI();
  refreshBars();
}

function endBattle(win) {
  const box = $('ov-battle-box');
  const title = $('ov-battle-title');
  const body = $('ov-battle-body');

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
  } else {
    box.className = 'overlay-box red';
    title.textContent = '战斗失败';
    body.textContent = '你的生命归零，旅途就此结束...';
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

function openBackToMenu() { openOverlay('ov-to-menu'); }
function cancelBackToMenu() { closeOverlay('ov-to-menu'); }
function confirmBackToMenu() {
  document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
  document.querySelectorAll('.class-btn').forEach((b) => b.classList.remove('sel'));
  selectedClassKey = null;
  $('btn-start').disabled = true;
  const hb = $('btn-hard-start'); if (hb) hb.disabled = true;
  showScreen('menu');
}

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
  $('btn-confirm').addEventListener('click', confirmAction);
  $('btn-restart-run-from-gameover').addEventListener('click', restartRun);
  $('btn-restart-run-from-victory').addEventListener('click', restartRun);
  // Back to menu
  $('btn-to-menu-map')?.addEventListener('click', openBackToMenu);
  $('btn-to-menu-battle')?.addEventListener('click', openBackToMenu);
  $('btn-confirm-to-menu')?.addEventListener('click', confirmBackToMenu);
  $('btn-cancel-to-menu')?.addEventListener('click', cancelBackToMenu);
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
}

document.addEventListener('DOMContentLoaded', bootstrap);
