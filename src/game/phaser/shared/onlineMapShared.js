import { OUTER_BORDER_SIZE, SURVIVAL_GRID_HEIGHT, SURVIVAL_GRID_WIDTH, TILE, TILE_SIZE } from "./constants.js";
import { clamp } from "./math.js";
import { cloneMatrix, makeMatrix } from "./levelGeneration.js";

export const ONLINE_GRID_WIDTH = SURVIVAL_GRID_WIDTH;
export const ONLINE_GRID_HEIGHT = SURVIVAL_GRID_HEIGHT;

const GRID_WIDTH = ONLINE_GRID_WIDTH;
const GRID_HEIGHT = ONLINE_GRID_HEIGHT;
const BASE_ANCHOR_ROW = Math.floor((GRID_HEIGHT - 2) / 2);
const LEFT_BASE_ANCHOR_COL = 0;
const RIGHT_BASE_ANCHOR_COL = GRID_WIDTH - 2;
const BASE_ZONE_TOP_ROW = BASE_ANCHOR_ROW - 4;
const BASE_ZONE_HEIGHT = 10;
const BASE_ZONE_WIDTH = 6;
const WEST_ROAD_START_COL = 0;
const EAST_ROAD_START_COL = GRID_WIDTH - BASE_ZONE_WIDTH;
const WEST_BRICK_START_COL = 0;
const EAST_BRICK_START_COL = GRID_WIDTH - 4;
const BRICK_TOP_ROW = BASE_ANCHOR_ROW - 2;
const BRICK_HEIGHT = 6;

function randInt(localRandom, min, max) {
  return min + Math.floor(localRandom() * (max - min + 1));
}

function inBounds(col, row) {
  return col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT;
}

export function bigCellCenterX(col, originX = 0) {
  return originX + OUTER_BORDER_SIZE + col * TILE_SIZE + TILE_SIZE;
}

export function bigCellCenterY(row, originY = 0) {
  return originY + OUTER_BORDER_SIZE + row * TILE_SIZE + TILE_SIZE;
}

function fillRect(matrix, value, startCol, startRow, width, height) {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (matrix[row]?.[col] === undefined) continue;
      matrix[row][col] = value;
    }
  }
}

function clearOverlayRect(level, startCol, startRow, width, height) {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (!inBounds(col, row)) continue;
      level.overlay[row][col] = null;
    }
  }
}

function ensureWaterMask(level) {
  if (!level.waterMask) level.waterMask = makeMatrix(false, GRID_WIDTH, GRID_HEIGHT);
  return level.waterMask;
}

function markWater(level, col, row, value = true) {
  if (!inBounds(col, row)) return;
  ensureWaterMask(level)[row][col] = value;
}

function syncWaterMaskFromObstacles(level) {
  const waterMask = ensureWaterMask(level);
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      waterMask[row][col] = level.obstacles[row][col] === TILE.WATER;
    }
  }
}

function isWaterCell(level, col, row) {
  return inBounds(col, row) && Boolean(ensureWaterMask(level)[row][col]);
}

function setGround(level, col, row, floorTile = TILE.GROUND) {
  if (!inBounds(col, row)) return;
  if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK) return;
  level.obstacles[row][col] = null;
  markWater(level, col, row, false);
  level.floor[row][col] = floorTile;
}

function setWater(level, col, row) {
  if (!inBounds(col, row)) return;
  if (isInBaseProtectedZone(col, row)) return;
  level.obstacles[row][col] = TILE.WATER;
  markWater(level, col, row, true);
  level.overlay[row][col] = null;
}

function cloneLevel(level) {
  return {
    floor: cloneMatrix(level.floor),
    overlay: cloneMatrix(level.overlay),
    obstacles: cloneMatrix(level.obstacles),
    waterMask: cloneMatrix(ensureWaterMask(level)),
  };
}

function isWalkableCell(level, col, row) {
  if (!inBounds(col, row)) return false;
  const tile = level.obstacles[row][col];
  return !isWaterCell(level, col, row) && tile !== TILE.BASE && tile !== TILE.BRICK && tile !== TILE.STEEL;
}

function hasGroundPath(level, from, to) {
  if (!isWalkableCell(level, from.col, from.row) || !isWalkableCell(level, to.col, to.row)) return false;
  const visited = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(false));
  const queue = [{ col: from.col, row: from.row }];
  visited[from.row][from.col] = true;
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (current.col === to.col && current.row === to.row) return true;
    const neighbors = [
      { col: current.col + 1, row: current.row },
      { col: current.col - 1, row: current.row },
      { col: current.col, row: current.row + 1 },
      { col: current.col, row: current.row - 1 },
    ];
    neighbors.forEach(({ col, row }) => {
      if (!inBounds(col, row) || visited[row][col] || !isWalkableCell(level, col, row)) return;
      visited[row][col] = true;
      queue.push({ col, row });
    });
  }
  return false;
}

function anyAdjacentWater(level, cells, padding = 1) {
  return cells.some(({ col, row }) => {
    for (let dy = -padding; dy <= padding; dy += 1) {
      for (let dx = -padding; dx <= padding; dx += 1) {
        const targetCol = col + dx;
        const targetRow = row + dy;
        if (!inBounds(targetCol, targetRow)) continue;
        if (isWaterCell(level, targetCol, targetRow)) return true;
      }
    }
    return false;
  });
}

function collectEllipseCells(centerCol, centerRow, radiusX, radiusY, localRandom) {
  const cells = [];
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!inBounds(col, row)) continue;
      const nx = (col - centerCol) / Math.max(1, radiusX);
      const ny = (row - centerRow) / Math.max(1, radiusY);
      const d = (nx * nx) + (ny * ny);
      if (d <= 1 + (localRandom() - 0.5) * 0.12) cells.push({ col, row });
    }
  }
  return cells;
}

function canPlaceLake(level, cells, options = {}) {
  const { requireWestEastPath = true, keepLandRows = [] } = options;
  if (cells.length === 0) return false;
  if (cells.some(({ col, row }) => isInBaseProtectedZone(col, row))) return false;
  if (cells.some(({ row }) => keepLandRows.includes(row))) return false;
  if (anyAdjacentWater(level, cells, 1)) return false;

  const trial = cloneLevel(level);
  cells.forEach(({ col, row }) => {
    trial.obstacles[row][col] = TILE.WATER;
    markWater(trial, col, row, true);
    trial.overlay[row][col] = null;
  });

  if (!requireWestEastPath) return true;
  const westGate = { col: WEST_ROAD_START_COL + BASE_ZONE_WIDTH, row: BASE_ANCHOR_ROW };
  const eastGate = { col: EAST_ROAD_START_COL - 1, row: BASE_ANCHOR_ROW };
  return hasGroundPath(trial, westGate, eastGate);
}

