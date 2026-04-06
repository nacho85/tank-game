import {
  EAGLE_COL,
  EAGLE_ROW,
  GRID_HEIGHT,
  GRID_SIZE,
  GRID_WIDTH,
  MACRO_EAGLE_COL,
  MACRO_EAGLE_ROW,
  MACRO_GRID_HEIGHT,
  MACRO_GRID_SIZE,
  MACRO_GRID_WIDTH,
  MACRO_PLAYER_SPAWN_COL,
  MACRO_PLAYER_SPAWN_ROW,
  MACRO_TILE_SIZE,
  OUTER_BORDER_SIZE,
  PLAYER_SPAWN_COL,
  PLAYER_SPAWN_ROW,
  PLAYER_TWO_SPAWN_COL,
  PLAYER_TWO_SPAWN_ROW,
  SURVIVAL_GRID_HEIGHT,
  SURVIVAL_GRID_WIDTH,
  SURVIVAL_MACRO_GRID_HEIGHT,
  SURVIVAL_MACRO_GRID_WIDTH,
  TILE,
  TILE_SIZE,
  TILE_SUBDIVISION,
} from "./constants.js";
import { clamp, randomChoice, vectorLength } from "./math.js";

export function makeMatrix(fillValue = null, width = GRID_WIDTH, height = GRID_HEIGHT) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => fillValue)
  );
}

export function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

export function makeMacroMatrix(fillValue = null, width = MACRO_GRID_WIDTH, height = MACRO_GRID_HEIGHT) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => fillValue)
  );
}

