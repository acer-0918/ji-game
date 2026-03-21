import { CLASS_DEFS, COMMON_ABILITY_DEFS, MAX_JI_DISPLAY, ORB_META, ORB_KEYS, POWER_RELIC_DEFS, SHOP_ITEMS } from './data.js';
import { G, getPlayerJiRate, isJiHiddenBattle, orbCount, orbUniqueCount } from './state.js';
import { getActionData } from './logic.js';

const $ = (id) => document.getElementById(id);

export function renderBadgeList(id, badges, emptyText='暂无') {
  const wrap = $(id);
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!badges.length) {
    const empty = document.createElement('div');
    empty.className = 'tag-placeholder';
    empty.textContent = emptyText;
    wrap.appendChild(empty);
    return;
  }
  badges.forEach((tag) => {
    const el = document.createElement('span');
    el.className = 'ab-tag';
    el.textContent = `${tag.icon} ${tag.name}`;
    wrap.appendChild(el);
  });
}

export function getPassiveBadges() {
  const arr = [];
  const classDef = CLASS_DEFS[G.player.classKey];
  const allAbilities = [...(classDef ? classDef.abilityDefs : []), ...COMMON_ABILITY_DEFS];
  allAbilities.forEach((ab) => {
    if (G.abilities[ab.key]) {
      let name = ab.name;
      if (ab.key === 'savedByBlade' && G.abilities.savedByBladeUsed) name += '（已用）';
      if (ab.key === 'amane') name += ` (${(G.player.jiSpentTotal || 0) % 8}/8)`;
      arr.push({icon:ab.icon, name});
    }
  });
  if (G.equippedGear === 'powerEquip') arr.push({icon:'🧰', name:'磨刀石'});
  if (G.equippedGear === 'vitalityEquip') arr.push({icon:'❤️‍🩹', name:'不朽馈赠'});
  if (G.shop.enhancedDagger) arr.push({icon:'🗡✨', name:'强化小刀'});
  if (G.shop.enhancedIceBlade) arr.push({icon:'❄️🗡', name:'强化冰刀'});
  if (G.shop.enhancedBlade) arr.push({icon:'👻⚔', name:'强化鬼刀'});
  POWER_RELIC_DEFS.forEach((item) => {
    if (G.powerRelics && G.powerRelics[item.key]) arr.push({icon:item.icon, name:item.name});
  });
  if (G.player.classKey === 'mage') arr.push({icon:'⚡', name:`闪电球 ×${G.player.lightningOrbs || 0}`});
  if (G.player.classKey === 'dog') arr.push({icon:'🍀', name:`幸运值 ×${G.player.luck || 0}`});
  if (G.player.classKey === 'nsyc') {
    arr.push({icon:'🤬', name:`傻逼层数 ×${G.player.shaBiStacks || 0}`});
    if (G.battle && G.battle.ekaiPending) arr.push({icon:'💢', name:'厄介待发'});
  }
  return arr;
}

export function renderPassiveTags(id) {
  renderBadgeList(id, getPassiveBadges(), '暂无');
}

export function getEnemyStateBadges() {
  const arr = [];
  if (!G.enemy) return arr;
  if (G.enemy.id === 'jiaxu') {
    arr.push({icon:'🌫️', name:'无知之幕：双方 Ji 数量隐藏'});
  }
  if (G.enemy.id === 'gufu') {
    arr.push({icon:'👑', name:`野性之心 当前 +${G.enemy.chargeValue || 1}Ji`});
  }
  if (G.enemy.id === 'faultRobot') {
    arr.push({icon:'🧪', name:`充能球图谱 ${orbUniqueCount(G.enemy)}/5`});
    ORB_KEYS.forEach((k) => {
      const c = orbCount(G.enemy, k);
      if (c > 0) arr.push({icon:ORB_META[k].icon, name:`${ORB_META[k].name} ×${c}`});
    });
    if (!arr.some((x) => x.name.includes('×'))) arr.push({icon:'🤖', name:'尚未生成任何充能球'});
  }
  return arr;
}