function placeLake(level, cells) {
  cells.forEach(({ col, row }) => setWater(level, col, row));
}

function isInRoadZone(col, row) {
  return (
    (col >= WEST_ROAD_START_COL && col < WEST_ROAD_START_COL + BASE_ZONE_WIDTH && row >= BASE_ZONE_TOP_ROW && row < BASE_ZONE_TOP_ROW + BASE_ZONE_HEIGHT) ||
    (col >= EAST_ROAD_START_COL && col < EAST_ROAD_START_COL + BASE_ZONE_WIDTH && row >= BASE_ZONE_TOP_ROW && row < BASE_ZONE_TOP_ROW + BASE_ZONE_HEIGHT)
  );
}

function isInBaseProtectedZone(col, row) {
  return isInRoadZone(col, row);
}

function applyBaseRoadZones(level) {
  fillRect(level.floor, TILE.ROAD, WEST_ROAD_START_COL, BASE_ZONE_TOP_ROW, BASE_ZONE_WIDTH, BASE_ZONE_HEIGHT);
  fillRect(level.floor, TILE.ROAD, EAST_ROAD_START_COL, BASE_ZONE_TOP_ROW, BASE_ZONE_WIDTH, BASE_ZONE_HEIGHT);
  clearOverlayRect(level, WEST_ROAD_START_COL, BASE_ZONE_TOP_ROW, BASE_ZONE_WIDTH, BASE_ZONE_HEIGHT);
  clearOverlayRect(level, EAST_ROAD_START_COL, BASE_ZONE_TOP_ROW, BASE_ZONE_WIDTH, BASE_ZONE_HEIGHT);
  for (let row = BASE_ZONE_TOP_ROW; row < BASE_ZONE_TOP_ROW + BASE_ZONE_HEIGHT; row += 1) {
    for (let col = WEST_ROAD_START_COL; col < WEST_ROAD_START_COL + BASE_ZONE_WIDTH; col += 1) {
      if (level.obstacles[row][col] !== TILE.BRICK && level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = null;
    }
    for (let col = EAST_ROAD_START_COL; col < EAST_ROAD_START_COL + BASE_ZONE_WIDTH; col += 1) {
      if (level.obstacles[row][col] !== TILE.BRICK && level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = null;
    }
  }
}

function stampBaseFortresses(level) {
  fillRect(level.obstacles, TILE.BRICK, WEST_BRICK_START_COL, BRICK_TOP_ROW, 4, BRICK_HEIGHT);
  fillRect(level.obstacles, TILE.BRICK, EAST_BRICK_START_COL, BRICK_TOP_ROW, 4, BRICK_HEIGHT);

  const bases = [ONLINE_BASE_DEFS.south, ONLINE_BASE_DEFS.north];
  bases.forEach((def) => {
    for (let row = def.anchorRow; row <= def.anchorRow + 1; row += 1) {
      for (let col = def.anchorCol; col <= def.anchorCol + 1; col += 1) {
        level.obstacles[row][col] = TILE.BASE;
      }
    }
  });
}

function resetLevel(level, floorTile = TILE.GROUND) {
  const waterMask = ensureWaterMask(level);
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      level.floor[row][col] = floorTile;
      level.overlay[row][col] = null;
      level.obstacles[row][col] = null;
      waterMask[row][col] = false;
    }
  }
}

function paintEllipse(level, centerCol, centerRow, radiusX, radiusY, painter, localRandom) {
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!inBounds(col, row)) continue;
      const nx = (col - centerCol) / Math.max(1, radiusX);
      const ny = (row - centerRow) / Math.max(1, radiusY);
      const d = (nx * nx) + (ny * ny);
      if (d <= 1 + (localRandom() - 0.5) * 0.16) painter(level, col, row);
    }
  }
}

function carveRoadPath(level, points, thickness = 2) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const col = Math.round(from.col + (to.col - from.col) * t);
      const row = Math.round(from.row + (to.row - from.row) * t);
      for (let dy = 0; dy < thickness; dy += 1) {
        for (let dx = 0; dx < thickness; dx += 1) {
          const targetCol = col + dx;
          const targetRow = row + dy;
          if (!inBounds(targetCol, targetRow)) continue;
          if (level.obstacles[targetRow][targetCol] === TILE.BASE || level.obstacles[targetRow][targetCol] === TILE.BRICK) continue;
          level.floor[targetRow][targetCol] = TILE.ROAD;
          level.obstacles[targetRow][targetCol] = null;
          level.overlay[targetRow][targetCol] = null;
        }
      }
    }
  }
}

function canPlaceBushAt(level, col, row, waterPadding = 1) {
  if (!inBounds(col, row) || isInRoadZone(col, row)) return false;
  if (isWaterCell(level, col, row) || level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK || level.obstacles[row][col] === TILE.STEEL) return false;
  if (level.floor[row][col] === TILE.ROAD) return false;
  if (isNearWater(level, col, row, waterPadding)) return false;
  return true;
}

function collectBushableCells(level, waterPadding = 1) {
  const cells = [];
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (canPlaceBushAt(level, col, row, waterPadding)) cells.push({ col, row });
    }
  }
  return cells;
}

function collectCoastalBushableCells(level) {
  const cells = [];
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (!inBounds(col, row) || isInRoadZone(col, row)) continue;
      if (isWaterCell(level, col, row)) continue;
      if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK || level.obstacles[row][col] === TILE.STEEL) continue;
      if (level.floor[row][col] === TILE.ROAD) continue;
      if (!isNearWater(level, col, row, 1)) continue;
      cells.push({ col, row });
    }
  }
  return cells;
}

function scatterBushClusters(level, { clusterCount, minRadius, maxRadius, density, excludeCell, waterPadding = 1 }, localRandom) {
  const bushableCells = collectBushableCells(level, waterPadding);
  if (bushableCells.length === 0) return;

  for (let i = 0; i < clusterCount; i += 1) {
    const center = bushableCells[randInt(localRandom, 0, bushableCells.length - 1)];
    const centerCol = center.col;
    const centerRow = center.row;
    const radiusX = randInt(localRandom, minRadius, maxRadius);
    const radiusY = randInt(localRandom, minRadius, maxRadius);
    for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
      for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
        if (!canPlaceBushAt(level, col, row, waterPadding)) continue;
        if (excludeCell && excludeCell(col, row)) continue;
        const nx = (col - centerCol) / Math.max(1, radiusX);
        const ny = (row - centerRow) / Math.max(1, radiusY);
        const d = (nx * nx) + (ny * ny);
        if (d <= 1.1 && localRandom() < density) level.overlay[row][col] = TILE.BUSH;
      }
    }
  }
}

