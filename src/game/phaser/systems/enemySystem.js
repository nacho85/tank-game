import * as Phaser from "phaser";
import {
  ENEMY_BODY_BASE_FACING_DEG,
  ENEMY_BODY_RING_CENTER,
  ENEMY_SPEED,
  ENEMY_TURRET_BASE_FACING_RAD,
  ENEMY_TURRET_CAP_CENTER,
  OUTER_BORDER_SIZE,
  PATROL_ZONES,
  TANK_COLLISION_SIZE,
  TANK_RENDER_SIZE,
  TANKETTE_BODY_TURRET_ANCHOR,
  TANKETTE_TURRET_PIVOT,
  TILE,
  TILE_SIZE,
} from "../shared/constants.js";
import {
  bigCellCenterX,
  bigCellCenterY,
  getEnemySpawnCenters,
  getLevelBaseAnchorCol,
  getLevelBaseAnchorRow,
  getLevelHeight,
  getLevelPlayerSpawnCol,
  getLevelWidth,
  inBounds,
  isBlockingTile,
  worldToGridCol,
  worldToGridRow,
} from "../shared/levelGeneration.js";
import {
  angleDegFromVector,
  clamp,
  circlesOverlap,
  normalizeVector,
  randomChoice,
  vectorLength,
  wrapRadDiff,
} from "../shared/math.js";
import { registerEnemy, syncSceneStatsToMatchState, syncSceneStatusToMatchState, unregisterEnemy } from "../core/state/matchState.js";

const POWER_CARRIER_SPAWN_NUMBERS = new Set([4, 11, 18]);

function clearEnemyPowerCarrierVisuals(enemy) {
  if (!enemy) return;
  enemy.powerCarrierFlashEvent?.remove?.(false);
  enemy.powerCarrierFlashEvent = null;
  enemy.body?.clearTint?.();
  enemy.turret?.clearTint?.();
}

export function markEnemyAsPowerCarrier(scene, enemy) {
  if (!enemy || enemy.isBoss || enemy.isPowerCarrier) return;

  enemy.isPowerCarrier = true;
  enemy.dropPowerUpOnDestroy = true;
  enemy.powerCarrierFlashOn = false;
  enemy.powerCarrierFlashEvent = scene.time.addEvent({
    delay: 150,
    repeat: -1,
    callback: () => {
      if (!enemy.body?.active) {
        clearEnemyPowerCarrierVisuals(enemy);
        return;
      }
      enemy.powerCarrierFlashOn = !enemy.powerCarrierFlashOn;
      const tint = enemy.powerCarrierFlashOn ? 0xf6e05e : 0xff8c42;
      enemy.body?.setTint?.(tint);
      enemy.turret?.setTint?.(tint);
    },
  });
}

export function handleEnemyDestroyed(scene, enemy, killerType = "player") {
  if (!enemy) return;

  if (enemy.isBoss) {
    scene.noteCombatDeath("enemy");
    scene.spawnTankHitExplosion(enemy.x, enemy.y);
    scene.spawnTankHitExplosion(enemy.x - 18, enemy.y + 10);
    scene.spawnTankHitExplosion(enemy.x + 22, enemy.y - 8);
    enemy.container?.destroy();
    scene.enemies = scene.enemies.filter((item) => item !== enemy);
    scene.boss = null;
    scene.isBossBattle = false;
    unregisterEnemy(scene, enemy);
    syncSceneStatusToMatchState(scene);
    scene.showMessage("Boss derrotado");
    scene.updateWaveText();
    return;
  }

  scene.destroyedEnemiesCount += 1;
  if (killerType === "player") {
    scene.score += 100;
  }
  syncSceneStatsToMatchState(scene);
  scene.noteCombatDeath("enemy");
  scene.spawnTankHitExplosion(enemy.x, enemy.y);
  clearEnemyPowerCarrierVisuals(enemy);
  enemy.container?.destroy();
  scene.enemies = scene.enemies.filter((item) => item !== enemy);
  unregisterEnemy(scene, enemy);

  if (enemy.dropPowerUpOnDestroy) {
    scene.spawnRandomPowerUp?.();
  }

  const shuffleEveryKills = Math.max(
    0,
    Math.round(Number(scene.settings?.survivalShuffleEveryKills || 0))
  );
  if (
    scene.currentGameMode === "survival" &&
    shuffleEveryKills > 0 &&
    scene.destroyedEnemiesCount > 0 &&
    scene.destroyedEnemiesCount % shuffleEveryKills === 0
  ) {
    scene.reshuffleSurvivalMap();
  }

  scene.scheduleEnemyRefill();
  scene.updateWaveText();
}

export function getEnemySpawnVariant(scene) {
  const tanketteRatio = clamp(Number(scene.settings?.enemyTanketteRatio || 0) / 100, 0, 1);
  const spawnTankette = Math.random() < tanketteRatio;

  if (spawnTankette) {
    return {
      enemyClass: "tankette",
      bodyKey: "enemy-tankette-body",
      turretKey: "enemy-tankette-turret",
      moveSpeed: Math.max(120, Number(scene.settings?.enemyTanketteSpeed || 250)),
      bodyMaxFactor: 1.02,
      turretMaxFactor: 0.95,
      turretScaleX: 0.6,
      turretScaleY: 0.6,
      turretOffsetX: 0,
      turretOffsetY: 0,
      bodyAnchorPx: TANKETTE_BODY_TURRET_ANCHOR,
      turretPivotPx: TANKETTE_TURRET_PIVOT,
    };
  }

  return {
    enemyClass: "tank",
    bodyKey: "enemy-body-gray-v2",
    turretKey: "enemy-turret-gray-v2",
    moveSpeed: ENEMY_SPEED,
    bodyMaxFactor: 0.95,
    turretMaxFactor: 1.0,
    turretScaleX: 1.1,
    turretScaleY: 1.0,
    turretOffsetX: 0,
    turretOffsetY: 3,
    bodyAnchorPx: ENEMY_BODY_RING_CENTER,
    turretPivotPx: ENEMY_TURRET_CAP_CENTER,
  };
}

