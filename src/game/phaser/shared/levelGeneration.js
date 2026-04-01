import {
  AIM_DEADZONE,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  EAGLE_COL,
  EAGLE_ROW,
  GRID_SIZE,
  MACRO_EAGLE_COL,
  MACRO_EAGLE_ROW,
  MACRO_GRID_SIZE,
  MACRO_PLAYER_SPAWN_COL,
  MACRO_PLAYER_SPAWN_ROW,
  MACRO_TILE_SIZE,
  OUTER_BORDER_SIZE,
  PLAYER_SPAWN_COL,
  PLAYER_SPAWN_ROW,
  PLAYER_TWO_SPAWN_COL,
  PLAYER_TWO_SPAWN_ROW,
  TILE,
  TILE_SIZE,
  TILE_SUBDIVISION,
} from "./constants";
import { clamp, randomChoice, vectorLength } from "./math";

export function makeMatrix(fillValue = null) {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => fillValue)
  );
}

export function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

export function makeMacroMatrix(fillValue = null) {
  return Array.from({ length: MACRO_GRID_SIZE }, () =>
    Array.from({ length: MACRO_GRID_SIZE }, () => fillValue)
  );
}

export function upscaleMacroMatrix(matrix) {
  const fine = makeMatrix(null);

  for (let row = 0; row < MACRO_GRID_SIZE; row += 1) {
    for (let col = 0; col < MACRO_GRID_SIZE; col += 1) {
      const value = matrix[row][col];
      for (let sy = 0; sy < TILE_SUBDIVISION; sy += 1) {
        for (let sx = 0; sx < TILE_SUBDIVISION; sx += 1) {
          fine[row * TILE_SUBDIVISION + sy][col * TILE_SUBDIVISION + sx] = value;
        }
      }
    }
  }

  return fine;
}

export function expandLevelFromMacro({ floor, overlay, obstacles }) {
  const fineFloor = upscaleMacroMatrix(floor);
  const fineOverlay = upscaleMacroMatrix(overlay);
  const fineObstacles = upscaleMacroMatrix(obstacles);

  fineObstacles[EAGLE_ROW][EAGLE_COL] = TILE.BASE;
  fineObstacles[EAGLE_ROW][EAGLE_COL + 1] = TILE.BASE;
  fineObstacles[EAGLE_ROW + 1][EAGLE_COL] = TILE.BASE;
  fineObstacles[EAGLE_ROW + 1][EAGLE_COL + 1] = TILE.BASE;

  return { floor: fineFloor, overlay: fineOverlay, obstacles: fineObstacles };
}

export function bigCellCenterX(col, originX) {
  return originX + OUTER_BORDER_SIZE + col * TILE_SIZE + MACRO_TILE_SIZE / 2;
}

export function bigCellCenterY(row, originY) {
  return originY + OUTER_BORDER_SIZE + row * TILE_SIZE + MACRO_TILE_SIZE / 2;
}

export function isBaseAnchorCell(level, col, row) {
  return (
    level?.obstacles?.[row]?.[col] === TILE.BASE &&
    (col === 0 || level?.obstacles?.[row]?.[col - 1] !== TILE.BASE) &&
    (row === 0 || level?.obstacles?.[row - 1]?.[col] !== TILE.BASE)
  );
}

export function cellCenterX(col, originX) {
  return originX + OUTER_BORDER_SIZE + col * TILE_SIZE + TILE_SIZE / 2;
}

export function cellCenterY(row, originY) {
  return originY + OUTER_BORDER_SIZE + row * TILE_SIZE + TILE_SIZE / 2;
}

export function worldToGridCol(worldX, originX) {
  return Math.floor((worldX - originX - OUTER_BORDER_SIZE) / TILE_SIZE);
}

export function worldToGridRow(worldY, originY) {
  return Math.floor((worldY - originY - OUTER_BORDER_SIZE) / TILE_SIZE);
}

export function inBounds(col, row) {
  return col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE;
}

export function isBlockingTile(tile) {
  return (
    tile === TILE.BRICK ||
    tile === TILE.STEEL ||
    tile === TILE.WATER ||
    tile === TILE.BASE
  );
}

export function isDestructibleTile(tile) {
  return tile === TILE.BRICK;
}