function scatterCoastalBushClusters(level, { clusterCount, minRadius, maxRadius, density, excludeCell }, localRandom) {
  const bushableCells = collectCoastalBushableCells(level);
  if (bushableCells.length === 0) return;

  for (let i = 0; i < clusterCount; i += 1) {
    const center = bushableCells[randInt(localRandom, 0, bushableCells.length - 1)];
    const centerCol = center.col;
    const centerRow = center.row;
    const radiusX = randInt(localRandom, minRadius, maxRadius);
    const radiusY = randInt(localRandom, minRadius, maxRadius);
    for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
      for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
        if (!inBounds(col, row) || isInRoadZone(col, row)) continue;
        if (isWaterCell(level, col, row)) continue;
        if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK || level.obstacles[row][col] === TILE.STEEL) continue;
        if (level.floor[row][col] === TILE.ROAD) continue;
        if (!isNearWater(level, col, row, 1)) continue;
        if (excludeCell && excludeCell(col, row)) continue;
        const nx = (col - centerCol) / Math.max(1, radiusX);
        const ny = (row - centerRow) / Math.max(1, radiusY);
        const d = (nx * nx) + (ny * ny);
        if (d <= 1.15 && localRandom() < density) level.overlay[row][col] = TILE.BUSH;
      }
    }
  }
}

function isNearWater(level, col, row, padding = 1) {
  for (let dy = -padding; dy <= padding; dy += 1) {
    for (let dx = -padding; dx <= padding; dx += 1) {
      const targetCol = col + dx;
      const targetRow = row + dy;
      if (!inBounds(targetCol, targetRow)) continue;
      if (isWaterCell(level, targetCol, targetRow)) return true;
    }
  }
  return false;
}

function sanitizeBushes(level, waterPadding = 1) {
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (level.overlay[row][col] !== TILE.BUSH) continue;
      if (!canPlaceBushAt(level, col, row, waterPadding)) {
        level.overlay[row][col] = null;
      }
    }
  }
}

function forceClearBushesOnWater(level) {
  const waterMask = ensureWaterMask(level);
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (waterMask[row][col]) level.overlay[row][col] = null;
    }
  }
}

function countWater(level) {
  let count = 0;
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (isWaterCell(level, col, row)) count += 1;
    }
  }
  return count;
}

