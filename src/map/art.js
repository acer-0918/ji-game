export function getMapNodeArtPath(nodeType) {
  return `assets/map/nodes/${nodeType}.png`;
}

export function getMapEventArtPath(eventId) {
  return `assets/cards/event/${eventId}.png`;
}

export function getMapBackgroundArtPath(theme = 'default') {
  return `assets/map/background/${theme}.png`;
}
