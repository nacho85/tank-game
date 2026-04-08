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

export function isBaseFortressCell(level, col, row) {
  const baseCol = getLevelBaseAnchorCol(level);
  const baseRow = getLevelBaseAnchorRow(level);
  const fortressStartCol = baseCol - TILE_SUBDIVISION;
  const fortressEndCol = baseCol + (TILE_SUBDIVISION * 3) - 1;
  const fortressStartRow = baseRow - TILE_SUBDIVISION;
  const fortressEndRow = baseRow + (TILE_SUBDIVISION * 2) - 1;
  const isBaseTile = col >= baseCol && col < baseCol + TILE_SUBDIVISION && row >= baseRow && row < baseRow + TILE_SUBDIVISION;

  return (
    !isBaseTile &&
    col >= fortressStartCol &&
    col <= fortressEndCol &&
    row >= fortressStartRow &&
    row <= fortressEndRow
  );
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
        if (!inBounds(fineCol, fineRow, level)) continue;
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
      if (!inBounds(x, y, level)) continue;
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
  return inBounds(col, row, level) && level.obstacles[row][col] !== TILE.BASE;
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
  const levelWidth = getLevelWidth(level);
  const levelHeight = getLevelHeight(level);
  const targetBuildingTiles = Math.round((levelWidth * levelHeight) * (brickChance + steelChance));
  if (targetBuildingTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBuildingTiles && attempts < 160) {
    attempts += 1;
    const startCol = 1 + Math.floor(localRandom() * Math.max(1, levelWidth - 6));
    const startRow = 1 + Math.floor(localRandom() * Math.max(1, levelHeight - 6));
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
      const annexCol = clamp(startCol + (localRandom() < 0.5 ? -annexWidth + 1 : width - 1), 0, levelWidth - annexWidth);
      const annexRow = clamp(startRow + Math.floor(localRandom() * Math.max(1, height - 1)), 0, levelHeight - annexHeight);
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
  const lw = getLevelWidth(level);
  const lh = getLevelHeight(level);

  for (let row = 0; row < lh; row += 1) {
    for (let col = 0; col < lw; col += 1) {
      level.overlay[row][col] = null;
    }
  }

  const targetBushTiles = Math.round((lw * lh) * bushChance);
  if (targetBushTiles <= 0) return;

  let painted = 0;
  let attempts = 0;
  while (painted < targetBushTiles && attempts < 220) {
    attempts += 1;
    const centerCol = 1 + Math.floor(localRandom() * Math.max(1, lw - 2));
    const centerRow = 1 + Math.floor(localRandom() * Math.max(1, lh - 2));
    const radiusBase = 1 + Math.floor(localRandom() * (1 + bushPatchScale * 3.2));
    const radiusX = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const radiusY = Math.max(1, radiusBase + Math.floor((localRandom() - 0.5) * (1 + bushClustering * 2)));
    const densityMultiplier = 0.72 + bushClustering * 0.38 + ((localRandom() - 0.5) * variability * 0.18);
    painted += paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, localRandom, densityMultiplier);

    if (localRandom() < (0.22 + bushClustering * 0.46)) {
      const offsetCol = clamp(centerCol + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, lw - 2);
      const offsetRow = clamp(centerRow + Math.round((localRandom() - 0.5) * (2 + bushPatchScale * 3)), 1, lh - 2);
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

  const levelWidth = getLevelWidth(level);
  const verticalBands = [4, 10, 16, 22];
  const horizontalBands = [6, 12, 18];
  verticalBands.forEach((bandCol) => {
    for (let row = 0; row < getLevelHeight(level); row += 1) {
      if (localRandom() < 0.55) {
        if (level.obstacles[row][bandCol] !== TILE.BASE) level.obstacles[row][bandCol] = null;
        level.floor[row][bandCol] = TILE.ROAD;
      }
      if (bandCol + 1 < levelWidth && localRandom() < 0.55) {
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
  const levelWidth = getLevelWidth(level);
  const levelHeight = getLevelHeight(level);
  const clusters = 14;
  const obstacleTypes = [TILE.BRICK, TILE.BRICK, TILE.BUSH, TILE.STEEL, TILE.WATER];
  for (let i = 0; i < clusters; i += 1) {
    const centerCol = Math.floor(localRandom() * levelWidth);
    const centerRow = Math.floor(localRandom() * levelHeight);
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
      if (!inBounds(x, y, level)) continue;
      if (level.obstacles[y][x] === TILE.WATER) continue; // los caminos no pisan agua
      level.floor[y][x] = TILE.ROAD;
    }
  }
}

// Como paintRoadCell pero fuerza limpieza de agua (para puentes sobre el río)
function paintBridgeCell(level, col, row, width = 2) {
  const halfBefore = Math.floor((width - 1) / 2);
  const halfAfter = width - halfBefore - 1;
  for (let y = row - halfBefore; y <= row + halfAfter; y += 1) {
    for (let x = col - halfBefore; x <= col + halfAfter; x += 1) {
      if (!inBounds(x, y, level)) continue;
      if (level.obstacles[y][x] !== TILE.BASE) level.obstacles[y][x] = null;
      level.floor[y][x] = TILE.ROAD;
    }
  }
}

function carveBridge(level, waypoints, width = 2) {
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1];
    const next = waypoints[i];
    let col = prev.col;
    let row = prev.row;
    paintBridgeCell(level, col, row, width);
    while (col !== next.col) { col += col < next.col ? 1 : -1; paintBridgeCell(level, col, row, width); }
    while (row !== next.row) { row += row < next.row ? 1 : -1; paintBridgeCell(level, col, row, width); }
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
    if (inBounds(x, y, level) && level.floor[y][x] === TILE.ROAD) count += 1;
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
          if (inBounds(x, y, level) && level.obstacles[y][x] === TILE.WATER) neighbors += 1;
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

// ─────────────────────────────────────────────────────────────────────────────
// SURVIVAL MAP GENERATION — ONLINE-MODE ADAPTED ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

function sIsBaseZone(level, col, row) {
  const ec = getLevelBaseAnchorCol(level);
  const er = getLevelBaseAnchorRow(level);
  return col >= ec - 5 && col <= ec + 6 && row >= er - 5;
}

function sIsSpawnZone(level, col, row) {
  return getEnemySpawnCenters(level).some(
    ({ col: sc, row: sr }) => Math.abs(col - sc) <= 3 && Math.abs(row - sr) <= 3
  );
}

function sIsProtected(level, col, row) {
  return sIsBaseZone(level, col, row) || sIsSpawnZone(level, col, row);
}

// 2×2 road cell; skips water tiles
function sPaintRoadCell2(level, col, row) {
  for (let dc = 0; dc < 2; dc += 1) {
    for (let dr = 0; dr < 2; dr += 1) {
      const tc = col + dc, tr = row + dr;
      if (!inBounds(tc, tr, level)) continue;
      if (level.obstacles[tr][tc] === TILE.WATER) continue;
      if (level.obstacles[tr][tc] === TILE.BASE || level.obstacles[tr][tc] === TILE.BRICK) continue;
      level.floor[tr][tc] = TILE.ROAD;
      level.obstacles[tr][tc] = null;
      level.overlay[tr][tc] = null;
    }
  }
}

// 2×2 bridge cell; forces through water
function sPaintBridgeCell(level, col, row, width = 2) {
  for (let dc = 0; dc < width; dc += 1) {
    for (let dr = 0; dr < width; dr += 1) {
      const tc = col + dc, tr = row + dr;
      if (!inBounds(tc, tr, level)) continue;
      if (level.obstacles[tr][tc] === TILE.BASE || level.obstacles[tr][tc] === TILE.BRICK) continue;
      level.floor[tr][tc] = TILE.ROAD;
      level.obstacles[tr][tc] = null;
      level.overlay[tr][tc] = null;
    }
  }
}

// L-shaped path (horizontal first, then vertical), forces through water
function sSurvivalCarveL(level, fromCol, fromRow, toCol, toRow, width = 2) {
  const c0 = Math.min(fromCol, toCol), c1 = Math.max(fromCol, toCol);
  for (let c = c0; c <= c1; c += 1) sPaintBridgeCell(level, c, fromRow, width);
  const r0 = Math.min(fromRow, toRow), r1 = Math.max(fromRow, toRow);
  for (let r = r0; r <= r1; r += 1) sPaintBridgeCell(level, toCol, r, width);
}

function sSurvivalCarveWideCauseway(level, fromCol, fromRow, toCol, toRow, rng, rx = 2, ry = 2) {
  sSurvivalCarveL(level, fromCol, fromRow, toCol, toRow);

  const c0 = Math.min(fromCol, toCol);
  const c1 = Math.max(fromCol, toCol);
  for (let c = c0; c <= c1; c += 2) {
    sSurvivalPaintIsland(level, c + 1, fromRow + 1, rx, ry, rng);
  }

  const r0 = Math.min(fromRow, toRow);
  const r1 = Math.max(fromRow, toRow);
  for (let r = r0; r <= r1; r += 2) {
    sSurvivalPaintIsland(level, toCol + 1, r + 1, rx, ry, rng);
  }

  sSurvivalPaintIsland(level, fromCol + 1, fromRow + 1, rx + 1, ry + 1, rng);
  sSurvivalPaintIsland(level, toCol + 1, toRow + 1, rx + 1, ry + 1, rng);
}

// Ragged ellipse island (clears water to ground)
function sSurvivalPaintIsland(level, cx, cy, rx, ry, rng) {
  for (let row = cy - ry - 1; row <= cy + ry + 1; row += 1) {
    for (let col = cx - rx - 1; col <= cx + rx + 1; col += 1) {
      if (!inBounds(col, row, level)) continue;
      const nx = (col - cx) / Math.max(1, rx);
      const ny = (row - cy) / Math.max(1, ry);
      if ((nx * nx) + (ny * ny) <= 1 + (rng() - 0.5) * 0.18) {
        if (level.obstacles[row][col] !== TILE.BASE) {
          level.obstacles[row][col] = null;
          level.floor[row][col] = TILE.GROUND;
        }
      }
    }
  }
}

// BFS dry path avoiding TILE.WATER; returns array of {col,row} or null
function sSurvivalFindDryPath(level, fromCol, fromRow, toCol, toRow) {
  const w = getLevelWidth(level), h = getLevelHeight(level);
  if (!inBounds(fromCol, fromRow, level) || !inBounds(toCol, toRow, level)) return null;
  const visited = Array.from({ length: h }, () => Array(w).fill(false));
  const prev    = Array.from({ length: h }, () => Array(w).fill(null));
  const queue   = [{ col: fromCol, row: fromRow }];
  visited[fromRow][fromCol] = true;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.col === toCol && cur.row === toRow) {
      const path = [];
      let node = cur;
      while (node) { path.unshift(node); node = prev[node.row][node.col]; }
      return path;
    }
    for (const [dc, dr] of DIRS) {
      const nc = cur.col + dc, nr = cur.row + dr;
      if (!inBounds(nc, nr, level) || visited[nr][nc]) continue;
      if (level.obstacles[nr][nc] === TILE.WATER) continue;
      visited[nr][nc] = true;
      prev[nr][nc] = cur;
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

function sSurvivalCarvePathRoad(level, fromCol, fromRow, toCol, toRow) {
  const path = sSurvivalFindDryPath(level, fromCol, fromRow, toCol, toRow);
  if (path) path.forEach(({ col, row }) => sPaintRoadCell2(level, col, row));
}

// Dense bushes along all water coastlines
function sSurvivalScatterCoastalBushes(level, rng) {
  const DIRS8 = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  for (let row = 0; row < getLevelHeight(level); row += 1) {
    for (let col = 0; col < getLevelWidth(level); col += 1) {
      const obs = level.obstacles[row][col];
      if (obs === TILE.WATER || obs === TILE.BASE || obs === TILE.BRICK || obs === TILE.STEEL) continue;
      if (level.floor[row][col] === TILE.ROAD) continue;
      const nearWater = DIRS8.some(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        return inBounds(nc, nr, level) && level.obstacles[nr][nc] === TILE.WATER;
      });
      if (nearWater && rng() < 0.88) level.overlay[row][col] = TILE.BUSH;
    }
  }
}

function boostSurvivalNormalBushes(level, rng) {
  const w = getLevelWidth(level);
  const h = getLevelHeight(level);

  for (let i = 0; i < 16; i += 1) {
    const centerCol = 2 + Math.floor(rng() * Math.max(1, w - 4));
    const centerRow = 2 + Math.floor(rng() * Math.max(1, h - 4));
    const radiusX = 2 + Math.floor(rng() * 4);
    const radiusY = 2 + Math.floor(rng() * 3);
    paintBushPatch(level, centerCol, centerRow, radiusX, radiusY, rng, 1.18);
  }

  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (level.obstacles[row][col] === TILE.WATER) continue;
      if (level.obstacles[row][col] === TILE.BASE || level.obstacles[row][col] === TILE.BRICK || level.obstacles[row][col] === TILE.STEEL) continue;
      if (level.floor[row][col] === TILE.ROAD) continue;

      let nearWaterCount = 0;
      dirs.forEach(([dc, dr]) => {
        const nc = col + dc;
        const nr = row + dr;
        if (inBounds(nc, nr, level) && level.obstacles[nr][nc] === TILE.WATER) nearWaterCount += 1;
      });

      if (nearWaterCount >= 1 && rng() < Math.min(0.52 + (nearWaterCount * 0.08), 0.9)) {
        level.overlay[row][col] = TILE.BUSH;
      }
    }
  }
}

// ── Algorithm 0: Normal ──────────────────────────────────────────────────────
// Lakes scattered in the upper portion; BFS dry roads from enemy spawns to base.
// Paths strictly avoid water — they route around lakes.

function generateSurvivalNormalMap(level, rng) {
  resetLevelToBase(level, TILE.GROUND);
  const w = getLevelWidth(level), h = getLevelHeight(level);
  const ec = getLevelBaseAnchorCol(level), er = getLevelBaseAnchorRow(level);

  // 1–3 lakes in upper 65% of map, away from protected zones
  const lakeCount = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < lakeCount; i += 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const cx = 5 + Math.floor(rng() * (w - 10));
      const cy = 4 + Math.floor(rng() * Math.max(1, h * 0.65 - 8));
      if (sIsProtected(level, cx, cy)) continue;
      const isSingleLake = lakeCount === 1;
      const rx = isSingleLake
        ? 7 + Math.floor(rng() * 4)
        : 4 + Math.floor(rng() * 5);
      const ry = isSingleLake
        ? 4 + Math.floor(rng() * 3)
        : 3 + Math.floor(rng() * 3);
      if (sIsProtected(level, cx, cy - ry - 1) || sIsProtected(level, cx, cy + ry + 1)) continue;
      if (sIsProtected(level, cx - rx - 1, cy) || sIsProtected(level, cx + rx + 1, cy)) continue;
      paintLake(level, cx, cy, rx, ry, rng);
      break;
    }
  }
  pruneIsolatedWater(level);

  // BFS dry roads from each spawn to base — never cross water
  const spawns = getEnemySpawnCenters(level);
  const baseTargetCol = ec + 1;
  const baseTargetRow = clamp(er - 8, 4, er - 2);
  spawns.forEach(({ col, row }) => {
    sSurvivalCarvePathRoad(level, col + 1, row + 3, baseTargetCol, baseTargetRow);
  });

  // Cross-lane connecting spawn corridors mid-map
  const crossRow = clamp(Math.floor(h * 0.35) + Math.round((rng() - 0.5) * 4), 4, h - 8);
  sSurvivalCarvePathRoad(level, 2, crossRow, w - 3, crossRow);
}

// ── Algorithm 1: River (horizontal flow, vertical crossings) ─────────────────
// River runs left→right across the map. Paths from enemy spawns to base are
// vertical (perpendicular). 2–3 bridges provide the only crossings.
// Dense bushes grow along the entire river coastline.

function generateSurvivalRiverMap(level, rng) {
  resetLevelToBase(level, TILE.GROUND);
  const w = getLevelWidth(level), h = getLevelHeight(level);
  const ec = getLevelBaseAnchorCol(level), er = getLevelBaseAnchorRow(level);

  const riverWidth = 4 + Math.floor(rng() * 2);
  const rHalf = Math.floor(riverWidth / 2);
  const minCenter = 4 + rHalf;
  const maxCenter = Math.floor(h * 0.55) - rHalf;
  let riverCenter = minCenter + Math.floor(rng() * Math.max(1, maxCenter - minCenter));
  const riverCentersByCol = [];

  // Paint horizontal river with slight vertical drift
  for (let col = 0; col < w; col += 1) {
    if (col > 0 && rng() < 0.28) {
      riverCenter = clamp(riverCenter + (rng() < 0.5 ? -1 : 1), minCenter, maxCenter);
    }
    riverCentersByCol[col] = riverCenter;
    for (let offset = -rHalf; offset <= rHalf; offset += 1) {
      const row = riverCenter + offset;
      if (!inBounds(col, row, level)) continue;
      if (sIsProtected(level, col, row)) continue;
      level.obstacles[row][col] = TILE.WATER;
      level.overlay[row][col] = null;
      level.floor[row][col] = TILE.GROUND;
    }
  }
  pruneIsolatedWater(level);

  // 2–3 vertical bridges (perpendicular to the horizontal river)
  const bridgeCount = 2 + Math.floor(rng() * 2);
  const usedBridgeCols = [];
  let safety = 0;
  while (usedBridgeCols.length < bridgeCount && safety < 300) {
    safety += 1;
    const bc = 4 + Math.floor(rng() * (w - 8));
    if (usedBridgeCols.every((c) => Math.abs(c - bc) >= 8)) usedBridgeCols.push(bc);
  }
  usedBridgeCols.forEach((bc) => {
    const bridgeWidth = rng() < 0.28 ? 3 : 2;
    const rc = riverCentersByCol[bc] ?? riverCenter;
    for (let row = Math.max(0, rc - rHalf - 1); row <= Math.min(h - 1, rc + rHalf + 1); row += 1) {
      sPaintBridgeCell(level, bc, row, bridgeWidth);
    }
  });

  // Vertical paths: each spawn → nearest bridge → base
  const spawns = getEnemySpawnCenters(level);
  const baseTargetRow = clamp(er - 6, 2, er - 2);
  const baseTargetCol = ec + 1;
  spawns.forEach(({ col: sc, row: sr }) => {
    const bc = usedBridgeCols.reduce(
      (best, c) => Math.abs(c - sc) < Math.abs(best - sc) ? c : best,
      usedBridgeCols[0]
    );
    const rc = riverCentersByCol[bc] ?? riverCenter;
    // Above river: L from spawn to bridge column entry
    sSurvivalCarveL(level, sc + 1, sr + 2, bc, Math.max(0, rc - rHalf - 1));
    // Below river: L from bridge exit to base
    sSurvivalCarveL(level, bc, Math.min(h - 1, rc + rHalf + 1), baseTargetCol, baseTargetRow);
  });
}

// ── Algorithm 2: Open Island ──────────────────────────────────────────────────
// Everything is water. Base has a large island at the bottom center.
// Three large enemy islands at the top (left, center, right).
// All islands interconnected.

function generateSurvivalOpenIslandMap(level, rng) {
  resetLevelToBase(level, TILE.GROUND);
  const w = getLevelWidth(level), h = getLevelHeight(level);
  const ec = getLevelBaseAnchorCol(level), er = getLevelBaseAnchorRow(level);

  // Fill map with water (protected zones stay as ground)
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (sIsProtected(level, col, row)) continue;
      if (level.obstacles[row][col] === TILE.BASE) continue;
      level.obstacles[row][col] = TILE.WATER;
      level.overlay[row][col] = null;
      level.floor[row][col] = TILE.GROUND;
    }
  }

  // Large base island at bottom center
  const baseRx = 11 + Math.floor(rng() * 3);
  const baseRy = 5 + Math.floor(rng() * 2);
  const baseCx = ec + 1;
  const baseCy = er - baseRy - 1;
  sSurvivalPaintIsland(level, baseCx, baseCy, baseRx, baseRy, rng);

  // Side landmasses near the lower left/right thirds to avoid dead-water voids.
  const lowerIslandRy = 4 + Math.floor(rng() * 2);
  const lowerIslandRx = 7 + Math.floor(rng() * 2);
  const lowerIslandCy = clamp(baseCy + 2, h - 8, h - 5);
  const lowerLeftCx = clamp(Math.floor(w * 0.17), lowerIslandRx + 2, Math.max(lowerIslandRx + 2, baseCx - baseRx - 4));
  const lowerRightCx = clamp(Math.floor(w * 0.83), Math.min(baseCx + baseRx + 4, w - lowerIslandRx - 3), w - lowerIslandRx - 3);

  const lowerIslands = [
    { col: lowerLeftCx, row: lowerIslandCy },
    { col: lowerRightCx, row: lowerIslandCy },
  ];
  lowerIslands.forEach(({ col, row }) => {
    sSurvivalPaintIsland(level, col, row, lowerIslandRx, lowerIslandRy, rng);
  });

  // Three enemy islands at top matching spawn positions
  const spawns = getEnemySpawnCenters(level);
  const enemyRx = 7 + Math.floor(rng() * 3);
  const enemyRy = 4 + Math.floor(rng() * 2);
  const enemyIslands = spawns.map(({ col }) => {
    const ic = clamp(col + 1, enemyRx + 2, w - enemyRx - 3);
    const ir = 3 + Math.floor(rng() * 2);
    sSurvivalPaintIsland(level, ic, ir, enemyRx, enemyRy, rng);
    return { col: ic, row: ir };
  });

  // Connect base island to lower side islands so the bottom thirds can host land.
  const baseLowerRow = Math.min(h - 3, baseCy + baseRy - 1);
  lowerIslands.forEach(({ col, row }) => {
    sSurvivalCarveWideCauseway(level, baseCx, baseLowerRow, col, Math.max(1, row - lowerIslandRy), rng, 2, 2);
  });

  // Connect base island to each enemy island with wide, tank-safe causeways.
  const baseTopRow = Math.max(0, baseCy - baseRy - 1);
  enemyIslands.forEach(({ col: eic, row: eir }) => {
    sSurvivalCarveWideCauseway(level, baseCx, baseTopRow, eic, eir + enemyRy + 1, rng, 2, 2);
  });

  // Connect enemy islands to each other horizontally with the same generous width.
  for (let i = 0; i < enemyIslands.length - 1; i += 1) {
    const a = enemyIslands[i], b = enemyIslands[i + 1];
    sSurvivalCarveWideCauseway(level, a.col, a.row, b.col, b.row, rng, 2, 2);
  }
}