function generateNormalMap(level, localRandom) {
  const maxWater = Math.floor(GRID_WIDTH * GRID_HEIGHT * 0.35);
  const targetLakeCount = randInt(localRandom, 1, 3);
  const keepLandRows = [
    BASE_ANCHOR_ROW - 2,
    BASE_ANCHOR_ROW - 1,
    BASE_ANCHOR_ROW,
    BASE_ANCHOR_ROW + 1,
    BASE_ANCHOR_ROW + 2,
  ];
  const lakeBandCenters = [
    Math.floor(GRID_WIDTH * 0.2),
    Math.floor(GRID_WIDTH * 0.5),
    Math.floor(GRID_WIDTH * 0.8),
  ];

  for (let lakeIndex = 0; lakeIndex < targetLakeCount; lakeIndex += 1) {
    let placed = false;
    for (let attempts = 0; attempts < 40 && !placed && countWater(level) < maxWater; attempts += 1) {
      const bandCenter = lakeBandCenters[lakeIndex] ?? randInt(localRandom, 10, GRID_WIDTH - 11);
      const centerCol = clamp(bandCenter + randInt(localRandom, -2, 2), 9, GRID_WIDTH - 10);
      const upperHalf = localRandom() < 0.5;
      const centerRow = upperHalf
        ? randInt(localRandom, 5, Math.max(5, BASE_ANCHOR_ROW - 5))
        : randInt(localRandom, Math.min(GRID_HEIGHT - 6, BASE_ANCHOR_ROW + 5), GRID_HEIGHT - 6);
      const radiusX = randInt(localRandom, 5, 7);
      const radiusY = randInt(localRandom, 4, 6);
      const cells = collectEllipseCells(centerCol, centerRow, radiusX, radiusY, localRandom)
        .filter(({ row, col }) => row >= 2 && row <= GRID_HEIGHT - 3 && col >= 2 && col <= GRID_WIDTH - 3 && !keepLandRows.includes(row));
      if (cells.length === 0) continue;
      if (!canPlaceLake(level, cells, { keepLandRows })) continue;
      if (countWater(level) + cells.length > maxWater) continue;
      placeLake(level, cells);
      placed = true;
    }
  }

  // Paint a 2x2 road cell clearing waterMask
  function paintRoadCell2(col, row) {
    for (let dc = 0; dc < 2; dc += 1) {
      for (let dr = 0; dr < 2; dr += 1) {
        const tc = col + dc;
        const tr = row + dr;
        if (!inBounds(tc, tr)) continue;
        if (level.obstacles[tr][tc] === TILE.BASE || level.obstacles[tr][tc] === TILE.BRICK) continue;
        level.obstacles[tr][tc] = null;
        markWater(level, tc, tr, false);
        level.floor[tr][tc] = TILE.ROAD;
        level.overlay[tr][tc] = null;
      }
    }
  }

  // Check if a 2x2 block starting at (col, row) is free of water
  function isRoadable(col, row) {
    for (let dc = 0; dc < 2; dc += 1) {
      for (let dr = 0; dr < 2; dr += 1) {
        const tc = col + dc;
        const tr = row + dr;
        if (!inBounds(tc, tr)) return false;
        if (isWaterCell(level, tc, tr)) return false;
      }
    }
    return true;
  }

  // BFS pathfinding on grid that avoids water, returns path of {col,row} or null
  function findDryPath(fromCol, fromRow, toCol, toRow) {
    const visited = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(false));
    const prev = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null));
    const queue = [{ col: fromCol, row: fromRow }];
    visited[fromRow][fromCol] = true;
    const dirs = [{ dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 }];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.col === toCol && cur.row === toRow) {
        // Reconstruct path
        const path = [];
        let node = cur;
        while (node) {
          path.unshift(node);
          node = prev[node.row][node.col];
        }
        return path;
      }
      for (const { dc, dr } of dirs) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (!inBounds(nc, nr) || visited[nr][nc]) continue;
        if (!isRoadable(nc, nr)) continue;
        visited[nr][nc] = true;
        prev[nr][nc] = cur;
        queue.push({ col: nc, row: nr });
      }
    }
    return null; // no dry path found
  }

  // Carve a road along a BFS path; if no dry path exists, skip
  function carvePathRoad(fromCol, fromRow, toCol, toRow) {
    const path = findDryPath(fromCol, fromRow, toCol, toRow);
    if (!path) return;
    path.forEach(({ col, row }) => paintRoadCell2(col, row));
  }

  const wGate = WEST_ROAD_START_COL + BASE_ZONE_WIDTH - 1;  // col 5
  const eGate = EAST_ROAD_START_COL;                         // col 40
  const MID_COL = Math.floor(GRID_WIDTH / 2);

  // Central lane at BASE_ANCHOR_ROW
  carvePathRoad(wGate, BASE_ANCHOR_ROW, eGate, BASE_ANCHOR_ROW);

  // 1-2 extra lanes at rows spread away from center, routed around lakes
  const laneCount = randInt(localRandom, 1, 2);
  const candidates = [];
  for (let r = 3; r < GRID_HEIGHT - 3; r += 1) {
    if (Math.abs(r - BASE_ANCHOR_ROW) >= 4) candidates.push(r);
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(localRandom() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const extraLanes = [];
  for (const r of candidates) {
    if (extraLanes.every((er) => Math.abs(er - r) >= 4)) {
      extraLanes.push(r);
      if (extraLanes.length >= laneCount) break;
    }
  }

  extraLanes.forEach((laneRow) => {
    // Use a mid waypoint then BFS each segment
    const midOffset = randInt(localRandom, -4, 4);
    const midCol = clamp(MID_COL + midOffset, 8, GRID_WIDTH - 9);
    carvePathRoad(wGate, BASE_ANCHOR_ROW, midCol, laneRow);
    carvePathRoad(midCol, laneRow, eGate, BASE_ANCHOR_ROW);
  });

  const excludeBushCell = (col, row) => !canPlaceBushAt(level, col, row, 0);
  scatterBushClusters(level, { clusterCount: 16, minRadius: 2, maxRadius: 4, density: 0.82, excludeCell: excludeBushCell, waterPadding: 0 }, localRandom);
  scatterBushClusters(level, { clusterCount: 8, minRadius: 1, maxRadius: 3, density: 0.76, excludeCell: excludeBushCell, waterPadding: 0 }, localRandom);
  sanitizeBushes(level, 0);
}

function generateRiverMap(level, localRandom) {
  const diagonal = localRandom() < 0.6;
  const riverWidth = randInt(localRandom, 4, 5);
  const riverCentersByRow = [];
  let centerCol = randInt(localRandom, Math.floor(GRID_WIDTH * 0.28), Math.floor(GRID_WIDTH * 0.72));

  function paintRoadCell(col, row) {
    if (!inBounds(col, row)) return;
    if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK) return;
    level.floor[row][col] = TILE.ROAD;
    level.obstacles[row][col] = null;
    level.overlay[row][col] = null;
    markWater(level, col, row, false);
  }

  function paintRoadBrush(centerCol, centerRow, width) {
    const startCol = centerCol - Math.floor(width / 2);
    const startRow = centerRow - Math.floor(width / 2);
    for (let dy = 0; dy < width; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        paintRoadCell(startCol + dx, startRow + dy);
      }
    }
  }

  function carveRoadPathWide(points, width) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i];
      const to = points[i + 1];
      const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row), 1);
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const col = Math.round(from.col + (to.col - from.col) * t);
        const row = Math.round(from.row + (to.row - from.row) * t);
        paintRoadBrush(col, row, width);
      }
    }
  }

  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    if (diagonal) {
      if (row > 0 && localRandom() < 0.92) centerCol = clamp(centerCol + (localRandom() < 0.7 ? 1 : 0), 6, GRID_WIDTH - 7);
    } else if (localRandom() < 0.3) {
      centerCol = clamp(centerCol + (localRandom() < 0.5 ? -1 : 1), 6, GRID_WIDTH - 7);
    }
    riverCentersByRow[row] = centerCol;
    for (let offset = -Math.floor(riverWidth / 2); offset <= Math.floor(riverWidth / 2); offset += 1) {
      setWater(level, centerCol + offset, row);
    }
  }

  const bridgeCount = randInt(localRandom, 2, 3);
  const wideBridgeIndex = randInt(localRandom, 0, bridgeCount - 1);
  const usedRows = [];
  while (usedRows.length < bridgeCount) {
    const candidate = randInt(localRandom, 4, GRID_HEIGHT - 5);
    if (usedRows.every((row) => Math.abs(row - candidate) >= 5)) usedRows.push(candidate);
  }
  usedRows.sort((a, b) => a - b);

  const leftGate = { col: WEST_ROAD_START_COL + BASE_ZONE_WIDTH - 1, row: BASE_ANCHOR_ROW };
  const rightGate = { col: EAST_ROAD_START_COL, row: BASE_ANCHOR_ROW };

  function paintBridgeSpan(centerRow, width) {
    const rowStart = clamp(centerRow - Math.floor(width / 2), 0, GRID_HEIGHT - width);
    let minCol = GRID_WIDTH - 1;
    let maxCol = 0;
    for (let row = rowStart; row < rowStart + width; row += 1) {
      const center = riverCentersByRow[row];
      if (center === undefined) continue;
      const spanMin = clamp(center - Math.floor(riverWidth / 2) - 1, 0, GRID_WIDTH - 1);
      const spanMax = clamp(center + Math.floor(riverWidth / 2) + 1, 0, GRID_WIDTH - 1);
      minCol = Math.min(minCol, spanMin);
      maxCol = Math.max(maxCol, spanMax);
      for (let col = spanMin; col <= spanMax; col += 1) paintRoadCell(col, row);
    }
    return {
      rowStart,
      rowEnd: rowStart + width - 1,
      centerRow: rowStart + Math.floor(width / 2),
      minCol,
      maxCol,
      width,
    };
  }

  usedRows.forEach((row, index) => {
    const bridgeWidth = index === wideBridgeIndex ? 3 : 2;
    const span = paintBridgeSpan(row, bridgeWidth);

    // Paint road from left gate down/up to the bridge rows, then across to the bridge
    // We paint each row of the bridge span independently to ensure alignment
    for (let bridgeRow = span.rowStart; bridgeRow <= span.rowEnd; bridgeRow += 1) {
      // Vertical segment: from gate col, between BASE_ANCHOR_ROW and this bridge row
      const rowMin = Math.min(BASE_ANCHOR_ROW, bridgeRow);
      const rowMax = Math.max(BASE_ANCHOR_ROW, bridgeRow);
      for (let r = rowMin; r <= rowMax; r += 1) {
        paintRoadCell(leftGate.col, r);
        paintRoadCell(leftGate.col + 1, r);
        paintRoadCell(rightGate.col, r);
        paintRoadCell(rightGate.col - 1, r);
      }
      // Horizontal segment: from gate col to bridge edge
      for (let c = leftGate.col; c <= span.minCol; c += 1) {
        paintRoadCell(c, bridgeRow);
      }
      for (let c = span.maxCol; c <= rightGate.col; c += 1) {
        paintRoadCell(c, bridgeRow);
      }
    }
  });

  scatterCoastalBushClusters(level, { clusterCount: 30, minRadius: 2, maxRadius: 4, density: 0.9 }, localRandom);
  scatterCoastalBushClusters(level, { clusterCount: 18, minRadius: 1, maxRadius: 3, density: 0.86 }, localRandom);
  scatterBushClusters(level, { clusterCount: 12, minRadius: 1, maxRadius: 3, density: 0.72, waterPadding: 0 }, localRandom);
  forceClearBushesOnWater(level);
}