export function createEnemyAtSpawn(scene, spawn) {
  const x = bigCellCenterX(spawn.col, scene.boardOriginX);
  const y = bigCellCenterY(spawn.row, scene.boardOriginY);

  const variant = scene.getEnemySpawnVariant();
  const spriteParts = scene.createTankSprite(
    x,
    y,
    variant.bodyKey,
    variant.turretKey,
    TANK_RENDER_SIZE,
    ENEMY_BODY_BASE_FACING_DEG,
    ENEMY_BODY_BASE_FACING_DEG,
    ENEMY_TURRET_BASE_FACING_RAD,
    {
      bodyMaxFactor: variant.bodyMaxFactor,
      turretMaxFactor: variant.turretMaxFactor,
      turretScaleX: variant.turretScaleX,
      turretScaleY: variant.turretScaleY,
      turretOffsetX: variant.turretOffsetX,
      turretOffsetY: variant.turretOffsetY,
      bodyAnchorPx: variant.bodyAnchorPx,
      turretPivotPx: variant.turretPivotPx,
    }
  );

  const zone = scene.pickPatrolZoneForSpawn(spawn.col, spawn.row);
  const waypoint = scene.pickWaypointInZone(zone);
  const startAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);

  const enemy = {
    id: `enemy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "enemy",
    ...spriteParts,
    x,
    y,
    col: spawn.col,
    row: spawn.row,
    moveAngleDeg: angleDegFromVector(Math.cos(startAngle), Math.sin(startAngle)),
    turretAngleRad: startAngle,
    moveSpeed: ENEMY_SPEED,
    shotCooldown: Phaser.Math.Between(350, 1200),
    patrolZone: zone,
    patrolTarget: waypoint,
    patrolRetargetTimer: Phaser.Math.Between(900, 1900),
    turretSweepSpeed: Phaser.Math.FloatBetween(0.55, 0.9) * (Math.random() < 0.5 ? -1 : 1),
    sidestepBias: Phaser.Math.FloatBetween(-0.8, 0.8),
    orbitSign: Math.random() < 0.5 ? -1 : 1,
    activeBullets: [],
    objectiveRetargetTimer: Phaser.Math.Between(500, 1200),
    currentGoalType: "patrol",
    currentObjective: scene.getEnemyApproachObjective(),
    wanderAngleRad: startAngle,
    wanderRetargetTimer: Phaser.Math.Between(260, 620),
    steeringAngleRad: startAngle,
    spawnIndex: spawn.spawnIndex ?? 0,
  };

  scene.noteEnemySpawnUsage(enemy.spawnIndex);
  scene.ensureEnemyRouteStats(enemy);
  scene.updateTankVisuals(enemy);
  registerEnemy(scene, enemy);
  return enemy;
}

export function pickPatrolZoneForSpawn(scene, col, row) {
  const containing = PATROL_ZONES.find(
    (zone) =>
      col >= zone.minCol &&
      col <= zone.maxCol &&
      row >= zone.minRow &&
      row <= zone.maxRow
  );
  return containing || randomChoice(PATROL_ZONES);
}

export function pickWaypointInZone(scene, zone) {
  for (let i = 0; i < 30; i += 1) {
    const col = Phaser.Math.Between(zone.minCol, zone.maxCol);
    const row = Phaser.Math.Between(zone.minRow, zone.maxRow);

    if (!isBlockingTile(scene.level?.obstacles?.[row]?.[col])) {
      return {
        col,
        row,
        x: bigCellCenterX(col, scene.boardOriginX),
        y: bigCellCenterY(row, scene.boardOriginY),
        goalType: "patrol",
      };
    }
  }

  const col = clamp(zone.minCol, 0, getLevelWidth(scene.level) - 1);
  const row = clamp(zone.minRow, 0, getLevelHeight(scene.level) - 1);

  return {
    col,
    row,
    x: bigCellCenterX(col, scene.boardOriginX),
    y: bigCellCenterY(row, scene.boardOriginY),
    goalType: "patrol",
  };
}

export function startBossBattle(scene) {
  scene.destroyAllBullets();
  scene.isBossBattle = true;
  syncSceneStatusToMatchState(scene);
  scene.levelText.setText("Boss · Helicóptero pesado");

  const boardWidth = (getLevelWidth(scene.level) + 2) * TILE_SIZE;
  const spawnX = scene.boardOriginX + boardWidth * 0.5;
  const spawnY = scene.boardOriginY + TILE_SIZE * 2.2;
  const boss = scene.createBossHelicopter(spawnX, spawnY);
  scene.boss = boss;
  scene.enemies.push(boss);
  registerEnemy(scene, boss);
  scene.updateWaveText();
}

export function createBossHelicopter(scene, x, y) {
  const container = scene.add.container(x, y).setDepth(235);
  const body = scene.add.image(0, 0, "boss-heli-body");
  const rotor = scene.add.image(0, 0, "boss-heli-rotor");

  const bodyTexture = scene.textures.get("boss-heli-body").getSourceImage();
  const rotorTexture = scene.textures.get("boss-heli-rotor").getSourceImage();
  const desiredBodyHeight = TILE_SIZE * 2.35 * 1.5;
  const bodyScale = desiredBodyHeight / bodyTexture.height;
  const rotorScale = bodyScale * 1.1;

  body.setScale(bodyScale);
  rotor.setScale(rotorScale);

  const bodyAnchorPx = { x: 249, y: 293, w: bodyTexture.width, h: bodyTexture.height };
  const rotorAnchorPx = { x: 269, y: 256, w: rotorTexture.width, h: rotorTexture.height };

  const bodyAnchorLocalX = (bodyAnchorPx.x - bodyAnchorPx.w / 2) * bodyScale;
  const bodyAnchorLocalY = (bodyAnchorPx.y - bodyAnchorPx.h / 2) * bodyScale;
  const rotorAnchorLocalX = (rotorAnchorPx.x - rotorAnchorPx.w / 2) * rotorScale;
  const rotorAnchorLocalY = (rotorAnchorPx.y - rotorAnchorPx.h / 2) * rotorScale;

  rotor.x = bodyAnchorLocalX - rotorAnchorLocalX;
  rotor.y = bodyAnchorLocalY - rotorAnchorLocalY;

  container.add([body, rotor]);
  scene.entityLayer.add(container);

  const cannonPointsPx = [
    { x: 171, y: 692 },
    { x: 411, y: 691 },
  ];

  return {
    type: "enemy",
    isBoss: true,
    x,
    y,
    col: worldToGridCol(x, scene.boardOriginX),
    row: worldToGridRow(y, scene.boardOriginY),
    container,
    body,
    rotor,
    rotorSpinSpeed: Phaser.Math.FloatBetween(0.22, 0.3),
    moveSpeed: TILE_SIZE * 1.9,
    targetPoint: null,
    retargetTimer: 0,
    shotCooldown: 700,
    burstShotsRemaining: 0,
    burstIntervalMs: Math.round(scene.settings?.bossBurstIntervalMs || 150),
    burstTimer: 0,
    burstCooldownMs: Math.round(scene.settings?.bossBurstCooldownMs || 2400),
    activeBullets: [],
    health: 28,
    maxHealth: 28,
    cannonOffsetsLocal: cannonPointsPx.map((point) => ({
      x: (point.x - bodyTexture.width / 2) * bodyScale,
      y: (point.y - bodyTexture.height / 2) * bodyScale,
    })),
  };
}

export function pickBossTargetPoint(scene) {
  const boardWidth = (getLevelWidth(scene.level) + 2) * TILE_SIZE;
  const boardHeight = (getLevelHeight(scene.level) + 2) * TILE_SIZE;
  const focus = scene.getNearestFriendlyTank(scene.boardOriginX + boardWidth / 2, scene.boardOriginY + boardHeight / 2);
  const targetX = focus ? focus.x + Phaser.Math.Between(-TILE_SIZE * 2, TILE_SIZE * 2) : scene.boardOriginX + boardWidth * Phaser.Math.FloatBetween(0.2, 0.8);
  const targetY = focus ? focus.y - Phaser.Math.Between(TILE_SIZE * 2, TILE_SIZE * 4) : scene.boardOriginY + boardHeight * Phaser.Math.FloatBetween(0.16, 0.48);
  return {
    x: clamp(targetX, scene.boardOriginX + TILE_SIZE * 1.2, scene.boardOriginX + boardWidth - TILE_SIZE * 1.2),
    y: clamp(targetY, scene.boardOriginY + TILE_SIZE * 1.1, scene.boardOriginY + boardHeight - TILE_SIZE * 1.3),
  };
}

export function updateBoss(scene, boss, delta) {
  if (!boss) return;

  boss.shotCooldown = Math.max(0, (boss.shotCooldown || 0) - delta);
  boss.burstTimer = Math.max(0, (boss.burstTimer || 0) - delta);
  boss.retargetTimer = Math.max(0, (boss.retargetTimer || 0) - delta);

  if (!boss.targetPoint || boss.retargetTimer <= 0) {
    boss.targetPoint = scene.pickBossTargetPoint();
    boss.retargetTimer = Phaser.Math.Between(900, 1500);
  }

  const toTarget = normalizeVector((boss.targetPoint?.x || boss.x) - boss.x, (boss.targetPoint?.y || boss.y) - boss.y);
  const moveAmount = (boss.moveSpeed * delta) / 1000;
  const boardWidth = (getLevelWidth(scene.level) + 2) * TILE_SIZE;
  const boardHeight = (getLevelHeight(scene.level) + 2) * TILE_SIZE;
  boss.x = clamp(boss.x + toTarget.x * moveAmount, scene.boardOriginX + TILE_SIZE, scene.boardOriginX + boardWidth - TILE_SIZE);
  boss.y = clamp(boss.y + toTarget.y * moveAmount, scene.boardOriginY + TILE_SIZE, scene.boardOriginY + boardHeight - TILE_SIZE);
  boss.col = scene.worldToCell(boss.x, boss.y).col;
  boss.row = scene.worldToCell(boss.x, boss.y).row;
  boss.container.setPosition(boss.x, boss.y);
  boss.rotor.rotation += boss.rotorSpinSpeed * (delta / 16.666);

  if (boss.burstShotsRemaining > 0) {
    if (boss.burstTimer <= 0) {
      const target = scene.getNearestFriendlyTank(boss.x, boss.y);
      if (target) scene.fireBossVolley(boss, target);
      boss.burstShotsRemaining -= 1;
      boss.burstTimer = boss.burstShotsRemaining > 0 ? boss.burstIntervalMs : boss.burstCooldownMs;
    }
  } else if (boss.shotCooldown <= 0) {
    boss.burstShotsRemaining = 5;
    boss.burstTimer = 0;
    boss.shotCooldown = boss.burstCooldownMs;
  }
}

export function scheduleEnemyRefill(scene) {
  const delay = Math.max(0, Math.round(scene.settings?.enemySpawnDelayMs || 0));
  const event = scene.time.delayedCall(delay, () => {
    scene.pendingEnemySpawnEvents = (scene.pendingEnemySpawnEvents || []).filter((item) => item !== event);
    scene.fillEnemyWaveSlots();
    scene.updateWaveText();
  });
  scene.pendingEnemySpawnEvents.push(event);
}

export function fillEnemyWaveSlots(scene) {
  if (scene.isTransitioning) return;

  const isSurvival = scene.currentGameMode === "survival";

  while (
    scene.enemies.length < scene.maxConcurrentEnemies &&
    (isSurvival || scene.spawnedEnemiesCount < scene.totalEnemiesForLevel)
  ) {
    const enemy = scene.spawnEnemy();
    if (!enemy) break;
    scene.enemies.push(enemy);
    scene.spawnedEnemiesCount += 1;
    if (!isSurvival && POWER_CARRIER_SPAWN_NUMBERS.has(scene.spawnedEnemiesCount)) {
      markEnemyAsPowerCarrier(scene, enemy);
    }

    // Survival: tanques 4, 11, 18, 25… (cada 7 desde el 4) son blindados
    if (isSurvival && scene.spawnedEnemiesCount >= 4 && (scene.spawnedEnemiesCount - 4) % 7 === 0) {
      scene.makeEnemyArmored(enemy);
    }

    // Si hay clock activo, el tanque recién aparecido también queda congelado
    if (scene.activePowerEffects?.clock && !enemy.isBoss) {
      enemy.frozen = true;
    }
  }

  scene.updateWaveText();
}

export function spawnEnemy(scene) {
  const spawnOrder = [...scene.spawnPoints];
  const startIndex = scene.nextEnemySpawnIndex || 0;
  const ordered = [
    ...spawnOrder.slice(startIndex),
    ...spawnOrder.slice(0, startIndex),
  ];

  const freeSpawn = ordered.find((spawn) => {
    const x = bigCellCenterX(spawn.col, scene.boardOriginX);
    const y = bigCellCenterY(spawn.row, scene.boardOriginY);
    return scene.canOccupyWorldPosition(x, y, null);
  });

  if (!freeSpawn) return null;
  const chosenIndex = scene.spawnPoints.findIndex((spawn) => spawn.col === freeSpawn.col && spawn.row === freeSpawn.row);
  scene.nextEnemySpawnIndex = (chosenIndex + 1) % scene.spawnPoints.length;
  return scene.createEnemyAtSpawn({ ...freeSpawn, spawnIndex: chosenIndex });
}

export function getObjectiveCells(scene) {
  const baseCol = getLevelBaseAnchorCol(scene.level);
  const baseRow = getLevelBaseAnchorRow(scene.level);
  return [{
    col: baseCol,
    row: baseRow,
    x: bigCellCenterX(baseCol, scene.boardOriginX),
    y: bigCellCenterY(baseRow, scene.boardOriginY),
    goalType: "base",
  }];
}

export function getPrimaryBaseObjective(scene) {
  const fallbackCol = getLevelBaseAnchorCol(scene.level);
  const fallbackRow = getLevelBaseAnchorRow(scene.level);
  return scene.getObjectiveCells()[0] || {
    col: fallbackCol,
    row: fallbackRow,
    x: bigCellCenterX(fallbackCol, scene.boardOriginX),
    y: bigCellCenterY(fallbackRow, scene.boardOriginY),
    goalType: "base",
  };
}

export function getCriticalBrickObjectives(scene, referenceTarget = null) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (col, row, reason, weight = 1) => {
    if (!inBounds(col, row, scene.level)) return;
    if (scene.level?.obstacles?.[row]?.[col] !== TILE.BRICK) return;
    const key = `${col},${row}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ col, row, x: bigCellCenterX(col, scene.boardOriginX), y: bigCellCenterY(row, scene.boardOriginY), goalType: "brick", brickReason: reason, weight });
  };
  const base = scene.getPrimaryBaseObjective();
  const baseRingRadius = 3;
  for (let row = base.row - baseRingRadius; row <= base.row + baseRingRadius; row += 1) {
    for (let col = base.col - baseRingRadius; col <= base.col + baseRingRadius; col += 1) {
      if (!inBounds(col, row, scene.level)) continue;
      const manhattan = Math.abs(col - base.col) + Math.abs(row - base.row);
      if (manhattan < 2 || manhattan > baseRingRadius + 1) continue;
      const openNeighbours = [
        { col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 },
      ].reduce((acc, cell) => acc + ((inBounds(cell.col, cell.row, scene.level) && !isBlockingTile(scene.level?.obstacles?.[cell.row]?.[cell.col])) ? 1 : 0), 0);
      addCandidate(col, row, "bloquea base", 1.4 + openNeighbours * 0.12);
    }
  }
  const players = referenceTarget ? [referenceTarget] : scene.getFriendlyTanks().filter((tank) => tank && !tank.isDestroyed);
  players.forEach((tank) => {
    const cell = scene.worldToCell(tank.x, tank.y);
    for (let row = cell.row - 2; row <= cell.row + 2; row += 1) {
      for (let col = cell.col - 2; col <= cell.col + 2; col += 1) {
        if (!inBounds(col, row, scene.level)) continue;
        const manhattan = Math.abs(col - cell.col) + Math.abs(row - cell.row);
        if (manhattan < 2 || manhattan > 4) continue;
        addCandidate(col, row, tank.type === "player2" ? "bloquea p2" : "bloquea p1", 1.15);
      }
    }
  });
  const spawnPoints = scene.enemySpawnPoints || [];
  const corridorTargets = [base, ...players.map((tank) => ({ ...scene.worldToCell(tank.x, tank.y), x: tank.x, y: tank.y }))];
  spawnPoints.forEach((spawn) => {
    corridorTargets.forEach((target, index) => {
      const steps = Math.max(4, Math.round((Math.abs(spawn.col - target.col) + Math.abs(spawn.row - target.row)) * 0.75));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const col = Math.round(Phaser.Math.Linear(spawn.col, target.col, t));
        const row = Math.round(Phaser.Math.Linear(spawn.row, target.row, t));
        addCandidate(col, row, index === 0 ? "corredor base" : "corredor jugador", 1.05 + (index === 0 ? 0.15 : 0));
        addCandidate(col + 1, row, "corredor ancho", 0.95);
        addCandidate(col, row + 1, "corredor ancho", 0.95);
      }
    });
  });
  return candidates;
}