// ── Algorithm 3: Archipelago ──────────────────────────────────────────────────
// Everything is water. Base island at bottom center; 3 enemy spawn islands at top.
// 2–3 central islands and 2–3 lower islands create a chain of stepping stones.
// All islands connected to form traversable paths enemy→center→lower→base.

function generateSurvivalArchipelagoMap(level, rng) {
  resetLevelToBase(level, TILE.GROUND);
  const w = getLevelWidth(level), h = getLevelHeight(level);
  const ec = getLevelBaseAnchorCol(level), er = getLevelBaseAnchorRow(level);

  // Fill map with water
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      if (sIsProtected(level, col, row)) continue;
      if (level.obstacles[row][col] === TILE.BASE) continue;
      level.obstacles[row][col] = TILE.WATER;
      level.overlay[row][col] = null;
      level.floor[row][col] = TILE.GROUND;
    }
  }

  const isRx = 4, isRy = 3;

  // Base island at bottom center
  const baseRx = 7 + Math.floor(rng() * 2);
  const baseRy = 4 + Math.floor(rng() * 2);
  const baseCx = ec + 1;
  const baseCy = er - baseRy - 2;
  sSurvivalPaintIsland(level, baseCx, baseCy, baseRx, baseRy, rng);

  // 3 enemy spawn islands at top
  const spawns = getEnemySpawnCenters(level);
  const topIslands = spawns.map(({ col }) => {
    const ic = clamp(col + 1, isRx + 2, w - isRx - 3);
    const ir = 3;
    sSurvivalPaintIsland(level, ic, ir, isRx + 1, isRy, rng);
    return { col: ic, row: ir };
  });

  // 2–3 central islands
  const centralCount = 2 + (rng() < 0.5 ? 0 : 1);
  const centralRowTarget = Math.floor(h * 0.5);
  const centralCols = [Math.floor(w * 0.22), Math.floor(w * 0.5), Math.floor(w * 0.78)].slice(0, centralCount);
  const centralIslands = centralCols.map((cc) => {
    const ic = cc + Math.round((rng() - 0.5) * 4);
    const ir = centralRowTarget + Math.round((rng() - 0.5) * 4);
    sSurvivalPaintIsland(level, ic, ir, isRx, isRy, rng);
    return { col: ic, row: ir };
  });

  // 2–3 lower islands between center and base
  const lowerCount = 2 + (rng() < 0.5 ? 0 : 1);
  const lowerRowTarget = Math.floor(h * 0.73);
  const lowerCols = [Math.floor(w * 0.28), Math.floor(w * 0.5), Math.floor(w * 0.72)].slice(0, lowerCount);
  const lowerIslands = lowerCols.map((lc) => {
    const ic = lc + Math.round((rng() - 0.5) * 4);
    const ir = lowerRowTarget + Math.round((rng() - 0.5) * 3);
    sSurvivalPaintIsland(level, ic, ir, isRx, isRy, rng);
    return { col: ic, row: ir };
  });

  // Connect top islands horizontally to each other
  for (let i = 0; i < topIslands.length - 1; i += 1) {
    sSurvivalCarveL(level, topIslands[i].col, topIslands[i].row, topIslands[i + 1].col, topIslands[i + 1].row);
  }

  // Connect top islands → nearest central island
  topIslands.forEach((ti) => {
    const nearest = centralIslands.reduce((best, ci) =>
      Math.abs(ci.col - ti.col) < Math.abs(best.col - ti.col) ? ci : best
    );
    sSurvivalCarveL(level, ti.col, ti.row, nearest.col, nearest.row);
  });

  // Connect central islands horizontally to each other
  for (let i = 0; i < centralIslands.length - 1; i += 1) {
    sSurvivalCarveL(level, centralIslands[i].col, centralIslands[i].row, centralIslands[i + 1].col, centralIslands[i + 1].row);
  }

  // Connect central islands → nearest lower island
  centralIslands.forEach((ci) => {
    const nearest = lowerIslands.reduce((best, li) =>
      Math.abs(li.col - ci.col) < Math.abs(best.col - ci.col) ? li : best
    );
    sSurvivalCarveL(level, ci.col, ci.row, nearest.col, nearest.row);
  });

  // Connect lower islands horizontally to each other
  for (let i = 0; i < lowerIslands.length - 1; i += 1) {
    sSurvivalCarveL(level, lowerIslands[i].col, lowerIslands[i].row, lowerIslands[i + 1].col, lowerIslands[i + 1].row);
  }

  // Connect lower islands → base island
  const baseCyTop = Math.max(0, baseCy - baseRy - 1);
  lowerIslands.forEach((li) => {
    sSurvivalCarveL(level, li.col, li.row, baseCx, baseCyTop);
  });
}