function generateOpenIslandMap(level, localRandom) {
  // Fill everything with water
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (isInBaseProtectedZone(col, row)) continue;
      level.obstacles[row][col] = TILE.WATER;
      markWater(level, col, row, true);
    }
  }

  // Paint a 2x2 road cell (always axis-aligned, no diagonals)
  function paintRoadCell2(col, row) {
    for (let dc = 0; dc < 2; dc += 1) {
      for (let dr = 0; dr < 2; dr += 1) {
        const tc = col + dc;
        const tr = row + dr;
        if (!inBounds(tc, tr)) continue;
        if (level.obstacles[tr][tc] === TILE.BASE || level.obstacles[tr][tc] === TILE.BRICK) continue;
        level.obstacles[tr][tc] = null;
        markWater(level, tc, tr, false);
        level.floor[tr][tc] = TILE.ROAD;
        level.overlay[tr][tc] = null;
      }
    }
  }

  // Carve an L-shaped road between two points (horiz first, then vert)
  function carveL(fromCol, fromRow, toCol, toRow) {
    const c0 = Math.min(fromCol, toCol);
    const c1 = Math.max(fromCol, toCol);
    for (let c = c0; c <= c1; c += 1) paintRoadCell2(c, fromRow);
    const r0 = Math.min(fromRow, toRow);
    const r1 = Math.max(fromRow, toRow);
    for (let r = r0; r <= r1; r += 1) paintRoadCell2(toCol, r);
  }

  // Paint a large ground island (ellipse), properly clearing waterMask
  function paintIsland(centerCol, centerRow, rx, ry) {
    for (let row = centerRow - ry - 1; row <= centerRow + ry + 1; row += 1) {
      for (let col = centerCol - rx - 1; col <= centerCol + rx + 1; col += 1) {
        if (!inBounds(col, row)) continue;
        if (isInBaseProtectedZone(col, row)) continue;
        const nx = (col - centerCol) / Math.max(1, rx);
        const ny = (row - centerRow) / Math.max(1, ry);
        if ((nx * nx) + (ny * ny) <= 1 + (localRandom() - 0.5) * 0.18) {
          setGround(level, col, row, TILE.GROUND);
        }
      }
    }
  }

  const MID_ROW = Math.floor(GRID_HEIGHT / 2);
  const MID_COL = Math.floor(GRID_WIDTH / 2);

  // Islands: center close to the base so the oval connects naturally
  const wIslandCol = 8 + randInt(localRandom, -1, 1);
  const eIslandCol = GRID_WIDTH - 9 + randInt(localRandom, -1, 1);
  const wRx = 9 + randInt(localRandom, 0, 2);
  const wRy = 7 + randInt(localRandom, -1, 2);
  const eRx = 9 + randInt(localRandom, 0, 2);
  const eRy = 7 + randInt(localRandom, -1, 2);
  const wAnchorRow = BASE_ANCHOR_ROW + randInt(localRandom, -1, 1);
  const eAnchorRow = BASE_ANCHOR_ROW + randInt(localRandom, -1, 1);
  paintIsland(wIslandCol, wAnchorRow, wRx, wRy);
  paintIsland(eIslandCol, eAnchorRow, eRx, eRy);

  // Base-side land: organic shape above and below the protected zone.
  // Each row gets a slightly different right-edge, making it irregular.
  // Top band: rows 2–7, bottom band: rows 18–22
  // Width per row varies with a simple noise step.
  function paintOrganicStrip(colStart, colMax, rowStart, rowEnd, goRight) {
    let width = randInt(localRandom, 3, colMax - colStart);
    for (let r = rowStart; r <= rowEnd; r += 1) {
      // Random walk the width ±1
      width = clamp(width + randInt(localRandom, -1, 1), 2, colMax - colStart);
      const c0 = goRight ? colStart : colStart - width;
      const c1 = goRight ? colStart + width : colStart;
      for (let c = c0; c <= c1; c += 1) {
        if (!inBounds(c, r)) continue;
        setGround(level, c, r, TILE.GROUND);
      }
    }
  }

  // West base: cols grow rightward from col 0
  paintOrganicStrip(0, 5, 2, 7,  true);
  paintOrganicStrip(0, 5, 18, 22, true);
  // East base: cols grow leftward from col 45
  paintOrganicStrip(GRID_WIDTH - 1, 5, 2, 7,  false);
  paintOrganicStrip(GRID_WIDTH - 1, 5, 18, 22, false);



  // Base gates (where road exits base zone)
  const wGateCol = WEST_ROAD_START_COL + BASE_ZONE_WIDTH - 1;
  const eGateCol = EAST_ROAD_START_COL;

  // Randomly decide if there's a small mid island (north or south variant, or none)
  const midVariant = randInt(localRandom, 0, 2); // 0=none, 1=north island, 2=south island
  const midIslandRow = midVariant === 1
    ? randInt(localRandom, 3, MID_ROW - 4)
    : randInt(localRandom, MID_ROW + 4, GRID_HEIGHT - 4);

  if (midVariant > 0) {
    paintIsland(MID_COL, midIslandRow, 4, 3);
    // Connect west island → mid island → east island via L roads
    carveL(wIslandCol, BASE_ANCHOR_ROW, MID_COL, midIslandRow);
    carveL(MID_COL, midIslandRow, eIslandCol, BASE_ANCHOR_ROW);
  } else {
    // Direct connection: two horizontal roads at top and bottom of the gap
    const topRow = MID_ROW - 3;
    const botRow = MID_ROW + 3;
    carveL(wIslandCol, BASE_ANCHOR_ROW, MID_COL, topRow);
    carveL(MID_COL, topRow, eIslandCol, BASE_ANCHOR_ROW);
    carveL(wIslandCol, BASE_ANCHOR_ROW, MID_COL, botRow);
    carveL(MID_COL, botRow, eIslandCol, BASE_ANCHOR_ROW);
  }

  // Connect base zones to their islands
  carveL(wGateCol, BASE_ANCHOR_ROW, wIslandCol, BASE_ANCHOR_ROW);
  carveL(eGateCol, BASE_ANCHOR_ROW, eIslandCol, BASE_ANCHOR_ROW);

  scatterBushClusters(level, { clusterCount: 10, minRadius: 1, maxRadius: 3, density: 0.7, waterPadding: 0 }, localRandom);
  scatterCoastalBushClusters(level, { clusterCount: 8, minRadius: 1, maxRadius: 2, density: 0.75 }, localRandom);
  forceClearBushesOnWater(level);
}