export function getEnemyApproachObjective(scene, referenceTarget = null) {
  const objectiveCells = scene.getObjectiveCells();
  const brickObjectives = scene.getCriticalBrickObjectives(referenceTarget);
  if (brickObjectives.length > 0 && Math.random() < 0.58) {
    brickObjectives.sort((a, b) => b.weight - a.weight);
    return brickObjectives[Math.min(brickObjectives.length - 1, Phaser.Math.Between(0, Math.min(2, brickObjectives.length - 1)))];
  }
  return randomChoice(objectiveCells);
}

export function getNearestFriendlyTank(scene, fromX, fromY) {
  const friendlies = scene.getFriendlyTanks().filter((tank) => tank && !tank.isDestroyed);
  if (friendlies.length === 0) return null;
  return friendlies.reduce((best, tank) => {
    if (!best) return tank;
    const bestDist = vectorLength(best.x - fromX, best.y - fromY);
    const nextDist = vectorLength(tank.x - fromX, tank.y - fromY);
    if (nextDist === bestDist && tank.type === "player2") return tank;
    return nextDist < bestDist ? tank : best;
  }, null);
}

export function rebuildEnemyNavigationField(scene) {
  const objectiveCells = scene.getObjectiveCells().map((cell) => ({ col: cell.col, row: cell.row }));
  const rows = Array.from({ length: getLevelHeight(scene.level) }, () => Array(getLevelWidth(scene.level)).fill(Number.POSITIVE_INFINITY));
  const queue = [];
  objectiveCells.forEach(({ col, row }) => {
    if (!inBounds(col, row, scene.level)) return;
    rows[row][col] = 0;
    queue.push({ col, row, cost: 0 });
  });
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    if (current.cost !== rows[current.row][current.col]) continue;
    const neighbours = [{ col: current.col + 1, row: current.row }, { col: current.col - 1, row: current.row }, { col: current.col, row: current.row + 1 }, { col: current.col, row: current.row - 1 }];
    neighbours.forEach(({ col, row }) => {
      if (!inBounds(col, row, scene.level)) return;
      const stepCost = scene.getEnemyTraversalCost(col, row);
      if (!Number.isFinite(stepCost)) return;
      const nextCost = current.cost + stepCost;
      if (nextCost >= rows[row][col]) return;
      rows[row][col] = nextCost;
      queue.push({ col, row, cost: nextCost });
    });
  }
  scene.enemyNavigationField = rows;
  scene.enemyNavigationFieldCache = {};
  scene.refreshDebugOverlay();
}

export function getEnemyTraversalCost(scene, col, row) {
  const obstacle = scene.level?.obstacles?.[row]?.[col];
  if (obstacle === TILE.WATER || obstacle === TILE.STEEL) return Number.POSITIVE_INFINITY;
  if (obstacle === TILE.BRICK) {
    const breakBias = scene.getEnemyBehaviorTuning?.().breakBricks ?? 0.58;
    return Phaser.Math.Linear(5.6, 2.2, breakBias);
  }
  if (obstacle === TILE.ROAD) {
    const survivalBridgeBias = scene.currentGameMode === "survival" ? 0.44 : 0.72;
    return survivalBridgeBias;
  }
  return 1;
}

export function getEnemyNavigationCostAt(scene, col, row) {
  if (!inBounds(col, row)) return Number.POSITIVE_INFINITY;
  return scene.enemyNavigationField?.[row]?.[col] ?? Number.POSITIVE_INFINITY;
}

export function countOpenNeighbourCells(scene, col, row) {
  let openCount = 0;
  [{ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 }].forEach((cell) => {
    if (!inBounds(cell.col, cell.row)) return;
    if (!isBlockingTile(scene.level?.obstacles?.[cell.row]?.[cell.col])) openCount += 1;
  });
  return openCount;
}

export function getEnemyNavigationVector(scene, enemy, objective) {
  const direct = normalizeVector(objective.x - enemy.x, objective.y - enemy.y);
  const currentCell = scene.worldToCell(enemy.x, enemy.y);
  const field = scene.getEnemyNavigationFieldForObjective(objective);
  const currentCost = field?.[currentCell.row]?.[currentCell.col] ?? Number.POSITIVE_INFINITY;
  const candidates = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 0.7071, y: 0.7071 }, { x: -0.7071, y: 0.7071 }, { x: 0.7071, y: -0.7071 }, { x: -0.7071, y: -0.7071 },
  ];
  let best = null;
  candidates.forEach((dir) => {
    const probeX = enemy.x + dir.x * TILE_SIZE * 1.2;
    const probeY = enemy.y + dir.y * TILE_SIZE * 1.2;
    if (!scene.canOccupyWorldPosition(probeX, probeY, enemy)) return;
    const probeCell = scene.worldToCell(probeX, probeY);
    const fieldCost = field?.[probeCell.row]?.[probeCell.col] ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(fieldCost)) return;
    const alignment = dir.x * direct.x + dir.y * direct.y;
    const openness = scene.countOpenNeighbourCells(probeCell.col, probeCell.row);
    const centerX = bigCellCenterX(probeCell.col, scene.boardOriginX);
    const centerY = bigCellCenterY(probeCell.row, scene.boardOriginY);
    const centerDir = normalizeVector(centerX - enemy.x, centerY - enemy.y);
    const centerAlignment = centerDir.x * direct.x + centerDir.y * direct.y;
    const score = fieldCost - alignment * 0.65 - centerAlignment * 0.2 - openness * 0.08;
    if (!best || score < best.score) best = { score, dir, fieldCost, probeCell };
  });
  if (best && (best.fieldCost <= currentCost + 2.4 || !Number.isFinite(currentCost))) {
    return normalizeVector(best.dir.x, best.dir.y);
  }
  scene.noteEnemyRouteMetric("navFallbacks");
  return direct;
}

export function clearEnemyNavigationStuckState(scene, enemy) {
  enemy.unstuckTimer = 0;
  enemy.unstuckDirection = null;
  enemy.routeStats = { stuckEvents: 0, repaths: 0, recoveries: 0, noProgressMs: 0, state: "avance" };
  enemy.lastObjectiveDistance = null;
  enemy.lastMeaningfulProgressAt = scene.time.now;
  enemy.routeRepathLatch = false;
  enemy.blockedTimer = 0;
}

export function createOrRefreshDebugOverlay(scene) {
  return null;
}

