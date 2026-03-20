import { ABILITY_DEFS, MAX_JI_DISPLAY, ORB_META, ORB_KEYS, SHOP_ITEMS } from './data.js';
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
  ABILITY_DEFS.forEach((ab) => {
    if (G.abilities[ab.key]) {
      let name = ab.name;
      if (ab.key === 'savedByBlade' && G.abilities.savedByBladeUsed) name += '（已用）';
      arr.push({icon:ab.icon, name});
    }
  });
  if (G.shop.powerEquip) arr.push({icon:'🧰', name:'一个强化装备'});
  if (G.shop.smoothStone) arr.push({icon:'🪨', name:'光滑的石头'});
  if (G.shop.enhancedBlade) arr.push({icon:'👻⚔', name:'强化鬼刀'});
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
    arr.push({icon:'👑', name:`帝王蓄力 当前 +${G.enemy.chargeValue || 1}Ji`});
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
  const slots = [
    {label:'武器', filled:G.shop.enhancedBlade, text:G.shop.enhancedBlade ? '👻⚔ 强化鬼刀' : '武器槽'},
    {label:'装备', filled:G.shop.powerEquip, text:G.shop.powerEquip ? '🧰 一个强化装备' : '装备槽'},
    {label:'遗物', filled:G.shop.smoothStone, text:G.shop.smoothStone ? '🪨 光滑的石头' : '遗物槽'},
  ];
  slots.forEach((slot) => {
    const div = document.createElement('div');
    div.className = `equip-slot${slot.filled ? ' filled' : ''}`;
    div.textContent = `${slot.label}｜${slot.text}`;
    wrap.appendChild(div);
  });
}

export function renderMap() {
  const p = G.player;
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
    if (node.done) cls += ' done';
    else if (i === G.nodeIdx) cls += ' available';
    div.className = cls;
    div.dataset.nodeIndex = String(i);

    const hint = node.done ? '✓ 已完成' : i === G.nodeIdx ? '点击进入' : '🔒 未解锁';
    const enemyTip = node.enemy ? ` · ${node.enemy.emoji}${node.enemy.name}` : '';
    div.innerHTML = `
      <div class="node-icon">${node.icon}</div>
      <div class="node-name">${node.label}${enemyTip}</div>
      <div class="node-hint">${hint}</div>`;

    wrap.appendChild(div);
  });
}

export function renderAbilityTree() {
  $('abtree-frags').textContent = G.player.fragments;
  const container = $('abtree-nodes');
  container.innerHTML = '';
  ABILITY_DEFS.forEach((ab) => {
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
}

export function renderShop() {
  $('shop-frags').textContent = G.player.fragments;
  const container = $('shop-items');
  container.innerHTML = '';
  SHOP_ITEMS.forEach((item) => {
    const owned = G.shop[item.key];
    const canAfford = G.player.fragments >= item.cost;
    const card = document.createElement('div');
    card.className = `shop-item-card${owned ? ' owned' : ''}${!owned && !canAfford ? ' cant-afford' : ''}`;
    card.innerHTML = `
      <div class="ab-icon">${item.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${item.name}</div>
        <div class="ab-desc">${item.desc}</div>
        <div class="ab-cost">${owned ? '✓ 已购买' : `售价 ${item.cost} ✨碎片${canAfford ? '' : `（当前 ${G.player.fragments}）`}`}</div>
      </div>
      <div class="ab-action">
        ${owned ? '<span class="ab-unlocked-mark">✓ 已拥有</span>' : `<button class="btn-buy" data-buy="${item.key}" ${canAfford ? '' : 'disabled'}>购买</button>`}
      </div>`;
    container.appendChild(card);
  });
}

export function refreshActionLabels() {
  $('ji-rate-hint').textContent = `+${getPlayerJiRate()}Ji`;
  ['defense_0', 'defense_1', 'defense_2'].forEach((key, idx) => {
    const action = getActionData(key, 'player');
    const btn = $(['sb-d0', 'sb-d1', 'sb-d2'][idx]);
    btn.textContent = `${action.emoji} ${action.name} (${action.cost}Ji) | 防御${action.def}`;
  });
  ['attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'].forEach((key, idx) => {
    const action = getActionData(key, 'player');
    const btn = $(`sb-a${idx + 1}`);
    if (btn) btn.textContent = `${action.emoji} ${action.name} (${action.cost}Ji) | 等级${action.atk}`;
  });
}

function setJiDisplay(barId, valId, value, max, hidden) {
  const bar = $(barId);
  const val = $(valId);
  if (hidden) {
    bar.style.width = '100%';
    bar.style.opacity = '0.16';
    bar.style.filter = 'grayscale(1)';
    val.textContent = '??';
    val.style.color = '#777';
    return;
  }
  bar.style.width = `${Math.min((value / max) * 100, 100)}%`;
  bar.style.opacity = '1';
  bar.style.filter = 'none';
  val.textContent = String(value);
  val.style.color = '#aaa';
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
  $('sb-d1').disabled = G.player.ji < getActionData('defense_1', 'player').cost;
  $('sb-d2').disabled = G.player.ji < getActionData('defense_2', 'player').cost;

  ['attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7'].forEach((key, idx) => {
    const btn = $(`sb-a${idx + 1}`);
    const action = getActionData(key, 'player');
    if (btn) btn.disabled = G.player.ji < action.cost;
  });

  $('mb-a2').disabled = !hasAffordable(['attack_4', 'attack_5', 'attack_6']);
  $('mb-a3').disabled = !hasAffordable(['attack_7']);
}

export function refreshBars() {
  const p = G.player;
  const e = G.enemy;
  if (!e) return;
  setBar('b-player-hp-bar', 'b-player-hp-val', p.hp, p.maxHp);
  setBar('b-enemy-hp-bar', 'b-enemy-hp-val', e.hp, e.maxHp);
  const hideJi = isJiHiddenBattle();
  setJiDisplay('b-player-ji-bar', 'b-player-ji-val', p.ji, MAX_JI_DISPLAY, hideJi);
  setJiDisplay('b-enemy-ji-bar', 'b-enemy-ji-val', e.ji, MAX_JI_DISPLAY, hideJi);
  updateSubButtons();
  renderEnemyStateTags();
  renderPassiveTags('battle-passive-tags');
  renderEquipSlots('battle-equip-slots');
}

export function resetRoundUI() {
  const ec = $('enemy-card');
  ec.className = 'card facedown';
  ec.innerHTML = '<div class="card-emoji" style="color:#1e1e30">🂠</div><div class="card-main" style="color:#333">???</div>';
  $('player-card').className = 'card';
  $('pc-emoji').textContent = '　';
  $('pc-main').textContent = '—';
  $('pc-sub').textContent = '';
  document.querySelectorAll('.sub-panel').forEach((panel) => panel.classList.remove('show'));
  document.querySelectorAll('.main-btn').forEach((btn) => btn.classList.remove('sel'));
  document.querySelectorAll('.sub-btn').forEach((btn) => btn.classList.remove('sel'));
  $('sel-preview-text').textContent = '未选择';
  $('btn-confirm').disabled = true;
  $('action-area').style.pointerEvents = 'auto';
  $('round-phase').textContent = '选择行动';
  G.ui = {mainSel:null, actionKey:null};
}

export function addLog(cls, text) {
  const log = $('battle-log');
  const div = document.createElement('div');
  div.className = `log-entry ${cls}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
