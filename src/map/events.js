import { consumeTechFromMapPool } from './generator.js';
import {
  getEquippedEquipmentIds,
  removeEquipmentTag,
  rerollEquipmentTag,
} from '../equipment/runtime.js';
import { TECH_DEFS, equipTechnique, getTechniqueCategoryLabel } from '../battleTechniques.js';
import {
  EQUIP_TAGPOOL_PO_A,
  EQUIP_TAGPOOL_PO_B,
} from '../equipment/tags.js';

function rerollPositiveTag(game, equipmentId, pool) {
  if (!equipmentId || !Array.isArray(pool) || pool.length <= 0) return false;
  const tagId = pool[Math.floor(Math.random() * pool.length)];
  const st = game.equipment;
  if (!st || !st.records || !st.records[equipmentId]) return false;
  st.records[equipmentId].tagId = tagId;
  return true;
}

function grantMapTechnique(game) {
  const out = consumeTechFromMapPool(game.map, 1);
  if (!out.length) return null;
  const techId = out[0];
  equipTechnique(game, techId);
  return techId;
}

export function resolveEventChoice(game, room, choiceKey, { addLog, selectedEquipmentId = null } = {}) {
  const eventId = room && room.payload ? room.payload.eventId : null;
  if (!eventId) return { text: '什么都没有发生。', leave: true };

  if (eventId === 'event_1') {
    if (choiceKey === 'A') {
      game.player.gold += 100;
      return { text: '他挥挥手，甩给你一袋钱币，让你离开。（获得100金币）', leave: true };
    }
    game.player.fragments += 1;
    return { text: '你沉默地看着他，他的工作气质让你受益良多。（获得1能力碎片）', leave: true };
  }

  if (eventId === 'event_2') {
    if (choiceKey === 'A') {
      game.player.maxHp += 1;
      game.player.hp += 1;
      return { text: '他点了点头。春天确实美好。（获得1生命上限，当前生命同步提升）', leave: true };
    }
    if (choiceKey === 'B') {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + 3);
      return { text: '他摇了摇头，对你的话不置可否。（回复3生命值）', leave: true };
    }
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 1);
    return { text: '他笑了一笑。现在你觉得自己很傻逼。（回复1生命值）', leave: true };
  }

  if (eventId === 'event_3') {
    if (choiceKey === 'A') {
      const equipped = getEquippedEquipmentIds(game);
      if (equipped.length <= 0) return { text: '你看了看背包，没有进行任何改动。', leave: true };
      if (!selectedEquipmentId || !equipped.includes(selectedEquipmentId)) {
        return {
          text: '请选择一件装备进行重随词条。',
          leave: false,
          requiresEquipmentPick: true,
          equipmentChoiceKey: choiceKey,
          equipmentIds: equipped,
        };
      }
      rerollEquipmentTag(game, selectedEquipmentId);
      return { text: '你对装备进行了重随词条。', leave: true };
    }
    if (choiceKey === 'B') {
      const techId = grantMapTechnique(game);
      if (techId) {
        const def = TECH_DEFS[techId];
        const name = def ? def.name : techId;
        const category = getTechniqueCategoryLabel(def || techId);
        addLog?.('log-ab', `📘 事件奖励：获得战技 ${name}（${category}，已自动装备到对应攻击槽）。`);
      }
      return { text: '睡觉是好事，你在睡梦中想明白了很多事情。（获得1战技）', leave: true };
    }
    game.player.maxHp += 1;
    game.player.hp = Math.max(1, game.player.hp - 2);
    return { text: '现在做什么？现在做什么？现在做什么？（获得1生命上限，当前生命-2，最低降至1）', leave: true };
  }

  if (eventId === 'event_4') {
    if (choiceKey === 'D') return { text: '你离开了铁匠铺。', leave: true };
    const equipped = getEquippedEquipmentIds(game);
    if (equipped.length <= 0) return { text: '你没有可操作的装备。', leave: true };

    if (choiceKey === 'A') {
      if (game.player.gold < 150) return { text: '金币不足。', leave: false };
      if (!selectedEquipmentId || !equipped.includes(selectedEquipmentId)) {
        return {
          text: '请选择一件装备进行大幅改良。',
          leave: false,
          requiresEquipmentPick: true,
          equipmentChoiceKey: choiceKey,
          equipmentIds: equipped,
        };
      }
      game.player.gold -= 150;
      rerollPositiveTag(game, selectedEquipmentId, EQUIP_TAGPOOL_PO_B);
      return { text: '铁匠进行了大幅改良。', leave: true };
    }
    if (choiceKey === 'B') {
      if (game.player.gold < 70) return { text: '金币不足。', leave: false };
      if (!selectedEquipmentId || !equipped.includes(selectedEquipmentId)) {
        return {
          text: '请选择一件装备进行小幅改良。',
          leave: false,
          requiresEquipmentPick: true,
          equipmentChoiceKey: choiceKey,
          equipmentIds: equipped,
        };
      }
      game.player.gold -= 70;
      rerollPositiveTag(game, selectedEquipmentId, EQUIP_TAGPOOL_PO_A);
      return { text: '铁匠进行了小幅改良。', leave: true };
    }
    if (game.player.gold < 40) return { text: '金币不足。', leave: false };
    if (!selectedEquipmentId || !equipped.includes(selectedEquipmentId)) {
      return {
        text: '请选择一件装备移除词条。',
        leave: false,
        requiresEquipmentPick: true,
        equipmentChoiceKey: choiceKey,
        equipmentIds: equipped,
      };
    }
    game.player.gold -= 40;
    removeEquipmentTag(game, selectedEquipmentId);
    return { text: '铁匠移除了词条。', leave: true };
  }

  if (choiceKey === 'A') {
    game.player.gold += 200;
    return { text: '你收下了财富。（获得200金币）', leave: true };
  }
  return { text: '你选择了放弃。', leave: true };
}