export function refreshDebugOverlay(scene) {
  scene.debugEnemyStateTexts?.forEach((text) => text.destroy());
  scene.debugEnemyStateTexts = [];
  return;
  const graphics = scene.createOrRefreshDebugOverlay();
  graphics.clear();
  const showSpawnReserve = Math.round(scene.settings?.debugSpawnReserveOverlay || 0) === 1;
  const showNav = Math.round(scene.settings?.debugEnemyNavOverlay || 0) === 1;
  const showState = Math.round(scene.settings?.debugEnemyStateText || 0) === 1;
  const showTargets = Math.round(scene.settings?.debugEnemyTargetOverlay || 0) === 1;
  const showPaths = Math.round(scene.settings?.debugEnemyPathOptions || 0) === 1;
  if (!showSpawnReserve && !showNav && !showState && !showTargets && !showPaths) {
    graphics.setVisible(false);
    scene.debugEnemyStateTexts?.forEach((text) => text.destroy());
    scene.debugEnemyStateTexts = [];
    scene.updateEnemyDebugHud();
    return;
  }
  graphics.setVisible(true);
  scene.debugEnemyStateTexts?.forEach((text) => text.destroy());
  scene.debugEnemyStateTexts = [];
  if (showSpawnReserve) {
    graphics.lineStyle(2, 0x7dd3fc, 0.85);
    const reservedAreas = [
      ...getEnemySpawnCenters(scene.level).map((cell) => ({ ...cell, size: 4 })),
      { col: getLevelPlayerSpawnCol(scene.level, 1), row: getLevelBaseAnchorRow(scene.level), size: 4 },
      { col: getLevelPlayerSpawnCol(scene.level, 2), row: getLevelBaseAnchorRow(scene.level), size: 4 },
    ];
    reservedAreas.forEach(({ col, row, size }) => {
      const startCol = clamp(col - 1, 0, getLevelWidth(scene.level) - size);
      const startRow = clamp(row - 1, 0, getLevelHeight(scene.level) - size);
      const x = scene.boardOriginX + OUTER_BORDER_SIZE + startCol * TILE_SIZE;
      const y = scene.boardOriginY + OUTER_BORDER_SIZE + startRow * TILE_SIZE;
      graphics.strokeRect(x, y, size * TILE_SIZE, size * TILE_SIZE);
    });
  }
  if (showNav) {
    graphics.lineStyle(2, 0xffd166, 0.9);
    scene.enemies.forEach((enemy) => {
      const goal = enemy.currentObjective || scene.getEnemyApproachObjective();
      graphics.strokeLineShape(new Phaser.Geom.Line(enemy.x, enemy.y, goal.x, goal.y));
    });
  }
  if (showTargets || showPaths) {
    scene.enemies.forEach((enemy) => {
      const plan = enemy.debugPlan || {};
      if (showTargets && plan.objective) {
        graphics.lineStyle(2, 0x22c55e, 0.9);
        graphics.strokeCircle(plan.objective.x, plan.objective.y, 10);
        graphics.strokeLineShape(new Phaser.Geom.Line(enemy.x, enemy.y, plan.objective.x, plan.objective.y));
      }
      if (showPaths && Array.isArray(plan.candidateObjectives)) {
        plan.candidateObjectives.slice(0, 5).forEach((candidate, idx) => {
          const color = candidate.goalType === "brick" ? 0xef4444 : candidate.goalType === "player" ? 0x60a5fa : candidate.goalType === "flank" ? 0xa78bfa : 0xfbbf24;
          graphics.lineStyle(idx === 0 ? 2 : 1, color, idx === 0 ? 0.85 : 0.55);
          graphics.strokeLineShape(new Phaser.Geom.Line(enemy.x, enemy.y, candidate.x, candidate.y));
          graphics.strokeRect(candidate.x - 4, candidate.y - 4, 8, 8);
        });
      }
    });
  }
  if (showState) {
    scene.enemies.forEach((enemy) => {
      const plan = enemy.debugPlan || {};
      const objectiveType = plan.objective?.goalType || enemy?.routeStats?.goalType || enemy?.currentObjective?.goalType || "base";
      const candidateSummary = (plan.candidateObjectives || []).slice(0, 3).map((candidate) => candidate.goalType || "ruta").join(",");
      const stateText = (enemy?.routeStats?.state || "avance") + " · obj: " + objectiveType + (enemy?.routeStats?.blockedBy && enemy?.routeStats?.blockedBy !== "ninguno" ? " · " + enemy.routeStats.blockedBy : "") + (candidateSummary ? "\nplan: " + candidateSummary : "");
      const label = scene.add.text(enemy.x + 10, enemy.y - 22, stateText, { fontFamily: "Arial", fontSize: "11px", color: "#ffffff", backgroundColor: "rgba(0,0,0,0.4)" }).setDepth(891);
      scene.entityLayer.add(label);
      scene.debugEnemyStateTexts.push(label);
    });
  }
  scene.updateEnemyDebugHud();
}

export function getEnemyBehaviorPresetBaseValues(scene, rawValue) {
  const presetIndex = Math.round(rawValue ?? scene.settings?.enemyBehaviorPreset ?? 3);
  return [
    { aggression: 84, navigation: 76, breakBricks: 82, recovery: 70, fireDiscipline: 68, shotFrequency: 62 },
    { aggression: 78, navigation: 72, breakBricks: 42, recovery: 74, fireDiscipline: 84, shotFrequency: 76 },
    { aggression: 54, navigation: 66, breakBricks: 46, recovery: 64, fireDiscipline: 48, shotFrequency: 42 },
    { aggression: 62, navigation: 70, breakBricks: 58, recovery: 72, fireDiscipline: 66, shotFrequency: 58 },
    { aggression: 70, navigation: 58, breakBricks: 64, recovery: 68, fireDiscipline: 60, shotFrequency: 72 },
  ][presetIndex] || { aggression: 62, navigation: 70, breakBricks: 58, recovery: 72, fireDiscipline: 66, shotFrequency: 58 };
}

export function applyEnemyBehaviorPresetToSettings(scene, rawValue) {
  const preset = scene.getEnemyBehaviorPresetBaseValues(rawValue);
  scene.settings.enemyAggression = preset.aggression;
  scene.settings.enemyNavigationSkill = preset.navigation;
  scene.settings.enemyBreakBricks = preset.breakBricks;
  scene.settings.enemyRecoverySkill = preset.recovery;
  scene.settings.enemyFireDiscipline = preset.fireDiscipline;
  scene.settings.enemyShotFrequency = preset.shotFrequency;
  scene.sliderControls?.forEach((control) => {
    if (["enemyAggression", "enemyNavigationSkill", "enemyBreakBricks", "enemyRecoverySkill", "enemyFireDiscipline", "enemyShotFrequency"].includes(control.schema.key)) {
      scene.refreshSlider(control);
    }
  });
}

export function getEnemyBehaviorPresetName(scene, rawValue) {
  return ["Asedio", "Cazador", "Patrulla", "Balanceado", "Caótico"][Math.round(rawValue)] || "Balanceado";
}

export function getEnemyBehaviorTuning(scene) {
  const presetIndex = Math.round(scene.settings?.enemyBehaviorPreset || 3);
  const presets = [
    { base: 92, flank: 22, player: 24, wander: 8, aim: 28, objectiveFire: 92, commit: 1500, notice: 5.8 },
    { base: 42, flank: 34, player: 92, wander: 12, aim: 94, objectiveFire: 30, commit: 1100, notice: 7.8 },
    { base: 56, flank: 82, player: 42, wander: 46, aim: 48, objectiveFire: 42, commit: 980, notice: 6.2 },
    { base: 70, flank: 52, player: 58, wander: 18, aim: 66, objectiveFire: 64, commit: 1300, notice: 6.8 },
    { base: 58, flank: 68, player: 66, wander: 62, aim: 58, objectiveFire: 58, commit: 760, notice: 7.2 },
  ];
  const preset = presets[presetIndex] || presets[3];
  const aggression = clamp((scene.settings?.enemyAggression || 0) / 100, 0, 1);
  const navigation = clamp((scene.settings?.enemyNavigationSkill || 0) / 100, 0, 1);
  const breakBricks = clamp((scene.settings?.enemyBreakBricks || 0) / 100, 0, 1);
  const recovery = clamp((scene.settings?.enemyRecoverySkill || 0) / 100, 0, 1);
  const fire = clamp((scene.settings?.enemyFireDiscipline || 0) / 100, 0, 1);
  const shotFrequency = clamp((scene.settings?.enemyShotFrequency || 0) / 100, 0, 1);
  const turretTurnDeg = clamp(Number(scene.settings?.enemyTurretTurnSpeed || 110), 20, 240);
  const basePressure = clamp((preset.base * 0.68) + aggression * 32 - (1 - aggression) * 4, 0, 100) / 100;
  const playerAggro = clamp((preset.player * 0.74) + aggression * 24, 0, 100) / 100;
  const flankBias = clamp((preset.flank * 0.8) + navigation * 14 + (1 - aggression) * 8, 0, 100) / 100;
  const wander = clamp(preset.wander * (1.08 - navigation * 0.5), 4, 100) / 100;
  const routeCommitMs = Phaser.Math.Linear(preset.commit + 260, preset.commit - 180, navigation);
  return {
    presetIndex,
    basePressure,
    flankBias,
    playerAggro,
    wander,
    aimPlayerBias: clamp((preset.aim * 0.76) + fire * 22, 0, 100) / 100,
    objectiveFireBias: clamp((preset.objectiveFire * 0.74) + fire * 24 + breakBricks * 10, 0, 100) / 100,
    navigationSkill: navigation,
    breakBricks,
    recovery,
    shotFrequency,
    turretTurnDeg,
    playerNoticeRadius: TILE_SIZE * Phaser.Math.Linear(4.4, preset.notice, aggression),
    obstacleProbeDistance: Phaser.Math.Linear(TILE_SIZE * 0.75, TILE_SIZE * 1.15, navigation),
    pathRefreshMs: Math.round(Phaser.Math.Linear(1050, 460, navigation)),
    progressForgetMs: Math.round(Phaser.Math.Linear(1600, 720, recovery)),
    blockedRetargetMs: Math.round(Phaser.Math.Linear(940, 360, recovery)),
    hardResetMs: Math.round(Phaser.Math.Linear(1900, 760, recovery)),
    shootBrickMs: Math.round(Phaser.Math.Linear(560, 240, breakBricks)),
    turnRateNormalDeg: Phaser.Math.Linear(85, 165, navigation),
    turnRateBlockedDeg: Phaser.Math.Linear(120, 235, recovery),
    routeCommitMs,
  };
}

export function getEnemyShotAngle(scene, enemy, targetAngle = enemy?.turretAngleRad ?? 0) {
  const aimErrorDeg = clamp(Number(scene.settings?.enemyAimErrorDeg ?? 0), 0, 25);
  if (aimErrorDeg <= 0) return targetAngle;

  return Phaser.Math.Angle.Wrap(
    targetAngle + Phaser.Math.FloatBetween(-Phaser.Math.DegToRad(aimErrorDeg), Phaser.Math.DegToRad(aimErrorDeg))
  );
}

export function ensureEnemyRouteStats(scene, enemy) {
  if (!enemy.routeStats) {
    enemy.routeStats = { stuckEvents: 0, repaths: 0, recoveries: 0, noProgressMs: 0, state: "avance", blockedBy: "ninguno", goalType: enemy?.currentObjective?.goalType || "base", routeCommitUntil: 0, lastProgressSample: 0 };
  }
  if (!scene.enemyAiMetrics) scene.enemyAiMetrics = scene.createEmptyEnemyMetrics();
  return enemy.routeStats;
}