export function renderEnemyStateTags() {
  renderBadgeList('enemy-state-tags', getEnemyStateBadges(), '无特殊效果');
}

export function renderEquipSlots(id) {
  const wrap = $(id);
  if (!wrap) return;
  wrap.innerHTML = '';
  const gearMeta = {
    powerEquip: {icon:'🧰', name:'磨刀石'},
    vitalityEquip: {icon:'❤️‍🩹', name:'不朽馈赠'},
  };
  const equipped = G.equippedGear ? gearMeta[G.equippedGear] : null;
  const slot = document.createElement('div');
  const filled = !!equipped;
  slot.className = `equip-slot${filled ? ' filled clickable' : ''}`;
  slot.dataset.slot = 'gear';
  slot.textContent = filled ? `装备槽｜${equipped.icon} ${equipped.name}` : '装备槽｜空';
  wrap.appendChild(slot);
}

export function renderMap() {
  const p = G.player;
  const devMode = !!G.devMode;
  $('map-name').textContent = `${p.classIcon || '🧙'} ${p.name}`;
  $('map-hp').textContent = p.hp;
  $('map-maxhp').textContent = p.maxHp;
  $('map-ji').textContent = p.ji;
  $('map-frags').textContent = p.fragments;
  $('map-rate').textContent = getPlayerJiRate();

  renderPassiveTags('map-passive-tags');
  renderEquipSlots('map-equip-slots');

  const wrap = $('nodes-wrap');
  wrap.innerHTML = '';

  G.nodes.forEach((node, i) => {
    if (i > 0) {
      const line = document.createElement('div');
      line.className = 'node-line';
      wrap.appendChild(line);
    }

    const div = document.createElement('div');
    let cls = 'map-node';
    if (node.type === 'boss') cls += ' boss-node';
    if (node.type === 'shop') cls += ' shop-node';
    if (!devMode && node.done) cls += ' done';
    else if (devMode || i === G.nodeIdx) cls += ' available';
    div.className = cls;
    div.dataset.nodeIndex = String(i);

    const hint = devMode
      ? '开发者模式：点击进入'
      : node.done
        ? '✓ 已完成'
        : i === G.nodeIdx
          ? '点击进入'
          : '🔒 未解锁';
    const enemyTip = node.enemy ? ` · ${node.enemy.emoji}${node.enemy.name}` : '';
    div.innerHTML = `
      <div class="node-icon">${node.icon}</div>
      <div class="node-name">${node.label}${enemyTip}</div>
      <div class="node-hint">${hint}</div>`;

    wrap.appendChild(div);
  });
}

export function renderAbilityTree() {
  const classDef = CLASS_DEFS[G.player.classKey];
  const title = $('abtree-title');
  if (title) title.textContent = `✨ 能力树 · ${classDef ? classDef.name : '职业'}`;
  $('abtree-frags').textContent = G.player.fragments;
  const container = $('abtree-nodes');
  container.innerHTML = '';
  const sections = [
    {title:`${classDef ? classDef.name : '职业'}专属能力`, defs: classDef ? classDef.abilityDefs : []},
    {title:'通用能力', defs: COMMON_ABILITY_DEFS},
  ];

  sections.forEach((section) => {
    const head = document.createElement('div');
    head.className = 'ab-section-title';
    head.textContent = section.title;
    container.appendChild(head);

    section.defs.forEach((ab) => {
    const unlocked = G.abilities[ab.key];
    const canAfford = G.player.fragments >= ab.cost;
    const card = document.createElement('div');
    card.className = `ab-node-card${unlocked ? ' unlocked' : ''}${!unlocked && !canAfford ? ' cant-afford' : ''}`;
    const usedNote = ab.key === 'savedByBlade' && G.abilities.savedByBladeUsed ? ' <span style="color:#555;font-size:.75em">（本局已用）</span>' : '';
    card.innerHTML = `
      <div class="ab-icon">${ab.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${ab.name}${usedNote}</div>
        <div class="ab-desc">${ab.desc}</div>
        <div class="ab-cost">${unlocked ? '✓ 已解锁' : `需要 ${ab.cost} ✨碎片${canAfford ? '' : `（当前 ${G.player.fragments}）`}`}</div>
      </div>
      <div class="ab-action">
        ${unlocked ? '<span class="ab-unlocked-mark">✓ 已激活</span>' : `<button class="btn-unlock" data-unlock="${ab.key}" ${canAfford ? '' : 'disabled'}>解锁</button>`}
      </div>`;
    container.appendChild(card);
    });
  });
}