function generateArchipelagoMap(level, localRandom) {
  // Fill everything with water first
  for (let row = 0; row < GRID_HEIGHT; row += 1) {
    for (let col = 0; col < GRID_WIDTH; col += 1) {
      if (isInBaseProtectedZone(col, row)) continue;
      level.obstacles[row][col] = TILE.WATER;
      markWater(level, col, row, true);
    }
  }

  // Paint a single row or column strip of road cells (no diagonal interpolation)
  function paintRoadStrip(col, row) {
    // Always paints a 2-wide strip anchored at (col, row) going right+down
    for (let dc = 0; dc < 2; dc += 1) {
      for (let dr = 0; dr < 2; dr += 1) {
        const tc = col + dc;
        const tr = row + dr;
        if (!inBounds(tc, tr)) continue;
        if (level.obstacles[tr][tc] === TILE.BASE || level.obstacles[tr][tc] === TILE.BRICK) continue;
        level.obstacles[tr][tc] = null;
        markWater(level, tc, tr, false);
        level.floor[tr][tc] = TILE.ROAD;
        level.overlay[tr][tc] = null;
      }
    }
  }

  // Carve an L-shaped road: horizontal first, then vertical (or vice versa).
  // This avoids diagonal interpolation that produces 1-cell-wide corners.
  function carveL(fromCol, fromRow, toCol, toRow) {
    // Horizontal segment: fromCol → toCol at fromRow
    const c0 = Math.min(fromCol, toCol);
    const c1 = Math.max(fromCol, toCol);
    for (let c = c0; c <= c1; c += 1) paintRoadStrip(c, fromRow);
    // Vertical segment: fromRow → toRow at toCol
    const r0 = Math.min(fromRow, toRow);
    const r1 = Math.max(fromRow, toRow);
    for (let r = r0; r <= r1; r += 1) paintRoadStrip(toCol, r);
  }

  // Helper: paint an island (ground ellipse) clearing water properly
  function paintIsland(centerCol, centerRow, rx, ry) {
    for (let row = centerRow - ry - 1; row <= centerRow + ry + 1; row += 1) {
      for (let col = centerCol - rx - 1; col <= centerCol + rx + 1; col += 1) {
        if (!inBounds(col, row)) continue;
        if (isInBaseProtectedZone(col, row)) continue;
        const nx = (col - centerCol) / Math.max(1, rx);
        const ny = (row - centerRow) / Math.max(1, ry);
        if ((nx * nx) + (ny * ny) <= 1 + (localRandom() - 0.5) * 0.15) {
          setGround(level, col, row, TILE.GROUND);
        }
      }
    }
  }

  const MID = Math.floor(GRID_HEIGHT / 2);
  const CX  = Math.floor(GRID_WIDTH / 2);

  // All possible island slots per column (top, mid, bot)
  const wSlots = [
    { col: 10, row: 5 },
    { col: 10, row: MID },
    { col: 10, row: GRID_HEIGHT - 6 },
  ];
  const cSlots = [
    { col: CX, row: 4 },
    { col: CX, row: MID },
    { col: CX, row: GRID_HEIGHT - 5 },
  ];
  const eSlots = [
    { col: GRID_WIDTH - 11, row: 5 },
    { col: GRID_WIDTH - 11, row: MID },
    { col: GRID_WIDTH - 11, row: GRID_HEIGHT - 6 },
  ];

  // Each column gets 2 or 3 islands randomly
  function pickIslands(slots) {
    const count = randInt(localRandom, 2, 3);
    if (count === 3) return [...slots];
    // Pick 2 out of 3 — always keep mid, randomly drop top or bottom
    const dropTop = localRandom() < 0.5;
    return dropTop ? [slots[1], slots[2]] : [slots[0], slots[1]];
  }

  const wIslands = pickIslands(wSlots);
  const cIslands = pickIslands(cSlots);
  const eIslands = pickIslands(eSlots);

  // Paint all chosen islands
  [...wIslands, ...cIslands, ...eIslands]
    .forEach(({ col, row }) => paintIsland(col, row, 4, 3));

  // Base gate positions
  const wGate = { col: WEST_ROAD_START_COL + BASE_ZONE_WIDTH - 1, row: BASE_ANCHOR_ROW };
  const eGate = { col: EAST_ROAD_START_COL, row: BASE_ANCHOR_ROW };

  // Connect base to each of its islands via L-shaped roads
  wIslands.forEach((island) => carveL(wGate.col, wGate.row, island.col, island.row));
  eIslands.forEach((island) => carveL(eGate.col, eGate.row, island.col, island.row));

  // Connect west islands → nearest center island (horizontal+vertical L)
  wIslands.forEach((wI) => {
    const nearest = cIslands.reduce((best, cI) =>
      Math.abs(cI.row - wI.row) < Math.abs(best.row - wI.row) ? cI : best
    );
    carveL(wI.col, wI.row, nearest.col, nearest.row);
  });

  // Connect center islands → nearest east island
  cIslands.forEach((cI) => {
    const nearest = eIslands.reduce((best, eI) =>
      Math.abs(eI.row - cI.row) < Math.abs(best.row - cI.row) ? eI : best
    );
    carveL(cI.col, cI.row, nearest.col, nearest.row);
  });

  // Connect islands within each column vertically (sorted by row)
  function connectColumn(islands) {
    const sorted = [...islands].sort((a, b) => a.row - b.row);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      carveL(sorted[i].col, sorted[i].row, sorted[i + 1].col, sorted[i + 1].row);
    }
  }
  connectColumn(wIslands);
  connectColumn(cIslands);
  connectColumn(eIslands);

  scatterBushClusters(level, { clusterCount: 8, minRadius: 1, maxRadius: 2, density: 0.65, waterPadding: 0 }, localRandom);
}

