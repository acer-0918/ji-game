import { randomChoice } from '../utils.js';
import {
  BOSS_POOL,
  ELITE_POOL,
  EVENT_POOL,
  MOB_POOL,
  TECHNIQUE_POOL,
  createBossById,
  createEliteById,
  createMobById,
  createRoomLabel,
} from './pools.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeRoomId(floor, index) {
  const letter = String.fromCharCode(97 + index);
  return `room_${floor}_${letter}`;
}

function makeRoom(floor, index, type, payload = {}) {
  return {
    id: makeRoomId(floor, index),
    floor,
    index,
    type,
    label: createRoomLabel(type, payload),
    payload,
    connections: [],
    parents: [],
    cleared: false,
    visited: false,
  };
}

function linkRooms(parent, child) {
  if (!parent || !child) return;
  if (!parent.connections.includes(child.id)) parent.connections.push(child.id);
  if (!child.parents.includes(parent.id)) child.parents.push(parent.id);
}

function chooseDistinct(pool, count) {
  const bag = [...pool];
  const out = [];
  while (bag.length > 0 && out.length < count) {
    const picked = randomChoice(bag);
    out.push(picked);
    bag.splice(bag.indexOf(picked), 1);
  }
  return out;
}

function buildMobRoom(floor, index) {
  const enemy = createMobById(randomChoice(MOB_POOL), floor);
  return makeRoom(floor, index, 'battle', {
    enemy,
    rewardSpec: {
      kind: 'mob',
      goldBase: randInt(10, 20),
      goldScale: Math.floor(floor * 0.5),
      pickCount: 1,
      pickPool: ['fragment', 'technique'],
    },
  });
}

function buildEliteRoom(floor, index) {
  const enemy = createEliteById(randomChoice(ELITE_POOL), floor);
  return makeRoom(floor, index, 'elite', {
    enemy,
    rewardSpec: {
      kind: 'elite',
      goldBase: randInt(80, 100),
      goldScale: Math.floor(floor * 3.5),
      pickCount: 2,
      pickPool: ['fragment', 'fragment', 'technique', 'technique'],
    },
  });
}

function buildEventRoom(floor, index) {
  return makeRoom(floor, index, 'event', {
    eventId: randomChoice(EVENT_POOL),
  });
}

function buildMysteryRoom(floor, index, allowBattle = true) {
  const pool = allowBattle
    ? ['battle', 'elite', 'event', 'camp', 'shop']
    : ['event', 'camp', 'shop'];
  const realType = randomChoice(pool);
  let payload = {};
  if (realType === 'battle') payload = buildMobRoom(floor, index).payload;
  else if (realType === 'elite') payload = buildEliteRoom(floor, index).payload;
  else if (realType === 'event') payload = buildEventRoom(floor, index).payload;
  return makeRoom(floor, index, 'mystery', {
    realType,
    realLabel: createRoomLabel(realType, payload),
    ...payload,
  });
}

function buildCampRoom(floor, index) {
  return makeRoom(floor, index, 'camp', {});
}

function buildShopRoom(floor, index) {
  return makeRoom(floor, index, 'shop', {});
}

function buildBossRoom(floor, index, excludeBossId = null) {
  const candidatePool = BOSS_POOL.filter((id) => id !== excludeBossId);
  const pickPool = candidatePool.length > 0 ? candidatePool : BOSS_POOL;
  const bossId = randomChoice(pickPool);
  return makeRoom(floor, index, 'boss', {
    bossId,
    enemy: createBossById(bossId),
    finalBoss: floor >= 12,
  });
}

function pushFloor(map, floor, rooms) {
  map.floors.push({ floor, roomIds: rooms.map((room) => room.id) });
  rooms.forEach((room) => {
    map.roomsById[room.id] = room;
  });
}

function roomArrayByIds(map, ids) {
  return ids.map((id) => map.roomsById[id]).filter(Boolean);
}

