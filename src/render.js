import { CLASS_DEFS, MAX_JI_DISPLAY, ORB_META, ORB_KEYS, POWER_RELIC_DEFS, SHOP_ITEMS } from './data.js';
import { G, getPlayerJiRate, isJiHiddenBattle, orbCount, orbUniqueCount } from './state.js';
import { getActionData } from './logic.js';
import { TECH_DEFS, getTechDefsForSlot, getTechniqueCategoryLabel } from './battleTechniques.js';
import { getEquipmentCardArtPath } from './equipment/art.js';
import { EQUIPMENT_DEFS, getEquipmentDef } from './equipment/defs.js';
import { getMapNodeArtPath } from './map/art.js';
import {
  getEquipmentIdInSlot,
  getEquipmentTagDefForItem,
  getEquipmentTagText,
  getEquippedEquipmentIds,
} from './equipment/runtime.js';

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
    el.className = `ab-tag${tag.detail ? ' detail-target' : ''}`;
    el.textContent = `${tag.icon} ${tag.name}`;
    if (tag.detail) {
      el.dataset.detailTitle = `${tag.icon} ${tag.name}`;
      el.dataset.detail = tag.detail;
    }
    wrap.appendChild(el);
  });
}

export function getPassiveBadges() {
  const arr = [];
  const classDef = CLASS_DEFS[G.player.classKey];
  const allAbilities = classDef ? [...classDef.abilityDefs] : [];
  allAbilities.forEach((ab) => {
    if (G.abilities[ab.key]) {
      let name = ab.name;
      if (ab.key === 'savedByBlade' && G.abilities.savedByBladeUsed) name += '（已用）';
      if (ab.key === 'amane') name += ` (${(G.player.jiSpentTotal || 0) % 8}/8)`;
      arr.push({icon:ab.icon, name, detail:ab.desc || ''});
    }
  });
  getEquippedEquipmentIds(G).forEach((equipmentId) => {
    const def = getEquipmentDef(equipmentId);
    if (!def) return;
    const tagDef = getEquipmentTagDefForItem(G, equipmentId);
    const tagText = tagDef ? ` · ${tagDef.name}` : '';
    const detail = tagDef
      ? `${def.desc}\n当前词条：${tagDef.name}\n词条效果：${tagDef.desc}`
      : `${def.desc}\n当前词条：无`;
    arr.push({ icon: def.icon, name: `${def.name}${tagText}`, detail });
  });
  if (G.shop.enhancedDagger) {
    const item = SHOP_ITEMS.find((x) => x.key === 'enhancedDagger');
    arr.push({icon:'🗡✨', name:'强化小刀', detail:item ? item.desc : ''});
  }
  if (G.shop.enhancedIceBlade) {
    const item = SHOP_ITEMS.find((x) => x.key === 'enhancedIceBlade');
    arr.push({icon:'❄️🗡', name:'强化冰刀', detail:item ? item.desc : ''});
  }
  if (G.shop.enhancedBlade) {
    const item = SHOP_ITEMS.find((x) => x.key === 'enhancedBlade');
    arr.push({icon:'👻⚔', name:'强化鬼刀', detail:item ? item.desc : ''});
  }
  POWER_RELIC_DEFS.forEach((item) => {
    if (G.powerRelics && G.powerRelics[item.key]) arr.push({icon:item.icon, name:item.name, detail:item.desc});
  });
  if (G.player.classKey === 'mage') arr.push({icon:'⚡', name:`闪电球 ×${G.player.lightningOrbs || 0}`, detail:'法师资源：用于释放一重释放。'});
  if (G.player.classKey === 'dog') arr.push({icon:'🍀', name:`幸运值 ×${G.player.luck || 0}`, detail:'小狗资源：影响幸运回复与幸运蓄力触发率。'});
  if (G.player.classKey === 'nsyc') {
    arr.push({icon:'🤬', name:`傻逼层数 ×${G.player.shaBiStacks || 0}`, detail:'nsyc 资源：用于释放厄介。'});
    if (G.battle && G.battle.ekaiPending) arr.push({icon:'💢', name:'厄介待发', detail:'厄介已蓄势，将在下回合开始时结算伤害。'});
  }
  // 已装备战技
  if (G.techniques) {
    for (let slot = 1; slot <= 7; slot++) {
      const id = G.techniques[slot];
      const def = id && TECH_DEFS[id];
      if (def) arr.push({
        icon: def.emoji,
        name: `${def.name}（${slot}）`,
        detail: `类别：${getTechniqueCategoryLabel(def)}\n${def.desc || ''}`,
      });
    }
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
  const allowUnequip = id === 'map-equip-slots';
  for (let slotIndex = 0; slotIndex < 2; slotIndex++) {
    const equipmentId = getEquipmentIdInSlot(G, slotIndex);
    const def = equipmentId ? getEquipmentDef(equipmentId) : null;
    const slot = document.createElement('div');
    const filled = !!def;
    slot.className = `equip-slot${filled ? ` filled${allowUnequip ? ' clickable' : ''}` : ''}${filled ? ' detail-target' : ''}`;
    slot.dataset.slotIndex = String(slotIndex);
    if (!filled) {
      slot.textContent = `装备槽${slotIndex + 1}｜空`;
      wrap.appendChild(slot);
      continue;
    }

    const tagLine = getEquipmentTagText(G, equipmentId);
    const tagDef = getEquipmentTagDefForItem(G, equipmentId);
    const detail = tagDef
      ? `${def.desc}\n当前词条：${tagDef.name}\n词条效果：${tagDef.desc}`
      : `${def.desc}\n当前词条：无`;
    slot.dataset.detailTitle = `${def.icon} ${def.name}`;
    slot.dataset.detail = detail;
    const artPath = getEquipmentCardArtPath(equipmentId);
    slot.innerHTML = `
      <img class="equip-slot-art" src="${artPath}" alt="${def.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">
      <span class="equip-slot-fallback" style="display:none">${def.icon}</span>
      <span class="equip-slot-name">${def.name}</span>
      <span class="equip-slot-tag">${tagLine}</span>`;
    wrap.appendChild(slot);
  }
}

export function renderMap() {
  const p = G.player;
  const map = G.map;
  $('map-name').textContent = `${p.classIcon || '🧙'} ${p.name}`;
  $('map-hp').textContent = p.hp;
  $('map-maxhp').textContent = p.maxHp;
  $('map-ji').textContent = p.ji;
  $('map-frags').textContent = p.fragments;
  $('map-gold').textContent = p.gold || 0;
  $('map-rate').textContent = getPlayerJiRate();

  renderPassiveTags('map-passive-tags');
  renderEquipSlots('map-equip-slots');

  const wrap = $('nodes-wrap');
  const svg = $('map-tree-lines');
  const viewport = $('map-tree-viewport');
  wrap.innerHTML = '';
  if (svg) svg.innerHTML = '';
  if (!map || !Array.isArray(map.floors)) return;

  const isNarrowScreen = window.matchMedia('(max-width: 680px)').matches;
  const X_GAP = isNarrowScreen ? 158 : 210;
  const Y_GAP = isNarrowScreen ? 136 : 150;
  const MARGIN_X = 160;
  const MARGIN_Y = 100;
  const coords = {};

  map.floors.forEach((floorDef, floorIdx) => {
    const roomIds = floorDef.roomIds || [];
    const rowWidth = Math.max(1, roomIds.length - 1) * X_GAP;
    const baseCenter = isNarrowScreen ? 260 : 380;
    const baseX = Math.max(70, MARGIN_X + (baseCenter - rowWidth) / 2);
    const y = MARGIN_Y + floorIdx * Y_GAP;
    roomIds.forEach((roomId, idx) => {
      coords[roomId] = { x: baseX + idx * X_GAP, y };
    });
  });

  const maxX = Math.max(...Object.values(coords).map((c) => c.x), 760) + 240;
  const maxY = Math.max(...Object.values(coords).map((c) => c.y), 900) + 220;
  wrap.style.width = `${maxX}px`;
  wrap.style.minHeight = `${maxY}px`;
  if (svg) {
    svg.setAttribute('width', `${maxX}`);
    svg.setAttribute('height', `${maxY}`);
  }

  // Draw connecting lines
  if (svg) {
    Object.values(map.roomsById).forEach((room) => {
      const from = coords[room.id];
      if (!from) return;
      room.connections.forEach((childId) => {
        const to = coords[childId];
        if (!to) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const c1x = from.x;
        const c1y = from.y + 58;
        const c2x = to.x;
        const c2y = to.y - 58;
        path.setAttribute('d', `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`);
        path.setAttribute('stroke', 'rgba(156,111,222,0.35)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      });
    });
  }

  Object.values(map.roomsById).forEach((node) => {
    const pos = coords[node.id];
    if (!pos) return;
    const div = document.createElement('div');
    let cls = 'map-node';
    if (node.type === 'boss') cls += ' boss-node';
    if (node.type === 'shop') cls += ' shop-node';
    if (node.cleared) cls += ' done';
    else if (G.devMode || (map.availableRoomIds || []).includes(node.id)) cls += ' available';
    div.className = cls;
    div.dataset.roomId = node.id;
    div.style.position = 'absolute';
    div.style.left = `${pos.x}px`;
    div.style.top = `${pos.y}px`;
    div.style.transform = 'translate(-50%, -50%)';

    const hint = G.devMode
      ? '开发者模式：点击进入'
      : node.cleared
        ? '✓ 已完成'
        : (map.availableRoomIds || []).includes(node.id)
          ? '点击进入'
          : '🔒 未解锁';
    const enemyTip = node.payload && node.payload.enemy ? ` · ${node.payload.enemy.emoji}${node.payload.enemy.name}` : '';
    const icon = node.type === 'battle' ? '👹'
      : node.type === 'elite' ? '⚔️'
      : node.type === 'event' ? '❓'
      : node.type === 'camp' ? '🔥'
      : node.type === 'shop' ? '🛒'
      : node.type === 'boss' ? '👑'
      : '❔';
    const artPath = getMapNodeArtPath(node.type);
    div.innerHTML = `
      <div class="node-icon-wrap">
        <img class="node-art" src="${artPath}" alt="${node.label}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">
        <div class="node-icon" style="display:none">${icon}</div>
      </div>
      <div class="node-name">${node.label}${enemyTip}</div>
      <div class="node-hint">${hint}</div>`;

    wrap.appendChild(div);
  });

  if (viewport && !viewport.dataset.scrolledToStart) {
    viewport.scrollTop = 0;
    viewport.dataset.scrolledToStart = '1';
  }
}

export function renderAbilityTree() {
  const classDef = CLASS_DEFS[G.player.classKey];
  const title = $('abtree-title');
  if (title) title.textContent = `✨ 能力树 · ${classDef ? classDef.name : '职业'}`;
  $('abtree-frags').textContent = G.player.fragments;
  const container = $('abtree-nodes');
  container.innerHTML = '';
  const defs = classDef ? classDef.abilityDefs : [];
  const isLinearTree = !classDef || classDef.abilityTreeLinear !== false;
  const head = document.createElement('div');
  head.className = 'ab-section-title';
  head.textContent = `${classDef ? classDef.name : '职业'}能力`;
  container.appendChild(head);

  defs.forEach((ab, idx) => {
    const unlocked = G.abilities[ab.key];
    const canAfford = G.player.fragments >= ab.cost;
    const prevLocked = isLinearTree && idx > 0 && !G.abilities[defs[idx - 1].key];
    const locked = !unlocked && prevLocked;
    const card = document.createElement('div');
    card.className = `ab-node-card${unlocked ? ' unlocked' : ''}${!unlocked && !canAfford && !locked ? ' cant-afford' : ''}${locked ? ' cant-afford' : ''}`;
    const usedNote = ab.key === 'savedByBlade' && G.abilities.savedByBladeUsed ? ' <span style="color:#555;font-size:.75em">（本局已用）</span>' : '';
    let costText, actionHtml;
    if (unlocked) {
      costText = '✓ 已解锁';
      actionHtml = '<span class="ab-unlocked-mark">✓ 已激活</span>';
    } else if (locked) {
      costText = '🔒 需先解锁上一节点';
      actionHtml = '<button class="btn-unlock" disabled>🔒 锁定</button>';
    } else {
      costText = `需要 ${ab.cost} ✨碎片${canAfford ? '' : `（当前 ${G.player.fragments}）`}`;
      actionHtml = `<button class="btn-unlock" data-unlock="${ab.key}" ${canAfford ? '' : 'disabled'}>解锁</button>`;
    }
    card.innerHTML = `
      <div class="ab-icon">${ab.icon}</div>
      <div class="ab-info">
        <div class="ab-name">${ab.name}${usedNote}</div>
        <div class="ab-desc">${ab.desc}</div>
        <div class="ab-cost">${costText}</div>
      </div>
      <div class="ab-action">${actionHtml}</div>`;
    container.appendChild(card);
  });
}

export function renderShop() {
  $('shop-gold').textContent = G.player.gold || 0;
  const container = $('shop-items');
  container.innerHTML = '';
  const room = G.currentNode;
  const inventory = room && room.payload ? room.payload.shopInventory : null;
  if (!inventory) {
    const empty = document.createElement('div');
    empty.className = 'tag-placeholder';
    empty.textContent = '当前商店暂无货物。';
    container.appendChild(empty);
    return;
  }

  const equippedIds = getEquippedEquipmentIds(G);
  const fullSlots = equippedIds.length >= 2;
  const allItems = [
    ...inventory.equipment,
    ...inventory.techniques,
    inventory.fragment,
  ].filter(Boolean);

  allItems.forEach((item) => {
    const card = document.createElement('div');
    const canAfford = (G.player.gold || 0) >= item.price;
    const canBuy = !item.purchased && canAfford;
    card.className = `shop-item-card${item.purchased ? ' owned' : ''}${!item.purchased && !canAfford ? ' cant-afford' : ''}`;

    if (item.kind === 'equipment') {
      const def = getEquipmentDef(item.id);
      if (!def) return;
      const tagLine = getEquipmentTagText(G, item.id);
      const tagDef = getEquipmentTagDefForItem(G, item.id);
      const equipBlocked = fullSlots && !equippedIds.includes(item.id);
      const allowed = canBuy && !equipBlocked;
      card.innerHTML = `
        <div class="ab-icon equip-shop-icon">
          <img class="shop-equip-art" src="${getEquipmentCardArtPath(item.id)}" alt="${def.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">
          <span class="shop-equip-fallback" style="display:none">${def.icon}</span>
        </div>
        <div class="ab-info">
          <div class="ab-name">${def.name}</div>
          <div class="ab-desc">${def.desc}</div>
          <div class="ab-desc">${tagLine}${tagDef ? `（${tagDef.desc}）` : ''}</div>
          <div class="ab-cost">售价 ${item.price} 金币${canAfford ? '' : `（当前 ${G.player.gold || 0}）`}${equipBlocked ? ' · 装备栏已满' : ''}</div>
        </div>
        <div class="ab-action">
          ${item.purchased ? '<span class="ab-unlocked-mark">✓ 已购买</span>' : `<button class="btn-buy" data-shop-buy="${item.kind}:${item.id}" ${allowed ? '' : 'disabled'}>购买</button>`}
        </div>`;
      container.appendChild(card);
      return;
    }

    if (item.kind === 'technique') {
      const def = TECH_DEFS[item.id];
      if (!def) return;
      const category = getTechniqueCategoryLabel(def);
      const equippedId = G.techniques ? G.techniques[def.slot] : null;
      const equippedDef = equippedId && TECH_DEFS[equippedId] ? TECH_DEFS[equippedId] : null;
      const replaceHint = equippedDef
        ? `购买后替换：${equippedDef.name} → ${def.name}`
        : `购买后装备到攻击${def.slot}类（替换基础攻击）`;
      card.innerHTML = `
        <div class="ab-icon">${def.emoji}</div>
        <div class="ab-info">
          <div class="ab-name">${def.name}</div>
          <div class="ab-desc">类别：${category}</div>
          <div class="ab-desc replace-hint">${replaceHint}</div>
          <div class="ab-desc">${def.desc}</div>
          <div class="ab-cost">售价 ${item.price} 金币${canAfford ? '' : `（当前 ${G.player.gold || 0}）`}</div>
        </div>
        <div class="ab-action">
          ${item.purchased ? '<span class="ab-unlocked-mark">✓ 已购买</span>' : `<button class="btn-buy" data-shop-buy="${item.kind}:${item.id}" ${canBuy ? '' : 'disabled'}>购买</button>`}
        </div>`;
      container.appendChild(card);
      return;
    }

    card.innerHTML = `
      <div class="ab-icon">✨</div>
      <div class="ab-info">
        <div class="ab-name">能力碎片</div>
        <div class="ab-desc">用于能力树解锁。</div>
        <div class="ab-cost">售价 ${item.price} 金币${canAfford ? '' : `（当前 ${G.player.gold || 0}）`}</div>
      </div>
      <div class="ab-action">
        ${item.purchased ? '<span class="ab-unlocked-mark">✓ 已购买</span>' : `<button class="btn-buy" data-shop-buy="${item.kind}:${item.id}" ${canBuy ? '' : 'disabled'}>购买</button>`}
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
    const hintText = action.def > 0 ? `等级${action.atk}·防${action.def}` : `等级${action.atk}`;
    setSubCardLabel(btn, `${action.cost}`, action.name, hintText);
  });

  const specialMain = $('mb-sp');
  const specialPanel = $('sp-special');
  const spHint = $('sp-hint');
  const sp1 = $('sb-sp1');
  const sp2 = $('sb-sp2');
  const spDev = $('sb-sp-dev');
  const showDevSpecial = !!G.devMode;
  if (G.player.classKey === 'mage') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    if (spDev) spDev.style.display = showDevSpecial ? '' : 'none';
    const release = getActionData('mage_release', 'player');
    if (spHint) spHint.textContent = `持有${G.player.lightningOrbs || 0}球`;
    setSubCardLabel(sp1, `${release.orbCost}⚡`, release.name, `等级${release.atk}·持有${G.player.lightningOrbs || 0}`);
    if (showDevSpecial) setSubCardLabel(spDev, 'DEV', '三军听令', '敌方立刻归零');
  } else if (G.player.classKey === 'nsyc') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = 'none';
    if (sp2) sp2.style.display = '';
    if (spDev) spDev.style.display = showDevSpecial ? '' : 'none';
    const stacks = G.player.shaBiStacks || 0;
    if (spHint) spHint.textContent = `傻逼${stacks}层`;
    setSubCardLabel(sp2, `3🤬`, '厄介', `持有${stacks}层`);
    if (showDevSpecial) setSubCardLabel(spDev, 'DEV', '三军听令', '敌方立刻归零');
  } else if (G.player.classKey === 'dog') {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    if (spDev) spDev.style.display = showDevSpecial ? '' : 'none';
    const luck = G.player.luck || 0;
    if (spHint) spHint.textContent = `幸运值 ${luck}`;
    setSubCardLabel(sp1, '🍀', '幸运值', `当前${luck}`);
    if (showDevSpecial) setSubCardLabel(spDev, 'DEV', '三军听令', '敌方立刻归零');
  } else if (showDevSpecial) {
    if (specialMain) specialMain.style.display = '';
    if (specialPanel) specialPanel.style.display = '';
    if (sp1) sp1.style.display = 'none';
    if (sp2) sp2.style.display = 'none';
    if (spDev) spDev.style.display = '';
    if (spHint) spHint.textContent = '开发者行动';
    setSubCardLabel(spDev, 'DEV', '三军听令', '敌方立刻归零');
  } else {
    if (specialMain) specialMain.style.display = 'none';
    if (specialPanel) specialPanel.style.display = 'none';
    if (sp1) sp1.style.display = '';
    if (sp2) sp2.style.display = 'none';
    if (spDev) spDev.style.display = 'none';
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
  const spDevBtn = $('sb-sp-dev');
  if (spDevBtn) spDevBtn.disabled = !G.devMode;
  if (G.player.classKey === 'mage') {
    const release = getActionData('mage_release', 'player');
    const canRelease = !!release && !release.disabledByOrbs && !blocked.has('mage_release');
    specialMain.disabled = !canRelease && !G.devMode;
    if (sp1Btn) sp1Btn.disabled = !canRelease;
    if (sp2Btn) sp2Btn.disabled = true;
  } else if (G.player.classKey === 'nsyc') {
    const ekai = getActionData('ekai', 'player');
    const canEkai = !!ekai && !ekai.disabledByOrbs;
    specialMain.disabled = !canEkai && !G.devMode;
    if (sp1Btn) sp1Btn.disabled = true;
    if (sp2Btn) sp2Btn.disabled = !canEkai;
  } else if (G.player.classKey === 'dog') {
    specialMain.disabled = !G.devMode;
    if (sp1Btn) sp1Btn.disabled = true;
    if (sp2Btn) sp2Btn.disabled = true;
  } else {
    specialMain.disabled = !G.devMode;
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

/** 渲染战技库覆盖层 */
export function renderTechniqueLibrary() {
  const container = $('tech-lib-slots');
  if (!container) return;
  container.innerHTML = '';

  for (let slot = 1; slot <= 7; slot++) {
    const equippedId = G.techniques ? G.techniques[slot] : null;
    const techs = getTechDefsForSlot(slot);

    const section = document.createElement('div');
    section.className = 'tech-lib-section';

    const head = document.createElement('div');
    head.className = 'tech-lib-slot-title';
    head.textContent = `攻击${slot} 槽位`;
    section.appendChild(head);

    if (techs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tag-placeholder';
      empty.textContent = '（暂无战技）';
      section.appendChild(empty);
    }

    techs.forEach((tech) => {
      const isEquipped = equippedId === tech.id;
      const card = document.createElement('div');
      card.className = `tech-lib-card${isEquipped ? ' equipped' : ''}`;

      // Art interface: 标准路径 assets/cards/tech/{id}.png，加载失败自动 fallback 到 emoji
      const stdArt = `assets/cards/tech/${tech.id}.png`;
      const artHtml = `<img class="tech-art" src="${stdArt}" alt="${tech.name}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="tech-art-emoji" style="display:none">${tech.emoji}</div>`;

      const devBtn = G.devMode
        ? `<div class="tech-lib-action">${isEquipped
            ? `<button class="btn btn-outline tech-dev-btn" data-unequip-slot="${tech.slot}">卸下</button>`
            : `<button class="btn btn-outline tech-dev-btn" data-equip-tech="${tech.id}">装备</button>`
          }</div>`
        : '';
      card.innerHTML = `
        <div class="tech-art-wrap">${artHtml}
        </div>
        <div class="tech-lib-info">
          <div class="tech-lib-name">${isEquipped ? '✓ ' : ''}${tech.name}${isEquipped ? '（已装备）' : ''}</div>
          <div class="tech-lib-desc">${tech.desc}</div>
        </div>${devBtn}`;
      section.appendChild(card);
    });

    // Show base attack if nothing equipped
    const equippedName = equippedId && TECH_DEFS[equippedId] ? TECH_DEFS[equippedId].name : '基础攻击';
    const statusDiv = document.createElement('div');
    statusDiv.className = 'tech-lib-slot-status';
    statusDiv.textContent = `当前槽位：${equippedName}`;
    section.appendChild(statusDiv);

    container.appendChild(section);
  }
}

export function renderEquipmentLibrary() {
  const container = $('equip-lib-list');
  if (!container) return;
  container.innerHTML = '';
  const equipped = new Set(getEquippedEquipmentIds(G));

  EQUIPMENT_DEFS.forEach((item) => {
    const card = document.createElement('div');
    const isEquipped = equipped.has(item.id);
    card.className = `tech-lib-card${isEquipped ? ' equipped' : ''}`;
    const tagText = isEquipped ? getEquipmentTagText(G, item.id) : '未装备';
    const tagDef = isEquipped ? getEquipmentTagDefForItem(G, item.id) : null;
    const tagDetail = tagDef ? `${tagDef.name}：${tagDef.desc}` : (isEquipped ? '无词条效果' : '—');
    card.innerHTML = `
      <div class="tech-art-wrap equip-lib-art-wrap">
        <img class="tech-art" src="${getEquipmentCardArtPath(item.id)}" alt="${item.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="tech-art-emoji" style="display:none">${item.icon}</div>
      </div>
      <div class="tech-lib-info">
        <div class="tech-lib-name">${isEquipped ? '✓ ' : ''}${item.name}${isEquipped ? '（已装备）' : ''}</div>
        <div class="tech-lib-desc">${item.desc}</div>
        <div class="tech-lib-slot-status">词条：${tagText}</div>
        <div class="tech-lib-desc">词条效果：${tagDetail}</div>
      </div>`;
    container.appendChild(card);
  });
}

/** 在被动标签中显示已装备战技 */
export function getTechBadges() {
  const arr = [];
  if (!G.techniques) return arr;
  for (let slot = 1; slot <= 7; slot++) {
    const id = G.techniques[slot];
    const def = id && TECH_DEFS[id];
    if (def) arr.push({ icon: def.emoji, name: `${def.name}（${slot}）` });
  }
  return arr;
}

export function renderProfilePanel() {
  const container = $('profile-content');
  if (!container || !G.player) return;
  const classDef = CLASS_DEFS[G.player.classKey];
  const unlockedAbilities = (classDef ? classDef.abilityDefs : []).filter((ab) => G.abilities[ab.key]);
  const equippedIds = getEquippedEquipmentIds(G);
  const relics = POWER_RELIC_DEFS.filter((item) => G.powerRelics && G.powerRelics[item.key]);
  const resourceRows = [
    `生命：${G.player.hp}/${G.player.maxHp}`,
    `Ji：${G.player.ji}（回合回复 +${getPlayerJiRate()}）`,
    `能力碎片：${G.player.fragments || 0}`,
    `金币：${G.player.gold || 0}`,
  ];
  if (G.player.classKey === 'dog') resourceRows.push(`幸运值：${G.player.luck || 0}`);
  if (G.player.classKey === 'nsyc') resourceRows.push(`傻逼层数：${G.player.shaBiStacks || 0}`);
  if (G.player.classKey === 'mage') resourceRows.push(`闪电球：${G.player.lightningOrbs || 0}`);

  const equipmentHtml = equippedIds.length > 0
    ? equippedIds.map((id, idx) => {
      const def = getEquipmentDef(id);
      const tagDef = getEquipmentTagDefForItem(G, id);
      if (!def) return '';
      return `<div class="profile-item">
        <strong>槽${idx + 1}：${def.icon} ${def.name}</strong>
        <div>${def.desc}</div>
        <div>词条：${tagDef ? `${tagDef.name}（${tagDef.desc}）` : '无'}</div>
      </div>`;
    }).join('')
    : '<div class="tag-placeholder">当前未装备。</div>';

  const techHtml = Array.from({ length: 7 }).map((_, i) => {
    const slot = i + 1;
    const id = G.techniques ? G.techniques[slot] : null;
    const def = id && TECH_DEFS[id] ? TECH_DEFS[id] : null;
    if (!def) return `<div class="profile-item">攻击${slot}类：基础攻击</div>`;
    return `<div class="profile-item">
      <strong>攻击${slot}类：${def.emoji} ${def.name}</strong>
      <div>${def.desc}</div>
    </div>`;
  }).join('');

  const relicHtml = relics.length > 0
    ? relics.map((item) => `<div class="profile-item"><strong>${item.icon} ${item.name}</strong><div>${item.desc}</div></div>`).join('')
    : '';

  const abilityHtml = unlockedAbilities.length > 0
    ? unlockedAbilities.map((ab) => `<div class="profile-item"><strong>${ab.icon} ${ab.name}</strong><div>${ab.desc}</div></div>`).join('')
    : '<div class="tag-placeholder">当前未解锁能力。</div>';

  container.innerHTML = `
    <div class="profile-grid">
      <section class="profile-section">
        <div class="profile-title">基础信息</div>
        <div class="profile-item"><strong>职业：</strong>${classDef ? `${classDef.icon} ${classDef.name}` : G.player.classKey}</div>
        ${resourceRows.map((line) => `<div class="profile-item">${line}</div>`).join('')}
      </section>
      <section class="profile-section">
        <div class="profile-title">能力树</div>
        ${abilityHtml}
      </section>
      <section class="profile-section">
        <div class="profile-title">装备</div>
        ${equipmentHtml}
      </section>
      <section class="profile-section">
        <div class="profile-title">战技列表</div>
        ${techHtml}
      </section>
      ${relics.length > 0 ? `<section class="profile-section">
        <div class="profile-title">强大遗物</div>
        ${relicHtml}
      </section>` : ''}
    </div>`;
}
