import { aiDecide } from './ai.js';
import { BATTLE_OUTCOME } from './battle/constants.js';
import { registerDefaultCombatEffects } from './battle/defaultCombatEffects.js';
import { registerDefaultDeathEffects } from './battle/defaultDeathEffects.js';
import { registerDefaultRoundStartEffects } from './battle/defaultRoundStartEffects.js';
import { registerDefaultResolveEffects } from './battle/defaultResolveEffects.js';
import { registerTechEffects } from './battle/techEffects.js';
import { registerEquipmentEffects } from './equipment/effects.js';
import { createBattleEngine } from './battle/engine.js';
import { createBattleRuntime } from './battle/runtime.js';
import { initMDPPolicies, clearMDPPolicies } from './mdp.js';
import { CLASS_DEFS, POWER_RELIC_DEFS, getAbilityDefsForClass, getPowerRelicDef } from './data.js';
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
  renderEquipmentLibrary,
  renderTechniqueLibrary,
  resetRoundUI,
} from './render.js';
import { G, initGame, resetRoomJi, ensureFaultRobotState, restoreFromBattleSnapshot } from './state.js';
import { equipTechnique, TECH_DEFS, getTechniqueCategoryLabel, unequipTechniqueSlot } from './battleTechniques.js';
import { clone, randomChoice } from './utils.js';
import { getEquipmentDef } from './equipment/defs.js';
import { getEquipmentCardArtPath } from './equipment/art.js';
import {
  applyOnWinEquipmentRewards,
  applyPostBattleTagModifiers,
  clearEquipmentShopOffers,
  createBattleEquipmentState,
  equipEquipment,
  getEquipmentIdInSlot,
  getEquipmentTagText,
  getEquippedEquipmentIds,
  hasEquippedEquipment,
  unequipEquipment,
} from './equipment/runtime.js';
import {
  buildBattleRewardOptions,
  completeMapRoom,
  createShopInventoryForRoom,
  enterMapRoom,
  formatRewardPickText,
  getEventViewModel,
  getRoomById,
  resolveEventChoice,
} from './map/index.js';
import { getMapEventArtPath } from './map/art.js';

const $ = (id) => document.getElementById(id);
let selectedClassKey = null;
const DEV_MODE_LS_KEY = 'ji_game_dev_mode';
const DEV_FRAGMENTS = 999999999;
const FEEDBACK_URL = 'https://v.wjx.cn/vm/hhxTGwR.aspx#';
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
registerTechEffects(battleEngine);
registerEquipmentEffects(battleEngine);
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

function getHuntRhythmState() {
  if (!G.battle || !G.battle.equipment) return null;
  return G.battle.equipment;
}

function syncHuntRhythmMeta(action) {
  const meta = $('hunt-rhythm-meta');
  const slider = $('hunt-rhythm-slider');
  if (!meta || !slider) return;
  const cost = Math.max(1, Math.floor((action && action.cost) || 1));
  const count = Math.max(0, Math.floor(Number(slider.value || 0)));
  const spend = count * cost;
  meta.textContent = `追加 ${count} 次（消耗 ${spend} Ji）`;
}

function hideHuntRhythmPanel(resetPlanned = true) {
  const panel = $('hunt-rhythm-panel');
  const slider = $('hunt-rhythm-slider');
  const meta = $('hunt-rhythm-meta');
  if (panel) panel.style.display = 'none';
  if (slider) {
    slider.min = '0';
    slider.max = '0';
    slider.value = '0';
  }
  if (meta) meta.textContent = '追加 0 次（消耗 0 Ji）';
  if (!resetPlanned) return;
  const st = getHuntRhythmState();
  if (st) st.huntRhythmPlannedExtraCount = 0;
}