export function getEventViewModel(room, game) {
  const eventId = room && room.payload ? room.payload.eventId : '';
  if (eventId === 'event_1') {
    return {
      title: '鲍勃',
      intro: '你遇到了一位青年正在伏案工作。',
      choices: [
        { key: 'A', text: '你脱口而出：“卷！”（获得金币）' },
        { key: 'B', text: '你心中默念：“卷……”（获得能力碎片）' },
      ],
    };
  }
  if (eventId === 'event_2') {
    return {
      title: '狗头',
      intro: '你看到一个狗头人正坐在地上沉思。你试图上前与之攀谈。',
      choices: [
        { key: 'A', text: '“春天真美好。”' },
        { key: 'B', text: '“我是一条狗。”' },
        { key: 'C', text: '“你是傻逼吗？”' },
      ],
    };
  }
  if (eventId === 'event_3') {
    return {
      title: '梓神',
      intro: '有一个神情憔悴的年轻人向你走来。他问你：“现在做什么？”',
      choices: [
        { key: 'A', text: '“我有要事在身。”（装备相关）' },
        { key: 'B', text: '“现在睡觉。”（战技相关）' },
        { key: 'C', text: '“现在做什么？”（生命相关）' },
      ],
    };
  }
  if (eventId === 'event_4') {
    const hasEquip = getEquippedEquipmentIds(game).length > 0;
    return {
      title: '铁匠',
      intro: '每个游戏都有类似的东西。铁匠是用来提升你的装备的。',
      choices: hasEquip
        ? [
            { key: 'A', text: '大幅改良装备词条（花费150金币）' },
            { key: 'B', text: '小幅改良装备词条（花费70金币）' },
            { key: 'C', text: '移除装备词条（花费40金币）' },
            { key: 'D', text: '离开' },
          ]
        : [{ key: 'D', text: '离开' }],
    };
  }
  return {
    title: '财富',
    intro: '每个游戏都有类似的东西。游戏制作者赠送你一大笔金币。',
    choices: [
      { key: 'A', text: '收下（获得200金币）' },
      { key: 'B', text: '放弃（无变化）' },
    ],
  };
}