export function upscaleMacroMatrix(matrix) {
  const macroHeight = matrix.length;
  const macroWidth = matrix[0]?.length || 0;
  const fine = makeMatrix(null, macroWidth * TILE_SUBDIVISION, macroHeight * TILE_SUBDIVISION);

  for (let row = 0; row < macroHeight; row += 1) {
    for (let col = 0; col < macroWidth; col += 1) {
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
  const eagleCol = Math.floor((fineFloor[0].length - 2) / 2);
  const eagleRow = fineFloor.length - 2;

  fineObstacles[eagleRow][eagleCol] = TILE.BASE;
  fineObstacles[eagleRow][eagleCol + 1] = TILE.BASE;
  fineObstacles[eagleRow + 1][eagleCol] = TILE.BASE;
  fineObstacles[eagleRow + 1][eagleCol + 1] = TILE.BASE;

  return { floor: fineFloor, overlay: fineOverlay, obstacles: fineObstacles };
}

export function bigCellCenterX(col, originX) {
  return originX + OUTER_BORDER_SIZE + col * TILE_SIZE + MACRO_TILE_SIZE / 2;
}

export function bigCellCenterY(row, originY) {
  return originY + OUTER_BORDER_SIZE + row * TILE_SIZE + MACRO_TILE_SIZE / 2;
}


export function getLevelWidth(level) {
  return level?.floor?.[0]?.length ?? level?.obstacles?.[0]?.length ?? GRID_WIDTH;
}

export function getLevelHeight(level) {
  return level?.floor?.length ?? level?.obstacles?.length ?? GRID_HEIGHT;
}

export function getLevelBaseAnchorCol(level) {
  return Math.floor((getLevelWidth(level) - 2) / 2);
}

export function getLevelBaseAnchorRow(level) {
  return Math.max(0, getLevelHeight(level) - 2);
}

export function getLevelPlayerSpawnCol(level, slot = 1) {
  const baseCol = getLevelBaseAnchorCol(level);
  return baseCol + (slot === 2 ? 4 : -4);
}

export function getEnemySpawnCenters(level) {
  const width = getLevelWidth(level);
  return [
    { col: 1, row: 1 },
    { col: Math.floor((width - 1) / 2), row: 1 },
    { col: Math.max(1, width - 2), row: 1 },
  ];
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

export function inBounds(col, row, level = null) {
  const width = getLevelWidth(level);
  const height = getLevelHeight(level);
  return col >= 0 && col < width && row >= 0 && row < height;
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

export function createBaseMacroLevel(width = MACRO_GRID_WIDTH, height = MACRO_GRID_HEIGHT) {
  const floor = makeMacroMatrix(TILE.GROUND, width, height);
  const overlay = makeMacroMatrix(null, width, height);
  const obstacles = makeMacroMatrix(null, width, height);
  const macroEagleCol = Math.floor((width - 1) / 2);
  const macroEagleRow = height - 1;
  const macroPlayerSpawnCol = macroEagleCol - 2;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if ((row + col) % 4 === 0) {
        floor[row][col] = TILE.ROAD;
      }
    }
  }

  obstacles[macroEagleRow][macroEagleCol] = TILE.BASE;

  const baseBricks = [
    { col: macroEagleCol - 1, row: macroEagleRow - 1 },
    { col: macroEagleCol, row: macroEagleRow - 1 },
    { col: macroEagleCol + 1, row: macroEagleRow - 1 },
    { col: macroEagleCol - 1, row: macroEagleRow },
    { col: macroEagleCol + 1, row: macroEagleRow },
  ];

  baseBricks.forEach(({ col, row }) => {
    obstacles[row][col] = TILE.BRICK;
  });

  floor[macroEagleRow][macroPlayerSpawnCol] = TILE.ROAD;
  obstacles[macroEagleRow][macroPlayerSpawnCol] = null;

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
  const macroHeight = obstacles.length;
  const macroWidth = obstacles[0]?.length || 0;
  const macroEagleCol = Math.floor((macroWidth - 1) / 2);
  const macroEagleRow = macroHeight - 1;
  const macroPlayerSpawnCol = macroEagleCol - 2;

  fn({ floor, overlay, obstacles });

  if (obstacles[macroEagleRow]?.[macroEagleCol] !== undefined) {
    obstacles[macroEagleRow][macroEagleCol] = TILE.BASE;
  }
  if (obstacles[macroEagleRow]?.[macroPlayerSpawnCol] !== undefined) {
    obstacles[macroEagleRow][macroPlayerSpawnCol] = null;
  }

  return expandLevelFromMacro({ floor, overlay, obstacles });
}

export const BASE_MACRO_LEVEL = createBaseMacroLevel();

export const BASE_FORTRESS_MACRO_CELLS = [
  { col: MACRO_EAGLE_COL - 1, row: MACRO_EAGLE_ROW - 1 },
  { col: MACRO_EAGLE_COL, row: MACRO_EAGLE_ROW - 1 },
  { col: MACRO_EAGLE_COL + 1, row: MACRO_EAGLE_ROW - 1 },
  { col: MACRO_EAGLE_COL - 1, row: MACRO_EAGLE_ROW },
  { col: MACRO_EAGLE_COL + 1, row: MACRO_EAGLE_ROW },
];

export function applyBaseFortressToFineLevel(level, tileType = TILE.BRICK) {
  const baseCol = getLevelBaseAnchorCol(level) / TILE_SUBDIVISION;
  const baseRow = getLevelBaseAnchorRow(level) / TILE_SUBDIVISION;
  [
    { col: baseCol - 1, row: baseRow - 1 },
    { col: baseCol, row: baseRow - 1 },
    { col: baseCol + 1, row: baseRow - 1 },
    { col: baseCol - 1, row: baseRow },
    { col: baseCol + 1, row: baseRow },
  ].forEach(({ col, row }) => {
    for (let sy = 0; sy < TILE_SUBDIVISION; sy += 1) {
      for (let sx = 0; sx < TILE_SUBDIVISION; sx += 1) {
        const fineCol = col * TILE_SUBDIVISION + sx;
        const fineRow = row * TILE_SUBDIVISION + sy;
        if (inBounds(fineCol, fineRow, level)) {
          level.obstacles[fineRow][fineCol] = tileType;
        }
      }
    }
  });
}

export function clearFineRect(level, startCol, startRow, width, height) {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      if (!inBounds(col, row, level)) continue;
      if (level.obstacles[row][col] !== TILE.BASE) {
        level.obstacles[row][col] = null;
      }
      level.overlay[row][col] = null;
    }
  }
}