export function generateRunMap({ hardMode = false } = {}) {
  const map = {
    floors: [],
    roomsById: {},
    startRoomId: null,
    currentRoomId: null,
    availableRoomIds: [],
    hardMode: !!hardMode,
    techPool: [...TECHNIQUE_POOL],
  };

  // floor 1
  const f1 = [buildMobRoom(1, 0)];
  pushFloor(map, 1, f1);
  map.startRoomId = f1[0].id;

  // floor 2
  const f2Count = randInt(1, 2);
  const f2 = Array.from({ length: f2Count }, (_, i) => buildMobRoom(2, i));
  pushFloor(map, 2, f2);
  f2.forEach((room) => linkRooms(f1[0], room));

  // floor 3
  const f3 = [];
  roomArrayByIds(map, map.floors[1].roomIds).forEach((parent) => {
    const cnt = randInt(1, 2);
    for (let i = 0; i < cnt; i++) {
      const room = buildEventRoom(3, f3.length);
      f3.push(room);
      linkRooms(parent, room);
    }
  });
  pushFloor(map, 3, f3);

  // floor 4
  const f4 = [];
  roomArrayByIds(map, map.floors[2].roomIds).forEach((parent) => {
    const room = buildMysteryRoom(4, f4.length, true);
    f4.push(room);
    linkRooms(parent, room);
  });
  pushFloor(map, 4, f4);

  // floor 5
  const f5 = [];
  roomArrayByIds(map, map.floors[3].roomIds).forEach((parent) => {
    const room = buildMysteryRoom(5, f5.length, false);
    f5.push(room);
    linkRooms(parent, room);
  });
  pushFloor(map, 5, f5);

  // floor 6
  const f6Count = randInt(1, 3);
  const f6 = Array.from({ length: f6Count }, (_, i) => {
    const kind = randomChoice(['battle', 'elite']);
    return kind === 'battle' ? buildMobRoom(6, i) : buildEliteRoom(6, i);
  });
  pushFloor(map, 6, f6);
  const parents5 = roomArrayByIds(map, map.floors[4].roomIds);
  f6.forEach((child) => {
    const parent = randomChoice(parents5);
    linkRooms(parent, child);
  });
  parents5.forEach((parent) => {
    if (parent.connections.some((id) => map.roomsById[id] && map.roomsById[id].floor === 6)) return;
    linkRooms(parent, randomChoice(f6));
  });

  // floor 7
  const f7 = [];
  roomArrayByIds(map, map.floors[5].roomIds).forEach((parent) => {
    const room = buildEliteRoom(7, f7.length);
    f7.push(room);
    linkRooms(parent, room);
  });
  pushFloor(map, 7, f7);

  // floor 8
  const f8 = [buildShopRoom(8, 0)];
  pushFloor(map, 8, f8);
  roomArrayByIds(map, map.floors[6].roomIds).forEach((parent) => linkRooms(parent, f8[0]));

  // floor 9
  const f9 = [buildEventRoom(9, 0)];
  pushFloor(map, 9, f9);
  linkRooms(f8[0], f9[0]);

  // floor 10
  const f10 = [buildEliteRoom(10, 0)];
  pushFloor(map, 10, f10);
  linkRooms(f9[0], f10[0]);

  // floor 11
  const f11Left = randomChoice(['camp', 'event']);
  const f11 = [
    f11Left === 'camp' ? buildCampRoom(11, 0) : buildEventRoom(11, 0),
    f11Left === 'camp' ? buildEventRoom(11, 1) : buildCampRoom(11, 1),
  ];
  pushFloor(map, 11, f11);
  f11.forEach((room) => linkRooms(f10[0], room));

  // floor 12
  const f12 = [buildBossRoom(12, 0)];
  pushFloor(map, 12, f12);
  f11.forEach((room) => linkRooms(room, f12[0]));

  if (hardMode) {
    const prevBossId = f12[0].payload ? f12[0].payload.bossId : null;
    const f13 = [buildBossRoom(13, 0, prevBossId)];
    pushFloor(map, 13, f13);
    linkRooms(f12[0], f13[0]);
    f12[0].payload.finalBoss = false;
    f13[0].payload.finalBoss = true;
  } else {
    f12[0].payload.finalBoss = true;
  }

  map.availableRoomIds = [map.startRoomId];
  return map;
}

export function revealMysteryRoom(room) {
  if (!room || room.type !== 'mystery') return room;
  const realType = room.payload.realType || 'event';
  room.type = realType;
  room.label = room.payload.realLabel || createRoomLabel(realType, room.payload);
  return room;
}

export function consumeTechFromMapPool(map, count = 1) {
  if (!map || !Array.isArray(map.techPool)) return [];
  const out = [];
  while (map.techPool.length > 0 && out.length < count) {
    const picked = randomChoice(map.techPool);
    out.push(picked);
    map.techPool.splice(map.techPool.indexOf(picked), 1);
  }
  if (out.length < count) {
    const fallback = chooseDistinct(TECHNIQUE_POOL, count - out.length);
    out.push(...fallback);
  }
  return out;
}