export function noteEnemyRouteMetric(scene, kind, amount = 1) {
  if (!scene.enemyAiMetrics) scene.enemyAiMetrics = scene.createEmptyEnemyMetrics();
  scene.enemyAiMetrics[kind] = (scene.enemyAiMetrics[kind] || 0) + amount;
}

export function noteEnemySpawnUsage(scene, spawnIndex) {
  if (!scene.enemyAiMetrics) scene.enemyAiMetrics = scene.createEmptyEnemyMetrics();
  if (Number.isInteger(spawnIndex) && scene.enemyAiMetrics.spawnUse?.[spawnIndex] != null) {
    scene.enemyAiMetrics.spawnUse[spawnIndex] += 1;
  }
}

export function getEnemyBlockedCause(scene, enemy) {
  const angle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
  const probeDistance = scene.getEnemyBehaviorTuning().obstacleProbeDistance;
  const probeX = enemy.x + Math.cos(angle) * probeDistance;
  const probeY = enemy.y + Math.sin(angle) * probeDistance;
  const probeCell = scene.worldToCell(probeX, probeY);
  const obstacle = scene.level?.obstacles?.[probeCell.row]?.[probeCell.col];
  if (obstacle === TILE.BRICK) return "ladrillo";
  if (obstacle === TILE.WATER) return "agua";
  if (obstacle === TILE.STEEL) return "steel";
  const blockingTank = [...scene.enemies, ...scene.getFriendlyTanks()].find((other) => other && other !== enemy && !other.isDestroyed && circlesOverlap(probeX, probeY, TANK_COLLISION_SIZE * 0.72, other.x, other.y, TANK_COLLISION_SIZE * 0.72));
  if (blockingTank) return blockingTank.type?.startsWith("player") ? "jugador" : "tanque";
  return obstacle ? "terreno" : "desconocido";
}

export function getEnemyRushTarget(scene, enemy, tuning = scene.getEnemyBehaviorTuning()) {
  const enemyNoticeRadius = Math.max(TILE_SIZE * 7, tuning.playerNoticeRadius || 0);
  const nearestFriendly = scene.getNearestFriendlyTank(enemy.x, enemy.y);
  const nearestFriendlyDist = nearestFriendly
    ? vectorLength(nearestFriendly.x - enemy.x, nearestFriendly.y - enemy.y)
    : Number.POSITIVE_INFINITY;

  if (nearestFriendly && !nearestFriendly.isDestroyed && nearestFriendlyDist < enemyNoticeRadius) {
    const cell = scene.worldToCell(nearestFriendly.x, nearestFriendly.y);
    return {
      goalType: "player",
      x: nearestFriendly.x,
      y: nearestFriendly.y,
      col: cell.col,
      row: cell.row,
      playerSlot: nearestFriendly.playerSlot || (nearestFriendly.type === "player2" ? 2 : 1),
    };
  }

  return scene.getPrimaryBaseObjective();
}

export function getEnemyRushMode(scene) {
  return clamp(Math.round(Number(scene.settings?.enemyRushMode ?? 0)), 0, 3);
}

export function chooseEnemyObjective(scene, enemy, tuning, forceNew = false) {
  const stats = scene.ensureEnemyRouteStats(enemy);
  const now = scene.time.now;
  const isSurvival = scene.currentGameMode === "survival";
  const rushMode = scene.getEnemyRushMode?.() ?? getEnemyRushMode(scene);
  const isSurvivalRush = isSurvival && rushMode >= 2;
  if (!forceNew && enemy.currentObjective && now < (stats.routeCommitUntil || 0)) {
    if (isSurvivalRush && enemy.currentObjective.goalType !== "player") return enemy.currentObjective;
    if (enemy.currentObjective.goalType !== "player") return enemy.currentObjective;
    const trackedPlayer = scene.getFriendlyTanks().find((tank) => tank && !tank.isDestroyed && tank.playerSlot === enemy.currentObjective.playerSlot);
    if (trackedPlayer) {
      enemy.currentObjective.x = trackedPlayer.x;
      enemy.currentObjective.y = trackedPlayer.y;
      const trackedCell = scene.worldToCell(trackedPlayer.x, trackedPlayer.y);
      enemy.currentObjective.col = trackedCell.col;
      enemy.currentObjective.row = trackedCell.row;
      return enemy.currentObjective;
    }
  }
  const nearestFriendly = scene.getNearestFriendlyTank(enemy.x, enemy.y);
  const distToPlayer = nearestFriendly ? vectorLength(nearestFriendly.x - enemy.x, nearestFriendly.y - enemy.y) : Number.POSITIVE_INFINITY;
  let nextObjective = scene.getPrimaryBaseObjective();
  let goalType = nextObjective.goalType || "base";
  if (isSurvivalRush && !forceNew) {
    nextObjective = scene.getEnemyRushTarget(enemy, tuning);
    goalType = nextObjective.goalType || "base";
    stats.goalType = goalType;
    stats.routeCommitUntil = now + tuning.routeCommitMs * 1.35;
    enemy.currentObjective = nextObjective;
    return nextObjective;
  }
  const shouldHuntPlayer = nearestFriendly && !nearestFriendly.isDestroyed && (
    distToPlayer <= (isSurvivalRush ? tuning.playerNoticeRadius * 0.92 : isSurvival ? tuning.playerNoticeRadius * 0.82 : tuning.playerNoticeRadius) &&
    (
      (isSurvivalRush
        ? distToPlayer <= TILE_SIZE * 5.2
        : isSurvival
        ? tuning.playerAggro >= tuning.basePressure * 1.18 && distToPlayer <= TILE_SIZE * 4.25
        : tuning.playerAggro >= tuning.basePressure * 0.82) ||
      enemy.lastDamagedByPlayerUntil > now ||
      goalType === "player"
    )
  );
  const brickObjectives = scene.getCriticalBrickObjectives(nearestFriendly);
  const shouldBreakCriticalBrick = brickObjectives.length > 0 && (
    tuning.breakBricks > (isSurvival ? 0.28 : 0.38) ||
    enemy.blockedTimer > 140 ||
    stats.noProgressMs > (isSurvival ? 260 : 420) ||
    Math.random() < (isSurvival ? 0.2 + tuning.breakBricks * 0.5 : 0.08 + tuning.breakBricks * 0.34)
  );
  if (shouldHuntPlayer) {
    const cell = scene.worldToCell(nearestFriendly.x, nearestFriendly.y);
    const playerPressureBrick = brickObjectives.find((candidate) => candidate.brickReason?.includes("p"));
    if (playerPressureBrick && tuning.breakBricks > 0.48 && distToPlayer > TILE_SIZE * 1.6 && Math.random() < 0.32) {
      nextObjective = playerPressureBrick; goalType = "brick";
    } else {
      nextObjective = { goalType: "player", x: nearestFriendly.x, y: nearestFriendly.y, col: cell.col, row: cell.row, playerSlot: nearestFriendly.playerSlot || (nearestFriendly.type === "player2" ? 2 : 1) };
      goalType = "player";
    }
  } else if (shouldBreakCriticalBrick) {
    brickObjectives.sort((a, b) => (vectorLength(a.x - enemy.x, a.y - enemy.y) / Math.max(0.1, a.weight || 1)) - (vectorLength(b.x - enemy.x, b.y - enemy.y) / Math.max(0.1, b.weight || 1)));
    nextObjective = brickObjectives[0] || scene.getEnemyApproachObjective(nearestFriendly);
    goalType = nextObjective.goalType || "base";
  } else if (!isSurvival && tuning.flankBias > 0.55 && Math.random() < 0.32 + tuning.flankBias * 0.24) {
    const flankTarget = scene.pickWaypointInZone(enemy.patrolZone);
    if (flankTarget) { nextObjective = { ...flankTarget, goalType: "flank" }; goalType = "flank"; }
  }
  if (enemy.currentObjective?.goalType !== goalType) scene.noteEnemyRouteMetric("routeSwitches");
  if (goalType === "player") scene.noteEnemyRouteMetric("goalPlayer");
  else if (goalType === "brick") scene.noteEnemyRouteMetric("goalBrick");
  else if (goalType === "flank") scene.noteEnemyRouteMetric("goalFlank");
  else scene.noteEnemyRouteMetric("goalBase");
  stats.goalType = goalType;
  stats.routeCommitUntil = now + tuning.routeCommitMs;
  enemy.currentObjective = nextObjective;
  return nextObjective;
}

export function buildEnemyNavigationFieldForTargets(scene, targetCells) {
  const rows = Array.from({ length: getLevelHeight(scene.level) }, () => Array(getLevelWidth(scene.level)).fill(Number.POSITIVE_INFINITY));
  const queue = [];
  targetCells.forEach(({ col, row }) => {
    if (!inBounds(col, row, scene.level)) return;
    rows[row][col] = 0;
    queue.push({ col, row, cost: 0 });
  });
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current || current.cost !== rows[current.row][current.col]) continue;
    const neighbours = [{ col: current.col + 1, row: current.row }, { col: current.col - 1, row: current.row }, { col: current.col, row: current.row + 1 }, { col: current.col, row: current.row - 1 }];
    neighbours.forEach(({ col, row }) => {
      if (!inBounds(col, row, scene.level)) return;
      const stepCost = scene.getEnemyTraversalCost(col, row);
      if (!Number.isFinite(stepCost)) return;
      const nextCost = current.cost + stepCost;
      if (nextCost >= rows[row][col]) return;
      rows[row][col] = nextCost;
      queue.push({ col, row, cost: nextCost });
    });
  }
  return rows;
}

export function getEnemyNavigationFieldForObjective(scene, objective) {
  if (!objective || objective.goalType === "base") return scene.enemyNavigationField;
  if (!scene.enemyNavigationFieldCache) scene.enemyNavigationFieldCache = {};
  const cacheKey = `${objective.goalType}:${objective.col}:${objective.row}`;
  const cached = scene.enemyNavigationFieldCache[cacheKey];
  if (cached && cached.expiresAt > scene.time.now) return cached.rows;
  const rows = scene.buildEnemyNavigationFieldForTargets([{ col: objective.col, row: objective.row }]);
  scene.enemyNavigationFieldCache = { [cacheKey]: { rows, expiresAt: scene.time.now + 260 } };
  return rows;
}