export function clearSpawnArea(level, centerCol, centerRow, size = 4) {
  const half = Math.floor(size / 2);
  const width = getLevelWidth(level);
  const height = getLevelHeight(level);
  const startCol = clamp(centerCol - half + 1, 0, width - size);
  const startRow = clamp(centerRow - half + 1, 0, height - size);
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
  const enemySpawnCenters = getEnemySpawnCenters(level);

  enemySpawnCenters.forEach(({ col, row }) => {
    clearSpawnArea(level, col, row, 4);
  });

  const playerOneSpawnCol = getLevelPlayerSpawnCol(level, 1);
  const playerTwoSpawnCol = getLevelPlayerSpawnCol(level, 2);
  const eagleCol = getLevelBaseAnchorCol(level);
  const eagleRow = getLevelBaseAnchorRow(level);
  clearSpawnArea(level, playerOneSpawnCol, eagleRow, 4);
  clearSpawnArea(level, playerTwoSpawnCol, eagleRow, 4);

  clearFineRect(level, eagleCol - 2, eagleRow - 2, 6, 6);
  for (let row = eagleRow - 2; row < eagleRow + 4; row += 1) {
    for (let col = eagleCol - 2; col < eagleCol + 4; col += 1) {
      if (!inBounds(col, row, level)) continue;
      level.floor[row][col] = TILE.ROAD;
      level.overlay[row][col] = null;
    }
  }

  const corridorTargetRow = Math.max(2, eagleRow - 6);
  const corridorTargetCol = Math.max(0, eagleCol - 1);
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
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      level.floor[row][col] = TILE.GROUND;
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
    if (!inBounds(col, row, level)) continue;
    if (level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = null;
    level.floor[row][col] = TILE.ROAD;
  }
}

export function placeClusteredWaterBodies(level, settings, localRandom) {
  const { waterChance, waterClustering, waterBridgeChance, variability } = getSurvivalDensitySettings(settings);
  const targetWaterTiles = Math.round((getLevelWidth(level) * getLevelHeight(level)) * waterChance);
  if (targetWaterTiles <= 0) return;

  let paintedWater = 0;
  let attempts = 0;
  while (paintedWater < targetWaterTiles && attempts < 120) {
    attempts += 1;
    const isRiver = localRandom() < (0.22 + waterClustering * 0.38);
    let cursorCol = 2 + Math.floor(localRandom() * Math.max(1, getLevelWidth(level) - 4));
    let cursorRow = 2 + Math.floor(localRandom() * Math.max(1, getLevelHeight(level) - 4));
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
      cursorCol = clamp(cursorCol + Math.round((localRandom() - 0.5) * (3 + jitter)), 1, getLevelWidth(level) - 2);
      cursorRow = clamp(cursorRow + Math.round((localRandom() - 0.5) * (4 + jitter)), 1, getLevelHeight(level) - 2);
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
  const targetBuildingTiles = Math.round((GRID_WIDTH * GRID_HEIGHT) * (brickChance + steelChance));
  if (targetBuildingTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBuildingTiles && attempts < 160) {
    attempts += 1;
    const startCol = 1 + Math.floor(localRandom() * Math.max(1, GRID_WIDTH - 6));
    const startRow = 1 + Math.floor(localRandom() * Math.max(1, GRID_HEIGHT - 6));
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
          if (!inBounds(col, row, level)) continue;
          if (level.obstacles[row][col] === TILE.BASE) continue;
          level.obstacles[row][col] = null;
        }
      }
    }

    if (localRandom() < (0.16 + buildingComplexity * 0.3)) {
      const annexWidth = Math.max(2, Math.floor(width * (0.4 + localRandom() * 0.25)));
      const annexHeight = Math.max(2, Math.floor(height * (0.4 + localRandom() * 0.25)));
      const annexCol = clamp(startCol + (localRandom() < 0.5 ? -annexWidth + 1 : width - 1), 0, GRID_WIDTH - annexWidth);
      const annexRow = clamp(startRow + Math.floor(localRandom() * Math.max(1, height - 1)), 0, GRID_HEIGHT - annexHeight);
      painted += paintBuildingFootprint(level, annexCol, annexRow, annexWidth, annexHeight, tileType, localRandom, cutOutChance * 0.5);
    }
  }
}