export function createBaseMacroLevel() {
  const floor = makeMacroMatrix(TILE.GROUND);
  const overlay = makeMacroMatrix(null);
  const obstacles = makeMacroMatrix(null);

  for (let row = 0; row < MACRO_GRID_SIZE; row += 1) {
    for (let col = 0; col < MACRO_GRID_SIZE; col += 1) {
      if ((row + col) % 4 === 0) {
        floor[row][col] = TILE.ROAD;
      }
    }
  }

  obstacles[MACRO_EAGLE_ROW][MACRO_EAGLE_COL] = TILE.BASE;

  const baseBricks = [
    { col: 5, row: 11 },
    { col: 6, row: 11 },
    { col: 7, row: 11 },
    { col: 5, row: 12 },
    { col: 7, row: 12 },
  ];

  baseBricks.forEach(({ col, row }) => {
    obstacles[row][col] = TILE.BRICK;
  });

  floor[MACRO_PLAYER_SPAWN_ROW][MACRO_PLAYER_SPAWN_COL] = TILE.ROAD;
  obstacles[MACRO_PLAYER_SPAWN_ROW][MACRO_PLAYER_SPAWN_COL] = null;

  const bushes = [
    { col: 2, row: 2 },
    { col: 3, row: 2 },
    { col: 9, row: 3 },
    { col: 10, row: 3 },
    { col: 1, row: 7 },
    { col: 11, row: 7 },
  ];

  bushes.forEach(({ col, row }) => {
    overlay[row][col] = TILE.BUSH;
  });

  return { floor, overlay, obstacles };
}

export function createBaseLevel() {
  return expandLevelFromMacro(createBaseMacroLevel());
}

export function withPattern(macroLevel, fn) {
  const floor = cloneMatrix(macroLevel.floor);
  const overlay = cloneMatrix(macroLevel.overlay);
  const obstacles = cloneMatrix(macroLevel.obstacles);

  fn({ floor, overlay, obstacles });

  obstacles[MACRO_EAGLE_ROW][MACRO_EAGLE_COL] = TILE.BASE;
  obstacles[MACRO_PLAYER_SPAWN_ROW][MACRO_PLAYER_SPAWN_COL] = null;

  return expandLevelFromMacro({ floor, overlay, obstacles });
}

export const BASE_MACRO_LEVEL = createBaseMacroLevel();

export const BASE_FORTRESS_MACRO_CELLS = [
  { col: 5, row: 11 },
  { col: 6, row: 11 },
  { col: 7, row: 11 },
  { col: 5, row: 12 },
  { col: 7, row: 12 },
];

export function applyBaseFortressToFineLevel(level, tileType = TILE.BRICK) {
  BASE_FORTRESS_MACRO_CELLS.forEach(({ col, row }) => {
    for (let sy = 0; sy < TILE_SUBDIVISION; sy += 1) {
      for (let sx = 0; sx < TILE_SUBDIVISION; sx += 1) {
        const fineCol = col * TILE_SUBDIVISION + sx;
        const fineRow = row * TILE_SUBDIVISION + sy;
        if (inBounds(fineCol, fineRow)) {
          level.obstacles[fineRow][fineCol] = tileType;
        }
      }
    }
  });
}

export function clearFineRect(level, startCol, startRow, width, height) {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (!inBounds(col, row)) continue;
      if (level.obstacles[row][col] !== TILE.BASE) {
        level.obstacles[row][col] = null;
      }
      level.overlay[row][col] = null;
    }
  }
}

export function clearSpawnArea(level, centerCol, centerRow, size = 4) {
  const half = Math.floor(size / 2);
  const startCol = clamp(centerCol - half + 1, 0, GRID_SIZE - size);
  const startRow = clamp(centerRow - half + 1, 0, GRID_SIZE - size);
  clearFineRect(level, startCol, startRow, size, size);

  for (let row = startRow; row < startRow + size; row += 1) {
    for (let col = startCol; col < startCol + size; col += 1) {
      level.floor[row][col] = TILE.ROAD;
    }
  }
}