function applyMapAlgorithm(level, algorithmIndex, localRandom) {
  if (algorithmIndex === 0) {
    generateNormalMap(level, localRandom);
  } else if (algorithmIndex === 1) {
    generateRiverMap(level, localRandom);
  } else if (algorithmIndex === 2) {
    generateOpenIslandMap(level, localRandom);
  } else {
    generateArchipelagoMap(level, localRandom);
  }
}

export const ONLINE_BASE_DEFS = {
  south: {
    id: "south",
    label: "Base Oeste",
    team: "south",
    side: "west",
    anchorCol: LEFT_BASE_ANCHOR_COL,
    anchorRow: BASE_ANCHOR_ROW,
    hp: 10,
    radius: 54,
    spriteRotation: Math.PI / 2,
  },
  north: {
    id: "north",
    label: "Base Este",
    team: "north",
    side: "east",
    anchorCol: RIGHT_BASE_ANCHOR_COL,
    anchorRow: BASE_ANCHOR_ROW,
    hp: 10,
    radius: 54,
    spriteRotation: -Math.PI / 2,
  },
};

export function getOnlineBaseDefByAnchor(anchorCol, anchorRow) {
  return Object.values(ONLINE_BASE_DEFS).find((def) => def.anchorCol === anchorCol && def.anchorRow === anchorRow) || null;
}

export const ONLINE_ROLE_SPAWNS = {
  yellow: { id: "yellow", label: "Izq amarillo", team: "south", col: 0, row: BASE_ANCHOR_ROW - 4 },
  green: { id: "green", label: "Izq verde", team: "south", col: 0, row: BASE_ANCHOR_ROW + 4 },
  red: { id: "red", label: "Der rojo", team: "north", col: GRID_WIDTH - 2, row: BASE_ANCHOR_ROW - 4 },
  blue: { id: "blue", label: "Der azul", team: "north", col: GRID_WIDTH - 2, row: BASE_ANCHOR_ROW + 4 },
};

export function getOnlineSpawnWorld(roleId) {
  const def = ONLINE_ROLE_SPAWNS[roleId];
  if (!def) return null;
  return { ...def, x: bigCellCenterX(def.col, 0), y: bigCellCenterY(def.row, 0) };
}

export function getOnlineBaseWorld(baseId) {
  const def = ONLINE_BASE_DEFS[baseId];
  if (!def) return null;
  return { ...def, x: bigCellCenterX(def.anchorCol, 0), y: bigCellCenterY(def.anchorRow, 0) };
}

// Suaviza los bordes del agua con múltiples pasadas de cellular automaton.
// Elimina protrusions (celdas de agua aisladas en tierra) y rellena
// bahías pequeñas (huecos de tierra rodeados de agua), redondeando
// visualmente las costas sin romper la conectividad del mapa.
// Para el mapa río (algorithmIndex=1) usamos parámetros más conservadores
// para no destruir el río.
function smoothWaterEdges(level, passes = 3, fillThreshold = 6, erodeThreshold = 2) {
  for (let pass = 0; pass < passes; pass += 1) {
    // Snapshot del estado actual para que las decisiones sean simultáneas
    const snap = Array.from({ length: GRID_HEIGHT }, (_, r) =>
      Array.from({ length: GRID_WIDTH }, (_, c) => isWaterCell(level, c, r))
    );

    for (let row = 1; row < GRID_HEIGHT - 1; row += 1) {
      for (let col = 1; col < GRID_WIDTH - 1; col += 1) {
        if (isInBaseProtectedZone(col, row)) continue;
        const obs = level.obstacles[row][col];
        if (obs === TILE.BASE || obs === TILE.BRICK || obs === TILE.STEEL) continue;

        // Contar vecinos agua (8-direccional)
        let waterNeighbors = 0;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            if (snap[row + dr]?.[col + dc]) waterNeighbors += 1;
          }
        }

        const isWater = snap[row][col];
        if (!isWater && waterNeighbors >= fillThreshold) {
          // Tierra rodeada de mucha agua → convertir en agua (rellenar bahía)
          level.obstacles[row][col] = TILE.WATER;
          markWater(level, col, row, true);
        } else if (isWater && waterNeighbors <= erodeThreshold) {
          // Agua con pocos vecinos agua → convertir en tierra (eliminar protrusion)
          if (isInBaseProtectedZone(col, row)) continue;
          level.obstacles[row][col] = null;
          markWater(level, col, row, false);
          level.floor[row][col] = TILE.GROUND;
        }
      }
    }
  }
}