function placeStructuredObstacles(level, localRandom, config = {}) {
  const {
    structureCount = [18, 24],
    compoundChance = 0.75,
    clusterChance = 0.45,
    minSpacing = 3,
  } = config;

  const w = getLevelWidth(level);
  const h = getLevelHeight(level);
  const eagleCol = getLevelBaseAnchorCol(level);
  const eagleRow = getLevelBaseAnchorRow(level);

  function isBaseZone(col, row) {
    return col >= eagleCol - 5 && col <= eagleCol + 6 && row >= eagleRow - 5;
  }

  function canPlaceCell(col, row) {
    if (col < 0 || col >= w || row < 0 || row >= h) return false;
    if (isBaseZone(col, row)) return false;
    if (level.obstacles[row][col] === TILE.WATER) return false;
    if (level.floor[row][col] === TILE.ROAD) return false;
    if (level.obstacles[row][col] !== null) return false;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (isBaseZone(col + dc, row + dr)) return false;
      }
    }
    return true;
  }

  function canPlaceBlock(cells) { return cells.every(({ col, row }) => canPlaceCell(col, row)); }
  function placeBlock(cells, tile) { cells.forEach(({ col, row }) => { level.obstacles[row][col] = tile; }); }

  const s2x1    = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }];
  const s1x2    = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }];
  const s2x2    = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }];
  const sL1     = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }, { col: c+1, row: r+2 }];
  const sL2     = (c, r) => [{ col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c+1, row: r+2 }, { col: c, row: r+2 }];
  const sL3     = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c, row: r+1 }];
  const sL4     = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+2, row: r+1 }];
  const sT1     = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+1, row: r+1 }];
  const sT2     = (c, r) => [{ col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c, row: r+1 }, { col: c+2, row: r+1 }];
  const sLine3h = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }];
  const sLine4h = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c+3, row: r }];
  const sLine3v = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }];
  const sLine4v = (c, r) => [{ col: c, row: r }, { col: c, row: r+1 }, { col: c, row: r+2 }, { col: c, row: r+3 }];
  const sZ      = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 }];
  const sS      = (c, r) => [{ col: c+1, row: r }, { col: c+2, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }];
  const sPlus   = (c, r) => [{ col: c+1, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 }, { col: c+1, row: r+2 }];
  const sRect3x2 = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c+2, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }, { col: c+2, row: r+1 }];
  const sRect2x3 = (c, r) => [{ col: c, row: r }, { col: c+1, row: r }, { col: c, row: r+1 }, { col: c+1, row: r+1 }, { col: c, row: r+2 }, { col: c+1, row: r+2 }];

  const ISOLATED = [s2x1, s1x2, s2x2];
  const COMPOUND = [sL1, sL2, sL3, sL4, sT1, sT2, sLine3h, sLine4h, sLine3v, sLine4v, sZ, sS, sPlus, sRect3x2, sRect2x3];
  const TILES = [TILE.BRICK, TILE.BRICK, TILE.BRICK, TILE.BRICK, TILE.STEEL, TILE.STEEL];

  const total = structureCount[0] + Math.floor(localRandom() * (structureCount[1] - structureCount[0] + 1));
  const placedPositions = [];
  let placed = 0;
  let attempts = 0;

  function tryPlace(col, row, allowClose = false) {
    if (!allowClose && placedPositions.some((p) => Math.abs(p.col - col) < minSpacing && Math.abs(p.row - row) < minSpacing)) return false;
    const tile = TILES[Math.floor(localRandom() * TILES.length)];
    const pool = localRandom() < compoundChance ? COMPOUND : ISOLATED;
    const cells = pool[Math.floor(localRandom() * pool.length)](col, row);
    if (!canPlaceBlock(cells)) return false;
    placeBlock(cells, tile);
    placedPositions.push({ col, row });
    placed += 1;
    return true;
  }

  while (placed < total && attempts < total * 60) {
    attempts += 1;
    const col = 2 + Math.floor(localRandom() * (w - 4));
    const row = 2 + Math.floor(localRandom() * (h - 4));
    if (!tryPlace(col, row)) continue;
    if (localRandom() < clusterChance) {
      const clusterSize = 1 + Math.floor(localRandom() * 2);
      for (let k = 0; k < clusterSize; k += 1) {
        const dc = Math.floor(localRandom() * 7) - 3;
        const dr = Math.floor(localRandom() * 7) - 3;
        if (dc === 0 && dr === 0) continue;
        tryPlace(col + dc, row + dr, true);
      }
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

// Survival map (46×26) es ~1.77× más grande que online (26×26), ajustamos densidad proporcionalmente
const SURVIVAL_OBSTACLE_CONFIGS = [
  { structureCount: [38, 52], compoundChance: 0.8,  clusterChance: 0.55, minSpacing: 3 },
  { structureCount: [24, 35], compoundChance: 0.75, clusterChance: 0.45, minSpacing: 3 },
  { structureCount: [18, 28], compoundChance: 0.7,  clusterChance: 0.4,  minSpacing: 4 },
  { structureCount: [10, 18], compoundChance: 0.65, clusterChance: 0.3,  minSpacing: 4 },
];

function generateStyle(level, settings, algorithmIndex, localRandom = Math.random) {
  const obstacleConfig = SURVIVAL_OBSTACLE_CONFIGS[algorithmIndex] ?? SURVIVAL_OBSTACLE_CONFIGS[0];
  if (algorithmIndex === 0) {
    generateSurvivalNormalMap(level, localRandom);
  } else if (algorithmIndex === 1) {
    generateSurvivalRiverMap(level, localRandom);
  } else if (algorithmIndex === 2) {
    generateSurvivalOpenIslandMap(level, localRandom);
  } else {
    generateSurvivalArchipelagoMap(level, localRandom);
  }
  placeStructuredObstacles(level, localRandom, obstacleConfig);
  connectSpawnRoads(level, localRandom);
  scatterBushOverlay(level, settings, localRandom);
  if (algorithmIndex === 0) {
    boostSurvivalNormalBushes(level, localRandom);
    sSurvivalScatterCoastalBushes(level, localRandom);
  } else if (algorithmIndex >= 1) {
    sSurvivalScatterCoastalBushes(level, localRandom);
  }
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