export function carveDestructibleCorridor(level, startCol, startRow, targetCol, targetRow, localRandom = Math.random) {
  const pathCells = [];
  let currentCol = startCol;
  let currentRow = startRow;

  while (currentRow !== targetRow) {
    pathCells.push({ col: currentCol, row: currentRow });
    currentRow += currentRow < targetRow ? 1 : -1;
  }

  while (currentCol !== targetCol) {
    pathCells.push({ col: currentCol, row: currentRow });
    currentCol += currentCol < targetCol ? 1 : -1;
  }

  pathCells.push({ col: currentCol, row: currentRow });

  pathCells.forEach(({ col, row }, index) => {
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const fineCol = col + dx;
        const fineRow = row + dy;
        if (!inBounds(fineCol, fineRow)) continue;
        level.floor[fineRow][fineCol] = TILE.ROAD;
        level.overlay[fineRow][fineCol] = null;
        if (level.obstacles[fineRow][fineCol] === TILE.BASE) continue;

        const distanceRatio = pathCells.length <= 1 ? 0 : index / (pathCells.length - 1);
        const shouldLeaveOpen = index < 2 || distanceRatio > 0.82 || localRandom() < 0.28;
        level.obstacles[fineRow][fineCol] = shouldLeaveOpen ? null : TILE.BRICK;
      }
    }
  });
}

export function clearSpawnAndBaseLanes(level, localRandom = Math.random) {
  const enemySpawnCenters = [
    { col: 1, row: 1 },
    { col: 12, row: 1 },
    { col: 24, row: 1 },
  ];

  enemySpawnCenters.forEach(({ col, row }) => {
    clearSpawnArea(level, col, row, 4);
  });

  clearSpawnArea(level, PLAYER_SPAWN_COL, PLAYER_SPAWN_ROW, 4);
  clearSpawnArea(level, PLAYER_TWO_SPAWN_COL, PLAYER_TWO_SPAWN_ROW, 4);

  clearFineRect(level, EAGLE_COL - 2, EAGLE_ROW - 2, 6, 4);
  for (let row = EAGLE_ROW - 2; row < EAGLE_ROW + 2; row += 1) {
    for (let col = EAGLE_COL - 2; col < EAGLE_COL + 4; col += 1) {
      if (!inBounds(col, row)) continue;
      level.floor[row][col] = TILE.ROAD;
      level.overlay[row][col] = null;
    }
  }

  const corridorTargetRow = Math.max(2, EAGLE_ROW - 6);
  const corridorTargetCol = Math.max(0, EAGLE_COL - 1);
  enemySpawnCenters.forEach(({ col, row }) => {
    carveDestructibleCorridor(level, Math.max(0, col - 1), row + 2, corridorTargetCol, corridorTargetRow, localRandom);
  });

  applyBaseFortressToFineLevel(level, TILE.BRICK);
}

export function reserveSafetyAreaAroundWorldPoint(level, worldX, worldY, originX = 0, originY = 0, radiusTiles = 2) {
  const col = worldToGridCol(worldX, originX);
  const row = worldToGridRow(worldY, originY);
  for (let y = row - radiusTiles; y <= row + radiusTiles; y += 1) {
    for (let x = col - radiusTiles; x <= col + radiusTiles; x += 1) {
      if (!inBounds(x, y)) continue;
      if (level.obstacles[y][x] !== TILE.BASE) {
        level.obstacles[y][x] = null;
      }
      level.overlay[y][x] = null;
      level.floor[y][x] = TILE.ROAD;
    }
  }
}

export function decorateFloorProcedurally(level, settings, localRandom) {
  const roadDensity = clamp(Number(settings?.survivalRoadDensity ?? 28), 0, 100) / 100;
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      level.floor[row][col] = localRandom() < roadDensity ? TILE.ROAD : TILE.GROUND;
    }
  }
}

export function getSurvivalDensitySettings(settings) {
  return {
    brickChance: clamp(Number(settings?.survivalBrickDensity ?? 34), 0, 100) / 100,
    bushChance: clamp(Number(settings?.survivalBushDensity ?? 20), 0, 100) / 100,
    steelChance: clamp(Number(settings?.survivalSteelDensity ?? 8), 0, 100) / 100,
    waterChance: clamp(Number(settings?.survivalWaterDensity ?? 6), 0, 100) / 100,
    variability: clamp(Number(settings?.survivalShuffleVariability ?? 48), 0, 100) / 100,
    waterClustering: clamp(Number(settings?.survivalWaterClustering ?? 72), 0, 100) / 100,
    waterBridgeChance: clamp(Number(settings?.survivalWaterBridgeChance ?? 38), 0, 100) / 100,
    buildingClustering: clamp(Number(settings?.survivalBuildingClustering ?? 76), 0, 100) / 100,
    buildingComplexity: clamp(Number(settings?.survivalBuildingComplexity ?? 58), 0, 100) / 100,
    bushClustering: clamp(Number(settings?.survivalBushClustering ?? 64), 0, 100) / 100,
    bushPatchScale: clamp(Number(settings?.survivalBushPatchScale ?? 52), 0, 100) / 100,
  };
}