export function updateEnemyRouteSelfEvaluation(scene, enemy, distanceToObjective, delta, tuning) {
  const stats = scene.ensureEnemyRouteStats(enemy);
  const evaluate = true;
  const autocorrect = true;
  if (enemy.lastObjectiveDistance == null || distanceToObjective + 8 < enemy.lastObjectiveDistance) {
    enemy.lastObjectiveDistance = distanceToObjective;
    enemy.lastMeaningfulProgressAt = scene.time.now;
    stats.noProgressMs = 0;
    stats.lastProgressSample = distanceToObjective;
    if (stats.state === "sin progreso" || stats.state === "bloqueado") stats.state = "avance";
    scene.noteEnemyRouteMetric("progressEvents");
    return;
  }
  const sinceProgress = scene.time.now - (enemy.lastMeaningfulProgressAt || scene.time.now);
  stats.noProgressMs = sinceProgress;
  enemy.lastObjectiveDistance = Math.min(enemy.lastObjectiveDistance || distanceToObjective, distanceToObjective);
  if (!evaluate) return;
  if (sinceProgress > tuning.progressForgetMs) {
    stats.state = enemy.blockedTimer > 0 ? "atascado" : "sin progreso";
    scene.noteEnemyRouteMetric("noProgressEvents");
    if (sinceProgress > tuning.progressForgetMs * 1.7) scene.noteEnemyRouteMetric("longStucks");
  }
  if (sinceProgress > tuning.blockedRetargetMs && !enemy.routeRepathLatch) {
    enemy.routeRepathLatch = true;
    stats.repaths += 1;
    scene.noteEnemyRouteMetric("repaths");
    enemy.currentObjective = scene.chooseEnemyObjective(enemy, tuning, true);
    enemy.patrolTarget = scene.pickWaypointInZone(enemy.patrolZone);
    enemy.objectiveRetargetTimer = Phaser.Math.Between(180, 420);
    enemy.patrolRetargetTimer = Phaser.Math.Between(180, 420);
  }
  if (autocorrect && sinceProgress > tuning.hardResetMs) {
    stats.stuckEvents += 1; stats.recoveries += 1;
    scene.noteEnemyRouteMetric("stuckEvents"); scene.noteEnemyRouteMetric("recoveries");
    enemy.routeRepathLatch = false; enemy.orbitSign *= -1;
    const unstuck = scene.getEnemyUnstuckDirection(enemy, enemy.unstuckDirection || { x: Math.cos(enemy.steeringAngleRad || 0), y: Math.sin(enemy.steeringAngleRad || 0) });
    enemy.unstuckDirection = unstuck.dir; enemy.unstuckTimer = Phaser.Math.Between(520, 920); enemy.steeringAngleRad = unstuck.angle;
    enemy.currentObjective = scene.chooseEnemyObjective(enemy, tuning, true);
    enemy.lastMeaningfulProgressAt = scene.time.now; enemy.lastObjectiveDistance = distanceToObjective + TILE_SIZE; stats.state = "recovery";
  }
}

export function ensureEnemyDebugHudText(scene) {
  return null;
  if (!scene.add || !scene.entityLayer || !scene.sys || scene.sys.isDestroyed) return null;
  const needsNewText = !scene.debugHudText || !scene.debugHudText.scene || !scene.debugHudText.active || !scene.debugHudText.canvas;
  if (needsNewText) {
    try { scene.debugHudText?.destroy?.(); } catch (error) {}
    scene.debugHudText = scene.add.text(scene.boardOriginX + 12, scene.boardOriginY + 12, "", { fontFamily: "Arial", fontSize: "14px", color: "#ffd166", backgroundColor: "rgba(0,0,0,0.35)" }).setDepth(892).setVisible(false);
    scene.entityLayer.add(scene.debugHudText);
  }
  return scene.debugHudText;
}

export function updateEnemyDebugHud(scene) {
  if (scene.debugHudText) {
    try { scene.debugHudText.destroy(); } catch (error) {}
    scene.debugHudText = null;
  }
  return;
  const showState = Math.round(scene.settings?.debugEnemyStateText || 0) === 1;
  const autoTest = Math.round(scene.settings?.autoTestEnemyRoutes || 0) === 1;
  const hudText = scene.ensureEnemyDebugHudText();
  if (!hudText) return;
  if (!showState && !autoTest) { hudText.setVisible(false); return; }
  const metrics = scene.enemyAiMetrics || scene.createEmptyEnemyMetrics();
  const stuckNow = (scene.enemies || []).filter((enemy) => ["atascado", "recovery", "sin progreso", "bloqueado"].includes(enemy?.routeStats?.state)).length;
  const totalEnemies = Math.max(1, (scene.enemies || []).length);
  const lines = [
    "IA: " + scene.getEnemyBehaviorPresetName(scene.settings?.enemyBehaviorPreset || 3) + " · activos: " + totalEnemies,
    "Trabados: " + stuckNow + " · repaths: " + (metrics.repaths || 0) + " · recoveries: " + (metrics.recoveries || 0),
    "Bloqueos terreno/tanque: " + (metrics.blockedByTerrain || 0) + "/" + (metrics.blockedByTank || 0) + " · tiros a ladrillo: " + (metrics.brickShots || 0),
    "Metas base/ladrillo/jugador/flanco: " + (metrics.goalBase || 0) + "/" + (metrics.goalBrick || 0) + "/" + (metrics.goalPlayer || 0) + "/" + (metrics.goalFlank || 0) + (autoTest ? " · autotest activo" : ""),
  ];
  try { hudText.setText(lines.join("\n")); hudText.setVisible(true); } catch (error) { scene.debugHudText = null; }
}

export function getEnemySteeringPlan(scene, enemy) {
  const tuning = scene.getEnemyBehaviorTuning();
  const isSurvival = scene.currentGameMode === "survival";
  const rushMode = scene.getEnemyRushMode?.() ?? getEnemyRushMode(scene);
  const isSurvivalRush = isSurvival && rushMode >= 2;
  const objective = scene.chooseEnemyObjective(enemy, tuning, false);
  const fallback = enemy.patrolTarget || scene.pickWaypointInZone(enemy.patrolZone);
  const basePressure = tuning.basePressure;
  const flankBias = tuning.flankBias;
  const wander = tuning.wander;
  const toObjective = scene.getEnemyNavigationVector(enemy, objective);
  const orbitSign = enemy.orbitSign || 1;
  const orbitDir = { x: -toObjective.y * orbitSign, y: toObjective.x * orbitSign };
  const fallbackDir = normalizeVector(fallback.x - enemy.x, fallback.y - enemy.y);
  const jitterAngle = enemy.wanderAngleRad ?? 0;
  const jitterDir = { x: Math.cos(jitterAngle), y: Math.sin(jitterAngle) };
  let pursuitDir = { x: 0, y: 0 };
  let pursuitWeight = 0;
  if (objective.goalType === "player") {
    pursuitDir = normalizeVector(objective.x - enemy.x, objective.y - enemy.y);
    const dist = vectorLength(objective.x - enemy.x, objective.y - enemy.y);
    const noticeRadius = Math.max(TILE_SIZE * 4.5, tuning.playerNoticeRadius);
    pursuitWeight = clamp(1 - dist / noticeRadius, 0, 1) * (0.45 + tuning.playerAggro * 0.65);
  }
  if (isSurvivalRush) {
    const rushTarget = scene.getEnemyRushTarget(enemy, tuning);
    const rushNav = scene.getEnemyNavigationVector(enemy, rushTarget);
    const rushDirect = normalizeVector(rushTarget.x - enemy.x, rushTarget.y - enemy.y);
    const rushSteering = normalizeVector(
      rushNav.x * 1.95 + rushDirect.x * 1.1,
      rushNav.y * 1.95 + rushDirect.y * 1.1
    );
    const candidateObjectives = [rushTarget];
    const brickCandidates = scene.getCriticalBrickObjectives(scene.getNearestFriendlyTank(enemy.x, enemy.y)).slice(0, 3);
    brickCandidates.forEach((candidate) => candidateObjectives.push(candidate));
    enemy.debugPlan = {
      objective: { x: rushTarget.x, y: rushTarget.y, goalType: rushTarget.goalType || "base", col: rushTarget.col, row: rushTarget.row },
      fallback: null,
      candidateObjectives: candidateObjectives.map((candidate) => ({ x: candidate.x, y: candidate.y, goalType: candidate.goalType || "extra", col: candidate.col, row: candidate.row })),
      vectors: { toObjective: { ...rushNav }, orbitDir: { x: 0, y: 0 }, fallbackDir: { x: 0, y: 0 }, pursuitDir: { ...rushDirect }, jitterDir: { x: 0, y: 0 } },
    };
    return { objective: rushTarget, steering: rushSteering, goalType: rushTarget.goalType || "base", fallback: rushTarget, playerWeight: pursuitWeight };
  }
  const steering = normalizeVector(
    toObjective.x * (isSurvivalRush ? 1.95 + basePressure * 1.2 : isSurvival ? 1.5 + basePressure * 1.1 : 0.95 + basePressure * 0.95) + orbitDir.x * (isSurvivalRush ? 0.015 + flankBias * 0.08 : isSurvival ? 0.04 + flankBias * 0.22 : 0.12 + flankBias * 0.82) + fallbackDir.x * (isSurvivalRush ? 0.01 + wander * 0.03 : isSurvival ? 0.03 + wander * 0.12 : 0.08 + wander * 0.45) + pursuitDir.x * (isSurvivalRush ? pursuitWeight * 0.98 : isSurvival ? pursuitWeight * 0.72 : pursuitWeight) + jitterDir.x * (isSurvivalRush ? wander * 0.015 : isSurvival ? wander * 0.08 : wander * 0.32),
    toObjective.y * (isSurvivalRush ? 1.95 + basePressure * 1.2 : isSurvival ? 1.5 + basePressure * 1.1 : 0.95 + basePressure * 0.95) + orbitDir.y * (isSurvivalRush ? 0.015 + flankBias * 0.08 : isSurvival ? 0.04 + flankBias * 0.22 : 0.12 + flankBias * 0.82) + fallbackDir.y * (isSurvivalRush ? 0.01 + wander * 0.03 : isSurvival ? 0.03 + wander * 0.12 : 0.08 + wander * 0.45) + pursuitDir.y * (isSurvivalRush ? pursuitWeight * 0.98 : isSurvival ? pursuitWeight * 0.72 : pursuitWeight) + jitterDir.y * (isSurvivalRush ? wander * 0.015 : isSurvival ? wander * 0.08 : wander * 0.32)
  );
  const candidateObjectives = [objective, fallback].filter(Boolean);
  const brickCandidates = scene.getCriticalBrickObjectives(scene.getNearestFriendlyTank(enemy.x, enemy.y)).slice(0, 3);
  brickCandidates.forEach((candidate) => candidateObjectives.push(candidate));
  enemy.debugPlan = { objective: { x: objective.x, y: objective.y, goalType: objective.goalType || "base", col: objective.col, row: objective.row }, fallback: fallback ? { x: fallback.x, y: fallback.y, goalType: fallback.goalType || "fallback", col: fallback.col, row: fallback.row } : null, candidateObjectives: candidateObjectives.map((candidate) => ({ x: candidate.x, y: candidate.y, goalType: candidate.goalType || "extra", col: candidate.col, row: candidate.row })), vectors: { toObjective: { ...toObjective }, orbitDir: { ...orbitDir }, fallbackDir: { ...fallbackDir }, pursuitDir: { ...pursuitDir }, jitterDir: { ...jitterDir } } };
  return { objective, steering, goalType: objective.goalType || "base", fallback, playerWeight: pursuitWeight };
}