// Place obstacle structures (BRICK and STEEL) across the map.
// config: { structureCount, compoundChance, clusterChance, minSpacing }
// Forbidden zones: base protected area + 1-cell buffer.
function placeObstacles(level, localRandom, config = {}) {
  const {
    structureCount = [18, 24],  // [min, max]
    compoundChance = 0.75,      // probability of compound over isolated
    clusterChance = 0.45,       // probability of placing a cluster of 2-3 structures close together
    minSpacing = 3,             // min cells between independent structures
  } = config;

  function canPlaceCell(col, row) {
    if (!inBounds(col, row)) return false;
    if (isInBaseProtectedZone(col, row)) return false;
    if (isWaterCell(level, col, row)) return false;
    if (level.obstacles[row][col] !== null) return false;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (isInBaseProtectedZone(col + dc, row + dr)) return false;
      }
    }
    return true;
  }

  function canPlaceBlock(cells) {
    return cells.every(({ col, row }) => canPlaceCell(col, row));
  }

  function placeBlock(cells, tile) {
    cells.forEach(({ col, row }) => { level.obstacles[row][col] = tile; });
  }

  // --- Atomic shapes ---
  const s2x1  = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }];
  const s1x2  = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }];
  const s2x2  = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }];

  // --- Compound shapes (all built from 2x1/1x2/2x2 combos) ---
  const sL1   = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }, { col: c+1, row: r+2 }];
  const sL2   = (c, r) => [{ col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c+1, row: r+2 }, { col: c, row: r+2 }];
  const sL3   = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c, row: r+1 }];
  const sL4   = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+2, row: r+1 }];
  const sT1   = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+1, row: r+1 }];
  const sT2   = (c, r) => [{ col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c, row: r+1 }, { col: c+2, row: r+1 }];
  const sLine3h = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }];
  const sLine4h = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+3, row: r }];
  const sLine3v = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }];
  const sLine4v = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }, { col: c, row: r+3 }];
  const sZ    = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 }];
  const sS    = (c, r) => [{ col: c+1, row: r }, { col: c+2, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }];
  const sPlus = (c, r) => [{ col: c+1, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 }, { col: c+1, row: r+2 }];
  const sRect3x2 = (c, r) => [
    { col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r },
    { col: c, row: r+1 }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 },
  ];
  const sRect2x3 = (c, r) => [
    { col: c, row: r }, { col: c+1, row: r },
    { col: c, row: r+1 }, { col: c+1, row: r+1 },
    { col: c, row: r+2 }, { col: c+1, row: r+2 },
  ];

  const ISOLATED = [s2x1, s1x2, s2x2];
  const COMPOUND = [sL1, sL2, sL3, sL4, sT1, sT2, sLine3h, sLine4h, sLine3v, sLine4v, sZ, sS, sPlus, sRect3x2, sRect2x3];
  const TILES = [TILE.BRICK, TILE.BRICK, TILE.BRICK, TILE.BRICK, TILE.STEEL, TILE.STEEL];

  const placedPositions = [];
  const total = randInt(localRandom, structureCount[0], structureCount[1]);
  let placed = 0;
  let attempts = 0;

  function tryPlace(col, row, allowClose = false) {
    if (!allowClose) {
      const tooClose = placedPositions.some(
        (p) => Math.abs(p.col - col) < minSpacing && Math.abs(p.row - row) < minSpacing
      );
      if (tooClose) return false;
    }
    const tile = TILES[randInt(localRandom, 0, TILES.length - 1)];
    const useCompound = localRandom() < compoundChance;
    const shapeFn = useCompound
      ? COMPOUND[randInt(localRandom, 0, COMPOUND.length - 1)]
      : ISOLATED[randInt(localRandom, 0, ISOLATED.length - 1)];
    const cells = shapeFn(col, row);
    if (!canPlaceBlock(cells)) return false;
    placeBlock(cells, tile);
    placedPositions.push({ col, row });
    placed += 1;
    return true;
  }

  while (placed < total && attempts < total * 60) {
    attempts += 1;
    const col = randInt(localRandom, 2, GRID_WIDTH - 6);
    const row = randInt(localRandom, 2, GRID_HEIGHT - 6);

    if (!tryPlace(col, row)) continue;

    // Optionally place 1-2 more structures close by to form a cluster
    if (localRandom() < clusterChance) {
      const clusterSize = randInt(localRandom, 1, 2);
      for (let k = 0; k < clusterSize; k += 1) {
        const dc = randInt(localRandom, -3, 3);
        const dr = randInt(localRandom, -3, 3);
        if (dc === 0 && dr === 0) continue;
        tryPlace(col + dc, row + dr, true); // allowClose within cluster
      }
    }
  }
}

export function createOnline2v2Level(settings = {}) {
  const algorithmIndex = clamp(Math.round(Number(settings?.mapAlgorithm ?? settings?.survivalMapAlgorithm ?? 0)), 0, 3);
  const densityMultiplier = clamp(Number(settings?.densityMultiplier ?? 1), 0.6, 1.8);
  const localRandom = Math.random;
  const floor = makeMatrix(TILE.GROUND, GRID_WIDTH, GRID_HEIGHT);
  const overlay = makeMatrix(null, GRID_WIDTH, GRID_HEIGHT);
  const obstacles = makeMatrix(null, GRID_WIDTH, GRID_HEIGHT);
  const waterMask = makeMatrix(false, GRID_WIDTH, GRID_HEIGHT);
  const level = { floor, overlay, obstacles, waterMask };

  resetLevel(level, TILE.GROUND);
  applyMapAlgorithm(level, algorithmIndex, localRandom);
  applyBaseRoadZones(level);
  stampBaseFortresses(level);
  applyBaseRoadZones(level);
  syncWaterMaskFromObstacles(level);
  // Suavizar bordes de agua — parámetros según tipo de mapa
  if (algorithmIndex === 1) {
    // Río: muy conservador para no destruir el canal
    smoothWaterEdges(level, 1, 7, 1);
  } else if (algorithmIndex !== 0) {
    // Isla / Archipiélago: suavizado normal
    smoothWaterEdges(level, 3, 6, 2);
  } else {
    // Normal (lagos): suavizado completo
    smoothWaterEdges(level, 4, 5, 2);
  }
  syncWaterMaskFromObstacles(level);
  // Obstacle density varies by map type
  const obstacleConfigs = [
    // 0: Normal — most land, most obstacles, dense clusters
    { structureCount: [22, 30], compoundChance: 0.8, clusterChance: 0.55, minSpacing: 3 },
    // 1: River — medium, obstacles on banks
    { structureCount: [14, 20], compoundChance: 0.75, clusterChance: 0.45, minSpacing: 3 },
    // 2: Open Island — medium-low, open feel
    { structureCount: [10, 16], compoundChance: 0.7, clusterChance: 0.4, minSpacing: 4 },
    // 3: Archipelago — few, islands are small so don't clutter
    { structureCount: [6, 10], compoundChance: 0.65, clusterChance: 0.3, minSpacing: 4 },
  ];
  const baseObstacleConfig = obstacleConfigs[algorithmIndex] ?? obstacleConfigs[0];
  const densityAdjustedObstacleConfig = {
    ...baseObstacleConfig,
    structureCount: [
      Math.max(2, Math.round(baseObstacleConfig.structureCount[0] * densityMultiplier)),
      Math.max(3, Math.round(baseObstacleConfig.structureCount[1] * densityMultiplier)),
    ],
    compoundChance: clamp(baseObstacleConfig.compoundChance * (0.92 + ((densityMultiplier - 1) * 0.25)), 0.35, 0.95),
    clusterChance: clamp(baseObstacleConfig.clusterChance * (0.9 + ((densityMultiplier - 1) * 0.4)), 0.18, 0.92),
    minSpacing: densityMultiplier > 1.15
      ? Math.max(2, baseObstacleConfig.minSpacing - 1)
      : densityMultiplier < 0.9
        ? baseObstacleConfig.minSpacing + 1
        : baseObstacleConfig.minSpacing,
  };
  placeObstacles(level, localRandom, densityAdjustedObstacleConfig);
  forceClearBushesOnWater(level);
  sanitizeBushes(level, 0);
  forceClearBushesOnWater(level);

  return {
    floor: cloneMatrix(level.floor),
    overlay: cloneMatrix(level.overlay),
    obstacles: cloneMatrix(level.obstacles),
    mapAlgorithm: algorithmIndex,
    densityMultiplier,
  };
}