export function renderShop() {
  $('shop-frags').textContent = G.player.fragments;
  const container = $('shop-items');
  container.innerHTML = '';
  SHOP_ITEMS.forEach((item) => {
    const owned = G.shop[item.key];
    const canAfford = G.player.fragments >= item.cost;
    const blockedByGearSlot = item.slot === 'gear' && !!G.equippedGear && G.equippedGear !== item.key;
    const card = document.createElement('div');
    card.className = `shop-item-card${owned ? ' owned' : ''}${!owned && (!canAfford || blockedByGearSlot) ? ' cant-afford' : ''}`;
    const canBuy = !owned && canAfford && !blockedByGearSlot;
    const costText = owned
      ? '✓ 已购买'
      : blockedByGearSlot
        ? '装备栏已满（请先卸下当前装备）'
        : `售价 ${item.cost} ✨碎片${canAfford ? '' : `（当前 ${G.player.fragments}）`}`;
    card.innerHTML = `
      <div class="ab-icon">${item.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${item.name}</div>
        <div class="ab-desc">${item.desc}</div>
        <div class="ab-cost">${costText}</div>
      </div>
      <div class="ab-action">
        ${owned ? '<span class="ab-unlocked-mark">✓ 已拥有</span>' : `<button class="btn-buy" data-buy="${item.key}" ${canBuy ? '' : 'disabled'}>购买</button>`}
      </div>`;
    container.appendChild(card);
  });
}

function setSubCardLabel(btn, costText, nameText, hintText) {
  // Update the child elements of a sub-card without destroying its structure
  if (!btn) return;
  const costEl = btn.querySelector('.sub-card-cost');
  const nameEl = btn.querySelector('.sub-card-name');
  const hintEl = btn.querySelector('.sub-card-hint');
  if (costEl && costText !== undefined) costEl.textContent = costText;
  if (nameEl && nameText !== undefined) nameEl.textContent = nameText;
  if (hintEl && hintText !== undefined) hintEl.textContent = hintText;
}

export function refreshActionLabels() {
  $('ji-rate-hint').textContent = `+${getPlayerJiRate()}Ji`;
  ['defense_0', 'defense_1', 'defense_2'].forEach((key, idx) => {
    const action = getActionData(key, 'player');
    const btn = $(['sb-d0', 'sb-d1', 'sb-d2'][idx]);
    setSubCardLabel(btn, `${action.cost}`, action.name, `防御${action.def}`);
  });
  ['attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'].forEach((key, idx) => {
    const action = getActionData(key, 'player');
    const btn = $(`sb-a${idx + 1}`);
    setSubCardLabel(btn, `${action.cost}`, action.name, `等级${action.atk}`);
  });

  const specialMain = $('mb-sp');
  const specialPanel = $('sp-special');
  const spHint = $('sp-hint');
  const sp1 = $('sb-sp1');
  const sp2 = $('sb-sp2');
  if (G.player.classKey === 'mage') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    const release = getActionData('mage_release', 'player');
    if (spHint) spHint.textContent = `持有${G.player.lightningOrbs || 0}球`;
    setSubCardLabel(sp1, `${release.orbCost}⚡`, release.name, `等级${release.atk}·持有${G.player.lightningOrbs || 0}`);
  } else if (G.player.classKey === 'nsyc') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = 'none';
    if (sp2) sp2.style.display = '';
    const stacks = G.player.shaBiStacks || 0;
    if (spHint) spHint.textContent = `傻逼${stacks}层`;
    setSubCardLabel(sp2, `3🤬`, '厄介', `持有${stacks}层`);
  } else if (G.player.classKey === 'dog') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    const luck = G.player.luck || 0;
    if (spHint) spHint.textContent = `幸运值 ${luck}`;
    setSubCardLabel(sp1, '🍀', '幸运值', `当前${luck}`);
  } else {
    if (specialMain) specialMain.style.display = 'none';
    if (specialPanel) specialPanel.style.display = 'none';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    if (spHint) spHint.textContent = '职业技能';
  }
}

