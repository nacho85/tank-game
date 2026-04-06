export {
  ONLINE_BASE_DEFS,
  ONLINE_ROLE_SPAWNS,
  getOnlineBaseDefByAnchor,
  getOnlineBaseWorld,
  getOnlineSpawnWorld,
  createOnline2v2Level,
  bigCellCenterX,
  bigCellCenterY,
} from "../../src/game/phaser/shared/onlineMapShared.js";

import { SURVIVAL_GRID_HEIGHT, SURVIVAL_GRID_WIDTH, TILE, OUTER_BORDER_SIZE, TILE_SIZE } from "../../src/game/phaser/shared/constants.js";

const GRID_WIDTH = SURVIVAL_GRID_WIDTH;
const GRID_HEIGHT = SURVIVAL_GRID_HEIGHT;

export function worldToGridCol(worldX, originX = 0) {
  return Math.floor((worldX - originX - OUTER_BORDER_SIZE) / TILE_SIZE);
}

export function worldToGridRow(worldY, originY = 0) {
  return Math.floor((worldY - originY - OUTER_BORDER_SIZE) / TILE_SIZE);
}

export function inBounds(col, row) {
  return col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT;
}

export function isDestructibleTile(tile) {
  return tile === TILE.BRICK;
}

export function isBlockingTile(tile) {
  return tile === TILE.BRICK || tile === TILE.STEEL || tile === TILE.WATER || tile === TILE.BASE;
}