function updateHuntRhythmPanelForAction(actionKey = null) {
  const panel = $('hunt-rhythm-panel');
  const slider = $('hunt-rhythm-slider');
  if (!panel || !slider) return;
  if (!G.battle || G.battle.phase !== 'select' || !hasEquippedEquipment(G, 'equi_1')) {
    hideHuntRhythmPanel(true);
    return;
  }

  const key = actionKey || (G.ui && G.ui.actionKey);
  const action = getActionData(key, 'player');
  if (!action || action.type !== 'attack' || action.isMageRelease || (action.cost || 0) <= 0) {
    hideHuntRhythmPanel(true);
    return;
  }

  const remainingJi = Math.max(0, Math.floor((G.player.ji || 0) - (action.cost || 0)));
  const cost = Math.max(1, Math.floor(action.cost || 1));
  const maxExtra = Math.max(0, Math.floor(remainingJi / cost));
  if (maxExtra <= 0) {
    hideHuntRhythmPanel(true);
    return;
  }

  const st = getHuntRhythmState();
  if (!st) {
    hideHuntRhythmPanel(true);
    return;
  }
  const planned = Math.max(0, Math.min(maxExtra, Math.floor(Number(st.huntRhythmPlannedExtraCount || 0))));
  st.huntRhythmPlannedExtraCount = planned;
  slider.min = '0';
  slider.max = String(maxExtra);
  slider.value = String(planned);
  panel.style.display = '';
  syncHuntRhythmMeta(action);
}

function getPlayerActionKeysForSilence() {
  const keys = ['ji', 'defense_0', 'defense_1', 'defense_2', 'attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'];
  if (G.player.classKey === 'mage') keys.push('mage_release');
  if (G.player.classKey === 'nsyc') keys.push('ekai');
  if (G.devMode) keys.push('dev_kill');
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

function clearEventRelicChoiceUI() {
  const wrap = $('event-relic-wrap');
  const options = $('event-relic-options');
  if (options) options.innerHTML = '';
  if (wrap) wrap.style.display = 'none';
  G.pendingEventRelicOptions = [];
  G.pendingEventRelicSelectedKey = null;
}

function renderEventRelicChoiceUI(options) {
  const wrap = $('event-relic-wrap');
  const container = $('event-relic-options');
  const skipBtn = $('btn-event-relic-skip');
  if (!wrap || !container) return;
  container.innerHTML = '';
  const selectedKey = G.pendingEventRelicSelectedKey;
  const hasSelected = !!selectedKey;
  if (!Array.isArray(options) || options.length <= 0) {
    const empty = document.createElement('div');
    empty.className = 'tag-placeholder';
    empty.textContent = '当前没有可选择的遗物。';
    container.appendChild(empty);
    if (skipBtn) skipBtn.disabled = false;
    wrap.style.display = '';
    return;
  }
  options.forEach((item) => {
    const isSelected = selectedKey === item.key;
    const isLocked = hasSelected && !isSelected;
    const card = document.createElement('div');
    card.className = `ab-node-card relic-choice-card${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`;
    card.innerHTML = `
      <div class="ab-icon">${item.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${item.name}</div>
        <div class="ab-desc">${item.desc}</div>
      </div>
      <div class="ab-action">
        <button class="btn-unlock" data-event-relic="${item.key}" ${hasSelected ? 'disabled' : ''}>${isSelected ? '已选择' : '选择'}</button>
      </div>`;
    container.appendChild(card);
  });
  if (skipBtn) skipBtn.disabled = hasSelected;
  wrap.style.display = '';
}

function chooseEventRelic(key) {
  if (G.pendingEventRelicSelectedKey) return;
  const def = getPowerRelicDef(key);
  if (!def || G.powerRelics[key]) return;
  G.powerRelics[key] = true;
  G.pendingEventRelicSelectedKey = key;
  addLog('log-ab', `🧿 事件馈赠：获得强大遗物 ${def.name}。`);
  renderEventRelicChoiceUI(G.pendingEventRelicOptions);
  renderMap();
  if (G.enemy) refreshBars();
}

function clearBattleRewardUI() {
  const wrap = $('ov-battle-reward-wrap');
  const tip = $('ov-battle-reward-tip');
  const options = $('ov-battle-reward-options');
  if (tip) tip.textContent = '';
  if (options) options.innerHTML = '';
  if (wrap) wrap.style.display = 'none';
}

function renderBattleRewardUI() {
  const wrap = $('ov-battle-reward-wrap');
  const tip = $('ov-battle-reward-tip');
  const optionsWrap = $('ov-battle-reward-options');
  if (!wrap || !tip || !optionsWrap) return;
  const reward = G.pendingBattleReward;
  const options = Array.isArray(reward && reward.options) ? reward.options : [];
  const pickCount = Math.max(0, Number(reward && reward.pickCount ? reward.pickCount : 0));
  if (pickCount <= 0 || options.length <= 0) {
    clearBattleRewardUI();
    return;
  }

  const selected = new Set(Array.isArray(reward.selectedOptionIds) ? reward.selectedOptionIds : []);
  const remain = Math.max(0, pickCount - selected.size);
  tip.textContent = `还可选择 ${remain} 项。`;

  optionsWrap.innerHTML = '';
  options.forEach((item) => {
    const checked = selected.has(item.optionId);
    const disabled = !checked && selected.size >= pickCount;
    const card = document.createElement('div');
    let icon = '🎁';
    let title = formatRewardPickText(item);
    let desc = '';
    if (item.kind === 'fragment') {
      icon = '✨';
      title = `能力碎片 +${item.amount || 1}`;
      desc = '用于能力树解锁。';
    } else if (item.kind === 'technique' && item.id) {
      const def = TECH_DEFS[item.id];
      if (def) {
        icon = def.emoji || '⚔';
        title = `战技：${def.name}`;
        desc = `类别：${getTechniqueCategoryLabel(def)}${def.desc ? ` · ${def.desc}` : ''}`;
      } else {
        icon = '⚔';
        title = `战技：${item.id}`;
      }
    }
    card.className = `ab-node-card reward-pick-card${checked ? ' selected' : ''}${disabled ? ' locked' : ''}`;
    card.innerHTML = `
      <div class="ab-icon">${icon}</div>
      <div class="ab-info">
        <div class="ab-name">${title}</div>
        ${desc ? `<div class="ab-desc">${desc}</div>` : ''}
      </div>
      <div class="ab-action">
        <button class="btn-unlock" data-reward-option="${item.optionId}" ${disabled ? 'disabled' : ''}>${checked ? '已选择' : '选择'}</button>
      </div>`;
    optionsWrap.appendChild(card);
  });
  wrap.style.display = '';
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

function openEventRoom(room) {
  const model = getEventViewModel(room, G);
  $('event-title').textContent = `事件：${model.title}`;
  const eventArt = $('event-art');
  if (eventArt) {
    const eventId = room && room.payload ? room.payload.eventId : '';
    eventArt.style.display = '';
    eventArt.src = getMapEventArtPath(eventId || 'default');
  }
  $('event-body').textContent = model.intro;
  renderEventChoiceButtons();
  $('btn-event-confirm').disabled = true;
  G.pendingEventEquipmentChoiceKey = null;
  clearEventRelicChoiceUI();
  openOverlay('ov-event');
}

function renderEventChoiceButtons() {
  const model = getEventViewModel(G.currentNode, G);
  const choicesWrap = $('event-choices');
  choicesWrap.innerHTML = '';
  model.choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.dataset.eventChoice = choice.key;
    btn.style.margin = '4px';
    btn.textContent = `${choice.key}. ${choice.text}`;
    choicesWrap.appendChild(btn);
  });
}