function setJiDisplay(barId, valId, value, max, hidden) {
  const bar = $(barId);
  const val = $(valId);
  if (hidden) {
    bar.style.width = '100%';
    bar.style.opacity = '0.16';
    bar.style.filter = 'grayscale(1)';
    val.textContent = '??';
    val.style.color = 'var(--text-lt)';
    return;
  }
  bar.style.width = `${Math.min((value / max) * 100, 100)}%`;
  bar.style.opacity = '1';
  bar.style.filter = 'none';
  val.textContent = String(value);
  val.style.color = 'var(--text-mid)';
}

function setBar(barId, valId, cur, max) {
  const ratio = max > 0 ? Math.max(0, cur / max * 100) : 0;
  $(barId).style.width = `${ratio}%`;
  $(valId).textContent = `${Math.max(0, cur)}/${max}`;
}

function hasAffordable(keys) {
  return keys.some((key) => {
    const action = getActionData(key, 'player');
    return action && action.cost <= G.player.ji;
  });
}

export function updateSubButtons() {
  const blocked = new Set((G.battle && G.battle.roundDisabledActions) || []);
  const defenseForbidden = !!(G.powerRelics && G.powerRelics.possibleReunion);
  $('sb-d0').disabled = defenseForbidden || blocked.has('defense_0');
  $('sb-d1').disabled = defenseForbidden || blocked.has('defense_1') || G.player.ji < getActionData('defense_1', 'player').cost;
  $('sb-d2').disabled = defenseForbidden || blocked.has('defense_2') || G.player.ji < getActionData('defense_2', 'player').cost;

  ['attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'].forEach((key, idx) => {
    const btn = $(`sb-a${idx + 1}`);
    const action = getActionData(key, 'player');
    if (btn) btn.disabled = blocked.has(key) || G.player.ji < action.cost;
  });

  // Disable the combined attack card if no attacks affordable
  const atkCard = $('mb-atk');
  if (atkCard) atkCard.disabled = !['attack_1','attack_2','attack_3','attack_4','attack_5','attack_6','attack_7'].some((key) => {
    if (blocked.has(key)) return false;
    const action = getActionData(key, 'player');
    return action && action.cost <= G.player.ji;
  });
  const jiCard = $('mb-ji');
  if (jiCard) jiCard.disabled = blocked.has('ji');
  const defCard = $('mb-def');
  if (defCard) defCard.disabled = defenseForbidden || ['defense_0','defense_1','defense_2'].every((key) => {
    if (blocked.has(key)) return true;
    const action = getActionData(key, 'player');
    return action.cost > G.player.ji;
  });
  // Legacy buttons (hidden but keep JS happy)
  const a2 = $('mb-a2'); if (a2) a2.disabled = !['attack_4', 'attack_5', 'attack_6'].some((key) => !blocked.has(key) && getActionData(key, 'player').cost <= G.player.ji);
  const a3 = $('mb-a3'); if (a3) a3.disabled = blocked.has('attack_7') || !hasAffordable(['attack_7']);

  const specialMain = $('mb-sp');
  const sp1Btn = $('sb-sp1');
  const sp2Btn = $('sb-sp2');
  if (G.player.classKey === 'mage') {
    const release = getActionData('mage_release', 'player');
    const canRelease = !!release && !release.disabledByOrbs && !blocked.has('mage_release');
    specialMain.disabled = !canRelease;
    if (sp1Btn) sp1Btn.disabled = !canRelease;
    if (sp2Btn) sp2Btn.disabled = true;
  } else if (G.player.classKey === 'nsyc') {
    const ekai = getActionData('ekai', 'player');
    const canEkai = !!ekai && !ekai.disabledByOrbs;
    specialMain.disabled = !canEkai;
    if (sp1Btn) sp1Btn.disabled = true;
    if (sp2Btn) sp2Btn.disabled = !canEkai;
  } else if (G.player.classKey === 'dog') {
    specialMain.disabled = true;
    if (sp1Btn) sp1Btn.disabled = true;
    if (sp2Btn) sp2Btn.disabled = true;
  } else {
    specialMain.disabled = true;
    if (sp1Btn) sp1Btn.disabled = true;
    if (sp2Btn) sp2Btn.disabled = true;
  }
}