export function paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, localRandom, densityMultiplier = 1) {
  let painted = 0;
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!inBounds(col, row, level)) continue;
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

  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      level.overlay[row][col] = null;
    }
  }

  const targetBushTiles = Math.round((GRID_WIDTH * GRID_HEIGHT) * bushChance);
  if (targetBushTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBushTiles && attempts < 220) {
    attempts += 1;
    const centerCol = 1 + Math.floor(localRandom() * Math.max(1, GRID_WIDTH - 2));
    const centerRow = 1 + Math.floor(localRandom() * Math.max(1, GRID_HEIGHT - 2));
    const radiusBase = 1 + Math.floor(localRandom() * (1 + bushPatchScale * 3.2));
    const radiusX = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const radiusY = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const densityMultiplier = 0.72 + bushClustering * 0.38 + ((localRandom() - 0.5) * variability * 0.18);
    painted += paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, localRandom, densityMultiplier);

    if (localRandom() < (0.22 + bushClustering * 0.46)) {
      const offsetCol = clamp(centerCol + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, GRID_WIDTH - 2);
      const offsetRow = clamp(centerRow + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, GRID_HEIGHT - 2);
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
    for (let row = 0; row < getLevelHeight(level); row += 1) {
      if (localRandom() < 0.55) {
        if (level.obstacles[row][bandCol] !== TILE.BASE) level.obstacles[row][bandCol] = null;
        level.floor[row][bandCol] = TILE.ROAD;
      }
      if (bandCol + 1 < GRID_WIDTH && localRandom() < 0.55) {
        if (level.obstacles[row][bandCol + 1] !== TILE.BASE) level.obstacles[row][bandCol + 1] = null;
        level.floor[row][bandCol + 1] = TILE.ROAD;
      }
    }
  });
  horizontalBands.forEach((bandRow) => {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
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
    const centerCol = Math.floor(localRandom() * GRID_WIDTH);
    const centerRow = Math.floor(localRandom() * GRID_HEIGHT);
    const radius = 1 + Math.floor(localRandom() * 3);
    const obstacleType = randomChoice(obstacleTypes);

    for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
      for (let col = centerCol - radius; col <= centerCol + radius; col += 1) {
        if (!inBounds(col, row, level)) continue;
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


function resetLevelToBase(level, fillFloor = TILE.GROUND) {
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      level.floor[row][col] = fillFloor;
      if (level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = null;
      level.overlay[row][col] = null;
    }
  }
}

function paintRoadCell(level, col, row, width = 2) {
  const halfBefore = Math.floor((width - 1) / 2);
  const halfAfter = width - halfBefore - 1;
  for (let y = row - halfBefore; y <= row + halfAfter; y += 1) {
    for (let x = col - halfBefore; x <= col + halfAfter; x += 1) {
      if (!inBounds(x, y)) continue;
      level.floor[y][x] = TILE.ROAD;
    }
  }
}

function paintRoadSegment(level, fromCol, fromRow, toCol, toRow, width = 2) {
  let col = fromCol;
  let row = fromRow;
  paintRoadCell(level, col, row, width);
  while (col !== toCol) {
    col += col < toCol ? 1 : -1;
    paintRoadCell(level, col, row, width);
  }
  while (row !== toRow) {
    row += row < toRow ? 1 : -1;
    paintRoadCell(level, col, row, width);
  }
}

function carveContinuousRoad(level, waypoints, width = 2) {
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1];
    const next = waypoints[i];
    paintRoadSegment(level, prev.col, prev.row, next.col, next.row, width);
  }
}


function roadNeighbors(level, col, row) {
  let count = 0;
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy]) => {
    const x = col + dx;
    const y = row + dy;
    if (inBounds(x,y) && level.floor[y][x] === TILE.ROAD) count += 1;
  });
  return count;
}

function pruneIsolatedWater(level) {
  const next = cloneMatrix(level.obstacles);
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.obstacles[row][col] !== TILE.WATER) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const x = col + dx, y = row + dy;
          if (inBounds(x,y) && level.obstacles[y][x] === TILE.WATER) neighbors += 1;
        }
      }
      if (neighbors === 0) next[row][col] = null;
    }
  }
  level.obstacles = next;
}

function clearWaterOnRoad(level) {
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.floor[row][col] === TILE.ROAD && level.obstacles[row][col] === TILE.WATER) {
        level.obstacles[row][col] = null;
      }
    }
  }
}

function getConnectedRoadPoints(level) {
  const pts = [];
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.floor[row][col] === TILE.ROAD && roadNeighbors(level,col,row) > 0) pts.push({col,row});
    }
  }
  return pts;
}