function renderEventEquipmentPicker(equipmentIds) {
  const choicesWrap = $('event-choices');
  choicesWrap.innerHTML = '';
  const ids = Array.isArray(equipmentIds) ? equipmentIds : [];
  if (ids.length <= 0) {
    const empty = document.createElement('div');
    empty.className = 'tag-placeholder';
    empty.textContent = '当前没有可选择的装备。';
    choicesWrap.appendChild(empty);
    return;
  }
  ids.forEach((equipmentId) => {
    const def = getEquipmentDef(equipmentId);
    if (!def) return;
    const card = document.createElement('div');
    card.className = 'ab-node-card';
    const tagText = getEquipmentTagText(G, equipmentId);
    card.innerHTML = `
      <div class="ab-icon equip-shop-icon">
        <img class="shop-equip-art" src="${getEquipmentCardArtPath(equipmentId)}" alt="${def.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">
        <span class="shop-equip-fallback" style="display:none">${def.icon}</span>
      </div>
      <div class="ab-info">
        <div class="ab-name">${def.name}</div>
        <div class="ab-desc">${def.desc}</div>
        <div class="ab-desc">当前词条：${tagText}</div>
      </div>
      <div class="ab-action">
        <button class="btn-unlock" data-event-equip="${equipmentId}">选择</button>
      </div>`;
    choicesWrap.appendChild(card);
  });
}