export function getEnemyObjectiveShot(scene, enemy) {
  const fireBias = scene.getEnemyBehaviorTuning().objectiveFireBias;
  if (Math.random() > fireBias) return null;
  const objectiveCells = [];
  if (enemy.currentObjective?.goalType === "brick") objectiveCells.push(enemy.currentObjective);
  objectiveCells.push(...scene.getCriticalBrickObjectives(scene.getNearestFriendlyTank(enemy.x, enemy.y)).slice(0, 6));
  objectiveCells.push(...scene.getObjectiveCells());
  for (const target of objectiveCells) {
    const dx = target.x - enemy.x; const dy = target.y - enemy.y; const dist = vectorLength(dx, dy);
    if (dist > TILE_SIZE * 5.2) continue;
    const axisAligned = Math.abs(dx) < 26 || Math.abs(dy) < 26;
    if (!axisAligned) continue;
    const angle = Math.atan2(dy, dx);
    const clear = scene.isLineToObjectiveClear(enemy.x, enemy.y, target.x, target.y, target);
    if (!clear) continue;
    return { angle, target };
  }
  return null;
}

export function getEnemyUnstuckDirection(scene, enemy, preferredSteering, localRandom = Math.random) {
  const tuning = scene.getEnemyBehaviorTuning?.() || {};
  const rushMode = scene.getEnemyRushMode?.() ?? getEnemyRushMode(scene);
  const isSurvivalRush = scene.currentGameMode === "survival" && rushMode >= 2;
  const preferredAngle = Math.atan2(preferredSteering.y, preferredSteering.x);
  const candidateAngles = isSurvivalRush
    ? [preferredAngle + Math.PI / 4, preferredAngle - Math.PI / 4, preferredAngle + Math.PI / 2, preferredAngle - Math.PI / 2]
    : [preferredAngle + Math.PI / 2, preferredAngle - Math.PI / 2, preferredAngle + Math.PI, preferredAngle + Math.PI / 4, preferredAngle - Math.PI / 4, preferredAngle + (localRandom() < 0.5 ? 0.72 : -0.72) * Math.PI];
  for (const angle of candidateAngles) {
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const probeDistance = Math.max(TILE_SIZE * 1.35, TANK_COLLISION_SIZE * 0.9);
    if (scene.canOccupyWorldPosition(enemy.x + dir.x * probeDistance, enemy.y + dir.y * probeDistance, enemy)) return { dir, angle };
  }
  if (isSurvivalRush) {
    return { dir: normalizeVector(preferredSteering.x, preferredSteering.y), angle: preferredAngle };
  }
  return { dir: { x: -preferredSteering.x, y: -preferredSteering.y }, angle: Phaser.Math.Angle.Wrap(preferredAngle + Math.PI) };
}

export function updateEnemyOnlineRushStyle(scene, enemy, delta, tuning) {
  const now = scene.time.now;
  const rushMode = scene.getEnemyRushMode?.() ?? getEnemyRushMode(scene);
  const target = scene.getEnemyRushTarget(enemy, tuning);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const len = Math.max(1, vectorLength(dx, dy));
  const targetDir = { x: dx / len, y: dy / len };
  const moveAmount = (enemy.moveSpeed * delta) / 1000;
  const probeDistance = TILE_SIZE * 1.1;

  enemy.rushLastSampleAt = enemy.rushLastSampleAt || now;
  if (enemy.rushLastX == null) {
    enemy.rushLastX = enemy.x;
    enemy.rushLastY = enemy.y;
    enemy.rushLastSampleAt = now;
  }

  if (now - enemy.rushLastSampleAt > 350) {
    const movedDistance = vectorLength(enemy.x - enemy.rushLastX, enemy.y - enemy.rushLastY);
    enemy.rushStuckTimer = movedDistance < 6
      ? (enemy.rushStuckTimer || 0) + (now - enemy.rushLastSampleAt)
      : 0;
    enemy.rushLastX = enemy.x;
    enemy.rushLastY = enemy.y;
    enemy.rushLastSampleAt = now;
  }

  let desiredDir = null;

  if ((enemy.rushUnstuckUntil || 0) > now && enemy.rushUnstuckDir) {
    desiredDir = enemy.rushUnstuckDir;
  } else {
    if ((enemy.rushStuckTimer || 0) > 500) {
      enemy.rushStuckTimer = 0;
      const perp1 = { x: -targetDir.y, y: targetDir.x };
      const perp2 = { x: targetDir.y, y: -targetDir.x };
      const diag1 = normalizeVector(targetDir.x * 0.5 - targetDir.y * 0.87, targetDir.y * 0.5 + targetDir.x * 0.87);
      const diag2 = normalizeVector(targetDir.x * 0.5 + targetDir.y * 0.87, targetDir.y * 0.5 - targetDir.x * 0.87);
      for (const dir of [perp1, perp2, diag1, diag2]) {
        if (scene.canOccupyWorldPosition(enemy.x + dir.x * probeDistance, enemy.y + dir.y * probeDistance, enemy)) {
          enemy.rushUnstuckDir = normalizeVector(dir.x, dir.y);
          enemy.rushUnstuckUntil = now + 500 + Math.random() * 400;
          enemy.rushLastDirChangeAt = now;
          desiredDir = enemy.rushUnstuckDir;
          break;
        }
      }
    }

    if (!desiredDir) {
      const needsDirRefresh = !enemy.rushDir || now - (enemy.rushLastDirChangeAt || 0) > 1000;
      if (needsDirRefresh) {
        const spread = rushMode >= 3 ? 0.22 : 0.34;
        let ndx = targetDir.x + (Math.random() - 0.5) * spread;
        let ndy = targetDir.y + (Math.random() - 0.5) * spread;
        const normalizedDir = normalizeVector(ndx, ndy);
        ndx = normalizedDir.x;
        ndy = normalizedDir.y;

        if (!scene.canOccupyWorldPosition(enemy.x + ndx * probeDistance, enemy.y + ndy * probeDistance, enemy)) {
          const perp1 = { x: -ndy, y: ndx };
          const perp2 = { x: ndy, y: -ndx };
          if (scene.canOccupyWorldPosition(enemy.x + perp1.x * probeDistance, enemy.y + perp1.y * probeDistance, enemy)) {
            ndx = perp1.x;
            ndy = perp1.y;
          } else if (scene.canOccupyWorldPosition(enemy.x + perp2.x * probeDistance, enemy.y + perp2.y * probeDistance, enemy)) {
            ndx = perp2.x;
            ndy = perp2.y;
          } else {
            const navDir = scene.getEnemyNavigationVector(enemy, target);
            ndx = navDir.x;
            ndy = navDir.y;
          }
        }

        enemy.rushDir = normalizeVector(ndx, ndy);
        enemy.rushLastDirChangeAt = now;
      }
      desiredDir = enemy.rushDir || targetDir;
    }
  }

  desiredDir = normalizeVector(desiredDir.x, desiredDir.y);
  enemy.currentObjective = target;
  enemy.currentGoalType = target.goalType || "base";
  enemy.debugPlan = {
    objective: { x: target.x, y: target.y, goalType: target.goalType || "base", col: target.col, row: target.row },
    fallback: null,
    candidateObjectives: [target],
    vectors: { toObjective: { ...desiredDir }, orbitDir: { x: 0, y: 0 }, fallbackDir: { x: 0, y: 0 }, pursuitDir: { ...targetDir }, jitterDir: { x: 0, y: 0 } },
  };

  const targetMoveAngle = Math.atan2(desiredDir.y, desiredDir.x);
  const currentMoveAngle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
  const turnRateRad = Phaser.Math.DegToRad(tuning.turnRateNormalDeg) * (delta / 1000);
  const angleDelta = wrapRadDiff(targetMoveAngle, currentMoveAngle);
  enemy.steeringAngleRad = currentMoveAngle + clamp(angleDelta, -turnRateRad, turnRateRad);

  let moved = scene.tryMoveTank(enemy, Math.cos(enemy.steeringAngleRad) * moveAmount, Math.sin(enemy.steeringAngleRad) * moveAmount);
  if (!moved && enemy.shotCooldown <= 0) {
    const aheadX = enemy.x + Math.cos(enemy.steeringAngleRad) * TILE_SIZE * 1.1;
    const aheadY = enemy.y + Math.sin(enemy.steeringAngleRad) * TILE_SIZE * 1.1;
    const aheadCell = scene.worldToCell(aheadX, aheadY);
    const aheadObstacle = scene.level?.obstacles?.[aheadCell.row]?.[aheadCell.col];
    if (aheadObstacle === TILE.BRICK) {
      enemy.turretAngleRad = enemy.steeringAngleRad;
      scene.noteEnemyRouteMetric("brickShots");
      scene.fireBullet(enemy);
    }
  }
  if (moved) {
    enemy.moveAngleDeg = angleDegFromVector(Math.cos(enemy.steeringAngleRad), Math.sin(enemy.steeringAngleRad));
    enemy.blockedTimer = 0;
    enemy.routeRepathLatch = false;
    if (enemy.routeStats) enemy.routeStats.state = "avance";
  } else {
    enemy.blockedTimer += delta;
  }

  const aimTarget = target.goalType === "player" ? target : scene.getNearestFriendlyTank(enemy.x, enemy.y);
  const aimDx = aimTarget ? aimTarget.x - enemy.x : dx;
  const aimDy = aimTarget ? aimTarget.y - enemy.y : dy;
  const desiredTurretAngle = Math.atan2(aimDy, aimDx);
  const turretTurnStep = Phaser.Math.DegToRad(tuning.turretTurnDeg) * (delta / 1000);
  const turretDelta = wrapRadDiff(desiredTurretAngle, enemy.turretAngleRad);
  enemy.turretAngleRad = Phaser.Math.Angle.Wrap(enemy.turretAngleRad + clamp(turretDelta, -turretTurnStep, turretTurnStep));
  scene.updateTankVisuals(enemy);

  const linedUp = Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - desiredTurretAngle)) < (rushMode >= 3 ? 0.22 : 0.3);
  if (enemy.shotCooldown <= 0 && linedUp) {
    scene.fireBullet(enemy, scene.getEnemyShotAngle(enemy, enemy.turretAngleRad));
  }
}