function connectPointToRoad(level, point, localRandom = Math.random) {
  const roads = getConnectedRoadPoints(level);
  if (!roads.length) return;
  let target = roads[0];
  let best = Infinity;
  roads.forEach((r) => {
    const d = Math.abs(r.col - point.col) + Math.abs(r.row - point.row);
    if (d < best) { best = d; target = r; }
  });
  const via = {
    col: point.col + Math.round((target.col - point.col) * (0.35 + localRandom() * 0.3)),
    row: point.row + Math.round((target.row - point.row) * (0.35 + localRandom() * 0.3)),
  };
  carveContinuousRoad(level, [point, via, target], 2);
}

function connectSpawnRoads(level, localRandom = Math.random) {
  [
    { col: getLevelPlayerSpawnCol(level, 1), row: getLevelBaseAnchorRow(level) },
    { col: getLevelPlayerSpawnCol(level, 2), row: getLevelBaseAnchorRow(level) },
    ...getEnemySpawnCenters(level),
  ].forEach((point) => connectPointToRoad(level, point, localRandom));
}

function paintLake(level, centerCol, centerRow, radiusX, radiusY, localRandom) {
  for (let row = centerRow - radiusY - 1; row <= centerRow + radiusY + 1; row += 1) {
    for (let col = centerCol - radiusX - 1; col <= centerCol + radiusX + 1; col += 1) {
      if (!canWriteObstacleAt(level, col, row)) continue;
      const nx = (col - centerCol) / Math.max(1, radiusX);
      const ny = (row - centerRow) / Math.max(1, radiusY);
      const d = (nx * nx) + (ny * ny);
      if (d <= 1 + (localRandom() - 0.5) * 0.22) level.obstacles[row][col] = TILE.WATER;
    }
  }
}

function generateNormalWater(level, localRandom = Math.random) {
  const lakeCount = 1 + Math.floor(localRandom() * 3);
  const maxWater = Math.floor(getLevelWidth(level) * getLevelHeight(level) * 0.35);
  let painted = 0;
  for (let i = 0; i < lakeCount; i += 1) {
    if (painted >= maxWater) break;
    const radiusX = 3 + Math.floor(localRandom() * 4);
    const radiusY = 3 + Math.floor(localRandom() * 4);
    const centerCol = 4 + Math.floor(localRandom() * (getLevelWidth(level) - 8));
    const centerRow = 4 + Math.floor(localRandom() * (getLevelHeight(level) - 8));
    paintLake(level, centerCol, centerRow, radiusX, radiusY, localRandom);
    painted = level.obstacles.flat().filter((t) => t === TILE.WATER).length;
  }
  if (painted > maxWater) {
    for (let row = 0; row < getLevelHeight(level); row += 1) {
      for (let col = 0; col < getLevelWidth(level); col += 1) {
        if (painted <= maxWater) break;
        if (level.obstacles[row][col] === TILE.WATER && localRandom() < 0.5) {
          level.obstacles[row][col] = null;
          painted -= 1;
        }
      }
    }
  }
  pruneIsolatedWater(level);
}

function generateRiver(level, localRandom = Math.random) {
  const vertical = localRandom() < 0.5;
  const width = 3 + Math.floor(localRandom() * 2);
  if (vertical) {
    let center = 6 + Math.floor(localRandom() * (getLevelWidth(level) - 12));
    for (let row = 0; row < getLevelHeight(level); row += 1) {
      if (localRandom() < 0.35) center = clamp(center + (localRandom() < 0.5 ? -1 : 1), 4, getLevelWidth(level) - 5);
      for (let x = center - Math.floor(width/2); x <= center + Math.floor(width/2); x += 1) {
        if (canWriteObstacleAt(level, x, row)) level.obstacles[row][x] = TILE.WATER;
      }
    }
    const bridgeRows = [8 + Math.floor(localRandom()*5), 16 + Math.floor(localRandom()*4)];
    bridgeRows.forEach((row) => carveContinuousRoad(level, [{col:0,row},{col:getLevelWidth(level)-1,row}], 2));
  } else {
    let center = 5 + Math.floor(localRandom() * (GRID_HEIGHT - 10));
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (localRandom() < 0.35) center = clamp(center + (localRandom() < 0.5 ? -1 : 1), 4, getLevelHeight(level) - 5);
      for (let y = center - Math.floor(width/2); y <= center + Math.floor(width/2); y += 1) {
        if (canWriteObstacleAt(level, col, y)) level.obstacles[y][col] = TILE.WATER;
      }
    }
    const bridgeCols = [7 + Math.floor(localRandom()*5), 16 + Math.floor(localRandom()*5)];
    bridgeCols.forEach((col) => carveContinuousRoad(level, [{col,row:0},{col,row:getLevelHeight(level)-1}], 2));
  }
  clearWaterOnRoad(level);
  pruneIsolatedWater(level);
}