function chooseEventEquipment(equipmentId) {
  if (!G.currentNode || G.currentNode.type !== 'event') return;
  if (!G.pendingEventEquipmentChoiceKey) return;
  const result = resolveEventChoice(
    G,
    G.currentNode,
    G.pendingEventEquipmentChoiceKey,
    { addLog, selectedEquipmentId: equipmentId },
  );
  $('event-body').textContent = result.text;
  $('btn-event-confirm').disabled = !result.leave;
  if (result.requiresEquipmentPick) {
    renderEventEquipmentPicker(result.equipmentIds);
    return;
  }
  G.pendingEventEquipmentChoiceKey = null;
  clearEventRelicChoiceUI();
  if (!result.leave) {
    renderEventChoiceButtons();
  } else {
    $('event-choices').innerHTML = '';
    const eventId = G.currentNode && G.currentNode.payload ? G.currentNode.payload.eventId : '';
    if (eventId === 'event_2') {
      const options = getPowerRelicOptions(2);
      G.pendingEventRelicOptions = options;
      renderEventRelicChoiceUI(options);
    }
  }
  renderMap();
}

function applyPickedRewards(picks) {
  const out = [];
  (Array.isArray(picks) ? picks : []).forEach((picked) => {
    if (!picked) return;
    if (picked.kind === 'fragment') {
      G.player.fragments += picked.amount || 1;
      out.push(picked);
      return;
    }
    if (picked.kind === 'technique' && picked.id) {
      equipTechnique(G, picked.id);
      const def = TECH_DEFS[picked.id];
      const name = def ? def.name : picked.id;
      const category = getTechniqueCategoryLabel(def || picked.id);
      addLog('log-ab', `📘 获得战技：${name}（${category}，已自动装备到对应攻击槽）。`);
      out.push(picked);
    }
  });
  return out;
}