export function updateEnemy(scene, enemy, delta) {
  // Congelado por el poder Clock: no actualizar nada
  if (enemy.frozen) return;

  enemy.shotCooldown = Math.max(0, enemy.shotCooldown - delta);
  enemy.patrolRetargetTimer -= delta;
  enemy.objectiveRetargetTimer -= delta;
  enemy.wanderRetargetTimer -= delta;
  enemy.blockedTimer = Math.max(0, enemy.blockedTimer || 0);
  enemy.unstuckTimer = Math.max(0, (enemy.unstuckTimer || 0) - delta);
  if (enemy.patrolRetargetTimer <= 0 || !enemy.patrolTarget) {
    enemy.patrolTarget = scene.pickWaypointInZone(enemy.patrolZone);
    enemy.patrolRetargetTimer = Phaser.Math.Between(900, 1900);
  }
  const tuning = scene.getEnemyBehaviorTuning();
  const rushMode = scene.getEnemyRushMode?.() ?? getEnemyRushMode(scene);
  const isSurvivalRush = scene.currentGameMode === "survival" && rushMode >= 2;
  if (isSurvivalRush) {
    updateEnemyOnlineRushStyle(scene, enemy, delta, tuning);
    return;
  }
  if (enemy.objectiveRetargetTimer <= 0 || !enemy.currentObjective) {
    enemy.orbitSign *= Math.random() < 0.35 ? -1 : 1;
    enemy.currentObjective = scene.chooseEnemyObjective(enemy, tuning, true);
    enemy.objectiveRetargetTimer = Phaser.Math.Between(Math.max(220, tuning.pathRefreshMs), Math.max(420, tuning.pathRefreshMs + 280));
  }
  if (enemy.wanderRetargetTimer <= 0) {
    enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
    enemy.wanderRetargetTimer = Phaser.Math.Between(620, 1180);
  }
  const plan = scene.getEnemySteeringPlan(enemy);
  enemy.currentGoalType = plan.goalType;
  enemy.currentObjective = plan.objective;
  const objectiveDistance = vectorLength(plan.objective.x - enemy.x, plan.objective.y - enemy.y);
  scene.updateEnemyRouteSelfEvaluation(enemy, objectiveDistance, delta, tuning);
  let desiredSteering = plan.steering;
  if (vectorLength(desiredSteering.x, desiredSteering.y) < 0.001) desiredSteering = normalizeVector(plan.fallback.x - enemy.x, plan.fallback.y - enemy.y);
  if (enemy.unstuckTimer > 0 && enemy.unstuckDirection) desiredSteering = enemy.unstuckDirection;
  const targetMoveAngle = Math.atan2(desiredSteering.y, desiredSteering.x);
  const currentMoveAngle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
  const baseTurnRateRad = Phaser.Math.DegToRad(enemy.unstuckTimer > 0 ? tuning.turnRateBlockedDeg : tuning.turnRateNormalDeg) * (delta / 1000);
  const angleDelta = wrapRadDiff(targetMoveAngle, currentMoveAngle);
  const nextMoveAngle = currentMoveAngle + clamp(angleDelta, -baseTurnRateRad, baseTurnRateRad);
  enemy.steeringAngleRad = nextMoveAngle;
  let steering = { x: Math.cos(nextMoveAngle), y: Math.sin(nextMoveAngle) };
  const moveAmount = (enemy.moveSpeed * delta) / 1000;
  let moved = scene.tryMoveTank(enemy, steering.x * moveAmount, steering.y * moveAmount);
  if (!moved) {
    enemy.blockedTimer += delta;
    const stats = scene.ensureEnemyRouteStats(enemy);
    stats.state = "bloqueado";
    stats.blockedBy = scene.getEnemyBlockedCause(enemy);
    if (["tanque", "jugador"].includes(stats.blockedBy)) scene.noteEnemyRouteMetric("blockedByTank");
    else scene.noteEnemyRouteMetric("blockedByTerrain");
    const sidestepOptions = (isSurvivalRush
      ? [{ x: -steering.y * enemy.orbitSign, y: steering.x * enemy.orbitSign }, { x: steering.y * enemy.orbitSign, y: -steering.x * enemy.orbitSign }]
      : [{ x: -steering.y * enemy.orbitSign, y: steering.x * enemy.orbitSign }, { x: steering.y * enemy.orbitSign, y: -steering.x * enemy.orbitSign }, { x: -steering.x, y: -steering.y }])
      .map((dir) => normalizeVector(dir.x, dir.y));
    for (const candidate of sidestepOptions) {
      moved = scene.tryMoveTank(enemy, candidate.x * moveAmount, candidate.y * moveAmount);
      if (moved) { steering = candidate; enemy.steeringAngleRad = Math.atan2(candidate.y, candidate.x); enemy.unstuckTimer = 260; enemy.unstuckDirection = candidate; break; }
    }
    if (!moved && enemy.blockedTimer >= tuning.shootBrickMs) {
      const unstuck = scene.getEnemyUnstuckDirection(enemy, desiredSteering); enemy.unstuckDirection = unstuck.dir; enemy.unstuckTimer = Phaser.Math.Between(420, 760); enemy.steeringAngleRad = unstuck.angle; moved = scene.tryMoveTank(enemy, unstuck.dir.x * moveAmount, unstuck.dir.y * moveAmount); if (moved) steering = unstuck.dir;
    }
    if (!moved && enemy.blockedTimer >= 320) {
      const aheadX = enemy.x + Math.cos(enemy.steeringAngleRad) * TILE_SIZE * 1.1; const aheadY = enemy.y + Math.sin(enemy.steeringAngleRad) * TILE_SIZE * 1.1; const aheadCell = scene.worldToCell(aheadX, aheadY); const aheadObstacle = scene.level?.obstacles?.[aheadCell.row]?.[aheadCell.col];
      if (aheadObstacle === TILE.BRICK) { enemy.turretAngleRad = enemy.steeringAngleRad; if (enemy.shotCooldown <= 0) { scene.noteEnemyRouteMetric("brickShots"); scene.fireBullet(enemy); } }
    }
    if (!moved && enemy.blockedTimer >= tuning.hardResetMs) {
      enemy.orbitSign *= -1; enemy.currentObjective = scene.chooseEnemyObjective(enemy, tuning, true); enemy.patrolTarget = scene.pickWaypointInZone(enemy.patrolZone); enemy.patrolRetargetTimer = Phaser.Math.Between(240, 520); enemy.objectiveRetargetTimer = Phaser.Math.Between(240, 520); enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }
  }
  if (moved) {
    enemy.blockedTimer = 0; enemy.routeRepathLatch = false; if (enemy.routeStats) enemy.routeStats.state = "avance"; enemy.moveAngleDeg = angleDegFromVector(steering.x, steering.y);
  }
  const rushTarget = isSurvivalRush ? scene.getEnemyRushTarget(enemy, tuning) : null;
  const aimTarget = rushTarget?.goalType === "player"
    ? scene.getNearestFriendlyTank(enemy.x, enemy.y)
    : scene.getNearestFriendlyTank(enemy.x, enemy.y);
  const dxToPlayer = aimTarget ? aimTarget.x - enemy.x : 0; const dyToPlayer = aimTarget ? aimTarget.y - enemy.y : 0; const distToPlayer = aimTarget ? vectorLength(dxToPlayer, dyToPlayer) : Infinity; const playerAimBias = scene.getEnemyBehaviorTuning().aimPlayerBias; const playerVisible = !!aimTarget && distToPlayer < TILE_SIZE * 5.4;
  const objectiveShot = scene.getEnemyObjectiveShot(enemy);
  const shouldTrackPlayer = playerVisible && (isSurvivalRush ? distToPlayer < TILE_SIZE * 7 : Math.random() < (0.28 + playerAimBias * 0.72));
  let desiredTurretAngle = null;
  if (shouldTrackPlayer) desiredTurretAngle = Math.atan2(dyToPlayer, dxToPlayer);
  else if (objectiveShot) desiredTurretAngle = objectiveShot.angle;
  else { const forwardAngle = Phaser.Math.DegToRad(enemy.moveAngleDeg); desiredTurretAngle = Phaser.Math.Angle.Wrap(forwardAngle + enemy.turretSweepSpeed * (delta / 1000) * 0.18); }
  if (desiredTurretAngle != null) {
    const turretTurnStep = Phaser.Math.DegToRad(tuning.turretTurnDeg) * (delta / 1000); const turretDelta = wrapRadDiff(desiredTurretAngle, enemy.turretAngleRad); enemy.turretAngleRad = Phaser.Math.Angle.Wrap(enemy.turretAngleRad + clamp(turretDelta, -turretTurnStep, turretTurnStep));
  }
  scene.updateTankVisuals(enemy);
  const aimedAtPlayer = shouldTrackPlayer && Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - Math.atan2(dyToPlayer, dxToPlayer))) < 0.3;
  const aimedAtObjective = objectiveShot && Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - objectiveShot.angle)) < 0.2;
  const opportunisticSuppression = Math.random() > 0.9975;
  if (enemy.shotCooldown <= 0 && (aimedAtPlayer || aimedAtObjective || opportunisticSuppression)) {
    scene.fireBullet(enemy, scene.getEnemyShotAngle(enemy, enemy.turretAngleRad));
  }
}