function generateIslandStyle(level, openStyle = true, localRandom = Math.random) {
  resetLevelToBase(level, TILE.GROUND);
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.obstacles[row][col] !== TILE.BASE) level.obstacles[row][col] = TILE.WATER;
    }
  }
  const islandCount = openStyle ? 5 : 10;
  const minRadius = openStyle ? 3 : 2;
  const maxRadius = openStyle ? 6 : 4;
  const forced = [
    { col: getLevelBaseAnchorCol(level) + 1, row: getLevelBaseAnchorRow(level) + 1, rx: 6, ry: 5 },
    { col: getLevelBaseAnchorCol(level) + 1, row: 1, rx: 6, ry: 5 },
  ];
  const islands = [...forced];
  for (let i = 0; i < islandCount; i += 1) {
    islands.push({
      col: 3 + Math.floor(localRandom() * (getLevelWidth(level) - 6)),
      row: 3 + Math.floor(localRandom() * (getLevelHeight(level) - 6)),
      rx: minRadius + Math.floor(localRandom() * (maxRadius - minRadius + 1)),
      ry: minRadius + Math.floor(localRandom() * (maxRadius - minRadius + 1)),
    });
  }
  islands.forEach(({col,row,rx,ry}) => {
    for (let y = row - ry - 1; y <= row + ry + 1; y += 1) {
      for (let x = col - rx - 1; x <= col + rx + 1; x += 1) {
        if (!inBounds(x,y)) continue;
        const nx = (x-col)/Math.max(1,rx);
        const ny = (y-row)/Math.max(1,ry);
        if ((nx*nx)+(ny*ny) <= 1 + (localRandom()-0.5)*0.2 && level.obstacles[y][x] !== TILE.BASE) level.obstacles[y][x] = null;
      }
    }
  });
  carveContinuousRoad(level, [{col:getLevelBaseAnchorCol(level)+1,row:getLevelBaseAnchorRow(level)+5},{col:Math.floor(getLevelWidth(level) / 2),row:Math.floor(getLevelHeight(level) / 2)},{col:getLevelBaseAnchorCol(level)+1,row:4}],2);
  if (!openStyle) {
    carveContinuousRoad(level, [{col:4,row:Math.floor(getLevelHeight(level) / 2)},{col:getLevelWidth(level)-5,row:Math.floor(getLevelHeight(level) / 2)}],2);
  }
  clearWaterOnRoad(level);
}

function placeObstaclesAlongTerrain(level, settings, localRandom = Math.random, includeWater = false) {
  const { brickChance, steelChance } = getSurvivalDensitySettings(settings);
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.floor[row][col] === TILE.ROAD) continue;
      if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.WATER) continue;
      if (localRandom() < steelChance * 0.55) level.obstacles[row][col] = TILE.STEEL;
      else if (localRandom() < brickChance * 0.65) level.obstacles[row][col] = TILE.BRICK;
    }
  }
}