function finalizeBattleRewards() {
  const reward = G.pendingBattleReward;
  if (!reward) return [];
  const selected = new Set(Array.isArray(reward.selectedOptionIds) ? reward.selectedOptionIds : []);
  const picked = (Array.isArray(reward.options) ? reward.options : []).filter((item) => selected.has(item.optionId));
  const out = applyPickedRewards(picked);
  G.pendingBattleReward = null;
  clearBattleRewardUI();
  return out;
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
  // Ability tree prerequisite check: linear by default, optional free-pick per class
  const classDef = CLASS_DEFS[G.player.classKey];
  const isLinearTree = !classDef || classDef.abilityTreeLinear !== false;
  if (classDef && isLinearTree) {
    const idx = classDef.abilityDefs.findIndex((a) => a.key === key);
    if (idx > 0 && !G.devMode) {
      const prevKey = classDef.abilityDefs[idx - 1].key;
      if (!G.abilities[prevKey]) return;
    }
  }
  if (!G.devMode) G.player.fragments -= ab.cost;
  G.abilities[key] = true;
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

function buyShopInventoryItem(kind, id) {
  const room = G.currentNode;
  const inventory = room && room.payload ? room.payload.shopInventory : null;
  if (!inventory) return;
  const allItems = [...inventory.equipment, ...inventory.techniques, inventory.fragment].filter(Boolean);
  const item = allItems.find((x) => x.kind === kind && x.id === id);
  if (!item || item.purchased) return;
  if ((G.player.gold || 0) < item.price) return;

  if (kind === 'equipment') {
    const equippedIds = getEquippedEquipmentIds(G);
    if (equippedIds.length >= 2 && !equippedIds.includes(id)) return;
    const result = equipEquipment(G, id);
    if (!result.ok) return;
  } else if (kind === 'technique') {
    const ok = equipTechnique(G, id);
    if (!ok) return;
  } else if (kind === 'fragment') {
    G.player.fragments += item.amount || 1;
  }

  G.player.gold -= item.price;
  item.purchased = true;
  keepDeveloperResources();
  renderShop();
  renderMap();
}

function unequipEquipmentSlot(slotIndex) {
  if (G.enemy) return;
  const equipmentId = getEquipmentIdInSlot(G, slotIndex);
  if (!equipmentId) return;
  const def = getEquipmentDef(equipmentId);
  const itemName = def ? def.name : '当前装备';
  const ok = window.confirm(`是否卸下【${itemName}】？卸下后需要重新购买才能再次装备。`);
  if (!ok) return;
  const result = unequipEquipment(G, slotIndex);
  if (!result.ok) return;
  renderMap();
  if ($('ov-shop').classList.contains('show')) renderShop();
  if (G.enemy) refreshBars();
}

function leaveShop() {
  clearEquipmentShopOffers(G);
  if (G.currentNode && G.currentNode.id) {
    completeMapRoom(G.map, G.currentNode.id);
  }
  if (G.devMode) {
    closeOverlay('ov-shop');
    renderMap();
    return;
  }
  resetRoomJi();
  closeOverlay('ov-shop');
  renderMap();
}

function chooseEventOption(choiceKey) {
  if (!G.currentNode || G.currentNode.type !== 'event') return;
  const result = resolveEventChoice(G, G.currentNode, choiceKey, { addLog, selectedEquipmentId: null });
  $('event-body').textContent = result.text;
  $('event-choices').innerHTML = '';
  $('btn-event-confirm').disabled = !result.leave;
  clearEventRelicChoiceUI();
  G.pendingEventEquipmentChoiceKey = null;
  if (result.requiresEquipmentPick) {
    G.pendingEventEquipmentChoiceKey = result.equipmentChoiceKey || choiceKey;
    renderEventEquipmentPicker(result.equipmentIds);
    return;
  }
  if (!result.leave) {
    renderEventChoiceButtons();
  } else {
    const eventId = G.currentNode && G.currentNode.payload ? G.currentNode.payload.eventId : '';
    if (eventId === 'event_2') {
      const options = getPowerRelicOptions(2);
      G.pendingEventRelicOptions = options;
      renderEventRelicChoiceUI(options);
    }
  }
  renderMap();
}

function confirmLeaveEvent() {
  if (G.currentNode && G.currentNode.id) {
    completeMapRoom(G.map, G.currentNode.id);
  }
  G.pendingEventEquipmentChoiceKey = null;
  clearEventRelicChoiceUI();
  closeOverlay('ov-event');
  renderMap();
}

function openCampRoom() {
  if (!G.currentNode || G.currentNode.type !== 'camp') return;
  const heal = 3;
  const before = G.player.hp;
  G.player.hp = Math.min(G.player.maxHp, G.player.hp + heal);
  const actual = G.player.hp - before;
  if (G.currentNode.id) completeMapRoom(G.map, G.currentNode.id);
  $('camp-body').textContent = `你在篝火旁恢复了 ${actual} 点生命。`;
  openOverlay('ov-camp');
  renderMap();
}

function confirmLeaveCamp() {
  closeOverlay('ov-camp');
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
  initGame(selectedClassKey, false);
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
  initGame(selectedClassKey, true);
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

function enterNode(roomId) {
  const node = getRoomById(G.map, roomId);
  if (!node) return;
  if (!G.devMode && !(G.map.availableRoomIds || []).includes(roomId)) return;
  const room = enterMapRoom(G.map, roomId);
  if (!room) return;
  G.currentNode = room;

  resetRoomJi();
  if (room.type === 'shop') {
    if (!room.payload.shopInventory) room.payload.shopInventory = createShopInventoryForRoom(G);
    renderShop();
    renderMap();
    openOverlay('ov-shop');
    return;
  }

  if (room.type === 'camp') {
    openCampRoom();
    return;
  }

  if (room.type === 'event') {
    openEventRoom(room);
    return;
  }

  startBattle(room);
}

function restartBattle() {
  if (!G.battleEntrySnapshot) return;
  const snap = clone(G.battleEntrySnapshot);
  restoreFromBattleSnapshot(snap);
  G.battleEntrySnapshot = clone(snap);
  startBattle(clone(G.currentNode), true);
}

function startBattle(node, keepSnapshot=false) {
  G.currentNode = node;
  G.pendingBattleReward = null;
  clearBattleRewardUI();
  let tigerTriggered = false;
  if (!keepSnapshot && G.abilities.tigerTank && node.type === 'boss') {
    G.player.maxHp += 3;
    G.player.hp += 3;
    tigerTriggered = true;
  }
  if (!keepSnapshot) {
    G.battleEntrySnapshot = clone(G);
  }

  G.enemy = clone(node.payload.enemy);
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
    equipment:createBattleEquipmentState(),
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
  hideHuntRhythmPanel(true);
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
    hideHuntRhythmPanel(true);
    return;
  }

  if (category === 'def' && isDefenseForbiddenByRelic()) return;

  if (category === 'sp') {
    const hasClassSpecial = G.player.classKey === 'mage' || G.player.classKey === 'nsyc' || G.player.classKey === 'dog';
    if (!hasClassSpecial && !G.devMode) return;
    if (G.player.classKey === 'mage' && !G.devMode && isActionBlockedForRound('mage_release')) return;
  }

  document.querySelectorAll('.action-card-btn').forEach((btn) => btn.classList.remove('sel'));
  document.querySelectorAll('.sub-panel').forEach((panel) => panel.classList.remove('show'));

  if (G.ui.mainSel === category) {
    G.ui.mainSel = null;
    hideHuntRhythmPanel(true);
    return;
  }

  G.ui.mainSel = category;
  $(btnMap[category]).classList.add('sel');
  $(panelMap[category]).classList.add('show');
  hideHuntRhythmPanel(true);
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
  updateHuntRhythmPanelForAction(key);
}

function confirmAction() {
  if (!G.ui.actionKey || G.battle.phase !== 'select') return;
  if (isActionBlockedForRound(G.ui.actionKey)) return;
  G.battle.pAction = G.ui.actionKey;
  G.battle.eAction = aiDecide(G.enemy);
  G.battle.phase = 'reveal';
  hideHuntRhythmPanel(false);
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
  hideHuntRhythmPanel(true);
  refreshBars();
}

function endBattle(win) {
  const box = $('ov-battle-box');
  const title = $('ov-battle-title');
  const body = $('ov-battle-body');
  // 清空上次结算文案，避免跨房间复用旧 Boss 名字
  body.innerHTML = '';
  clearRelicChoiceUI();
  clearBattleRewardUI();
  hideHuntRhythmPanel(true);
  G.pendingPowerRelicOptions = [];
  G.pendingBattleReward = null;

  resetRoomJi();

  if (win) {
    box.className = 'overlay-box green';
    title.textContent = '战斗胜利！';
    const node = G.currentNode;
    const reward = buildBattleRewardOptions(G, node);
    G.player.gold = (G.player.gold || 0) + reward.gold;
    applyOnWinEquipmentRewards(G, node && node.payload && node.payload.enemy ? node.payload.enemy.maxHp : 0, { addLog });
    applyPostBattleTagModifiers(G, { addLog });
    G.pendingBattleReward = {
      pickCount: Math.max(0, Number(reward.pickCount || 0)),
      options: Array.isArray(reward.options) ? reward.options : [],
      selectedOptionIds: [],
    };
    renderBattleRewardUI();

    const completeInfo = completeMapRoom(G.map, node.id);
    if (completeInfo.isRunCompleted) G.runWon = true;

    if (node.payload && node.payload.finalBoss) {
      body.innerHTML = `你击败了 <strong style="color:#e07070">${node.payload.enemy.name}</strong>！`;
    } else if (!body.innerHTML) {
      body.innerHTML = `你击败了 <strong style="color:#e07070">${node.payload.enemy.name}</strong>！<br>获得金币 +${reward.gold}。`;
    }

    if (node.payload && node.payload.dropPowerRelic) {
      const options = getPowerRelicOptions(2);
      if (options.length > 0) {
        G.pendingPowerRelicOptions = options;
        renderRelicChoiceUI(options);
      }
    }
  } else {
    box.className = 'overlay-box red';
    title.textContent = '战斗失败';
    applyPostBattleTagModifiers(G, { addLog });
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
  finalizeBattleRewards();
  closeOverlay('ov-battle');
  if (G.player.hp <= 0) {
    showScreen('gameover');
    return;
  }
  if (G.runWon) {
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

function openFeedbackForm() {
  window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer');
}

// ── Intro overlay ─────────────────────────────────────────────────────────────
function openIntro(startKey) {
  const fallbackKey = Object.keys(CLASS_DEFS)[0];
  const singleKey = startKey || selectedClassKey || (G.player && G.player.classKey) || fallbackKey;

  function renderIntroContent(key) {
    const cls = CLASS_DEFS[key];
    if (!cls) return;

    // Single-class mode: hide tabs, only show current class
    $('intro-tabs').innerHTML = '';
    $('intro-tabs').style.display = 'none';

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

    $('intro-content').innerHTML = html;
  }

  renderIntroContent(singleKey);
  openOverlay('ov-intro');
}
function closeIntro() { closeOverlay('ov-intro'); }

function openTechLibrary() {
  renderTechniqueLibrary();
  openOverlay('ov-tech-lib');
}
function closeTechLibrary() { closeOverlay('ov-tech-lib'); }
function openEquipLibrary() {
  renderEquipmentLibrary();
  openOverlay('ov-equip-lib');
}
function closeEquipLibrary() { closeOverlay('ov-equip-lib'); }

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
  $('hunt-rhythm-slider')?.addEventListener('input', () => {
    const slider = $('hunt-rhythm-slider');
    const st = getHuntRhythmState();
    if (!slider || !st) return;
    st.huntRhythmPlannedExtraCount = Math.max(0, Math.floor(Number(slider.value || 0)));
    const action = getActionData(G.ui && G.ui.actionKey, 'player');
    syncHuntRhythmMeta(action);
  });
  $('btn-restart-run-from-gameover').addEventListener('click', restartRun);
  $('btn-restart-run-from-victory').addEventListener('click', restartRun);
  $('btn-feedback-gameover')?.addEventListener('click', openFeedbackForm);
  $('btn-feedback-victory')?.addEventListener('click', openFeedbackForm);
  // Settings placeholder
  $('btn-to-menu-map')?.addEventListener('click', openSettings);
  $('btn-to-menu-battle')?.addEventListener('click', openSettings);
  $('btn-settings-close')?.addEventListener('click', closeSettings);
  $('btn-toggle-devmode')?.addEventListener('click', toggleDeveloperMode);
  $('btn-intro')?.addEventListener('click', () => openIntro());
  $('btn-intro-battle')?.addEventListener('click', () => openIntro(G.player.classKey));
  $('btn-intro-close')?.addEventListener('click', closeIntro);
  $('btn-tech-lib')?.addEventListener('click', openTechLibrary);
  $('btn-tech-lib-close')?.addEventListener('click', closeTechLibrary);
  $('btn-equip-lib')?.addEventListener('click', openEquipLibrary);
  $('btn-equip-lib-close')?.addEventListener('click', closeEquipLibrary);

  // Dev mode: equip/unequip techniques from the library
  $('tech-lib-slots')?.addEventListener('click', (event) => {
    if (!G.devMode) return;
    const equipBtn = event.target.closest('button[data-equip-tech]');
    const unequipBtn = event.target.closest('button[data-unequip-slot]');
    if (equipBtn) {
      const techId = equipBtn.dataset.equipTech;
      if (techId) { equipTechnique(G, techId); renderTechniqueLibrary(); refreshActionLabels(); }
    } else if (unequipBtn) {
      const slot = parseInt(unequipBtn.dataset.unequipSlot, 10);
      if (slot) { unequipTechniqueSlot(G, slot); renderTechniqueLibrary(); refreshActionLabels(); }
    }
  });
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
    const roomId = node.dataset.roomId;
    if (!roomId) return;
    enterNode(roomId);
  });

  const mapViewport = $('map-tree-viewport');
  if (mapViewport) {
    let dragging = false;
    let lastY = 0;
    mapViewport.addEventListener('mousedown', (event) => {
      dragging = true;
      lastY = event.clientY;
      mapViewport.classList.add('dragging');
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      mapViewport.classList.remove('dragging');
    });
    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const dy = event.clientY - lastY;
      mapViewport.scrollTop -= dy;
      lastY = event.clientY;
    });
  }

  $('abtree-nodes').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-unlock]');
    if (!button) return;
    unlockAbility(button.dataset.unlock);
  });

  $('shop-items').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-shop-buy]');
    if (!btn) return;
    const payload = btn.dataset.shopBuy || '';
    const [kind, id] = payload.split(':');
    if (!kind || !id) return;
    buyShopInventoryItem(kind, id);
  });

  $('event-choices')?.addEventListener('click', (event) => {
    const equipBtn = event.target.closest('button[data-event-equip]');
    if (equipBtn) {
      chooseEventEquipment(equipBtn.dataset.eventEquip);
      return;
    }
    const btn = event.target.closest('button[data-event-choice]');
    if (!btn) return;
    chooseEventOption(btn.dataset.eventChoice);
  });
  $('event-relic-options')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-event-relic]');
    if (!btn) return;
    chooseEventRelic(btn.dataset.eventRelic);
  });
  $('btn-event-relic-skip')?.addEventListener('click', () => {
    clearEventRelicChoiceUI();
  });
  $('btn-event-confirm')?.addEventListener('click', confirmLeaveEvent);
  $('btn-camp-confirm')?.addEventListener('click', confirmLeaveCamp);

  $('ov-battle-relic-options')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-choose-relic]');
    if (!btn) return;
    choosePowerRelic(btn.dataset.chooseRelic);
  });

  ['map-equip-slots'].forEach((id) => {
    $(id).addEventListener('click', (event) => {
      const slot = event.target.closest('.equip-slot.filled');
      if (!slot) return;
      const slotIndex = Number(slot.dataset.slotIndex);
      if (!Number.isFinite(slotIndex)) return;
      unequipEquipmentSlot(slotIndex);
    });
  });

  $('ov-battle-reward-options')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-reward-option]');
    if (!btn || !G.pendingBattleReward) return;
    const optionId = btn.dataset.rewardOption;
    const selected = new Set(Array.isArray(G.pendingBattleReward.selectedOptionIds) ? G.pendingBattleReward.selectedOptionIds : []);
    if (selected.has(optionId)) selected.delete(optionId);
    else selected.add(optionId);
    const limit = Math.max(0, Number(G.pendingBattleReward.pickCount || 0));
    if (selected.size > limit) {
      return;
    }
    G.pendingBattleReward.selectedOptionIds = [...selected];
    renderBattleRewardUI();
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

