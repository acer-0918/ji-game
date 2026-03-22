import { generateRunMap, revealMysteryRoom } from './generator.js';

function getRoom(map, roomId) {
  if (!map || !roomId) return null;
  return map.roomsById[roomId] || null;
}

export function createMapState({ hardMode = false } = {}) {
  return generateRunMap({ hardMode });
}

export function getRoomById(map, roomId) {
  return getRoom(map, roomId);
}

export function getFloorRooms(map, floor) {
  if (!map) return [];
  const floorDef = map.floors.find((item) => item.floor === floor);
  if (!floorDef) return [];
  return floorDef.roomIds.map((id) => map.roomsById[id]).filter(Boolean);
}

export function isRoomAvailable(map, roomId) {
  if (!map || !roomId) return false;
  return (map.availableRoomIds || []).includes(roomId);
}

export function enterMapRoom(map, roomId) {
  const room = getRoom(map, roomId);
  if (!room) return null;
  map.currentRoomId = roomId;
  room.visited = true;
  if (room.type === 'mystery') revealMysteryRoom(room);
  return room;
}

export function completeMapRoom(map, roomId) {
  const room = getRoom(map, roomId);
  if (!room) return { room: null, isRunCompleted: false };
  room.cleared = true;

  // Single-path progression: after clearing a room, only its direct next-floor
  // connections remain available. Do not keep sibling rooms on the same floor.
  const next = new Set();
  room.connections.forEach((childId) => {
    const child = getRoom(map, childId);
    if (!child || child.cleared) return;
    next.add(childId);
  });
  map.availableRoomIds = [...next];

  const hasPending = Object.values(map.roomsById).some((item) => item.payload && item.payload.finalBoss && !item.cleared);
  return { room, isRunCompleted: !hasPending };
}