export function refreshBars() {
  const p = G.player;
  const e = G.enemy;
  if (!e) return;
  refreshActionLabels();
  setBar('b-player-hp-bar', 'b-player-hp-val', p.hp, p.maxHp);
  setBar('b-enemy-hp-bar', 'b-enemy-hp-val', e.hp, e.maxHp);
  const hideJi = isJiHiddenBattle();
  setJiDisplay('b-player-ji-bar', 'b-player-ji-val', p.ji, MAX_JI_DISPLAY, hideJi);
  setJiDisplay('b-enemy-ji-bar', 'b-enemy-ji-val', e.ji, MAX_JI_DISPLAY, hideJi);
  // Ji pip display in action area
  updateJiPips(hideJi ? 0 : p.ji);
  const rateEl = $('ji-display-rate');
  if (rateEl) rateEl.textContent = `+${getPlayerJiRate()}/回`;
  // Player avatar emoji
  const avatarEl = $('b-player-emoji');
  if (avatarEl) avatarEl.textContent = p.classIcon || '🗡️';
  updateSubButtons();
  renderEnemyStateTags();
  renderPassiveTags('battle-passive-tags');
  renderEquipSlots('battle-equip-slots');
}

export function resetRoundUI() {
  const ec = $('enemy-card');
  ec.className = 'reveal-card facedown';
  ec.innerHTML = '<div class="ac-emoji">🂠</div><div class="ac-name">???</div><div class="ac-sub"></div>';
  $('player-card').className = 'reveal-card';
  $('pc-emoji').textContent = '　';
  $('pc-main').textContent = '—';
  $('pc-sub').textContent = '';
  document.querySelectorAll('.sub-panel').forEach((panel) => panel.classList.remove('show'));
  document.querySelectorAll('.action-card-btn').forEach((btn) => btn.classList.remove('sel'));
  document.querySelectorAll('.sub-btn').forEach((btn) => btn.classList.remove('sel'));
  $('sel-preview-text').textContent = '未选择';
  $('btn-confirm').disabled = true;
  $('action-area').style.pointerEvents = 'auto';
  $('round-phase').textContent = '选择行动';
  G.ui = {mainSel:null, actionKey:null};
}

function updateJiPips(value) {
  const container = $('ji-pips');
  const numEl = $('ji-display-num');
  if (!container) return;
  const MAX_PIPS = 12;
  const shown = Math.min(value, MAX_PIPS);
  container.innerHTML = '';
  for (let i = 0; i < Math.min(MAX_PIPS, Math.max(shown + 2, 7)); i++) {
    const pip = document.createElement('div');
    pip.className = 'ji-pip' + (i < shown ? ' active' : '');
    container.appendChild(pip);
  }
  if (numEl) numEl.textContent = value;
}

export function addLog(cls, text) {
  const log = $('battle-log');
  const div = document.createElement('div');
  div.className = `log-entry ${cls}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