// ── 键盘快捷键 ─────────────────────────────────────────────────────────────────
function handleKeydown(e) {
  // 只在战斗选牌阶段响应；忽略文本输入等场景
  if (!$('screen-battle').classList.contains('active')) return;
  if (!G.battle || G.battle.phase !== 'select') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const key = e.key;

  // Enter → 确认出牌
  if (key === 'Enter') {
    e.preventDefault();
    const btn = $('btn-confirm');
    if (btn && !btn.disabled) confirmAction();
    return;
  }

  // Escape → 关闭子面板（回到主卡选择状态）
  if (key === 'Escape') {
    document.querySelectorAll('.sub-panel').forEach((p) => p.classList.remove('show'));
    document.querySelectorAll('.action-card-btn').forEach((b) => b.classList.remove('sel'));
    G.ui.mainSel = null;
    hideHuntRhythmPanel(true);
    return;
  }

  // 主卡快捷键
  if (key === 'j' || key === 'J') { e.preventDefault(); mainSelect('ji');  return; }
  if (key === 'd' || key === 'D') { e.preventDefault(); mainSelect('def'); return; }
  if (key === 'a' || key === 'A') { e.preventDefault(); mainSelect('atk'); return; }
  if (key === 's' || key === 'S') { e.preventDefault(); mainSelect('sp');  return; }

  // 数字键 → 选择当前展开面板中的子卡
  const num = parseInt(key, 10);
  if (isNaN(num) || num < 1 || num > 7) return;
  const openPanel = document.querySelector('.sub-panel.show');
  if (!openPanel) return;
  e.preventDefault();
  if (openPanel.id === 'sp-def') {
    const map = {1:'defense_0', 2:'defense_1', 3:'defense_2'};
    if (map[num]) subSelect(map[num]);
  } else if (openPanel.id === 'sp-atk') {
    subSelect(`attack_${num}`);
  } else if (openPanel.id === 'sp-special') {
    const options = ['sb-sp1', 'sb-sp2', 'sb-sp-dev']
      .map((id) => $(id))
      .filter((el) => el && el.style.display !== 'none');
    const picked = options[num - 1];
    if (picked) subSelect(picked.dataset.action);
  }
}

function bootstrap() {
  bindStaticEvents();
  document.addEventListener('keydown', handleKeydown);
  initGame();
  applyDeveloperModeToGameState();
  refreshDeveloperModeButton();
}

document.addEventListener('DOMContentLoaded', bootstrap);