function generateConnectedRoads(level, localRandom = Math.random, crossChance = 0.65) {
  const vertical = localRandom() < 0.5;
  if (vertical) {
    const c0 = 4 + Math.floor(localRandom() * (getLevelWidth(level) - 8));
    carveContinuousRoad(level, [
      { col: c0, row: 0 },
      { col: clamp(c0 + Math.round((localRandom()-0.5)*6),2,getLevelWidth(level)-3), row: 8 },
      { col: clamp(c0 + Math.round((localRandom()-0.5)*8),2,getLevelWidth(level)-3), row: 16 },
      { col: clamp(c0 + Math.round((localRandom()-0.5)*6),2,getLevelWidth(level)-3), row: getLevelHeight(level)-1 },
    ], 2);
    if (localRandom() < crossChance) {
      const row = 7 + Math.floor(localRandom() * (getLevelHeight(level) - 14));
      carveContinuousRoad(level, [
        { col: 0, row },
        { col: 8, row: clamp(row + Math.round((localRandom()-0.5)*4),2,getLevelHeight(level)-3) },
        { col: Math.min(17, getLevelWidth(level) - 3), row: clamp(row + Math.round((localRandom()-0.5)*4),2,getLevelHeight(level)-3) },
        { col: getLevelWidth(level)-1, row },
      ], 2);
    }
  } else {
    const r0 = 4 + Math.floor(localRandom() * (getLevelHeight(level) - 8));
    carveContinuousRoad(level, [
      { col: 0, row: r0 },
      { col: 8, row: clamp(r0 + Math.round((localRandom()-0.5)*6),2,getLevelHeight(level)-3) },
      { col: 16, row: clamp(r0 + Math.round((localRandom()-0.5)*8),2,getLevelHeight(level)-3) },
      { col: getLevelWidth(level)-1, row: clamp(r0 + Math.round((localRandom()-0.5)*6),2,getLevelHeight(level)-3) },
    ], 2);
    if (localRandom() < crossChance) {
      const col = 7 + Math.floor(localRandom() * (getLevelWidth(level) - 14));
      carveContinuousRoad(level, [
        { col, row: 0 },
        { col: clamp(col + Math.round((localRandom()-0.5)*4),2,getLevelWidth(level)-3), row: 8 },
        { col: clamp(col + Math.round((localRandom()-0.5)*4),2,getLevelWidth(level)-3), row: 17 },
        { col, row: getLevelHeight(level)-1 },
      ], 2);
    }
  }
}



function sanitizeBushOverlay(level) {
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.overlay[row][col] !== TILE.BUSH) continue;
      const obstacle = level.obstacles[row][col];
      if (obstacle === TILE.WATER || obstacle === TILE.STEEL || obstacle === TILE.BASE) {
        level.overlay[row][col] = null;
      }
    }
  }
}

function generateStyle(level, settings, algorithmIndex, localRandom = Math.random) {
  if (algorithmIndex === 0) {
    resetLevelToBase(level, TILE.GROUND);
    generateNormalWater(level, localRandom);
    generateConnectedRoads(level, localRandom, 0.5);
    placeObstaclesAlongTerrain(level, settings, localRandom);
  } else if (algorithmIndex === 1) {
    resetLevelToBase(level, TILE.GROUND);
    generateConnectedRoads(level, localRandom, 0.35);
    generateRiver(level, localRandom);
    placeObstaclesAlongTerrain(level, settings, localRandom);
  } else if (algorithmIndex === 2) {
    generateIslandStyle(level, true, localRandom);
    placeObstaclesAlongTerrain(level, settings, localRandom);
  } else {
    generateIslandStyle(level, false, localRandom);
    placeObstaclesAlongTerrain(level, settings, localRandom);
  }
  connectSpawnRoads(level, localRandom);
  scatterBushOverlay(level, settings, localRandom);
  sanitizeBushOverlay(level);
}

export function createProceduralSurvivalLevel(settings = {}) {
  const level = expandLevelFromMacro(createBaseMacroLevel(SURVIVAL_MACRO_GRID_WIDTH, SURVIVAL_MACRO_GRID_HEIGHT));
  const localRandom = Math.random;
  const eagleCol = getLevelBaseAnchorCol(level);
  const eagleRow = getLevelBaseAnchorRow(level);
  for (let ry = eagleRow; ry <= eagleRow + 1 && ry < getLevelHeight(level); ry += 1) {
    for (let cx = eagleCol; cx <= eagleCol + 1 && cx < getLevelWidth(level); cx += 1) {
      level.obstacles[ry][cx] = TILE.BASE;
    }
  }
  decorateFloorProcedurally(level, settings, localRandom);

  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      if (level.obstacles[row][col] !== TILE.BASE) {
        level.obstacles[row][col] = null;
      }
      level.overlay[row][col] = null;
    }
  }

  const algorithmIndex = clamp(Math.round(Number(settings?.survivalMapAlgorithm ?? 0)), 0, 3);
  generateStyle(level, settings, algorithmIndex, localRandom);
  clearSpawnAndBaseLanes(level, localRandom);
  connectSpawnRoads(level, localRandom);
  clearWaterOnRoad(level);
  sanitizeBushOverlay(level);
  return level;
}