export function canWriteObstacleAt(level, col, row) {
  return inBounds(col, row) && level.obstacles[row][col] !== TILE.BASE;
}

export function setObstacleTile(level, col, row, tileType) {
  if (!canWriteObstacleAt(level, col, row)) return false;
  if (level.obstacles[row][col] === tileType) return false;
  level.obstacles[row][col] = tileType;
  return true;
}

export function paintWaterBlob(level, centerCol, centerRow, radiusX, radiusY, localRandom) {
  let painted = 0;
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!canWriteObstacleAt(level, col, row)) continue;
      const normalizedX = (col - centerCol) / Math.max(1, radiusX);
      const normalizedY = (row - centerRow) / Math.max(1, radiusY);
      const ellipseDistance = (normalizedX * normalizedX) + (normalizedY * normalizedY);
      const raggedEdge = 1 + (localRandom() - 0.5) * 0.35;
      if (ellipseDistance <= raggedEdge) {
        if (setObstacleTile(level, col, row, TILE.WATER)) painted += 1;
      }
    }
  }
  return painted;
}

export function carveRoadBridge(level, centerCol, centerRow, horizontal = true, span = 3) {
  for (let offset = -span; offset <= span; offset += 1) {
    const col = horizontal ? centerCol + offset : centerCol;
    const row = horizontal ? centerRow : centerRow + offset;
    if (!inBounds(col, row)) continue;
    if (level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = null;
    level.floor[row][col] = TILE.ROAD;
  }
}

export function placeClusteredWaterBodies(level, settings, localRandom) {
  const { waterChance, waterClustering, waterBridgeChance, variability } = getSurvivalDensitySettings(settings);
  const targetWaterTiles = Math.round((GRID_SIZE * GRID_SIZE) * waterChance);
  if (targetWaterTiles <= 0) return;

  let paintedWater = 0;
  let attempts = 0;
  while (paintedWater < targetWaterTiles && attempts < 120) {
    attempts += 1;
    const isRiver = localRandom() < (0.22 + waterClustering * 0.38);
    let cursorCol = 2 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 4));
    let cursorRow = 2 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 4));
    const strokeLength = isRiver ? 4 + Math.floor(localRandom() * (5 + waterClustering * 8)) : 2 + Math.floor(localRandom() * 4);

    for (let step = 0; step < strokeLength && paintedWater < targetWaterTiles; step += 1) {
      const radiusX = isRiver
        ? 1 + Math.floor(localRandom() * (1 + waterClustering * 2))
        : 1 + Math.floor(localRandom() * (2 + waterClustering * 3));
      const radiusY = isRiver
        ? 1 + Math.floor(localRandom() * (2 + waterClustering * 3))
        : 1 + Math.floor(localRandom() * (2 + waterClustering * 2));
      paintedWater += paintWaterBlob(level, cursorCol, cursorRow, radiusX, radiusY, localRandom);

      if (localRandom() < waterBridgeChance * (isRiver ? 0.85 : 0.45)) {
        carveRoadBridge(level, cursorCol, cursorRow, localRandom() < 0.5, 1 + Math.floor(localRandom() * 2));
      }

      const jitter = variability * 2.2;
      cursorCol = clamp(cursorCol + Math.round((localRandom() - 0.5) * (3 + jitter)), 1, GRID_SIZE - 2);
      cursorRow = clamp(cursorRow + Math.round((localRandom() - 0.5) * (4 + jitter)), 1, GRID_SIZE - 2);
    }
  }
}

export function paintBuildingFootprint(level, startCol, startRow, width, height, tileType, localRandom, cutOutChance = 0) {
  let painted = 0;
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (!canWriteObstacleAt(level, col, row)) continue;
      if (level.obstacles[row][col] === TILE.WATER) continue;
      if (cutOutChance > 0 && localRandom() < cutOutChance) continue;
      if (setObstacleTile(level, col, row, tileType)) painted += 1;
    }
  }
  return painted;
}

