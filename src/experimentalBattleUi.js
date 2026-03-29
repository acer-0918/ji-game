import { MAX_JI_DISPLAY } from './data.js';
import { getActionData, getActionSubText } from './logic.js';
import { hasPowerRelic } from './powerRelics/index.js';
import { getPassiveBadges, getPlayerBattleValueBadges, getEnemyBattleValueBadges } from './render.js';
import { G, isJiHiddenBattle } from './state.js';

const $ = (id) => document.getElementById(id);

export function createExperimentalBattleUi({
  isEnabled,
  hasDelegationProblemRelic,
  previewActionKey,
  confirmAction,
  openOverlay,
  closeOverlay,
  openTechLibrary,
  openEquipLibrary,
  openIntro,
  openProfile,
  restartBattle,
  askSurrender,
  openSettings,
}) {
  let dragState = null;

  function isActive() {
    return !!(isEnabled() && $('screen-battle') && $('screen-battle').classList.contains('active'));
  }

  function syncLogPanels() {
    const battleLog = $('battle-log');
    const logHtml = battleLog && battleLog.innerHTML ? battleLog.innerHTML : '';

    const inlineLog = $('exp-inline-battle-log');
    if (inlineLog) {
      inlineLog.innerHTML = logHtml;
      inlineLog.scrollTop = inlineLog.scrollHeight;
    }

    const liveLog = $('live-battle-log');
    if (liveLog) {
      liveLog.innerHTML = logHtml;
      liveLog.scrollTop = liveLog.scrollHeight;
    }
  }

  function openLiveBattleLog() {
    syncLogPanels();
    openOverlay('ov-live-battle-log');
  }

  function closeLiveBattleLog() {
    closeOverlay('ov-live-battle-log');
  }

  function pulseFeedback(targetId, className, duration = 360) {
    const el = $(targetId);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), duration);
  }

  function triggerAttackFeedback() {
    if (!isActive() || !G.battle || !G.battle.cardsRevealed) return;
    const playerAction = getActionData(G.battle.pAction, 'player');
    const enemyAction = getActionData(G.battle.eAction, 'enemy');
    if (playerAction && playerAction.type === 'attack') pulseFeedback('exp-player-portrait', 'attack-left', 320);
    if (enemyAction && enemyAction.type === 'attack') pulseFeedback('exp-enemy-portrait', 'attack-right', 320);
    pulseFeedback('exp-player-card', 'card-pulse', 320);
    pulseFeedback('exp-enemy-card', 'card-pulse', 320);
  }

  function triggerHitFeedback(result) {
    if (!isActive() || !result) return;
    if (Number(result.pdmg || 0) > 0) pulseFeedback('exp-player-portrait', 'taking-hit', 420);
    if (Number(result.edmg || 0) > 0) pulseFeedback('exp-enemy-portrait', 'taking-hit', 420);
  }

  function resetDragState() {
    if (dragState && dragState.cardEl) {
      const card = dragState.cardEl;
      card.classList.remove('dragging', 'drag-ready');
      card.style.removeProperty('--drag-x');
      card.style.removeProperty('--drag-y');
      card.style.removeProperty('--drag-rotate');
      if (dragState.pointerId != null && typeof card.releasePointerCapture === 'function') {
        try {
          card.releasePointerCapture(dragState.pointerId);
        } catch (_) {
          // ignore pointer capture release failures
        }
      }
    }
    const handShell = $('exp-battle-hand-shell');
    if (handShell) handShell.classList.remove('dragging', 'ready');
    dragState = null;
  }

  function canStartDrag(card) {
    if (!card || card.disabled) return false;
    if (!isActive() || !G.battle || G.battle.phase !== 'select') return false;
    if (hasDelegationProblemRelic()) return false;
    return card.dataset.disabled !== 'true';
  }

  function handleHandPointerDown(event) {
    if (!isActive()) return;
    const card = event.target.closest('.exp-hand-card[data-action]');
    if (!canStartDrag(card)) return;
    dragState = {
      key: card.dataset.action,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      cardEl: card,
      dragging: false,
      releaseReady: false,
    };
    if (typeof card.setPointerCapture === 'function') {
      try {
        card.setPointerCapture(event.pointerId);
      } catch (_) {
        // ignore pointer capture failures
      }
    }
  }

  function handleHandPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const { startX, startY, cardEl } = dragState;
    if (!cardEl) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    if (!dragState.dragging && Math.hypot(dx, dy) < 10) return;
    dragState.dragging = true;
    cardEl.classList.add('dragging');
    cardEl.style.setProperty('--drag-x', `${dx}px`);
    cardEl.style.setProperty('--drag-y', `${dy}px`);
    cardEl.style.setProperty('--drag-rotate', `${Math.max(-8, Math.min(8, dx * 0.04))}deg`);
    const handShell = $('exp-battle-hand-shell');
    let ready = false;
    if (handShell) {
      handShell.classList.add('dragging');
      const rect = handShell.getBoundingClientRect();
      ready = event.clientY < rect.top + 8;
      handShell.classList.toggle('ready', ready);
    }
    dragState.releaseReady = ready;
    cardEl.classList.toggle('drag-ready', ready);
  }

  function handleHandPointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = dragState;
    const shouldRelease = !!(state.dragging && state.releaseReady);
    const actionKey = state.key;
    resetDragState();
    if (!actionKey) return;
    if (shouldRelease) {
      if (!(G.ui && G.ui.actionKey === actionKey)) previewActionKey(actionKey);
      confirmAction({ forceActionKey: actionKey });
      render();
      return;
    }
    previewActionKey(actionKey);
  }

  function renderChipRow(id, items, { iconOnly = false } = {}) {
    const wrap = $(id);
    if (!wrap) return;
    wrap.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    wrap.classList.toggle('is-empty', list.length <= 0);
    wrap.style.display = 'flex';

    list.forEach((item) => {
      const el = document.createElement(iconOnly ? 'button' : 'div');
      el.className = `${iconOnly ? 'exp-icon-chip' : 'exp-value-chip'}${item.detail ? ' detail-target' : ''}`;
      if (iconOnly) {
        el.type = 'button';
        el.textContent = item.icon || '•';
      } else {
        el.innerHTML = `
          <span class="exp-chip-icon">${item.icon || '•'}</span>
          ${item.valueText ? `<span class="exp-chip-value">${item.valueText}</span>` : ''}`;
      }
      if (item.detail) {
        el.dataset.detailTitle = item.title || `${item.icon || ''} ${item.name || '效果'}`.trim();
        el.dataset.detail = item.detail;
      }
      wrap.appendChild(el);
    });
  }

  function getRoomText() {
    if (!G.currentNode) return '战斗';
    const typeLabel = G.currentNode.type === 'boss'
      ? 'Boss 战'
      : G.currentNode.type === 'elite'
        ? '精英战'
        : G.currentNode.type === 'battle'
          ? '普通战'
          : '战斗';
    const enemyPart = G.enemy ? ` · ${G.enemy.name}` : '';
    return `${typeLabel}${enemyPart}`;
  }

  function setRevealCard(cardId, emojiId, mainId, subId, action, { facedown = false } = {}) {
    const card = $(cardId);
    if (!card) return;
    if (facedown) {
      card.className = 'reveal-card facedown exp-reveal-card';
      card.innerHTML = '<div class="ac-emoji">🂠</div><div class="ac-name">???</div><div class="ac-sub"></div>';
      return;
    }

    if (!action) {
      card.className = 'reveal-card exp-reveal-card';
      if (emojiId && mainId && subId) {
        $(emojiId).textContent = '　';
        $(mainId).textContent = '—';
        $(subId).textContent = '';
      } else {
        card.innerHTML = '<div class="ac-emoji">　</div><div class="ac-name">—</div><div class="ac-sub"></div>';
      }
      return;
    }

    const subText = getActionSubText(action);
    card.className = `reveal-card exp-reveal-card${cardId.includes('enemy') ? ' revealed-enemy' : ' revealed-player'}`;
    if (emojiId && mainId && subId) {
      $(emojiId).textContent = action.emoji || '　';
      $(mainId).textContent = action.name || '—';
      $(subId).textContent = subText;
    } else {
      card.innerHTML = `
        <div class="ac-emoji">${action.emoji || '　'}</div>
        <div class="ac-name">${action.name || '—'}</div>
        <div class="ac-sub">${subText}</div>`;
    }
  }

  function setBar(barId, valId, cur, max) {
    const bar = $(barId);
    const val = $(valId);
    if (!bar || !val) return;
    const ratio = max > 0 ? Math.max(0, cur / max * 100) : 0;
    bar.style.width = `${ratio}%`;
    val.textContent = `${Math.max(0, cur)}/${max}`;
  }

  function setJiBar(barId, valId, value, max, hidden) {
    const bar = $(barId);
    const val = $(valId);
    if (!bar || !val) return;
    if (hidden) {
      bar.style.width = '100%';
      bar.style.opacity = '0.16';
      bar.style.filter = 'grayscale(1)';
      val.textContent = '??';
      return;
    }
    bar.style.width = `${Math.min((value / max) * 100, 100)}%`;
    bar.style.opacity = '1';
    bar.style.filter = 'none';
    val.textContent = String(value);
  }

  function getCardHint(action, key) {
    if (!action) return '';
    if (key === 'ji') return `+${action.gain || 0}Ji`;
    if (action.isMageRelease) return `等级${action.atk}·持有${G.player.lightningOrbs || 0}`;
    if (action.type === 'defense') return `防御${action.def || 0}`;
    if (action.type === 'attack') return action.def > 0 ? `等级${action.atk}·防${action.def}` : `等级${action.atk}`;
    if (action.type === 'ekai') return `持有${G.player.shaBiStacks || 0}层`;
    if (action.type === 'soul_devour') return `诅咒${(G.enemy && G.enemy.curseStacks) || 0}层`;
    if (action.type === 'fault_orb') return '随机充能球';
    if (action.type === 'dev_kill') return '敌方立刻归零';
    return '';
  }

  function buildBattleCards() {
    const groups = [];
    const blocked = new Set((G.battle && G.battle.roundDisabledActions) || []);
    const defenseForbidden = hasPowerRelic(G, 'possibleReunion');
    const interactionLocked = !G.battle || G.battle.phase !== 'select' || hasDelegationProblemRelic();

    function buildCard(key, group) {
      const action = getActionData(key, 'player');
      if (!action) return null;
      const blockedByRound = key.startsWith('defense_')
        ? defenseForbidden || blocked.has(key)
        : blocked.has(key);
      const insufficient = action.isMageRelease
        ? !!action.disabledByOrbs
        : (action.cost || 0) > Number(G.player && G.player.ji || 0);
      const disabled = interactionLocked || blockedByRound || insufficient || !!action.disabledByOrbs;
      let costText = key === 'ji' ? 'J' : `${action.cost || 0}`;
      if (action.isMageRelease) costText = `${action.orbCost || 0}⚡`;
      else if (action.type === 'ekai') costText = `${action.stackCost || 4}🤬`;
      else if (action.type === 'soul_devour') costText = `4☠`;
      else if (action.type === 'dev_kill') costText = 'DEV';

      return {
        key,
        group,
        action,
        blockedByRound,
        disabled,
        selected: G.ui && G.ui.actionKey === key,
        costText,
        hintText: getCardHint(action, key),
      };
    }

    groups.push({ key: 'charge', cards: [buildCard('ji', 'charge')].filter(Boolean) });
    groups.push({
      key: 'defense',
      cards: ['defense_0', 'defense_1', 'defense_2'].map((key) => buildCard(key, 'defense')).filter(Boolean),
    });
    groups.push({
      key: 'attack',
      cards: ['attack_1', 'attack_2', 'attack_3', 'attack_4', 'attack_5', 'attack_6', 'attack_7']
        .map((key) => buildCard(key, 'attack'))
        .filter(Boolean),
    });

    const specialKeys = [];
    if (G.player && G.player.classKey === 'mage') specialKeys.push('mage_release');
    if (G.player && G.player.classKey === 'nsyc') specialKeys.push('ekai');
    if (G.player && G.player.classKey === 'warlock') specialKeys.push('soul_devour');
    if (hasPowerRelic(G, 'deification')) specialKeys.push('perfect_core');
    if (G.devMode) specialKeys.push('dev_kill');
    const specialCards = specialKeys.map((key) => buildCard(key, 'special')).filter(Boolean);
    if (specialCards.length > 0) {
      groups.push({ key: 'special', cards: specialCards });
    }

    return groups;
  }

  function renderBattleHand() {
    const wrap = $('exp-battle-hand');
    if (!wrap) return;
    wrap.innerHTML = '';
    const groups = buildBattleCards();
    const focusedGroup = G.ui && G.ui.mainSel
      ? (G.ui.mainSel === 'def'
        ? 'defense'
        : G.ui.mainSel === 'atk'
          ? 'attack'
          : G.ui.mainSel === 'sp'
            ? 'special'
            : '')
      : '';
    const groupLabels = { charge: '蓄力', defense: '防御', attack: '攻击', special: '技能' };

    function buildCardBtn(card, idx, totalInRow, fanSpread, groupFocused) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `exp-hand-card${groupFocused ? ' group-focused' : ''}${card.selected ? ' selected' : ''}${card.blockedByRound ? ' blocked' : ''}`;
      btn.dataset.action = card.key;
      btn.dataset.group = card.group;
      btn.dataset.disabled = card.disabled ? 'true' : 'false';
      btn.dataset.blocked = card.blockedByRound ? 'true' : 'false';
      const angle = totalInRow <= 1 ? 0 : (-fanSpread / 2) + (fanSpread * idx / Math.max(1, totalInRow - 1));
      btn.style.setProperty('--exp-angle', `${angle}deg`);
      btn.style.setProperty('--exp-z', String(6 + idx));
      btn.disabled = card.disabled;
      btn.innerHTML = `
        <span class="exp-card-cost">${card.costText}</span>
        ${card.blockedByRound ? '<span class="exp-card-disabled-mark">禁</span>' : ''}
        <div class="exp-card-icon">${card.action.emoji || '•'}</div>
        <div class="exp-card-name">${card.action.name}</div>
        <div class="exp-card-hint">${card.hintText || ''}</div>`;
      return btn;
    }

    groups.forEach((group) => {
      const section = document.createElement('div');
      const groupFocused = !!focusedGroup && focusedGroup === group.key;
      section.className = `exp-card-group${groupFocused ? ' active' : ''}`;
      section.dataset.group = group.key;

      const title = document.createElement('div');
      title.className = 'exp-card-group-title';
      title.textContent = groupLabels[group.key] || '';
      section.appendChild(title);

      if (group.key === 'attack' && group.cards.length > 4) {
        // 两排垒放：上排前4张，下排剩余（3张）
        const topCards = group.cards.slice(0, 4);
        const bottomCards = group.cards.slice(4);
        const fanSpread = 16;

        const rows = document.createElement('div');
        rows.className = 'exp-attack-rows';

        const topFan = document.createElement('div');
        topFan.className = 'exp-card-fan exp-attack-row exp-attack-row-top';
        topCards.forEach((card, idx) => topFan.appendChild(buildCardBtn(card, idx, topCards.length, fanSpread, groupFocused)));

        const bottomFan = document.createElement('div');
        bottomFan.className = 'exp-card-fan exp-attack-row exp-attack-row-bottom';
        bottomCards.forEach((card, idx) => bottomFan.appendChild(buildCardBtn(card, idx, bottomCards.length, fanSpread, groupFocused)));

        rows.appendChild(topFan);
        rows.appendChild(bottomFan);
        section.appendChild(rows);
      } else {
        // 普通单排扇形
        const n = group.cards.length;
        const fanSpread = n >= 4 ? 22 : n >= 2 ? 14 : 0;
        const fan = document.createElement('div');
        fan.className = 'exp-card-fan';
        group.cards.forEach((card, idx) => fan.appendChild(buildCardBtn(card, idx, n, fanSpread, groupFocused)));
        section.appendChild(fan);
      }

      wrap.appendChild(section);
    });
  }

  function render() {
    if (!G.player || !G.battle) return;

    const roomLabel = $('exp-battle-room');
    if (roomLabel) roomLabel.textContent = getRoomText();
    const roundLabel = $('exp-round-label');
    if (roundLabel) roundLabel.textContent = `第 ${G.battle.round || 1} 回合`;
    const phaseLabel = $('exp-phase-label');
    if (phaseLabel) {
      const legacyPhase = $('round-phase');
      phaseLabel.textContent = legacyPhase ? legacyPhase.textContent : (G.battle.phase === 'select' ? '选择行动' : '结算中...');
    }

    const expHardBadge = $('exp-hard-badge');
    if (expHardBadge) expHardBadge.style.display = G.hardMode ? '' : 'none';

    const playerStageName = $('exp-player-stage-name');
    if (playerStageName) playerStageName.textContent = G.player.name || '玩家';
    const enemyStageName = $('exp-enemy-stage-name');
    if (enemyStageName) enemyStageName.textContent = G.enemy ? G.enemy.name : '敌人';
    const playerEmoji = $('exp-player-portrait-emoji');
    if (playerEmoji) playerEmoji.textContent = G.player.classIcon || '🗡️';
    const enemyEmoji = $('exp-enemy-portrait-emoji');
    if (enemyEmoji) enemyEmoji.textContent = G.enemy ? (G.enemy.emoji || '👹') : '👹';

    renderChipRow('exp-player-icon-row', getPassiveBadges({ includeResources: true, includeTechniques: false }), {
      iconOnly: true,
    });
    renderChipRow('exp-player-values', getPlayerBattleValueBadges());
    renderChipRow('exp-enemy-values', getEnemyBattleValueBadges());
    syncLogPanels();

    setBar('exp-player-hp-bar', 'exp-player-hp-val', G.player.hp, G.player.maxHp);
    if (G.enemy) setBar('exp-enemy-hp-bar', 'exp-enemy-hp-val', G.enemy.hp, G.enemy.maxHp);
    const hideJi = isJiHiddenBattle();
    setJiBar('exp-player-ji-bar', 'exp-player-ji-val', G.player.ji, MAX_JI_DISPLAY, hideJi);
    if (G.enemy) setJiBar('exp-enemy-ji-bar', 'exp-enemy-ji-val', G.enemy.ji, MAX_JI_DISPLAY, hideJi);

    const revealed = !!(G.battle && G.battle.cardsRevealed);
    const previewAction = G.ui && G.ui.actionKey ? getActionData(G.ui.actionKey, 'player') : null;
    const revealedPlayerAction = G.battle && G.battle.pAction ? getActionData(G.battle.pAction, 'player') : null;
    const revealedEnemyAction = G.battle && G.battle.eAction ? getActionData(G.battle.eAction, 'enemy') : null;

    setRevealCard(
      'exp-player-card',
      'exp-pc-emoji',
      'exp-pc-main',
      'exp-pc-sub',
      revealed ? revealedPlayerAction : previewAction,
    );
    setRevealCard('exp-enemy-card', null, null, null, revealedEnemyAction, { facedown: !revealed });

    const caption = $('exp-selection-caption');
    if (caption) caption.textContent = '';

    renderBattleHand();
  }

  function bindEvents() {
    $('btn-exp-tech-lib')?.addEventListener('click', openTechLibrary);
    $('btn-exp-equip-lib')?.addEventListener('click', openEquipLibrary);
    $('btn-exp-intro')?.addEventListener('click', openIntro);
    $('btn-exp-profile')?.addEventListener('click', openProfile);
    $('btn-exp-restart')?.addEventListener('click', restartBattle);
    $('btn-exp-surrender')?.addEventListener('click', askSurrender);
    $('btn-exp-settings')?.addEventListener('click', openSettings);
    $('btn-exp-battle-log')?.addEventListener('click', openLiveBattleLog);
    $('btn-live-log-close')?.addEventListener('click', closeLiveBattleLog);

    const experimentalHand = $('exp-battle-hand');
    if (experimentalHand) {
      experimentalHand.addEventListener('pointerdown', handleHandPointerDown);
      experimentalHand.addEventListener('pointermove', handleHandPointerMove);
      experimentalHand.addEventListener('pointerup', handleHandPointerUp);
      experimentalHand.addEventListener('pointercancel', resetDragState);
      experimentalHand.addEventListener('pointerleave', (event) => {
        if (!dragState) return;
        if (event.pointerType === 'mouse' && !dragState.dragging) resetDragState();
      });
    }
  }

  return {
    bindEvents,
    closeLiveBattleLog,
    isActive,
    openLiveBattleLog,
    render,
    resetDragState,
    syncLogPanels,
    triggerAttackFeedback,
    triggerHitFeedback,
  };
}