export function placeBuildingStructures(level, settings, localRandom) {
  const { brickChance, steelChance, buildingClustering, buildingComplexity, variability } = getSurvivalDensitySettings(settings);
  const targetBuildingTiles = Math.round((GRID_SIZE * GRID_SIZE) * (brickChance + steelChance));
  if (targetBuildingTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBuildingTiles && attempts < 160) {
    attempts += 1;
    const startCol = 1 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 6));
    const startRow = 1 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 6));
    const width = 2 + Math.floor(localRandom() * (2 + buildingClustering * 4));
    const height = 2 + Math.floor(localRandom() * (2 + buildingClustering * 4));
    const useSteel = localRandom() < (steelChance / Math.max(0.001, brickChance + steelChance));
    const tileType = useSteel ? TILE.STEEL : TILE.BRICK;
    const useLShape = localRandom() < (0.22 + buildingComplexity * 0.45);
    const cutOutChance = Math.max(0, (variability * 0.12) - 0.02);

    painted += paintBuildingFootprint(level, startCol, startRow, width, height, tileType, localRandom, cutOutChance);

    if (useLShape) {
      const notchWidth = Math.max(1, Math.floor(width * (0.3 + localRandom() * 0.35)));
      const notchHeight = Math.max(1, Math.floor(height * (0.3 + localRandom() * 0.35)));
      const cutFromRight = localRandom() < 0.5;
      const cutFromBottom = localRandom() < 0.5;
      for (let row = startRow + (cutFromBottom ? height - notchHeight : 0); row < startRow + (cutFromBottom ? height : notchHeight); row += 1) {
        for (let col = startCol + (cutFromRight ? width - notchWidth : 0); col < startCol + (cutFromRight ? width : notchWidth); col += 1) {
          if (!inBounds(col, row)) continue;
          if (level.obstacles[row][col] === TILE.BASE) continue;
          level.obstacles[row][col] = null;
        }
      }
    }

    if (localRandom() < (0.16 + buildingComplexity * 0.3)) {
      const annexWidth = Math.max(2, Math.floor(width * (0.4 + localRandom() * 0.25)));
      const annexHeight = Math.max(2, Math.floor(height * (0.4 + localRandom() * 0.25)));
      const annexCol = clamp(startCol + (localRandom() < 0.5 ? -annexWidth + 1 : width - 1), 0, GRID_SIZE - annexWidth);
      const annexRow = clamp(startRow + Math.floor(localRandom() * Math.max(1, height - 1)), 0, GRID_SIZE - annexHeight);
      painted += paintBuildingFootprint(level, annexCol, annexRow, annexWidth, annexHeight, tileType, localRandom, cutOutChance * 0.5);
    }
  }
}

export function paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, localRandom, densityMultiplier = 1) {
  let painted = 0;
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!inBounds(col, row)) continue;
      if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.WATER) continue;
      const normalizedX = (col - centerCol) / Math.max(1, radiusX);
      const normalizedY = (row - centerRow) / Math.max(1, radiusY);
      const ellipseDistance = (normalizedX * normalizedX) + (normalizedY * normalizedY);
      const roundedThreshold = 1 + (localRandom() - 0.5) * 0.18;
      if (ellipseDistance <= roundedThreshold) {
        const fillChance = clamp((1.08 - (ellipseDistance * 0.42)) * densityMultiplier, 0.18, 1);
        if (localRandom() < fillChance) {
          level.overlay[row][col] = TILE.BUSH;
          painted += 1;
        }
      }
    }
  }
  return painted;
}

export function scatterBushOverlay(level, settings, localRandom) {
  const { bushChance, variability, bushClustering, bushPatchScale } = getSurvivalDensitySettings(settings);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      level.overlay[row][col] = null;
    }
  }

  const targetBushTiles = Math.round((GRID_SIZE * GRID_SIZE) * bushChance);
  if (targetBushTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBushTiles && attempts < 220) {
    attempts += 1;
    const centerCol = 1 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 2));
    const centerRow = 1 + Math.floor(localRandom() * Math.max(1, GRID_SIZE - 2));
    const radiusBase = 1 + Math.floor(localRandom() * (1 + bushPatchScale * 3.2));
    const radiusX = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const radiusY = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const densityMultiplier = 0.72 + bushClustering * 0.38 + ((localRandom() - 0.5) * variability * 0.18);
    painted += paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, localRandom, densityMultiplier);

    if (localRandom() < (0.22 + bushClustering * 0.46)) {
      const offsetCol = clamp(centerCol + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, GRID_SIZE - 2);
      const offsetRow = clamp(centerRow + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, GRID_SIZE - 2);
      painted += paintBushPatch(
        level,
        offsetCol,
        offsetRow,
        Math.max(1, radiusX - 1 + Math.floor(localRandom() * 2)),
        Math.max(1, radiusY - 1 + Math.floor(localRandom() * 2)),
        localRandom,
        densityMultiplier * 0.92
      );
    }
  }
}

export function placeBalancedProceduralTiles(level, settings, localRandom) {
  placeClusteredWaterBodies(level, settings, localRandom);
  placeBuildingStructures(level, settings, localRandom);
  scatterBushOverlay(level, settings, localRandom);
}

export function placeLaneProceduralTiles(level, settings, localRandom) {
  placeBalancedProceduralTiles(level, settings, localRandom);

  const verticalBands = [4, 10, 16, 22];
  const horizontalBands = [6, 12, 18];
  verticalBands.forEach((bandCol) => {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      if (localRandom() < 0.55) {
        if (level.obstacles[row][bandCol] !== TILE.BASE) level.obstacles[row][bandCol] = null;
        level.floor[row][bandCol] = TILE.ROAD;
      }
      if (bandCol + 1 < GRID_SIZE && localRandom() < 0.55) {
        if (level.obstacles[row][bandCol + 1] !== TILE.BASE) level.obstacles[row][bandCol + 1] = null;
        level.floor[row][bandCol + 1] = TILE.ROAD;
      }
    }
  });
  horizontalBands.forEach((bandRow) => {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (localRandom() < 0.6) {
        if (level.obstacles[bandRow][col] !== TILE.BASE) level.obstacles[bandRow][col] = null;
        level.floor[bandRow][col] = TILE.ROAD;
      }
    }
  });
}

export function placeIslandProceduralTiles(level, settings, localRandom) {
  const clusters = 14;
  const obstacleTypes = [TILE.BRICK, TILE.BRICK, TILE.BUSH, TILE.STEEL, TILE.WATER];
  for (let i = 0; i < clusters; i += 1) {
    const centerCol = Math.floor(localRandom() * GRID_SIZE);
    const centerRow = Math.floor(localRandom() * GRID_SIZE);
    const radius = 1 + Math.floor(localRandom() * 3);
    const obstacleType = randomChoice(obstacleTypes);

    for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
      for (let col = centerCol - radius; col <= centerCol + radius; col += 1) {
        if (!inBounds(col, row)) continue;
        if (level.obstacles[row][col] === TILE.BASE) continue;
        const dist = vectorLength(col - centerCol, row - centerRow);
        if (dist > radius + localRandom() * 0.6) continue;

        if (obstacleType === TILE.BUSH) {
          level.overlay[row][col] = TILE.BUSH;
        } else {
          level.obstacles[row][col] = obstacleType;
        }
      }
    }
  }

  placeBalancedProceduralTiles(level, {
    ...settings,
    survivalBrickDensity: Number(settings?.survivalBrickDensity ?? 34) * 0.35,
    survivalBushDensity: Number(settings?.survivalBushDensity ?? 20) * 0.45,
    survivalSteelDensity: Number(settings?.survivalSteelDensity ?? 8) * 0.4,
    survivalWaterDensity: Number(settings?.survivalWaterDensity ?? 6) * 0.4,
  }, localRandom);
}

export function createProceduralSurvivalLevel(settings = {}) {
  const level = expandLevelFromMacro(createBaseMacroLevel());
  decorateFloorProcedurally(level, settings, Math.random);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (level.obstacles[row][col] !== TILE.BASE) {
        level.obstacles[row][col] = null;
      }
      level.overlay[row][col] = null;
    }
  }

  const algorithmIndex = Math.round(Number(settings?.survivalMapAlgorithm ?? 0));
  if (algorithmIndex === 1) {
    placeLaneProceduralTiles(level, settings, Math.random);
  } else if (algorithmIndex === 2) {
    placeIslandProceduralTiles(level, settings, Math.random);
  } else {
    placeBalancedProceduralTiles(level, settings, Math.random);
  }

  clearSpawnAndBaseLanes(level, Math.random);
  return level;
}
