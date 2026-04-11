import { WebSocketServer } from "ws";
import { MESSAGE } from "./protocol.js";
import { computeTankControlStep } from "../../src/game/phaser/core/sim/tankController.js";
import { CLASSIC_80S_LEVELS, CLASSIC_80S_WAVE_CONFIGS } from "../../src/game/phaser/core/levels.js";
import { OUTER_BORDER_SIZE, PLAYER_SPEED, SURVIVAL_GRID_HEIGHT, SURVIVAL_GRID_WIDTH, TANK_COLLISION_SIZE, TANK_HIT_RADIUS, TILE, TILE_SIZE } from "../../src/game/phaser/shared/constants.js";
import { createBulletState, getWeaponConfigForTankType, isBulletOutsideBoard, stepBulletState } from "../../src/game/phaser/core/sim/weaponSystem.js";
import { getUpgradeTier } from "../../src/game/phaser/data/playerUpgrades.js";
import { applyBaseFortressToFineLevel, bigCellCenterX, bigCellCenterY, cloneMatrix, getLevelBaseAnchorCol, getLevelBaseAnchorRow, getLevelHeight, getLevelPlayerSpawnCol, getLevelWidth, getEnemySpawnCenters } from "../../src/game/phaser/shared/levelGeneration.js";
import { worldToGridCol, worldToGridRow, inBounds, isDestructibleTile, isBlockingTile } from "./onlineMap.js";
import { createOnline2v2Level, getOnlineBaseWorld, getOnlineSpawnWorld, ONLINE_BASE_DEFS, ONLINE_ROLE_SPAWNS } from "./onlineMap.js";

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const TICK_RATE = 40;
const TICK_MS = Math.round(1000 / TICK_RATE);
const BOARD_WIDTH = (SURVIVAL_GRID_WIDTH + 2) * TILE_SIZE;
const BOARD_HEIGHT = (SURVIVAL_GRID_HEIGHT + 2) * TILE_SIZE;
const MARGIN = OUTER_BORDER_SIZE;
const MAX_BULLETS_PER_PLAYER = 1;

const TOTAL_ROUNDS = 6;
const SIDE_SWITCH_AFTER_ROUND = Math.max(1, Math.floor(TOTAL_ROUNDS / 2));
const ROUND_TRANSITION_MS = 3500;
const SIDE_SWITCH_PARTIAL_SUMMARY_MS = 5000;
const RESPAWN_DELAY_MS = 2000;
const SPAWN_SHIELD_DURATION_MS = 3000;
const BASE_HP_PER_ROUND = 1;
const MISSILE_STRIKE_SPEED = 640;
const MISSILE_STRIKE_MIN_MS = 260;
const MISSILE_STRIKE_MAX_MS = 1200;
const MISSILE_IMPACT_EFFECT_MS = 180;
const POWER_DURATION_MS = 12000;
const POWER_FLICKER_AT_MS = 2000;
const POWER_FLICKER_STEP_MS = 200;
const DOUBLE_SHOT_SPREAD_PX = 8;
const DEFAULT_DENSITY = "Normal (1x)";
const DEFAULT_LOBBY_MODE = "Clasico - 80s";
const CLASSIC_ENEMY_SPEED = 170;
const CLASSIC_ENEMY_SPAWN_INTERVAL_MS = 2200;
const CLASSIC_LEVEL_TRANSITION_MS = 3500;
const CLASSIC_ENEMY_FIRE_COOLDOWN_MIN_MS = 2200;
const CLASSIC_ENEMY_FIRE_COOLDOWN_RANGE_MS = 1500;
const CLASSIC_MAX_ENEMY_BULLETS = 1;
const CLASSIC_ENEMY_NOTICE_RADIUS = TILE_SIZE * 9;
const CLASSIC_ENEMY_FIRE_RANGE = TILE_SIZE * 8;
const POWER_UP_PICKUP_RADIUS = 38;
const MAX_HOSTED_ROOMS_PER_IP = 2;
const DEFAULT_AI_DIFFICULTY = "Normal";
const GAMEPLAY_CHAT_TTL_MS = 7000;
const GAMEPLAY_CHAT_MAX_LEN = 90;
const GAMEPLAY_CHAT_FLOOD_COUNT = 4;
const GAMEPLAY_CHAT_FLOOD_WINDOW_MS = 5000;
const GAMEPLAY_CHAT_MUTE_MS = 12000;
const ONLINE_POINTS_ENEMY_KILL = 50;
const ONLINE_POINTS_BASE_DESTROYED = 150;
const ONLINE_POINTS_TEAM_KILL = -75;
const RANDOM_PLAYER_COLOR = "Azar";
const RANDOM_COLOR_POOL = [
  "#f5f5f5", "#ffd166", "#c2b280", "#f4c430", "#ffb703", "#c0ca33",
  "#8ac926", "#39d353", "#2dc653", "#4cc9f0", "#00bcd4", "#14b8a6",
  "#06d6a0", "#ff9f1c", "#ff7f50", "#ef476f", "#ff66c4", "#e11d48",
  "#c1121f", "#00a6fb", "#3a86ff", "#4361ee", "#8b5cf6", "#7b2cbf",
  "#b5179e", "#a47148", "#6b7280", "#374151", "#111827",
];
const ALLOWED_PLAYER_COLORS = new Set(RANDOM_COLOR_POOL);
const AI_CELEBRITY_NAMES = [
  "Messi",
  "Maradona",
  "Madonna",
  "Mozart",
  "Gandhi",
  "Mandela",
  "Frida",
  "Borges",
  "Shrek",
  "Homer",
  "Yoda",
  "Zelda",
  "Rocky",
  "Conan",
  "Neo",
  "Draco",
];
const SURVIVAL_AI_PRESETS = {
  Facil: {
    enemyBehaviorPreset: 3,
    enemyAggression: 70,
    enemyNavigationSkill: 80,
    enemyBreakBricks: 64,
    enemyRecoverySkill: 78,
    enemyFireDiscipline: 70,
    enemyShotFrequency: 62,
    enemyAimErrorDeg: 8,
    enemyRushMode: 1,
  },
  Normal: {
    enemyBehaviorPreset: 3,
    enemyAggression: 74,
    enemyNavigationSkill: 84,
    enemyBreakBricks: 68,
    enemyRecoverySkill: 80,
    enemyFireDiscipline: 72,
    enemyShotFrequency: 64,
    enemyAimErrorDeg: 7,
    enemyRushMode: 1,
  },
  Dificil: {
    enemyBehaviorPreset: 3,
    enemyAggression: 78,
    enemyNavigationSkill: 88,
    enemyBreakBricks: 72,
    enemyRecoverySkill: 82,
    enemyFireDiscipline: 76,
    enemyShotFrequency: 68,
    enemyAimErrorDeg: 6,
    enemyRushMode: 2,
  },
  Massacre: {
    enemyBehaviorPreset: 3,
    enemyAggression: 82,
    enemyNavigationSkill: 91,
    enemyBreakBricks: 76,
    enemyRecoverySkill: 85,
    enemyFireDiscipline: 80,
    enemyShotFrequency: 72,
    enemyAimErrorDeg: 5,
    enemyRushMode: 2,
  },
};

const ROLE_ORDER = [
  ONLINE_ROLE_SPAWNS.yellow,
  ONLINE_ROLE_SPAWNS.green,
  ONLINE_ROLE_SPAWNS.red,
  ONLINE_ROLE_SPAWNS.blue,
].map((spawn) => ({ ...spawn, x: getOnlineSpawnWorld(spawn.id).x, y: getOnlineSpawnWorld(spawn.id).y }));

const CLASSIC_ROLE_ORDER = [
  { id: "classic-p1", label: "Jugador 1", side: "south", colorTeam: "team1", slot: 1 },
  { id: "classic-p2", label: "Jugador 2", side: "south", colorTeam: "team1", slot: 2 },
];

const SIDE_SWITCH_ROLE_MAP = { yellow: "red", green: "blue", red: "yellow", blue: "green" };
const LOBBY_PING_TIMEOUT_MS = 20000;
const LOBBY_SWEEP_MS = 5000;

function getEffectiveTeam(roleId, sideSwitched) {
  const isSouthRole = roleId === "yellow" || roleId === "green";
  if (!sideSwitched) return isSouthRole ? "south" : "north";
  return isSouthRole ? "north" : "south";
}

function getEffectiveSpawnWorld(roleId, sideSwitched) {
  const spawnRoleId = sideSwitched ? SIDE_SWITCH_ROLE_MAP[roleId] : roleId;
  return getOnlineSpawnWorld(spawnRoleId);
}

function createDefaultMatchConfig() {
  return {
    mode: DEFAULT_LOBBY_MODE,
    mapAlgorithm: 0,
    density: DEFAULT_DENSITY,
    densityMultiplier: 1,
    totalRounds: TOTAL_ROUNDS,
    sideSwitchAfterRound: Math.max(1, Math.floor(TOTAL_ROUNDS / 2)),
    livesPerRound: 3,
    baseHpPerRound: BASE_HP_PER_ROUND,
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function getMapAlgorithmFromRoomMode(mode) {
  switch (String(mode || "").trim()) {
    case "Rio":
    case "Río":
      return 1;
    case "Islas":
      return 2;
    case "Archipielagos":
    case "Archipiélagos":
      return 3;
    case DEFAULT_LOBBY_MODE:
    case "Normal":
    default:
      return 0;
  }
}

function getDensityMultiplier(density) {
  const label = String(density || "").trim();
  if (label === "Baja (0.75x)") return 0.75;
  if (label === "Alta (1.25x)") return 1.25;
  if (label === "Muy alta (1.5x)") return 1.5;
  return 1;
}

function buildMatchConfigFromRoom(room = null) {
  const defaults = createDefaultMatchConfig();
  const mode = room?.mode || defaults.mode;
  const density = room?.density || defaults.density;
  if (isClassicLobbyMode(mode)) {
    return {
      ...defaults,
      mode,
      mapAlgorithm: 0,
      density,
      densityMultiplier: 1,
      totalRounds: 1,
      sideSwitchAfterRound: 1,
      livesPerRound: clampInteger(room?.lives, 1, 9, defaults.livesPerRound),
      baseHpPerRound: 1,
    };
  }
  const totalRounds = clampInteger(room?.rounds, 1, 99, defaults.totalRounds);
  return {
    mode,
    mapAlgorithm: getMapAlgorithmFromRoomMode(mode),
    density,
    densityMultiplier: getDensityMultiplier(density),
    totalRounds,
    sideSwitchAfterRound: Math.max(1, Math.floor(totalRounds / 2)),
    livesPerRound: clampInteger(room?.lives, 1, 9, defaults.livesPerRound),
    baseHpPerRound: clampInteger(room?.baseHits, 1, 9, defaults.baseHpPerRound),
  };
}

function normalizeAiDifficulty(value) {
  const key = String(value || "").trim();
  if (SURVIVAL_AI_PRESETS[key]) return key;
  return DEFAULT_AI_DIFFICULTY;
}

function pickRandomAiCelebrityName(usedNames = new Set()) {
  const availableNames = AI_CELEBRITY_NAMES.filter((name) => !usedNames.has(name));
  const pool = availableNames.length ? availableNames : AI_CELEBRITY_NAMES;
  const picked = pool[Math.floor(Math.random() * pool.length)] || "Ronaldo";
  usedNames.add(picked);
  return picked;
}

function normalizeLobbyAiSlots(slots = []) {
  const usedAiNames = new Set(
    slots
      .filter((slot) => slot?.kind === "IA" && AI_CELEBRITY_NAMES.includes(String(slot?.label || "").trim()))
      .map((slot) => String(slot.label).trim()),
  );
  return slots.map((slot, index) => {
    const nextSlot = {
      ...slot,
      aiDifficulty: normalizeAiDifficulty(slot?.aiDifficulty),
    };

    if (nextSlot.clientId || nextSlot.isHost) {
      return nextSlot;
    }

    if (nextSlot.kind === "IA") {
      const currentName = String(nextSlot.label || "").trim();
      const celebrityName = AI_CELEBRITY_NAMES.includes(currentName)
        ? currentName
        : pickRandomAiCelebrityName(usedAiNames);
      usedAiNames.add(celebrityName);
      return {
        ...nextSlot,
        label: celebrityName,
        role: `IA ${index + 1}`,
      };
    }

    return {
      ...nextSlot,
      label: nextSlot.baseRole || nextSlot.role || `Slot ${index + 1}`,
      role: nextSlot.baseRole || nextSlot.role || `Slot ${index + 1}`,
    };
  });
}

function buildBotDifficultyProfile(aiDifficulty = DEFAULT_AI_DIFFICULTY) {
  const preset = SURVIVAL_AI_PRESETS[normalizeAiDifficulty(aiDifficulty)] || SURVIVAL_AI_PRESETS[DEFAULT_AI_DIFFICULTY];
  const aggression = clamp(Number(preset.enemyAggression || 0), 0, 100);
  const navigation = clamp(Number(preset.enemyNavigationSkill || 0), 0, 100);
  const recovery = clamp(Number(preset.enemyRecoverySkill || 0), 0, 100);
  const fireDiscipline = clamp(Number(preset.enemyFireDiscipline || 0), 0, 100);
  const shotFrequency = clamp(Number(preset.enemyShotFrequency || 0), 0, 100);
  const aimErrorDeg = clamp(Number(preset.enemyAimErrorDeg || 0), 0, 25);

  return {
    label: normalizeAiDifficulty(aiDifficulty),
    preset,
    noticeRadius: TILE_SIZE * clamp(4.6 + (navigation / 22), 4.5, 9.2),
    closeCombatRadius: TILE_SIZE * clamp(3.2 + (aggression / 30), 3.8, 6.4),
    powerUpEnemyDistance: TILE_SIZE * clamp(5 + ((100 - aggression) / 16) + (navigation / 30), 5.2, 9.8),
    dirChangeIntervalMs: clamp(1650 - (navigation * 8), 850, 1350),
    movementJitter: clamp(0.72 - (navigation / 180), 0.18, 0.52),
    stuckThresholdMs: clamp(980 - (recovery * 4.4), 460, 760),
    fireRange: TILE_SIZE * clamp(4.8 + (shotFrequency / 18) + (fireDiscipline / 32), 5, 10.5),
    fireChance: clamp(((fireDiscipline * 0.58) + (shotFrequency * 0.42)) / 100, 0.48, 0.96),
    aimErrorRad: aimErrorDeg * (Math.PI / 180),
  };
}

// ── Classic 80s online: enemy system ─────────────────────────────────────

// Números de spawn (1-based) que generan un tanque power carrier (misma lógica que el modo local)
const CLASSIC_POWER_CARRIER_SPAWN_NUMBERS = new Set([4, 11, 18]);

function getActiveBoardBounds() {
  if (isClassicMatchMode(gameplayRoom.matchConfig)) {
    const w = getLevelWidth(gameplayRoom.level);
    const h = getLevelHeight(gameplayRoom.level);
    return { maxX: (w + 2) * TILE_SIZE, maxY: (h + 2) * TILE_SIZE };
  }
  return { maxX: BOARD_WIDTH, maxY: BOARD_HEIGHT };
}

function inBoundsForCurrentLevel(col, row) {
  const w = getLevelWidth(gameplayRoom.level);
  const h = getLevelHeight(gameplayRoom.level);
  return col >= 0 && col < w && row >= 0 && row < h;
}

function createClassicStateForLevel(level, levelIndex) {
  const waveConfig = CLASSIC_80S_WAVE_CONFIGS[levelIndex] || CLASSIC_80S_WAVE_CONFIGS[CLASSIC_80S_WAVE_CONFIGS.length - 1];
  const eagleCol = getLevelBaseAnchorCol(level);
  const eagleRow = getLevelBaseAnchorRow(level);
  return {
    enemies: new Map(),
    levelIndex,
    spawnedEnemiesCount: 0,
    destroyedEnemiesCount: 0,
    totalEnemies: waveConfig.totalEnemies,
    maxConcurrent: waveConfig.maxConcurrent,
    lastSpawnAt: 0,
    eagle: { x: bigCellCenterX(eagleCol, 0), y: bigCellCenterY(eagleRow, 0), hp: 1, isDestroyed: false, radius: 30 },
    gameOver: false,
    gameOverReason: null,
    levelTransitioning: false,
    levelTransitionAt: null,
    enemiesFrozenUntil: 0,
    shovelUntil: 0,
    shovelFlickerState: true,
  };
}

function createClassicEnemy(spawnCol, spawnRow, isPowerCarrier = false) {
  return {
    id: `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "enemy",
    team: "enemy",
    x: bigCellCenterX(spawnCol, 0),
    y: bigCellCenterY(spawnRow, 0),
    moveAngleDeg: 90,
    turretAngleRad: Math.PI / 2,
    moveSpeed: CLASSIC_ENEMY_SPEED,
    activeBulletIds: new Set(),
    lastFireAt: 0,
    fireCooldown: CLASSIC_ENEMY_FIRE_COOLDOWN_MIN_MS + Math.random() * CLASSIC_ENEMY_FIRE_COOLDOWN_RANGE_MS,
    isDestroyed: false,
    hp: 1,
    isPowerCarrier,
    botState: {},
  };
}

// Returns true if the tile at distance `dist` in direction `angleRad` is clear (no blocking tile)
function isClearDirForEnemy(enemy, angleRad, dist = TILE_SIZE * 1.3) {
  return canOccupyEnemyPosition(enemy, enemy.x + Math.cos(angleRad) * dist, enemy.y + Math.sin(angleRad) * dist);
}

// Returns true if there is a BRICK tile immediately ahead in `angleRad`
function hasBrickAheadEnemy(enemy, angleRad) {
  const probeX = enemy.x + Math.cos(angleRad) * TILE_SIZE * 0.85;
  const probeY = enemy.y + Math.sin(angleRad) * TILE_SIZE * 0.85;
  const col = worldToGridCol(probeX, 0);
  const row = worldToGridRow(probeY, 0);
  return gameplayRoom.level.obstacles?.[row]?.[col] === TILE.BRICK;
}

function wrapAngleRadSrv(angle) {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI)  a -= Math.PI * 2;
  return a;
}

function canOccupyEnemyPosition(enemy, x, y) {
  const half = TANK_COLLISION_SIZE / 2;
  const startCol = worldToGridCol(x - half, 0);
  const endCol   = worldToGridCol(x + half, 0);
  const startRow = worldToGridRow(y - half, 0);
  const endRow   = worldToGridRow(y + half, 0);
  if (!inBoundsForCurrentLevel(startCol, startRow) || !inBoundsForCurrentLevel(endCol, endRow)) return false;
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const tile = gameplayRoom.level.obstacles?.[row]?.[col];
      // enemies can shoot through BASE tile but can't occupy it, same as walls
      if (isBlockingTile(tile)) return false;
    }
  }
  const cs = gameplayRoom.classicState;
  if (cs) {
    for (const other of cs.enemies.values()) {
      if (other === enemy || other.isDestroyed) continue;
      if (vectorLength(x - other.x, y - other.y) < TANK_COLLISION_SIZE * 0.82) return false;
    }
  }
  for (const player of gameplayRoom.players.values()) {
    if (!player || player.isDestroyed) continue;
    if (vectorLength(x - player.x, y - player.y) < TANK_COLLISION_SIZE * 0.82) return false;
  }
  return true;
}

function tickClassicEnemySpawns(now) {
  const cs = gameplayRoom.classicState;
  if (!cs || cs.spawnedEnemiesCount >= cs.totalEnemies) return;
  const aliveCount = Array.from(cs.enemies.values()).filter((e) => !e.isDestroyed).length;
  if (aliveCount >= cs.maxConcurrent) return;
  if (now - cs.lastSpawnAt < CLASSIC_ENEMY_SPAWN_INTERVAL_MS) return;
  const spawnCenters = getEnemySpawnCenters(gameplayRoom.level);
  const shuffled = [...spawnCenters].sort(() => Math.random() - 0.5);
  for (const spawn of shuffled) {
    const sx = bigCellCenterX(spawn.col, 0);
    const sy = bigCellCenterY(spawn.row, 0);
    const occupied = Array.from(cs.enemies.values()).some(
      (e) => !e.isDestroyed && vectorLength(e.x - sx, e.y - sy) < TANK_COLLISION_SIZE * 1.5,
    );
    // Check spawn tile is clear (no blocking tiles) — pass a sentinel so entity checks are skipped
    const spawnTilesClear = (() => {
      const half = TANK_COLLISION_SIZE / 2;
      for (let row = worldToGridRow(sy - half, 0); row <= worldToGridRow(sy + half, 0); row += 1) {
        for (let col = worldToGridCol(sx - half, 0); col <= worldToGridCol(sx + half, 0); col += 1) {
          if (!inBoundsForCurrentLevel(col, row)) return false;
          if (isBlockingTile(gameplayRoom.level.obstacles?.[row]?.[col])) return false;
        }
      }
      return true;
    })();
    if (!occupied && spawnTilesClear) {
      // spawnedEnemiesCount is 0-based here; we check 1-based spawn number
      const spawnNumber = cs.spawnedEnemiesCount + 1;
      const isPowerCarrier = CLASSIC_POWER_CARRIER_SPAWN_NUMBERS.has(spawnNumber);
      const enemy = createClassicEnemy(spawn.col, spawn.row, isPowerCarrier);
      cs.enemies.set(enemy.id, enemy);
      cs.spawnedEnemiesCount += 1;
      cs.lastSpawnAt = now;
      break;
    }
  }
}

const CARDINALS_RAD = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // E, S, W, N

function tickClassicEnemyAI(enemy, now) {
  if (enemy.isDestroyed) return;
  const bs = enemy.botState;
  const cs = gameplayRoom.classicState;

  // Target: nearest non-destroyed player within notice radius, otherwise the eagle
  let targetX = cs.eagle.x;
  let targetY = cs.eagle.y;
  let nearestDist = Infinity;
  gameplayRoom.players.forEach((player) => {
    if (player.isDestroyed) return;
    const dist = vectorLength(player.x - enemy.x, player.y - enemy.y);
    if (dist < nearestDist && dist < CLASSIC_ENEMY_NOTICE_RADIUS) {
      nearestDist = dist;
      targetX = player.x;
      targetY = player.y;
    }
  });

  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // When actively trying to break a wall, point turret at that wall instead of target
  if (bs.wallFireUntil && now < bs.wallFireUntil && bs.sideStepAngle != null) {
    enemy.turretAngleRad = bs.sideStepAngle;
  } else {
    enemy.turretAngleRad = Math.atan2(dy, dx);
  }

  // ── Stuck detection ───────────────────────────────────────────────────────
  if (bs.lastX == null) { bs.lastX = enemy.x; bs.lastY = enemy.y; bs.lastProgressAt = now; }
  if (now - (bs.lastProgressAt || now) > 350) {
    const moved = vectorLength(enemy.x - bs.lastX, enemy.y - bs.lastY);
    bs.stuckTimer = moved < 5 ? (bs.stuckTimer || 0) + (now - bs.lastProgressAt) : 0;
    bs.lastX = enemy.x; bs.lastY = enemy.y; bs.lastProgressAt = now;
  }

  if ((bs.stuckTimer || 0) > 480) {
    bs.stuckTimer = 0;

    // Sort cardinals by closeness to target direction so the best free path is picked first
    const targetAngle = Math.atan2(dy, dx);
    const sorted = [...CARDINALS_RAD].sort(
      (a, b) => Math.abs(wrapAngleRadSrv(a - targetAngle)) - Math.abs(wrapAngleRadSrv(b - targetAngle)),
    );

    // Find first clear cardinal
    let freeAngle = sorted.find((a) => isClearDirForEnemy(enemy, a)) ?? null;

    if (freeAngle == null) {
      // Completely surrounded — fire at brick wall in the turret direction to break out
      bs.wallFireUntil = now + 1200;
      freeAngle = sorted[Math.floor(Math.random() * sorted.length)];
    }

    bs.sideStepUntil = now + 900;
    bs.sideStepAngle = freeAngle;
  }

  // ── Movement ──────────────────────────────────────────────────────────────
  let moveX, moveY;
  if (bs.sideStepUntil && now < bs.sideStepUntil && bs.sideStepAngle != null) {
    moveX = Math.cos(bs.sideStepAngle);
    moveY = Math.sin(bs.sideStepAngle);
  } else {
    const jitter = 0.22;
    moveX = dx / len + (Math.random() - 0.5) * 2 * jitter;
    moveY = dy / len + (Math.random() - 0.5) * 2 * jitter;
  }
  enemy.input = { moveX, moveY };
}

function moveClassicEnemy(enemy) {
  if (enemy.isDestroyed) return;
  const { maxX: boardW, maxY: boardH } = getActiveBoardBounds();
  const control = computeTankControlStep(
    enemy,
    { moveX: enemy.input?.moveX || 0, moveY: enemy.input?.moveY || 0, aimX: Math.cos(enemy.turretAngleRad), aimY: Math.sin(enemy.turretAngleRad) },
    TICK_MS,
    { preserveTurretWhenIdle: true, fallbackTurretToMove: false },
  );
  if (control.hasMove) {
    const nextX = clamp(enemy.x + control.moveDx, MARGIN, boardW - MARGIN);
    const nextY = clamp(enemy.y + control.moveDy, MARGIN, boardH - MARGIN);
    if (canOccupyEnemyPosition(enemy, nextX, enemy.y)) enemy.x = nextX;
    if (canOccupyEnemyPosition(enemy, enemy.x, nextY)) enemy.y = nextY;
    enemy.moveAngleDeg = control.nextMoveAngleDeg;
  }
  enemy.turretAngleRad = control.nextTurretAngleRad;
}

function pruneEnemyBullets(enemy) {
  enemy.activeBulletIds.forEach((id) => {
    if (!gameplayRoom.bullets.has(id)) enemy.activeBulletIds.delete(id);
  });
}

function tryFireClassicEnemy(enemy, now, frozen = false) {
  if (enemy.isDestroyed || frozen) return;
  const cs = gameplayRoom.classicState;
  if (!cs || cs.gameOver) return;
  pruneEnemyBullets(enemy);
  if (enemy.activeBulletIds.size >= CLASSIC_MAX_ENEMY_BULLETS) return;
  if (now - enemy.lastFireAt < enemy.fireCooldown) return;

  // Wall-breaking fire: when stuck and surrounded, aim at turret direction and fire at brick
  const bs = enemy.botState;
  const wallFireActive = bs.wallFireUntil && now < bs.wallFireUntil;
  if (wallFireActive && hasBrickAheadEnemy(enemy, enemy.turretAngleRad)) {
    // Aim turret at the stuck direction to break the wall
  } else {
    bs.wallFireUntil = 0; // wall shot no longer useful
    // Only fire if there's something in range to shoot at
    let inRange = false;
    gameplayRoom.players.forEach((player) => {
      if (!player.isDestroyed && vectorLength(player.x - enemy.x, player.y - enemy.y) < CLASSIC_ENEMY_FIRE_RANGE) {
        inRange = true;
      }
    });
    if (!inRange && !cs.eagle.isDestroyed && vectorLength(cs.eagle.x - enemy.x, cs.eagle.y - enemy.y) < CLASSIC_ENEMY_FIRE_RANGE) {
      inRange = true;
    }
    if (!inRange) return;
  }
  const bullet = createBulletState({
    id: `eb-${Math.random().toString(36).slice(2, 10)}`,
    ownerType: "enemy",
    ownerId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    angleRad: enemy.turretAngleRad,
    canDestroyStone: false,
  });
  bullet.ownerTeam = "enemy";
  bullet.tint = 0xfff3a8;
  gameplayRoom.bullets.set(bullet.id, bullet);
  enemy.activeBulletIds.add(bullet.id);
  enemy.lastFireAt = now;
}

// Power-ups disponibles en modo clásico (sin missiles — no hay base enemiga en coop)
const CLASSIC_POWER_TYPES = ["shovel", "shield", "tank", "star", "clock"];

function spawnClassicPowerUp(x, y) {
  const type = CLASSIC_POWER_TYPES[Math.floor(Math.random() * CLASSIC_POWER_TYPES.length)];
  const now = Date.now();
  gameplayRoom.powerUps.push({
    id: `pu-classic-${now}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    x,
    y,
    spawnedAt: now,
    expiresAt: now + POWER_DURATION_MS,
  });
}

function resolveClassicBulletCollisions(bulletEntries, bulletsToDestroy) {
  const cs = gameplayRoom.classicState;
  if (!cs) return;
  const enemiesToDestroy = [];

  bulletEntries.forEach(([bulletId, bullet]) => {
    if (!bullet || bulletsToDestroy.has(bulletId)) return;
    const isEnemyBullet = bullet.ownerTeam === "enemy";

    // Player bullet vs classic enemies
    if (!isEnemyBullet) {
      cs.enemies.forEach((enemy) => {
        if (enemy.isDestroyed || bulletsToDestroy.has(bulletId)) return;
        if (vectorLength(bullet.x - enemy.x, bullet.y - enemy.y) <= TANK_HIT_RADIUS + (bullet.hitRadius || 0)) {
          bulletsToDestroy.add(bulletId);
          if (!enemy.isDestroyed) {
            enemy.isDestroyed = true;
            enemy.activeBulletIds.forEach((id) => bulletsToDestroy.add(id));
            enemiesToDestroy.push(enemy.id);
          }
        }
      });
    }

    // Enemy bullet vs eagle
    if (isEnemyBullet && cs.eagle && !cs.eagle.isDestroyed && !bulletsToDestroy.has(bulletId)) {
      if (vectorLength(bullet.x - cs.eagle.x, bullet.y - cs.eagle.y) <= cs.eagle.radius + (bullet.hitRadius || 0)) {
        cs.eagle.hp = Math.max(0, cs.eagle.hp - 1);
        bulletsToDestroy.add(bulletId);
        if (cs.eagle.hp <= 0) {
          cs.eagle.isDestroyed = true;
          triggerClassicGameOver("eagle");
        }
      }
    }
  });

  // Increment count; keep in Map with isDestroyed=true so the next snapshot
  // reaches the client before the visual is removed.  Cleanup happens at the
  // start of the next tickClassicMode call.
  enemiesToDestroy.forEach((id) => {
    cs.destroyedEnemiesCount += 1;
    const dead = cs.enemies.get(id);
    if (dead?.isPowerCarrier) spawnClassicPowerUp(dead.x, dead.y);
  });
}

function checkClassicPlayerGameOver(now) {
  const cs = gameplayRoom.classicState;
  if (!cs || cs.gameOver) return;
  if (gameplayRoom.players.size === 0) return;
  const allPermanentlyDead = Array.from(gameplayRoom.players.values()).every(
    (player) => player.isDestroyed && (player.respawnAt || 0) === 0,
  );
  if (allPermanentlyDead) triggerClassicGameOver("lives");
}

function triggerClassicGameOver(reason) {
  const cs = gameplayRoom.classicState;
  if (!cs || cs.gameOver) return;
  cs.gameOver = true;
  cs.gameOverReason = reason;
  cs.enemies.forEach((enemy) => {
    enemy.activeBulletIds.forEach((id) => destroyBullet(id));
    enemy.activeBulletIds.clear();
  });
}

function advanceClassicLevel() {
  const cs = gameplayRoom.classicState;
  if (!cs) return;
  const nextIdx = cs.levelIndex + 1;
  const levels = CLASSIC_80S_LEVELS;
  const nextRawLevel = levels[nextIdx] || levels[levels.length - 1];
  const nextWave = CLASSIC_80S_WAVE_CONFIGS[nextIdx] || CLASSIC_80S_WAVE_CONFIGS[CLASSIC_80S_WAVE_CONFIGS.length - 1];
  gameplayRoom.level = {
    floor: cloneMatrix(nextRawLevel.floor),
    overlay: cloneMatrix(nextRawLevel.overlay),
    obstacles: cloneMatrix(nextRawLevel.obstacles),
    mapAlgorithm: 0,
  };
  const eagleCol = getLevelBaseAnchorCol(gameplayRoom.level);
  const eagleRow = getLevelBaseAnchorRow(gameplayRoom.level);
  cs.levelIndex = nextIdx;
  cs.enemies.clear();
  cs.spawnedEnemiesCount = 0;
  cs.destroyedEnemiesCount = 0;
  cs.totalEnemies = nextWave.totalEnemies;
  cs.maxConcurrent = nextWave.maxConcurrent;
  cs.lastSpawnAt = 0;
  cs.eagle = { x: bigCellCenterX(eagleCol, 0), y: bigCellCenterY(eagleRow, 0), hp: 1, isDestroyed: false, radius: 30 };
  cs.levelTransitioning = false;
  cs.levelTransitionAt = null;
  gameplayRoom.bullets.clear();
  gameplayRoom.powerUps = [];
  // Respawn all players for new level
  gameplayRoom.players.forEach((player) => {
    const spawnConfig = getPlayerSpawnForRole(player.role);
    player.x = spawnConfig.spawn.x;
    player.y = spawnConfig.spawn.y;
    player.isDestroyed = false;
    player.respawnAt = 0;
    player.hp = 1;
    player.activeBulletIds = new Set();
    activateSpawnShield(player);
  });
}

function tickClassicMode(now) {
  const cs = gameplayRoom.classicState;
  if (!cs || cs.gameOver) return;

  // Remove enemies that were already sent to clients with isDestroyed=true last tick
  cs.enemies.forEach((enemy, id) => {
    if (enemy.isDestroyed) cs.enemies.delete(id);
  });

  if (cs.levelTransitioning) {
    if (now - cs.levelTransitionAt >= CLASSIC_LEVEL_TRANSITION_MS) advanceClassicLevel();
    return;
  }
  // ── Shovel (fortress) timer ───────────────────────────────────────────
  if (cs.shovelUntil > 0) {
    const remaining = cs.shovelUntil - now;
    if (remaining <= 0) {
      applyBaseFortressToFineLevel(gameplayRoom.level, TILE.BRICK);
      cs.shovelUntil = 0;
    } else if (remaining < POWER_FLICKER_AT_MS) {
      const flickerOn = Math.floor(remaining / POWER_FLICKER_STEP_MS) % 2 === 0;
      if (flickerOn !== cs.shovelFlickerState) {
        applyBaseFortressToFineLevel(gameplayRoom.level, flickerOn ? TILE.STEEL : TILE.BRICK);
        cs.shovelFlickerState = flickerOn;
      }
    }
  }

  tickClassicEnemySpawns(now);
  const frozen = cs.enemiesFrozenUntil > now;
  cs.enemies.forEach((enemy) => tickClassicEnemyAI(enemy, now));
  cs.enemies.forEach((enemy) => {
    if (!frozen) moveClassicEnemy(enemy);
    tryFireClassicEnemy(enemy, now, frozen);
  });
  const aliveEnemies = Array.from(cs.enemies.values()).filter((e) => !e.isDestroyed).length;
  if (cs.spawnedEnemiesCount >= cs.totalEnemies && aliveEnemies === 0) {
    cs.levelTransitioning = true;
    cs.levelTransitionAt = now;
  }
  checkClassicPlayerGameOver(now);
}

// ─────────────────────────────────────────────────────────────────────────────

function createFreshBases(matchConfigOrBaseHp = BASE_HP_PER_ROUND) {
  if (typeof matchConfigOrBaseHp === "object" && isClassicMatchMode(matchConfigOrBaseHp)) {
    return new Map();
  }
  const baseHpPerRound = typeof matchConfigOrBaseHp === "object"
    ? Number(matchConfigOrBaseHp?.baseHpPerRound || BASE_HP_PER_ROUND)
    : Number(matchConfigOrBaseHp || BASE_HP_PER_ROUND);
  return new Map([
    ["south", { ...getOnlineBaseWorld("south"), hp: baseHpPerRound, maxHp: baseHpPerRound }],
    ["north", { ...getOnlineBaseWorld("north"), hp: baseHpPerRound, maxHp: baseHpPerRound }],
  ]);
}

function getColorTeam(roleId) {
  if (roleId === "classic-p1" || roleId === "classic-p2") return "team1";
  return roleId === "yellow" || roleId === "green" ? "team1" : "team2";
}

function getClassicSpawnWorld(slot = 1) {
  const level = gameplayRoom.level || createClassicOnlineLevel();
  const spawnCol = getLevelPlayerSpawnCol(level, slot);
  const spawnRow = getLevelBaseAnchorRow(level);
  return {
    x: bigCellCenterX(spawnCol, 0),
    y: bigCellCenterY(spawnRow, 0),
  };
}

function getPlayerSpawnForRole(role, matchConfig = gameplayRoom.matchConfig, sideSwitched = gameplayRoom.roundState.sideSwitched) {
  if (isClassicMatchMode(matchConfig)) {
    const slot = role?.slot || (role?.id === "classic-p2" ? 2 : 1);
    return {
      team: "south",
      spawn: getClassicSpawnWorld(slot),
      moveAngleDeg: -90,
      turretAngleRad: -Math.PI / 2,
    };
  }

  const team = getEffectiveTeam(role.id, sideSwitched);
  const spawn = getEffectiveSpawnWorld(role.id, sideSwitched);
  return {
    team,
    spawn,
    moveAngleDeg: team === "south" ? 0 : 180,
    turretAngleRad: team === "south" ? 0 : Math.PI,
  };
}

function colorTeamForGeographicWinner(geographicTeam, sideSwitched) {
  if (!sideSwitched) return geographicTeam === "south" ? "team1" : "team2";
  return geographicTeam === "south" ? "team2" : "team1";
}

function createRoundState(matchConfig = createDefaultMatchConfig()) {
  return {
    currentRound: 1,
    totalRounds: matchConfig.totalRounds,
    scores: { team1: 0, team2: 0 },
    sideSwitched: false,
    transitioning: false,
    transitionAt: null,
    transitionDurationMs: ROUND_TRANSITION_MS,
    showPartialSummary: false,
    matchOver: false,
    matchWinner: null,
  };
}

const wss = new WebSocketServer({ host: HOST, port: PORT });
const clients = new Map();
const ALL_POWER_TYPES_ONLINE = ["shovel", "shield", "tank", "star", "clock", "missiles"];

const legacyGameplayRoom = {
  players: new Map(),
  bullets: new Map(),
  playerStats: new Map(),
  powerUps: [],                  // power-ups activos en el mapa
  activeMissileStrikes: [],
  missileImpactEffects: [],
  chatMessages: [],
  baseFortressEffects: new Map(),
  teamFreezeEffects: new Map(),
  totalKillsLifetime: 0,         // bajas acumuladas en toda la partida
  powerUpKillMilestone: 3,       // próxima baja-meta para soltar poder
  status: { winnerTeam: null },
  matchConfig: createDefaultMatchConfig(),
  level: createLevelForMatch(createDefaultMatchConfig()),
  bases: createFreshBases(createDefaultMatchConfig()),
  roundState: createRoundState(createDefaultMatchConfig()),
  classicState: null,
};
const lobbyRooms = new Map();
const gameplayRooms = new Map();
const roomCreateRequests = new Map();
let activeGameplayRoom = null;

function createGameplayRoom(roomId, matchConfig = null) {
  const nextMatchConfig = {
    ...createDefaultMatchConfig(),
    ...(matchConfig || {}),
  };
  const level = createLevelForMatch(nextMatchConfig);
  return {
    roomId,
    players: new Map(),
    bullets: new Map(),
    playerStats: new Map(),
    powerUps: [],
    activeMissileStrikes: [],
    missileImpactEffects: [],
    chatMessages: [],
    baseFortressEffects: new Map(),
    teamFreezeEffects: new Map(),
    totalKillsLifetime: 0,
    powerUpKillMilestone: 3,
    status: { winnerTeam: null },
    matchConfig: nextMatchConfig,
    level,
    bases: createFreshBases(nextMatchConfig),
    roundState: createRoundState(nextMatchConfig),
    classicState: isClassicMatchMode(nextMatchConfig) ? createClassicStateForLevel(level, 0) : null,
    pendingMatchSlots: [],
  };
}

function getActiveGameplayRoom() {
  if (!activeGameplayRoom) {
    throw new Error("Gameplay room context not set");
  }
  return activeGameplayRoom;
}

const gameplayRoom = new Proxy({}, {
  get(_target, prop) {
    return getActiveGameplayRoom()[prop];
  },
  set(_target, prop, value) {
    getActiveGameplayRoom()[prop] = value;
    return true;
  },
});

function runInGameplayRoom(room, fn) {
  if (!room) return null;
  const previous = activeGameplayRoom;
  activeGameplayRoom = room;
  try {
    return fn();
  } finally {
    activeGameplayRoom = previous;
  }
}

function getGameplayRoomById(roomId) {
  if (!roomId) return null;
  return gameplayRooms.get(roomId) || null;
}

function getGameplayRoomForClient(clientId) {
  const roomId = getClient(clientId)?.currentMatchRoomId;
  return getGameplayRoomById(roomId);
}

function ensureGameplayRoom(roomId, matchConfig = null) {
  let room = getGameplayRoomById(roomId);
  if (!room) {
    room = createGameplayRoom(roomId, matchConfig);
    gameplayRooms.set(roomId, room);
  }
  return room;
}

function resetGameplayRoomState(matchConfig = null) {
  const nextMatchConfig = {
    ...createDefaultMatchConfig(),
    ...(matchConfig || gameplayRoom.matchConfig || {}),
  };
  gameplayRoom.players.clear();
  gameplayRoom.bullets.clear();
  gameplayRoom.playerStats.clear();
  gameplayRoom.powerUps = [];
  gameplayRoom.activeMissileStrikes = [];
  gameplayRoom.missileImpactEffects = [];
  gameplayRoom.chatMessages = [];
  gameplayRoom.baseFortressEffects.clear();
  gameplayRoom.teamFreezeEffects.clear();
  gameplayRoom.totalKillsLifetime = 0;
  gameplayRoom.powerUpKillMilestone = 3;
  gameplayRoom.status = { winnerTeam: null };
  gameplayRoom.matchConfig = nextMatchConfig;
  gameplayRoom.level = createLevelForMatch(nextMatchConfig);
  gameplayRoom.bases = createFreshBases(nextMatchConfig);
  gameplayRoom.roundState = createRoundState(nextMatchConfig);
  gameplayRoom.classicState = isClassicMatchMode(nextMatchConfig) ? createClassicStateForLevel(gameplayRoom.level, 0) : null;
}

function cleanupGameplayIfEmpty() {
  const hasHumanPlayers = Array.from(gameplayRoom.players.values()).some((player) => !player?.isBot);
  if (hasHumanPlayers) return false;
  const roomId = gameplayRoom.roomId;
  gameplayRooms.delete(roomId);
  if (lobbyRooms.has(roomId)) {
    deleteLobbyRoom(roomId);
  }
  return true;
}

// token -> clientId (current live connection)
const tokenToClientId = new Map();
// token -> setTimeout handle for lobby grace period
const lobbyReconnectTimers = new Map();
const LOBBY_GRACE_MS = 30000;

const TEAM_TO_ROLE_IDS = { "1": ["yellow", "green"], "2": ["red", "blue"] };

function getLobbyModeConfig(mode) {
  if (String(mode || "").trim() === DEFAULT_LOBBY_MODE) {
    return { slotCount: 2 };
  }
  return { slotCount: 4 };
}

function isClassicLobbyMode(mode) {
  return getLobbyModeConfig(mode).slotCount === 2;
}

function isClassicMatchMode(matchConfig = null) {
  return isClassicLobbyMode(matchConfig?.mode);
}

function createClassicOnlineLevel() {
  const level = CLASSIC_80S_LEVELS[0];
  return {
    floor: cloneMatrix(level.floor),
    overlay: cloneMatrix(level.overlay),
    obstacles: cloneMatrix(level.obstacles),
    mapAlgorithm: 0,
  };
}

function createLevelForMatch(matchConfig = null) {
  return isClassicMatchMode(matchConfig)
    ? createClassicOnlineLevel()
    : createOnline2v2Level(matchConfig);
}

function normalizeLobbySlotsForMode(slots = [], mode = DEFAULT_LOBBY_MODE) {
  const modeConfig = getLobbyModeConfig(mode);
  return normalizeLobbyAiSlots(slots.map((slot, index) => {
    const baseRole = slot?.baseRole || slot?.role || `Slot ${index + 1}`;
    if (index >= modeConfig.slotCount) {
      return {
        ...slot,
        label: baseRole,
        role: baseRole,
        baseRole,
        kind: "Cerrado",
        team: "-",
        isReady: false,
        clientId: null,
      };
    }

    return {
      ...slot,
      label: slot?.label || baseRole,
      role: slot?.role || baseRole,
      baseRole,
      kind: slot?.isHost ? "Jugador" : ((slot?.kind || "Abierto") === "Cerrado" ? "Abierto" : (slot?.kind || "Abierto")),
      team: isClassicLobbyMode(mode) ? "1" : (slot?.team || "-"),
    };
  }));
}

function normalizeCustomColor(value) {
  const normalized = String(value || "").trim();
  if (normalized === RANDOM_PLAYER_COLOR) return RANDOM_PLAYER_COLOR;
  const hexValue = /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "#f4c430";
  return ALLOWED_PLAYER_COLORS.has(hexValue) ? hexValue : "#f4c430";
}

function pickRandomAvailableColor(usedColors = new Set()) {
  const normalizedUsed = new Set(
    Array.from(usedColors || [])
      .map((color) => String(color || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const availableColors = RANDOM_COLOR_POOL.filter((color) => !normalizedUsed.has(color));
  const pool = availableColors.length ? availableColors : RANDOM_COLOR_POOL;
  const usedPaletteColors = RANDOM_COLOR_POOL.filter((color) => normalizedUsed.has(color));
  if (!usedPaletteColors.length) {
    return pool[Math.floor(Math.random() * pool.length)] || "#f4c430";
  }

  let bestScore = -1;
  let bestColors = [];
  pool.forEach((candidate) => {
    const minDistance = usedPaletteColors.reduce((min, usedColor) => (
      Math.min(min, getPaletteColorDistance(candidate, usedColor))
    ), Number.POSITIVE_INFINITY);
    if (minDistance > bestScore + 0.0001) {
      bestScore = minDistance;
      bestColors = [candidate];
      return;
    }
    if (Math.abs(minDistance - bestScore) <= 0.0001) {
      bestColors.push(candidate);
    }
  });

  const bestPool = bestColors.length ? bestColors : pool;
  return bestPool[Math.floor(Math.random() * bestPool.length)] || "#f4c430";
}

function resolveVisualColor(value, usedColors = new Set()) {
  if (value === RANDOM_PLAYER_COLOR) {
    return pickRandomAvailableColor(usedColors);
  }
  return normalizeCustomColor(value);
}

function hexColorToNumber(value, fallback = 0xd8b13a) {
  const normalized = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }
  return fallback;
}

function mixColorChannel(from, to, amount) {
  return Math.round(from + ((to - from) * amount));
}

function brightenColor(color, amount = 0.35) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const nextR = mixColorChannel(r, 0xff, amount);
  const nextG = mixColorChannel(g, 0xff, amount);
  const nextB = mixColorChannel(b, 0xff, amount);
  return (nextR << 16) | (nextG << 8) | nextB;
}

function colorToRgb(color) {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

function rgbToColor(r, g, b) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = ((bn - rn) / delta) + 2;
    else h = ((rn - gn) / delta) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function getPaletteColorDistance(colorA, colorB) {
  const rgbA = colorToRgb(hexColorToNumber(colorA));
  const rgbB = colorToRgb(hexColorToNumber(colorB));
  const hsvA = rgbToHsv(rgbA.r, rgbA.g, rgbA.b);
  const hsvB = rgbToHsv(rgbB.r, rgbB.g, rgbB.b);
  const hueDiffRaw = Math.abs(hsvA.h - hsvB.h);
  const hueDiff = Math.min(hueDiffRaw, 360 - hueDiffRaw) / 180;
  const satDiff = Math.abs(hsvA.s - hsvB.s);
  const valDiff = Math.abs(hsvA.v - hsvB.v);
  const rgbDistance = Math.sqrt(
    ((rgbA.r - rgbB.r) ** 2) +
    ((rgbA.g - rgbB.g) ** 2) +
    ((rgbA.b - rgbB.b) ** 2),
  ) / 441.67295593;
  return (rgbDistance * 0.55) + (hueDiff * 0.25) + (satDiff * 0.12) + (valDiff * 0.08);
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (hh >= 0 && hh < 1) [rn, gn, bn] = [c, x, 0];
  else if (hh < 2) [rn, gn, bn] = [x, c, 0];
  else if (hh < 3) [rn, gn, bn] = [0, c, x];
  else if (hh < 4) [rn, gn, bn] = [0, x, c];
  else if (hh < 5) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  const m = v - c;
  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function toProjectileColor(color) {
  const { r, g, b } = colorToRgb(color);
  const { h, s, v } = rgbToHsv(r, g, b);

  if (v < 0.18) return 0x050505;
  if (v < 0.32 && s < 0.28) return 0x101010;
  if (s < 0.12 && v > 0.82) return 0xdedede;
  if (s < 0.22) {
    const gray = Math.max(0x1a, Math.min(0xd8, Math.round(v * 255)));
    return rgbToColor(gray, gray, gray);
  }
  if (h >= 18 && h < 42 && v < 0.72) {
    if (v < 0.4) return 0x5a3418;
    if (v < 0.58) return 0x7a451c;
    return 0x99602b;
  }

  if (h < 15 || h >= 345) return 0xff3b30;
  if (h < 35) return 0xff7a00;
  if (h < 58) return 0xffd400;
  if (h < 85) return 0xb7ff00;
  if (h < 155) return 0x00ff66;
  if (h < 190) return 0x00ffd5;
  if (h < 225) return 0x00c8ff;
  if (h < 255) return 0x3d5afe;
  if (h < 290) return 0x8b2cff;
  if (h < 325) return 0xff00c8;
  return 0xff2d6f;
}

function assignRoleFromSlot(slot, takenRoleIds) {
  if (isClassicLobbyMode(slot?.mode)) {
    const availableClassicRoles = CLASSIC_ROLE_ORDER.filter((role) => !takenRoleIds.has(role.id));
    return availableClassicRoles[0] || null;
  }

  const available = ROLE_ORDER.filter((r) => !takenRoleIds.has(r.id));
  if (!available.length) return null;

  const teamFilter = slot?.team && slot.team !== "-" ? (TEAM_TO_ROLE_IDS[slot.team] || null) : null;

  // Try any available role matching team
  const pool = teamFilter ? available.filter((r) => teamFilter.includes(r.id)) : available;
  if (!pool.length) return available[0]; // fallback if team is full
  return pool[Math.floor(Math.random() * pool.length)];
}

function countLobbyPlayersByTeam(room, excludeClientId = null, excludeSlotId = null) {
  return (room?.slots || []).reduce((counts, slot) => {
    if (!slot || slot.kind === "Cerrado") return counts;
    if (excludeClientId && slot.clientId === excludeClientId) return counts;
    if (excludeSlotId && slot.id === excludeSlotId) return counts;
    if (slot.team === "1") counts.team1 += 1;
    if (slot.team === "2") counts.team2 += 1;
    return counts;
  }, { team1: 0, team2: 0 });
}

function normalizeLobbyTeamValue(room, requestedTeam, options = {}) {
  const team = String(requestedTeam || "").trim();
  if (team !== "1" && team !== "2") return "-";
  const counts = countLobbyPlayersByTeam(room, options.excludeClientId, options.excludeSlotId);
  if (team === "1" && counts.team1 >= 2) return "-";
  if (team === "2" && counts.team2 >= 2) return "-";
  return team;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function vectorLength(x, y) {
  return Math.sqrt(x * x + y * y);
}

function normalizeVector(x, y) {
  const length = vectorLength(x, y) || 1;
  return { x: x / length, y: y / length, length };
}

function rotateVector(x, y, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: (x * cos) - (y * sin),
    y: (x * sin) + (y * cos),
  };
}

function getObstacleAhead(player, dir, distance = TILE_SIZE * 1.1) {
  const probeX = player.x + (dir.x * distance);
  const probeY = player.y + (dir.y * distance);
  const col = worldToGridCol(probeX, 0);
  const row = worldToGridRow(probeY, 0);
  if (!inBounds(col, row)) return { tile: "out", col, row };
  return {
    tile: gameplayRoom.level.obstacles?.[row]?.[col] || null,
    col,
    row,
  };
}

function shouldBotFireAtObstacle(player, dir, distance = TILE_SIZE * 1.1) {
  const obstacle = getObstacleAhead(player, dir, distance);
  if (!obstacle?.tile) return false;
  if (obstacle.tile === TILE.BRICK) return true;
  if (obstacle.tile === TILE.STEEL && player?.canDestroyStone) return true;
  return false;
}

function chooseNavigableDirection(player, targetX, targetY, probeDist, currentDir = null, options = {}) {
  const { canDestroyStone = false } = options;
  const toTarget = normalizeVector(targetX - player.x, targetY - player.y);
  const base = { x: toTarget.x, y: toTarget.y };
  const current = currentDir && (Math.abs(currentDir.x) > 0.001 || Math.abs(currentDir.y) > 0.001)
    ? normalizeVector(currentDir.x, currentDir.y)
    : null;
  const candidateAngles = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, Math.PI];
  let best = null;
  let bestScore = -Infinity;

  candidateAngles.forEach((angle) => {
    const turned = angle === 0 ? base : rotateVector(base.x, base.y, angle);
    const dir = normalizeVector(turned.x, turned.y);
    const obstacleAhead = getObstacleAhead(player, dir, probeDist);
    const step1X = player.x + (dir.x * probeDist);
    const step1Y = player.y + (dir.y * probeDist);
    if (!canOccupyPlayerPosition(player, step1X, step1Y)) {
      if (!(obstacleAhead.tile === TILE.BRICK || (obstacleAhead.tile === TILE.STEEL && canDestroyStone))) {
        return;
      }
    }

    const step2X = player.x + (dir.x * probeDist * 1.85);
    const step2Y = player.y + (dir.y * probeDist * 1.85);
    const secondStepOpen = canOccupyPlayerPosition(player, step2X, step2Y);
    const remainingDx = targetX - step1X;
    const remainingDy = targetY - step1Y;
    const alignment = ((dir.x * base.x) + (dir.y * base.y));
    const progress = -vectorLength(remainingDx, remainingDy);
    const continuity = current ? ((dir.x * current.x) + (dir.y * current.y)) : 0;
    const isBreakableAhead = obstacleAhead.tile === TILE.BRICK || (obstacleAhead.tile === TILE.STEEL && canDestroyStone);
    const steelPenalty = obstacleAhead.tile === TILE.STEEL && !canDestroyStone ? 140 : 0;
    const brickBias = obstacleAhead.tile === TILE.BRICK ? 18 : 0;
    const breakSteelBias = obstacleAhead.tile === TILE.STEEL && canDestroyStone ? 14 : 0;
    const score = progress + (alignment * 60) + (continuity * 12) + (secondStepOpen ? 16 : 0) + brickBias + breakSteelBias - steelPenalty - (isBreakableAhead && !secondStepOpen ? 8 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = { x: dir.x, y: dir.y };
    }
  });

  return best || { x: base.x, y: base.y };
}

function getRandomValidPowerUpPosition() {
  const level = gameplayRoom.level;
  if (!level?.obstacles) return null;
  const height = level.obstacles.length;
  const width  = level.obstacles[0]?.length ?? 0;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const col = Math.floor(Math.random() * width);
    const row = Math.floor(Math.random() * (height - 3)); // evitar últimas filas
    const obstacle = level.obstacles[row]?.[col];
    if (obstacle !== null && obstacle !== undefined) continue;
    // Convertir a coordenadas mundo (boardOriginX = 0 en servidor)
    const x = OUTER_BORDER_SIZE + col * TILE_SIZE + TILE_SIZE / 2;
    const y = OUTER_BORDER_SIZE + row * TILE_SIZE + TILE_SIZE / 2;
    return { col, row, x, y };
  }
  return null;
}

function spawnOnlinePowerUp() {
  const pos = getRandomValidPowerUpPosition();
  if (!pos) return;
  const type = ALL_POWER_TYPES_ONLINE[Math.floor(Math.random() * ALL_POWER_TYPES_ONLINE.length)];
  const spawnedAt = Date.now();
  gameplayRoom.powerUps.push({
    id:   `pu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    x: pos.x,
    y: pos.y,
    spawnedAt,
    expiresAt: spawnedAt + POWER_DURATION_MS,
  });
}

function spawnMissilesPowerUpForPlayer(player, now = Date.now()) {
  if (!player || !gameplayRoom.level?.obstacles) return false;
  const forwardDir = player.team === "south" ? 1 : -1;
  const candidateOffsets = [
    { x: TILE_SIZE * 1.35 * forwardDir, y: 0 },
    { x: TILE_SIZE * 1.7 * forwardDir, y: 0 },
    { x: TILE_SIZE * 1.15 * forwardDir, y: TILE_SIZE * 0.45 },
    { x: TILE_SIZE * 1.15 * forwardDir, y: -TILE_SIZE * 0.45 },
  ];

  for (const offset of candidateOffsets) {
    const x = player.spawnX + offset.x;
    const y = player.spawnY + offset.y;
    const col = worldToGridCol(x, 0);
    const row = worldToGridRow(y, 0);
    if (!inBounds(col, row)) continue;
    if (gameplayRoom.level.obstacles?.[row]?.[col]) continue;
    const overlapsOtherPowerUp = gameplayRoom.powerUps.some((powerUp) => vectorLength(powerUp.x - x, powerUp.y - y) < TILE_SIZE * 0.7);
    if (overlapsOtherPowerUp) continue;

    gameplayRoom.powerUps.push({
      id: `pu-missiles-${player.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type: "missiles",
      x,
      y,
      spawnedAt: now,
      expiresAt: now + POWER_DURATION_MS,
    });
    return true;
  }

  return false;
}

function registerOnlineKill() {
  gameplayRoom.totalKillsLifetime += 1;
  if (gameplayRoom.totalKillsLifetime < gameplayRoom.powerUpKillMilestone) return;
  gameplayRoom.powerUpKillMilestone = gameplayRoom.totalKillsLifetime + 3;
  spawnOnlinePowerUp();
}

function getPowerUpInterestScore(player, powerUp) {
  if (!player || !powerUp) return -Infinity;

  const dist = vectorLength(powerUp.x - player.x, powerUp.y - player.y);
  const friendlyBase = gameplayRoom.bases.get(player.team) || null;
  const friendlyBaseAlive = !!friendlyBase && friendlyBase.hp > 0;
  let radius = TILE_SIZE * 9;
  let weight = 1;

  switch (powerUp.type) {
    case "shovel":
      radius = TILE_SIZE * 16;
      weight = friendlyBaseAlive ? 2.4 : 1.1;
      if (friendlyBaseAlive && friendlyBase.hp <= 1) weight += 0.8;
      break;
    case "shield":
      radius = TILE_SIZE * 11;
      weight = 1.8;
      break;
    case "star":
      radius = TILE_SIZE * 10;
      weight = 1.6;
      break;
    case "tank":
      radius = TILE_SIZE * 10;
      weight = 1.5;
      break;
    case "clock":
      radius = TILE_SIZE * 9;
      weight = 1.35;
      break;
    case "missiles":
      radius = TILE_SIZE * 9;
      weight = 1.3;
      break;
    default:
      radius = TILE_SIZE * 8;
      weight = 1;
      break;
  }

  if (dist > radius) return -Infinity;
  return weight - (dist / radius);
}

function chooseBotPowerUpTarget(player) {
  let bestPowerUp = null;
  let bestScore = -Infinity;

  gameplayRoom.powerUps.forEach((powerUp) => {
    const score = getPowerUpInterestScore(player, powerUp);
    if (score > bestScore) {
      bestScore = score;
      bestPowerUp = powerUp;
    }
  });

  return { powerUp: bestPowerUp, score: bestScore };
}

function setOnlineBaseFortress(baseId, tileType = TILE.BRICK) {
  const def = ONLINE_BASE_DEFS?.[baseId];
  const level = gameplayRoom.level;
  if (!def || !level?.obstacles) return;

  const startCol = def.side === "west" ? def.anchorCol : def.anchorCol - 2;
  const startRow = def.anchorRow - 2;

  for (let row = startRow; row < startRow + 6; row += 1) {
    for (let col = startCol; col < startCol + 4; col += 1) {
      if (!inBounds(col, row)) continue;
      const isBaseTile = col >= def.anchorCol && col <= def.anchorCol + 1 && row >= def.anchorRow && row <= def.anchorRow + 1;
      level.obstacles[row][col] = isBaseTile ? TILE.BASE : tileType;
    }
  }
}

function applyOnlineShovelEffect(player) {
  if (isClassicMatchMode(gameplayRoom.matchConfig) && gameplayRoom.classicState) {
    const cs = gameplayRoom.classicState;
    applyBaseFortressToFineLevel(gameplayRoom.level, TILE.STEEL);
    cs.shovelUntil = Date.now() + POWER_DURATION_MS;
    cs.shovelFlickerState = true;
    return;
  }
  const baseId = player?.team;
  if (!baseId || !ONLINE_BASE_DEFS?.[baseId]) return;

  setOnlineBaseFortress(baseId, TILE.STEEL);
  gameplayRoom.baseFortressEffects.set(baseId, {
    timeRemaining: POWER_DURATION_MS,
    flickerState: true,
    flickerElapsed: 0,
  });
}

function hasActiveShield(player, now = Date.now()) {
  return !!player && Number(player.shieldUntil || 0) > now;
}

function activateSpawnShield(player, durationMs = SPAWN_SHIELD_DURATION_MS, now = Date.now(), flickerOnExpire = false) {
  if (!player) return;
  player.shieldUntil = now + durationMs;
  player.shieldFlickerOnExpire = !!flickerOnExpire;
}

function createMissileStrike(owner, target, now = Date.now()) {
  if (!owner || !target) return null;
  const dist = vectorLength(target.x - owner.x, target.y - owner.y);
  const durationMs = clamp(Math.round((dist / MISSILE_STRIKE_SPEED) * 1000), MISSILE_STRIKE_MIN_MS, MISSILE_STRIKE_MAX_MS);
  const angleRad = Math.atan2(target.y - owner.y, target.x - owner.x);
  return {
    id: `ms-${now}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId: owner.id,
    targetId: target.id,
    startedAt: now,
    hitAt: now + durationMs,
    durationMs,
    x: owner.x,
    y: owner.y,
    angleRad,
  };
}

function resolveMissileStrike(strike, now = Date.now()) {
  if (!strike) return false;
  const owner = gameplayRoom.players.get(strike.ownerId) || null;
  const target = gameplayRoom.players.get(strike.targetId) || null;
  if (!target || target.isDestroyed) return false;
  if (hasActiveShield(target, now)) return false;

  const ownerStats = ensurePlayerStats(owner, { label: owner?.label });
  const victimStats = ensurePlayerStats(target, { label: target.label });
  const isEnemyKill = !!owner && owner.team !== target.team;
  if (isEnemyKill) awardEnemyKillStats(ownerStats);
  else awardTeamKillStats(ownerStats);
  if (victimStats) victimStats.deaths += 1;
  if (isEnemyKill) registerOnlineKill();
  markPlayerDestroyed(target, now);
  return true;
}

function registerMissileImpactEffect(strike, x, y, now = Date.now()) {
  if (!strike) return;
  gameplayRoom.missileImpactEffects.push({
    id: `ms-impact-${strike.id}-${now}`,
    strikeId: strike.id,
    ownerId: strike.ownerId,
    targetId: strike.targetId,
    x: Number(x || 0),
    y: Number(y || 0),
    createdAt: now,
    expiresAt: now + MISSILE_IMPACT_EFFECT_MS,
  });
}

function applyOnlineMissilesEffect(player) {
  if (!player) return;
  const now = Date.now();

  for (const enemy of gameplayRoom.players.values()) {
    if (!enemy || enemy.id === player.id || enemy.team === player.team || enemy.isDestroyed) continue;
    const strike = createMissileStrike(player, enemy, now);
    if (strike) gameplayRoom.activeMissileStrikes.push(strike);
  }
}

function applyOnlineTankEffect(player) {
  if (!player) return;
  player.extraLives = Math.max(0, Number(player.extraLives || 0)) + 1;
}

function markPlayerDestroyed(player, now = Date.now()) {
  if (!player) return;
  player.input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
  player.activeBulletIds?.forEach((bulletId) => destroyBullet(bulletId));
  player.activeBulletIds = new Set();
  resetPlayerUpgradeState(player);
  player.isDestroyed = true;
  player.shieldUntil = 0;
  player.shieldFlickerOnExpire = false;
  if ((player.extraLives || 0) > 0) {
    player.extraLives -= 1;
    player.respawnAt = now + RESPAWN_DELAY_MS;
  } else {
    player.respawnAt = 0;
  }
}

function applyOnlineStarEffect(player) {
  if (!player) return;
  const tier = getUpgradeTier((player.starCount || 0) + 1);
  player.starCount = tier.starLevel;
  player.bulletCount = tier.bulletCount;
  player.bulletSpeed = tier.bulletSpeed;
  player.fireCooldown = tier.fireCooldown;
  player.canDestroyStone = tier.canDestroyStone;
}

function applyOnlineShieldEffect(player, now = Date.now()) {
  if (!player) return;
  activateSpawnShield(player, POWER_DURATION_MS, now, true);
}

function applyOnlineClockEffect(player) {
  if (!player) return;
  const now = Date.now();
  if (isClassicMatchMode(gameplayRoom.matchConfig) && gameplayRoom.classicState) {
    gameplayRoom.classicState.enemiesFrozenUntil = now + POWER_DURATION_MS;
    return;
  }
  const frozenTeam = player.team === "south" ? "north" : "south";
  gameplayRoom.teamFreezeEffects.set(frozenTeam, {
    startedAt: now,
    timeRemaining: POWER_DURATION_MS,
  });
}

function consumeOnlinePowerUp(player, powerUp) {
  if (!player || !powerUp) return false;

  const puIndex = gameplayRoom.powerUps.findIndex((pu) => pu.id === powerUp.id);
  if (puIndex === -1) return false;

  gameplayRoom.powerUps.splice(puIndex, 1);

  if (powerUp?.type === "shovel") {
    applyOnlineShovelEffect(player);
  } else if (powerUp?.type === "shield") {
    applyOnlineShieldEffect(player);
  } else if (powerUp?.type === "tank") {
    applyOnlineTankEffect(player);
  } else if (powerUp?.type === "star") {
    applyOnlineStarEffect(player);
  } else if (powerUp?.type === "clock") {
    applyOnlineClockEffect(player);
  } else if (powerUp?.type === "missiles") {
    applyOnlineMissilesEffect(player);
  }

  return true;
}

function tryPickupNearbyPowerUp(player) {
  if (!player || player.isDestroyed) return false;

  const powerUp = gameplayRoom.powerUps.find((pu) => (
    vectorLength(player.x - pu.x, player.y - pu.y) <= POWER_UP_PICKUP_RADIUS
  )) || null;

  if (!powerUp) return false;
  return consumeOnlinePowerUp(player, powerUp);
}

function isPlayerFrozen(player, now = Date.now()) {
  if (!player) return false;
  if (Number(player.freezeExemptUntil || 0) > now) return false;
  return !!gameplayRoom.teamFreezeEffects.get(player.team);
}

function updateTeamFreezeEffects(delta) {
  if (!gameplayRoom.teamFreezeEffects.size) return;

  Array.from(gameplayRoom.teamFreezeEffects.entries()).forEach(([teamId, effect]) => {
    effect.timeRemaining -= delta;
    if (effect.timeRemaining <= 0) {
      gameplayRoom.teamFreezeEffects.delete(teamId);
    }
  });
}

function updateBaseFortressEffects(delta) {
  if (!gameplayRoom.baseFortressEffects.size) return;

  Array.from(gameplayRoom.baseFortressEffects.entries()).forEach(([baseId, effect]) => {
    effect.timeRemaining -= delta;

    if (effect.timeRemaining <= 0) {
      setOnlineBaseFortress(baseId, TILE.BRICK);
      gameplayRoom.baseFortressEffects.delete(baseId);
      return;
    }

    if (effect.timeRemaining <= POWER_FLICKER_AT_MS) {
      effect.flickerElapsed += delta;
      if (effect.flickerElapsed >= POWER_FLICKER_STEP_MS) {
        effect.flickerElapsed = 0;
        effect.flickerState = !effect.flickerState;
        setOnlineBaseFortress(baseId, effect.flickerState ? TILE.STEEL : TILE.BRICK);
      }
      return;
    }

    if (!effect.flickerState) {
      effect.flickerState = true;
      effect.flickerElapsed = 0;
      setOnlineBaseFortress(baseId, TILE.STEEL);
    }
  });
}

function updateOnlinePowerUps(now) {
  if (!Array.isArray(gameplayRoom.powerUps) || !gameplayRoom.powerUps.length) return;
  gameplayRoom.powerUps = gameplayRoom.powerUps.filter((powerUp) => Number(powerUp?.expiresAt || 0) > now);
}

function getClient(clientId) {
  return clients.get(clientId) || null;
}

function lobbyRoomHasConnectedHuman(room) {
  if (!room) return false;
  return room.slots.some((slot) => !!slot?.clientId && !!getClient(slot.clientId));
}

function countHostedRoomsForIp(ipAddress) {
  if (!ipAddress) return 0;
  return Array.from(lobbyRooms.values()).filter((room) => {
    const hostClient = getClient(room.hostClientId);
    return !!hostClient && hostClient.ipAddress === ipAddress && lobbyRoomHasConnectedHuman(room);
  }).length;
}

function createPlayerStats(player, { label } = {}) {
  return {
    playerId: player.id,
    label: label || player.role?.label || player.id,
    roleLabel: player.role?.label || player.id,
    colorTeam: player.colorTeam,
    points: 0,
    basesDestroyed: 0,
    kills: 0,
    teamKills: 0,
    deaths: 0,
    shots: 0,
    hits: 0,
  };
}

function ensurePlayerStats(player, options = {}) {
  if (!player?.id) return null;
  if (!gameplayRoom.playerStats.has(player.id)) {
    gameplayRoom.playerStats.set(player.id, createPlayerStats(player, options));
  }
  const stats = gameplayRoom.playerStats.get(player.id);
  if (options.label) stats.label = options.label;
  if (player.role?.label) stats.roleLabel = player.role.label;
  if (player.colorTeam) stats.colorTeam = player.colorTeam;
  return stats;
}

function buildMatchSummary() {
  const sortPlayers = (left, right) => (
    (right.points - left.points)
    || (right.basesDestroyed - left.basesDestroyed)
    || (right.kills - left.kills)
    || (left.teamKills - right.teamKills)
    || (left.deaths - right.deaths)
    || (right.accuracy - left.accuracy)
    || String(left.label || "").localeCompare(String(right.label || ""))
  );

  const createTeamSummary = (teamId, teamName) => {
    const players = Array.from(gameplayRoom.playerStats.values())
      .filter((stats) => stats.colorTeam === teamId)
      .map((stats) => ({
        ...stats,
        accuracy: stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0,
      }))
      .sort(sortPlayers);

    return {
      id: teamId,
      name: teamName,
      players,
    };
  };

  const winnerTeamName = gameplayRoom.roundState.matchWinner === "team1"
    ? "Equipo 1"
    : gameplayRoom.roundState.matchWinner === "team2"
      ? "Equipo 2"
      : null;
  return {
    winnerTeam: gameplayRoom.roundState.matchWinner,
    winnerTeamName,
    team1: createTeamSummary("team1", "Equipo 1"),
    team2: createTeamSummary("team2", "Equipo 2"),
  };
}

function awardEnemyKillStats(ownerStats) {
  if (!ownerStats) return;
  ownerStats.hits += 1;
  ownerStats.kills += 1;
  ownerStats.points += ONLINE_POINTS_ENEMY_KILL;
}

function awardTeamKillStats(ownerStats) {
  if (!ownerStats) return;
  ownerStats.teamKills += 1;
  ownerStats.points += ONLINE_POINTS_TEAM_KILL;
}

function awardEnemyBaseDestroyedStats(ownerStats) {
  if (!ownerStats) return;
  ownerStats.hits += 1;
  ownerStats.basesDestroyed += 1;
  ownerStats.points += ONLINE_POINTS_BASE_DESTROYED;
}

function clearReconnectTimer(token) {
  if (!token) return;
  const timer = lobbyReconnectTimers.get(token);
  if (timer) {
    clearTimeout(timer);
    lobbyReconnectTimers.delete(token);
  }
}

function replaceClientIdEverywhere(fromClientId, toClientId) {
  if (!fromClientId || !toClientId || fromClientId === toClientId) return;

  lobbyRooms.forEach((room) => {
    let changed = false;

    if (room.watchers.delete(fromClientId)) {
      room.watchers.add(toClientId);
      changed = true;
    }

    if (room.hostClientId === fromClientId) {
      room.hostClientId = toClientId;
      changed = true;
    }

    room.slots.forEach((slot) => {
      if (slot.clientId !== fromClientId) return;
      slot.clientId = toClientId;
      changed = true;
    });

    if (changed && room.hostClientId) {
      const hostSlot = room.slots.find((slot) => slot.clientId === room.hostClientId);
      if (hostSlot) {
        room.hostName = hostSlot.label || room.hostName;
      }
    }
  });

  gameplayRooms.forEach((room) => {
    runInGameplayRoom(room, () => {
      gameplayRoom.pendingMatchSlots = gameplayRoom.pendingMatchSlots.map((slot) => (
        slot.clientId === fromClientId ? { ...slot, clientId: toClientId } : slot
      ));

      const player = gameplayRoom.players.get(fromClientId);
      if (player) {
        gameplayRoom.players.delete(fromClientId);
        player.id = toClientId;
        player.clientId = toClientId;
        gameplayRoom.players.set(toClientId, player);
      }

      gameplayRoom.bullets.forEach((bullet) => {
        if (bullet.ownerId === fromClientId) bullet.ownerId = toClientId;
      });
    });
  });
}

function finalizeClientDisconnect(clientId) {
  const client = getClient(clientId);
  if (!client) return;

  const reconnectToken = client.reconnectToken || null;
  if (reconnectToken && tokenToClientId.get(reconnectToken) === clientId) {
    tokenToClientId.delete(reconnectToken);
  }
  clearReconnectTimer(reconnectToken);

  removeClientFromLobbyRoom(clientId);

  const match = getGameplayRoomForClient(clientId);
  if (match) {
    runInGameplayRoom(match, () => {
      const player = gameplayRoom.players.get(clientId);
      player?.activeBulletIds?.forEach((bulletId) => destroyBullet(bulletId));
      gameplayRoom.players.delete(clientId);
      gameplayRoom.playerStats.delete(clientId);
      gameplayRoom.pendingMatchSlots = gameplayRoom.pendingMatchSlots.map((slot) => (
        slot.clientId === clientId ? { ...slot, clientId: null } : slot
      ));
      cleanupGameplayIfEmpty();
    });
  }
  client.currentMatchRoomId = null;
  clients.delete(clientId);
}

function scheduleReconnectCleanup(clientId) {
  const client = getClient(clientId);
  if (!client) return false;

  const reconnectToken = client.reconnectToken || null;
  const hasLobbyPresence = Array.from(lobbyRooms.values()).some((room) => (
    room.watchers.has(clientId) || room.slots.some((slot) => slot.clientId === clientId)
  ));
  const hasGameplayPresence = Array.from(gameplayRooms.values()).some((room) => (
    room.players.has(clientId) || room.pendingMatchSlots.some((slot) => slot.clientId === clientId)
  ));

  if (!reconnectToken || (!hasLobbyPresence && !hasGameplayPresence)) {
    finalizeClientDisconnect(clientId);
    return false;
  }

  clearReconnectTimer(reconnectToken);
  const timer = setTimeout(() => {
    if (tokenToClientId.get(reconnectToken) !== clientId) return;
    finalizeClientDisconnect(clientId);
  }, LOBBY_GRACE_MS);
  lobbyReconnectTimers.set(reconnectToken, timer);
  return true;
}

function bindReconnectToken(clientId, rawToken) {
  const client = getClient(clientId);
  const reconnectToken = String(rawToken || "").trim();
  if (!client || !reconnectToken) return reconnectToken;

  const previousClientId = tokenToClientId.get(reconnectToken);
  if (previousClientId && previousClientId !== clientId) {
    const previousClient = getClient(previousClientId);
    if (previousClient) {
      replaceClientIdEverywhere(previousClientId, clientId);
      client.playerName = previousClient.playerName || client.playerName;
      client.currentLobbyRoomId = previousClient.currentLobbyRoomId || null;
      client.currentMatchRoomId = previousClient.currentMatchRoomId || null;
      clients.delete(previousClientId);
    }
  }

  client.reconnectToken = reconnectToken;
  clearReconnectTimer(reconnectToken);
  tokenToClientId.set(reconnectToken, clientId);
  return reconnectToken;
}

function sendToClient(clientId, type, payload) {
  const client = getClient(clientId);
  if (!client || client.ws.readyState !== 1) return;
  client.ws.send(JSON.stringify({ type, payload }));
}

function getLobbyFreeSlotCount(room) {
  return room?.slots?.filter((slot) => (
    slot
    && !slot.clientId
    && slot.kind !== "IA"
    && slot.kind !== "Cerrado"
  )).length || 0;
}

function lobbyRoomToSummary(room) {
  const humanCount = room.slots.filter((slot) => slot.clientId).length;
  const aiCount = room.slots.filter((slot) => slot.kind === "IA").length;
  const occupiedCount = humanCount + aiCount;
  const maxPlayers = room.slots.filter((slot) => slot.kind !== "Cerrado").length;
  const freeSlots = getLobbyFreeSlotCount(room);
  return {
    id: room.id,
    roomName: room.roomName,
    hostName: room.hostName,
    mode: room.mode,
    playerCount: occupiedCount,
    maxPlayers,
    freeSlots,
    state: freeSlots > 0 ? "waiting" : "full",
    createdAt: room.createdAt,
  };
}

function getLobbyOccupiedCount(room) {
  return room?.slots?.filter((slot) => slot.clientId || slot.kind === "IA").length || 0;
}

function canLobbyRoomStart(room) {
  if (!room) return { ok: false, message: "La sala ya no existe." };

  const occupiedCount = getLobbyOccupiedCount(room);
  const requiredOccupiedCount = getLobbyModeConfig(room.mode).slotCount;
  if (occupiedCount !== requiredOccupiedCount) {
    return { ok: false, message: `Necesitas ${requiredOccupiedCount} slots ocupados para comenzar la partida.` };
  }

  const humanSlots = room.slots.filter((slot) => slot.clientId);
  if (!humanSlots.length) {
    return { ok: false, message: "No hay jugadores humanos listos para iniciar." };
  }

  const allHumansReady = humanSlots.every((slot) => slot.isReady);
  if (!allHumansReady) {
    return { ok: false, message: "Todos los humanos conectados tienen que marcar ESTOY LISTO." };
  }

  return { ok: true };
}

function buildLobbyRoomDetail(room) {
  return {
    id: room.id,
    roomName: room.roomName,
    hostClientId: room.hostClientId,
    hostName: room.hostName,
    mode: room.mode,
    density: room.density,
    rounds: room.rounds,
    lives: room.lives,
    baseHits: room.baseHits,
    createdAt: room.createdAt,
    slots: room.slots.map((slot) => ({ ...slot })),
    messages: room.messages.map((message) => ({ ...message })),
  };
}

function pushRoomMessage(room, author, text, kind = "chat") {
  if (!room || !text) return;
  room.messages.push({
    id: `room-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author,
    text,
    kind,
    createdAt: Date.now(),
  });
  if (room.messages.length > 60) room.messages = room.messages.slice(-60);
}

function broadcastLobbyList() {
  const payload = {
    rooms: Array.from(lobbyRooms.values())
      .map(lobbyRoomToSummary)
      .filter((room) => room.freeSlots > 0)
      .sort((a, b) => a.createdAt - b.createdAt),
  };
  clients.forEach((client) => {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ type: MESSAGE.ROOM_LIST, payload }));
    }
  });
}

function broadcastRoomDetail(roomId) {
  const room = lobbyRooms.get(roomId);
  if (!room) return;
  const payload = buildLobbyRoomDetail(room);
  room.watchers.forEach((clientId) => sendToClient(clientId, MESSAGE.ROOM_DETAIL, payload));
}

function pushGameplayChatMessage(player, text, now = Date.now()) {
  if (!player || !text) return;
  const trimmed = String(text || "").trim().slice(0, GAMEPLAY_CHAT_MAX_LEN);
  if (!trimmed) return;
  gameplayRoom.chatMessages.push({
    id: `game-chat-${now}-${Math.random().toString(36).slice(2, 7)}`,
    playerId: player.id,
    author: player.label || "Player",
    text: trimmed,
    color: player.visualColor || "#f5f5f5",
    createdAt: now,
    expiresAt: now + GAMEPLAY_CHAT_TTL_MS,
  });
  if (gameplayRoom.chatMessages.length > 24) {
    gameplayRoom.chatMessages = gameplayRoom.chatMessages.slice(-24);
  }
}

function sendGameplayChat(clientId, payload = {}) {
  const player = gameplayRoom.players.get(clientId);
  if (!player || player.isDestroyed) return;
  const now = Date.now();
  if (Number(player.chatMutedUntil || 0) > now) {
    const secondsLeft = Math.max(1, Math.ceil((Number(player.chatMutedUntil || 0) - now) / 1000));
    sendToClient(clientId, MESSAGE.ERROR, { message: `Chat bloqueado ${secondsLeft}s por flood.` });
    return;
  }

  player.chatMessageTimes = (player.chatMessageTimes || []).filter((timestamp) => (now - Number(timestamp || 0)) <= GAMEPLAY_CHAT_FLOOD_WINDOW_MS);
  if (player.chatMessageTimes.length >= GAMEPLAY_CHAT_FLOOD_COUNT) {
    player.chatMutedUntil = now + GAMEPLAY_CHAT_MUTE_MS;
    player.chatMessageTimes = [];
    sendToClient(clientId, MESSAGE.ERROR, { message: `Flood detectado: chat bloqueado ${Math.ceil(GAMEPLAY_CHAT_MUTE_MS / 1000)}s.` });
    return;
  }

  pushGameplayChatMessage(player, payload?.text, now);
  player.chatMessageTimes.push(now);
}

function attachWatcher(room, clientId) {
  room.watchers.add(clientId);
  const client = getClient(clientId);
  if (client) client.currentLobbyRoomId = room.id;
}

function detachWatcher(room, clientId) {
  room.watchers.delete(clientId);
  const client = getClient(clientId);
  if (client && client.currentLobbyRoomId === room.id) {
    client.currentLobbyRoomId = null;
  }
}

function createLobbySlotFromSource(slot, fallbackId) {
  return {
    id: slot?.id || fallbackId,
    label: slot?.label || fallbackId,
    role: slot?.role || fallbackId,
    baseRole: slot?.baseRole || slot?.role || fallbackId,
    kind: slot?.kind || "Abierto",
    aiDifficulty: normalizeAiDifficulty(slot?.aiDifficulty),
    color: normalizeCustomColor(slot?.color),
    team: slot?.team || "-",
    locked: !!slot?.locked,
    clientId: slot?.clientId || null,
    isHost: !!slot?.isHost,
    isReady: !!slot?.isReady,
  };
}

function createLobbyRoom(clientId, payload = {}) {
  const client = getClient(clientId);
  const createRequestId = String(payload.createRequestId || "").trim() || null;
  const createdRoomId = createRequestId ? roomCreateRequests.get(createRequestId) : null;
  const existingRoomForCreateRequest = createdRoomId ? lobbyRooms.get(createdRoomId) : null;
  if (existingRoomForCreateRequest) {
    joinLobbyRoom(clientId, { roomId: existingRoomForCreateRequest.id, playerName: payload.playerName });
    return;
  }
  if (client?.ipAddress && countHostedRoomsForIp(client.ipAddress) >= MAX_HOSTED_ROOMS_PER_IP) {
    sendToClient(clientId, MESSAGE.ERROR, { message: `Máximo ${MAX_HOSTED_ROOMS_PER_IP} salas por IP.` });
    return;
  }
  const browserToken = String(payload.browserToken || client?.browserToken || "").trim() || null;
  const existingRoomForBrowser = browserToken
    ? Array.from(lobbyRooms.values()).find((room) => room.hostBrowserToken === browserToken)
    : null;
  if (existingRoomForBrowser && !lobbyRoomHasConnectedHuman(existingRoomForBrowser)) {
    deleteLobbyRoom(existingRoomForBrowser.id);
  }
  if (existingRoomForBrowser) {
    joinLobbyRoom(clientId, { roomId: existingRoomForBrowser.id, playerName: payload.playerName });
    return;
  }
  const hostName = String(payload.playerName || "Player1").trim() || "Player1";
  const roomName = String(payload.roomName || "Sala sin nombre").trim() || "Sala sin nombre";
  const rawSlots = Array.isArray(payload.slots) ? payload.slots : [];
  const normalizedSlots = rawSlots.length
    ? rawSlots.map((slot, index) => createLobbySlotFromSource(slot, `slot-${index + 1}`))
    : [
        createLobbySlotFromSource({ id: "host", label: hostName, role: "Anfitrión", kind: "Jugador", team: "-", color: RANDOM_PLAYER_COLOR }, "host"),
        createLobbySlotFromSource({ id: "slot-2", label: "Slot 2", role: "Slot 2", kind: "Abierto", color: RANDOM_PLAYER_COLOR }, "slot-2"),
        createLobbySlotFromSource({ id: "slot-3", label: "Slot 3", role: "Slot 3", kind: "Abierto", color: RANDOM_PLAYER_COLOR }, "slot-3"),
        createLobbySlotFromSource({ id: "slot-4", label: "Slot 4", role: "Slot 4", kind: "Abierto", color: RANDOM_PLAYER_COLOR }, "slot-4"),
      ];

  const requestedMode = payload.mode || DEFAULT_LOBBY_MODE;
  const lobbySlots = normalizeLobbySlotsForMode(normalizedSlots, requestedMode);

  lobbySlots[0] = {
    ...lobbySlots[0],
    label: hostName,
    role: "Anfitrión",
    kind: "Jugador",
    locked: true,
    clientId,
    isHost: true,
    isReady: false,
  };

  const room = {
    id: `room-${Math.random().toString(36).slice(2, 10)}`,
    roomName,
    hostClientId: clientId,
    hostBrowserToken: browserToken,
    hostName,
    mode: requestedMode,
    density: payload.density || "Normal (1x)",
    rounds: payload.rounds || "6",
    lives: payload.lives || "3",
    baseHits: payload.baseHits || "3",
    slots: lobbySlots,
    watchers: new Set([clientId]),
    messages: [],
    createdAt: Date.now(),
  };

  pushRoomMessage(room, "Sistema", `La sala ${roomName} quedó abierta.`, "system");

  lobbyRooms.set(room.id, room);
  if (createRequestId) roomCreateRequests.set(createRequestId, room.id);
  if (client) {
    client.currentLobbyRoomId = room.id;
    client.playerName = hostName;
  }
  sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: true });
  room.slots = normalizeLobbySlotsForMode(room.slots, room.mode);
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function updateLobbyRoom(clientId, payload = {}) {
  const roomId = payload.roomId || getClient(clientId)?.currentLobbyRoomId;
  const room = roomId ? lobbyRooms.get(roomId) : null;
  if (!room || room.hostClientId !== clientId) return;

  const requestedMode = payload.mode || room.mode;
  const hasHumansOutsideClassicSlots = isClassicLobbyMode(requestedMode)
    && room.slots.slice(getLobbyModeConfig(requestedMode).slotCount).some((slot) => !!slot?.clientId);
  if (hasHumansOutsideClassicSlots) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "No podes cambiar a Clasico - 80s mientras haya jugadores conectados en los slots 3 o 4." });
    broadcastRoomDetail(room.id);
    return;
  }

  room.roomName = String(payload.roomName || room.roomName).trim() || room.roomName;
  room.hostName = String(payload.playerName || room.hostName).trim() || room.hostName;
  room.mode = requestedMode;
  room.density = payload.density || room.density;
  room.rounds = payload.rounds || room.rounds;
  room.lives = payload.lives || room.lives;
  room.baseHits = payload.baseHits || room.baseHits;

  if (Array.isArray(payload.slots) && payload.slots.length === room.slots.length) {
    room.slots = normalizeLobbySlotsForMode(payload.slots.map((incoming, index) => {
      const existing = room.slots[index];
      const isOccupiedHuman = !!existing.clientId;
      const nextKind = isOccupiedHuman ? existing.kind : incoming.kind || existing.kind;
      // Don't overwrite color/team of slots occupied by a human player — those are owned by the player via update_my_slot
      return {
        ...existing,
        color: isOccupiedHuman ? existing.color : (incoming.color || existing.color),
        team: isOccupiedHuman
          ? existing.team
          : normalizeLobbyTeamValue(room, incoming.team ?? existing.team, { excludeSlotId: existing.id }),
        aiDifficulty: isOccupiedHuman ? existing.aiDifficulty : normalizeAiDifficulty(incoming.aiDifficulty || existing.aiDifficulty),
        kind: existing.isHost ? "Jugador" : nextKind,
        locked: existing.isHost ? true : !!incoming.locked,
      };
    }), room.mode);
  }

  const hostSlot = room.slots.find((slot) => slot.clientId === room.hostClientId);
  if (hostSlot) {
    hostSlot.label = room.hostName;
    hostSlot.role = "Anfitrión";
    hostSlot.isHost = true;
    hostSlot.locked = true;
    hostSlot.kind = "Jugador";
  }

  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function joinLobbyRoom(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId);
  if (!room) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "La sala ya no existe." });
    broadcastLobbyList();
    return;
  }

  attachWatcher(room, clientId);
  const existingSlot = room.slots.find((slot) => slot.clientId === clientId);
  if (existingSlot) {
    sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: room.hostClientId === clientId });
    broadcastRoomDetail(room.id);
    return;
  }

  const openSlot = room.slots.find((slot) => slot.kind === "Abierto" && !slot.clientId);
  if (!openSlot) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "La sala está llena." });
    broadcastRoomDetail(room.id);
    broadcastLobbyList();
    return;
  }

  const client = getClient(clientId);
  const playerName = String(payload.playerName || client?.playerName || "Player").trim() || "Player";
  if (client) client.playerName = playerName;

  openSlot.clientId = clientId;
  openSlot.label = playerName;
  openSlot.kind = "Jugador";
  openSlot.isReady = false;
  openSlot.isHost = false;

  pushRoomMessage(room, "Sistema", `${playerName} se unió a la sala.`, "system");
  sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: false });
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function requestRoomDetail(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId);
  if (!room) return;
  attachWatcher(room, clientId);
  sendToClient(clientId, MESSAGE.ROOM_DETAIL, buildLobbyRoomDetail(room));
}

function setLobbyReady(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId || getClient(clientId)?.currentLobbyRoomId);
  if (!room) return;
  const slot = room.slots.find((item) => item.clientId === clientId);
  if (!slot) return;
  slot.isReady = !!payload.isReady;
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function updateMySlot(clientId, payload = {}) {
  const roomId = payload.roomId || getClient(clientId)?.currentLobbyRoomId;
  const room = roomId ? lobbyRooms.get(roomId) : null;
  if (!room) return;
  const slot = room.slots.find((s) => s.clientId === clientId);
  if (!slot) return;
  if (payload.color !== undefined) slot.color = normalizeCustomColor(payload.color);
  if (payload.team !== undefined) {
    slot.team = isClassicLobbyMode(room.mode)
      ? "1"
      : normalizeLobbyTeamValue(room, payload.team, { excludeClientId: clientId });
  }
  room.slots = normalizeLobbySlotsForMode(room.slots, room.mode);
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function startLobbyMatch(clientId, payload = {}) {
  const roomId = payload.roomId || getClient(clientId)?.currentLobbyRoomId;
  const room = roomId ? lobbyRooms.get(roomId) : null;
  if (!room) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "La sala no existe." });
    return;
  }
  if (room.hostClientId !== clientId) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "Solo el anfitrión puede iniciar la partida." });
    return;
  }

  const validation = canLobbyRoomStart(room);
  if (!validation.ok) {
    sendToClient(clientId, MESSAGE.ERROR, { message: validation.message });
    broadcastRoomDetail(room.id);
    broadcastLobbyList();
    return;
  }

  const matchConfig = buildMatchConfigFromRoom(room);
  const match = ensureGameplayRoom(room.id, matchConfig);
  runInGameplayRoom(match, () => {
    resetGameplayRoomState(matchConfig);
    gameplayRoom.pendingMatchSlots = room.slots.map((s) => ({ ...s }));
  });

  room.watchers.forEach((watcherId) => {
    const client = getClient(watcherId);
    if (client) client.currentMatchRoomId = room.id;
  });

  room.watchers.forEach((watcherId) => {
    sendToClient(watcherId, MESSAGE.MATCH_STARTING, { roomId: room.id, matchConfig });
  });
}

function leaveGameplay(clientId) {
  const match = getGameplayRoomForClient(clientId);
  if (!match) return false;
  const result = runInGameplayRoom(match, () => {
    const player = gameplayRoom.players.get(clientId);
    if (player) {
      player.activeBulletIds?.forEach((bulletId) => destroyBullet(bulletId));
      gameplayRoom.players.delete(clientId);
      gameplayRoom.playerStats.delete(clientId);
    }
    gameplayRoom.pendingMatchSlots = gameplayRoom.pendingMatchSlots.map((slot) => (
      slot.clientId === clientId ? { ...slot, clientId: null } : slot
    ));
    cleanupGameplayIfEmpty();
    return !!player;
  });
  const client = getClient(clientId);
  if (client) client.currentMatchRoomId = null;
  removeClientFromLobbyRoom(clientId);
  return result;
}

function deleteLobbyRoom(roomId) {
  const room = lobbyRooms.get(roomId);
  if (!room) return;
  gameplayRooms.delete(roomId);
  room.watchers.forEach((clientId) => {
    const client = getClient(clientId);
    if (client && client.currentLobbyRoomId === roomId) client.currentLobbyRoomId = null;
    if (client && client.currentMatchRoomId === roomId) client.currentMatchRoomId = null;
    sendToClient(clientId, MESSAGE.ROOM_CLOSED, { roomId });
  });
  lobbyRooms.delete(roomId);
  broadcastLobbyList();
}

function getLobbyHumanCount(room) {
  return room?.slots?.filter((slot) => !!slot.clientId).length || 0;
}

function removeClientFromLobbyRoom(clientId) {
  for (const room of lobbyRooms.values()) {
    const occupiedSlot = room.slots.find((slot) => slot.clientId === clientId);
    const wasWatching = room.watchers.has(clientId);
    if (!occupiedSlot && !wasWatching) continue;

    detachWatcher(room, clientId);

    if (occupiedSlot) {
      occupiedSlot.clientId = null;
      occupiedSlot.isReady = false;
      occupiedSlot.isHost = false;
      occupiedSlot.locked = false;
      occupiedSlot.role = occupiedSlot.baseRole || occupiedSlot.role;
      occupiedSlot.label = occupiedSlot.baseRole || occupiedSlot.label;
      occupiedSlot.kind = occupiedSlot.kind === "Jugador" ? "Abierto" : occupiedSlot.kind;

      const leavingName = occupiedSlot.label;
      if (getLobbyHumanCount(room) === 0) {
        deleteLobbyRoom(room.id);
        return;
      }

      const hostWasLeaving = room.hostClientId === clientId;
      if (hostWasLeaving) {
        const nextHostSlot = room.slots.find((slot) => slot.clientId);
        if (!nextHostSlot) {
          deleteLobbyRoom(room.id);
          return;
        }

        room.hostClientId = nextHostSlot.clientId;
        room.hostBrowserToken = getClient(nextHostSlot.clientId)?.browserToken || null;
        room.hostName = nextHostSlot.label;
        nextHostSlot.isHost = true;
        nextHostSlot.locked = true;
        nextHostSlot.role = "Anfitrión";
        nextHostSlot.kind = "Jugador";
        pushRoomMessage(room, "Sistema", `${leavingName} salió de la sala. ${nextHostSlot.label} ahora es el anfitrión.`, "system");
      } else {
        pushRoomMessage(room, "Sistema", `${leavingName} salió de la sala.`, "system");
      }
    }

    broadcastRoomDetail(room.id);
    broadcastLobbyList();
    return;
  }
}

function sendRoomChat(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId || getClient(clientId)?.currentLobbyRoomId);
  if (!room) return;
  const slot = room.slots.find((item) => item.clientId === clientId);
  if (!slot) return;
  const text = String(payload.text || "").trim();
  if (!text) return;
  pushRoomMessage(room, slot.label || getClient(clientId)?.playerName || "Player", text, "chat");
  broadcastRoomDetail(room.id);
}

function getMatchWinner() {
  if (isClassicMatchMode(gameplayRoom.matchConfig)) return null;
  const { currentRound, totalRounds, scores } = gameplayRoom.roundState;
  const diff = scores.team1 - scores.team2;
  const roundsToWin = Math.floor(totalRounds / 2) + 1;
  if (scores.team1 >= roundsToWin) return "team1";
  if (scores.team2 >= roundsToWin) return "team2";
  if (currentRound < totalRounds) return null;
  if (currentRound === totalRounds) {
    if (diff !== 0) return diff > 0 ? "team1" : "team2";
    return null;
  }
  if (Math.abs(diff) >= 2) return diff > 0 ? "team1" : "team2";
  return null;
}

function teamHasRoundLivesRemaining(team, now = Date.now()) {
  const teamPlayers = Array.from(gameplayRoom.players.values()).filter((player) => player?.team === team);
  if (!teamPlayers.length) return false;
  return teamPlayers.some((player) => !player.isDestroyed || Number(player.respawnAt || 0) > now);
}

function getRoundWinnerByTeamElimination(now = Date.now()) {
  if (isClassicMatchMode(gameplayRoom.matchConfig)) return null;
  const southAlive = teamHasRoundLivesRemaining("south", now);
  const northAlive = teamHasRoundLivesRemaining("north", now);
  if (southAlive === northAlive) return null;
  return southAlive ? "south" : "north";
}

function resetPlayerForRespawn(player) {
  const spawnConfig = getPlayerSpawnForRole(player.role);
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.moveAngleDeg = spawnConfig.moveAngleDeg;
  player.turretAngleRad = spawnConfig.turretAngleRad;
  player.input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
  player.activeBulletIds = new Set();
  player.lastFireAt = 0;
  player.respawnAt = 0;
  player.isDestroyed = false;
  player.hp = 1;
  const activeFreeze = gameplayRoom.teamFreezeEffects.get(player.team) || null;
  player.freezeExemptUntil = activeFreeze ? Date.now() + Math.max(0, Number(activeFreeze.timeRemaining || 0)) : 0;
  activateSpawnShield(player);
}

function clearRoundFreezeState() {
  gameplayRoom.teamFreezeEffects.clear();
  gameplayRoom.players.forEach((player) => {
    if (!player) return;
    player.freezeExemptUntil = 0;
  });
}

function resetPlayerUpgradeState(player) {
  if (!player) return;
  const tier = getUpgradeTier(0);
  player.starCount = tier.starLevel;
  player.bulletCount = tier.bulletCount;
  player.bulletLimit = tier.bulletLimit;
  player.bulletSpeed = tier.bulletSpeed;
  player.fireCooldown = tier.fireCooldown;
  player.canDestroyStone = tier.canDestroyStone;
}

function applyRoundSideToPlayer(player) {
  const spawnConfig = getPlayerSpawnForRole(player.role);
  player.team = spawnConfig.team;
  player.spawnX = spawnConfig.spawn.x;
  player.spawnY = spawnConfig.spawn.y;
}

function startNewRound() {
  const roundStartedAt = Date.now();
  const previousSideSwitched = !!gameplayRoom.roundState.sideSwitched;
  gameplayRoom.roundState.currentRound += 1;
  gameplayRoom.roundState.sideSwitched = gameplayRoom.roundState.currentRound > (gameplayRoom.matchConfig?.sideSwitchAfterRound ?? Math.max(1, Math.floor(gameplayRoom.roundState.totalRounds / 2)));
  const sideSwitchChanged = gameplayRoom.roundState.sideSwitched !== previousSideSwitched;
  gameplayRoom.roundState.transitioning = false;
  gameplayRoom.roundState.transitionAt = null;
  gameplayRoom.roundState.transitionDurationMs = ROUND_TRANSITION_MS;
  gameplayRoom.roundState.showPartialSummary = false;
  gameplayRoom.status.winnerTeam = null;
  gameplayRoom.level = createLevelForMatch(gameplayRoom.matchConfig);
  gameplayRoom.bases = createFreshBases(gameplayRoom.matchConfig);
  gameplayRoom.bullets.clear();
  gameplayRoom.powerUps = [];
  gameplayRoom.activeMissileStrikes = [];
  gameplayRoom.missileImpactEffects = [];
  gameplayRoom.chatMessages = [];
  gameplayRoom.baseFortressEffects.clear();
  clearRoundFreezeState();

  gameplayRoom.players.forEach((player) => {
    player.activeBulletIds = new Set();
    player.extraLives = Math.max(0, Number(gameplayRoom.matchConfig?.livesPerRound || 1) - 1);
    applyRoundSideToPlayer(player);
    if (sideSwitchChanged) {
      resetPlayerUpgradeState(player);
    }
    resetPlayerForRespawn(player);
  });

  broadcast(MESSAGE.ROUND_START, {
    currentRound: gameplayRoom.roundState.currentRound,
    totalRounds: gameplayRoom.roundState.totalRounds,
    scores: { ...gameplayRoom.roundState.scores },
    sideSwitched: gameplayRoom.roundState.sideSwitched,
  });
}

function canOccupyPlayerPosition(player, x, y) {
  const half = TANK_COLLISION_SIZE / 2;
  const left = x - half;
  const right = x + half;
  const top = y - half;
  const bottom = y + half;
  const startCol = worldToGridCol(left, 0);
  const endCol = worldToGridCol(right, 0);
  const startRow = worldToGridRow(top, 0);
  const endRow = worldToGridRow(bottom, 0);
  const boundsCheck = isClassicMatchMode(gameplayRoom.matchConfig)
    ? (c, r) => inBoundsForCurrentLevel(c, r)
    : (c, r) => inBounds(c, r);
  if (!boundsCheck(startCol, startRow) || !boundsCheck(endCol, endRow)) return false;
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (isBlockingTile(gameplayRoom.level.obstacles?.[row]?.[col])) return false;
    }
  }
  for (const other of gameplayRoom.players.values()) {
    if (!other || other === player || other.isDestroyed) continue;
    if (vectorLength(x - other.x, y - other.y) < TANK_COLLISION_SIZE * 0.82) return false;
  }
  // In classic mode, players also collide with enemy tanks
  if (isClassicMatchMode(gameplayRoom.matchConfig) && gameplayRoom.classicState) {
    for (const enemy of gameplayRoom.classicState.enemies.values()) {
      if (enemy.isDestroyed) continue;
      if (vectorLength(x - enemy.x, y - enemy.y) < TANK_COLLISION_SIZE * 0.82) return false;
    }
  }
  return true;
}

function getBaseIdAtCell(col, row) {
  for (const def of Object.values(ONLINE_BASE_DEFS)) {
    if (col >= def.anchorCol && col <= def.anchorCol + 1 && row >= def.anchorRow && row <= def.anchorRow + 1) {
      return def.id;
    }
  }
  return null;
}

function getFortressBaseIdAtCell(col, row) {
  for (const def of Object.values(ONLINE_BASE_DEFS)) {
    const startCol = def.side === "west" ? def.anchorCol : def.anchorCol - 2;
    const startRow = def.anchorRow - 2;
    const inFortress = col >= startCol && col < startCol + 4 && row >= startRow && row < startRow + 6;
    const isBaseTile = col >= def.anchorCol && col <= def.anchorCol + 1 && row >= def.anchorRow && row <= def.anchorRow + 1;
    if (inFortress && !isBaseTile) return def.id;
  }
  return null;
}

function destroyBullet(bulletId) {
  const bullet = gameplayRoom.bullets.get(bulletId);
  if (!bullet) return;
  gameplayRoom.bullets.delete(bulletId);
  const owner = gameplayRoom.players.get(bullet.ownerId);
  owner?.activeBulletIds?.delete?.(bulletId);
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  gameplayRoom.players.forEach((player, playerId) => {
    if (player?.isBot) return;
    const client = getClient(playerId);
    if (client?.ws.readyState === 1) {
      client.ws.send(message);
    }
  });
}

function buildSnapshot() {
  return {
    serverTime: Date.now(),
    players: Array.from(gameplayRoom.players.values()).map((player) => ({
      id: player.id,
      color: player.role.id,
      visualColor: player.visualColor,
      label: player.label || player.role.label,
      x: player.x,
      y: player.y,
      moveAngleDeg: player.moveAngleDeg,
      turretAngleRad: player.turretAngleRad,
      isDestroyed: !!player.isDestroyed,
      shieldActive: hasActiveShield(player),
      shieldUntil: Number(player.shieldUntil || 0),
      shieldFlickerOnExpire: !!player.shieldFlickerOnExpire,
      team: player.team,
      colorTeam: player.colorTeam,
      starCount: Number(player.starCount || 0),
      extraLives: Math.max(0, Number(player.extraLives || 0)),
      livesRemaining: Math.max(
        0,
        Number(player.extraLives || 0)
          + (player.isDestroyed ? (Number(player.respawnAt || 0) > 0 ? 1 : 0) : 1),
      ),
      roundLives: Math.max(1, Number(gameplayRoom.matchConfig?.livesPerRound || 1)),
    })),
    bullets: Array.from(gameplayRoom.bullets.values()).map((bullet) => ({
      id: bullet.id,
      ownerId: bullet.ownerId,
      x: bullet.x,
      y: bullet.y,
      angleRad: bullet.angleRad,
      width: bullet.width,
      length: bullet.length,
      tint: bullet.tint,
    })),
    activeMissileStrikes: gameplayRoom.activeMissileStrikes.map((strike) => ({ ...strike })),
    missileImpactEffects: gameplayRoom.missileImpactEffects.map((effect) => ({ ...effect })),
    chatMessages: gameplayRoom.chatMessages.map((message) => ({ ...message })),
    bases: Array.from(gameplayRoom.bases.values()).map((base) => ({ ...base })),
    powerUps: gameplayRoom.powerUps.map((pu) => ({ ...pu })),
    floor: gameplayRoom.level.floor,
    overlay: gameplayRoom.level.overlay,
    obstacles: gameplayRoom.level.obstacles,
    mapAlgorithm: gameplayRoom.level.mapAlgorithm ?? 0,
    matchConfig: { ...gameplayRoom.matchConfig },
    status: { ...gameplayRoom.status },
    matchSummary: buildMatchSummary(),
    roundState: {
      currentRound: gameplayRoom.roundState.currentRound,
      totalRounds: gameplayRoom.roundState.totalRounds,
      scores: { ...gameplayRoom.roundState.scores },
      sideSwitched: gameplayRoom.roundState.sideSwitched,
      transitioning: gameplayRoom.roundState.transitioning,
      transitionAt: gameplayRoom.roundState.transitionAt,
      transitionDurationMs: gameplayRoom.roundState.transitionDurationMs,
      showPartialSummary: gameplayRoom.roundState.showPartialSummary,
      matchOver: gameplayRoom.roundState.matchOver,
      matchWinner: gameplayRoom.roundState.matchWinner,
      sideSwitchAfterRound: gameplayRoom.matchConfig?.sideSwitchAfterRound ?? Math.max(1, Math.floor(gameplayRoom.roundState.totalRounds / 2)),
      roundWinnerColorTeam: gameplayRoom.status.winnerTeam
        ? colorTeamForGeographicWinner(gameplayRoom.status.winnerTeam, gameplayRoom.roundState.sideSwitched)
        : null,
    },
    classicEnemies: isClassicMatchMode(gameplayRoom.matchConfig) && gameplayRoom.classicState
      ? Array.from(gameplayRoom.classicState.enemies.values()).map((e) => ({
          id: e.id, x: e.x, y: e.y,
          moveAngleDeg: e.moveAngleDeg, turretAngleRad: e.turretAngleRad,
          isDestroyed: e.isDestroyed,
          isPowerCarrier: !!e.isPowerCarrier,
        }))
      : null,
    classicState: isClassicMatchMode(gameplayRoom.matchConfig) && gameplayRoom.classicState
      ? {
          levelIndex: gameplayRoom.classicState.levelIndex,
          spawnedEnemiesCount: gameplayRoom.classicState.spawnedEnemiesCount,
          destroyedEnemiesCount: gameplayRoom.classicState.destroyedEnemiesCount,
          totalEnemies: gameplayRoom.classicState.totalEnemies,
          gameOver: gameplayRoom.classicState.gameOver,
          gameOverReason: gameplayRoom.classicState.gameOverReason,
          eagle: gameplayRoom.classicState.eagle ? { ...gameplayRoom.classicState.eagle } : null,
          levelTransitioning: gameplayRoom.classicState.levelTransitioning,
          enemiesFrozen: gameplayRoom.classicState.enemiesFrozenUntil > Date.now(),
          shovelActive: gameplayRoom.classicState.shovelUntil > Date.now(),
        }
      : null,
  };
}

function createPlayer(
  id,
  role,
  {
    isBot = false,
    label = null,
    aiDifficulty = DEFAULT_AI_DIFFICULTY,
    visualColor = RANDOM_PLAYER_COLOR,
    usedColors = new Set(),
  } = {},
) {
  const spawnConfig = getPlayerSpawnForRole(role);
  const tier = getUpgradeTier(0);
  const botDifficulty = normalizeAiDifficulty(aiDifficulty);
  return {
    id,
    clientId: isBot ? null : id,
    role,
    label: label || role.label,
    visualColor: resolveVisualColor(visualColor, usedColors),
    colorTeam: getColorTeam(role.id),
    team: spawnConfig.team,
    spawnX: spawnConfig.spawn.x,
    spawnY: spawnConfig.spawn.y,
    x: spawnConfig.spawn.x,
    y: spawnConfig.spawn.y,
    moveAngleDeg: spawnConfig.moveAngleDeg,
    moveSpeed: PLAYER_SPEED,
    turretAngleRad: spawnConfig.turretAngleRad,
    input: { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false },
    activeBulletIds: new Set(),
    hp: 1,
    shieldUntil: isClassicMatchMode(gameplayRoom.matchConfig) ? Date.now() + SPAWN_SHIELD_DURATION_MS : 0,
    shieldFlickerOnExpire: false,
    freezeExemptUntil: 0,
    extraLives: Math.max(0, Number(gameplayRoom.matchConfig?.livesPerRound || 1) - 1),
    isDestroyed: false,
    respawnAt: 0,
    lastFireAt: 0,
    lastFirePressed: false,
    chatMessageTimes: [],
    chatMutedUntil: 0,
    starCount: tier.starLevel,
    bulletCount: tier.bulletCount,
    bulletSpeed: tier.bulletSpeed,
    fireCooldown: tier.fireCooldown,
    canDestroyStone: tier.canDestroyStone,
    isBot,
    botDifficulty,
    botProfile: isBot ? buildBotDifficultyProfile(botDifficulty) : null,
    botState: isBot ? { lastDirChangeAt: 0, dirX: 0, dirY: 0, lastX: null, lastY: null, lastProgressAt: 0, stuckTimer: 0, unstuckDir: null, unstuckUntil: 0 } : null,
  };
}

function handleJoin(clientId, ws, payload = {}) {
  bindReconnectToken(clientId, payload?.reconnectToken);
  const client = getClient(clientId);
  const roomId = payload?.roomId || client?.currentMatchRoomId || client?.currentLobbyRoomId;
  const match = getGameplayRoomById(roomId);

  if (!client || !roomId || !match) {
    ws.send(JSON.stringify({ type: MESSAGE.ERROR, payload: { message: "La partida no está lista para unirse." } }));
    return;
  }

  client.currentMatchRoomId = roomId;

  runInGameplayRoom(match, () => {
    const existingPlayer = gameplayRoom.players.get(clientId);
    if (existingPlayer) {
      ws.send(JSON.stringify({
        type: MESSAGE.WELCOME,
        payload: {
          playerId: clientId,
          roleLabel: existingPlayer.role?.label || null,
          matchConfig: { ...gameplayRoom.matchConfig },
          roundState: {
            currentRound: gameplayRoom.roundState.currentRound,
            totalRounds: gameplayRoom.roundState.totalRounds,
            scores: { ...gameplayRoom.roundState.scores },
            sideSwitchAfterRound: gameplayRoom.matchConfig?.sideSwitchAfterRound ?? Math.max(1, Math.floor(gameplayRoom.roundState.totalRounds / 2)),
          },
        },
      }));
      return;
    }

    if (gameplayRoom.players.size === 0) {
      gameplayRoom.level = createLevelForMatch(gameplayRoom.matchConfig);
      gameplayRoom.bases = createFreshBases(gameplayRoom.matchConfig);
      gameplayRoom.status = { winnerTeam: null };
      gameplayRoom.roundState = createRoundState(gameplayRoom.matchConfig);
      gameplayRoom.bullets.clear();
      gameplayRoom.playerStats.clear();
      gameplayRoom.powerUps = [];
      gameplayRoom.chatMessages = [];
      gameplayRoom.totalKillsLifetime = 0;
      gameplayRoom.powerUpKillMilestone = 3;

      if (gameplayRoom.pendingMatchSlots.length) {
        const takenRoleIds = new Set();
        const takenVisualColors = new Set();
        const humanSlots = gameplayRoom.pendingMatchSlots.filter((s) => s.clientId && s.kind !== "IA");
        const botSlots = gameplayRoom.pendingMatchSlots.filter((s) => s.kind === "IA");

        humanSlots.forEach((slot) => {
          const role = assignRoleFromSlot({ ...slot, mode: gameplayRoom.matchConfig?.mode }, takenRoleIds);
          if (role) takenRoleIds.add(role.id);
        });

        botSlots.forEach((slot) => {
          const role = assignRoleFromSlot({ ...slot, mode: gameplayRoom.matchConfig?.mode }, takenRoleIds);
          if (!role) return;
          takenRoleIds.add(role.id);
          const botId = `bot-${gameplayRoom.roomId}-${role.id}`;
          const bot = createPlayer(botId, role, {
            isBot: true,
            label: slot.label || role.label,
            aiDifficulty: slot.aiDifficulty || DEFAULT_AI_DIFFICULTY,
            visualColor: slot.color || "#d8b13a",
            usedColors: takenVisualColors,
          });
          takenVisualColors.add(String(bot.visualColor || "").trim().toLowerCase());
          gameplayRoom.players.set(botId, bot);
          ensurePlayerStats(bot, { label: bot.label });
        });
      }
    }

    const takenRoleIds = new Set(Array.from(gameplayRoom.players.values()).map((p) => p.role.id));
    const mySlot = gameplayRoom.pendingMatchSlots.find((s) => s.clientId === clientId) || null;
    const role = assignRoleFromSlot({ ...(mySlot || {}), mode: gameplayRoom.matchConfig?.mode }, takenRoleIds);

    if (!role) {
      ws.send(JSON.stringify({ type: MESSAGE.ERROR, payload: { message: "Sala llena" } }));
      return;
    }

    const takenVisualColors = new Set(
      Array.from(gameplayRoom.players.values())
        .map((player) => String(player?.visualColor || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const player = createPlayer(clientId, role, {
      label: mySlot?.label || role.label,
      visualColor: mySlot?.color || "#d8b13a",
      usedColors: takenVisualColors,
    });
    gameplayRoom.players.set(clientId, player);
    ensurePlayerStats(player, { label: player.label });
    ws.send(JSON.stringify({
      type: MESSAGE.WELCOME,
      payload: {
        playerId: clientId,
        roleLabel: role.label,
        matchConfig: { ...gameplayRoom.matchConfig },
        roundState: {
          currentRound: gameplayRoom.roundState.currentRound,
          totalRounds: gameplayRoom.roundState.totalRounds,
          scores: { ...gameplayRoom.roundState.scores },
          sideSwitchAfterRound: gameplayRoom.matchConfig?.sideSwitchAfterRound ?? Math.max(1, Math.floor(gameplayRoom.roundState.totalRounds / 2)),
        },
      },
    }));
  });
}

function createBulletForPlayer(player) {
  const stats = ensurePlayerStats(player, { label: player.label });
  if (stats) stats.shots += 1;
  const projectileTint = toProjectileColor(hexColorToNumber(player.visualColor, 0xd8b13a));

  const spawnBullet = (perpOffsetPx = 0) => {
    const perpAngle = player.turretAngleRad + Math.PI / 2;
    const ox = Math.cos(perpAngle) * perpOffsetPx;
    const oy = Math.sin(perpAngle) * perpOffsetPx;
    const bullet = createBulletState({
      id: `b-${Math.random().toString(36).slice(2, 10)}`,
      ownerType: player.role.id,
      ownerId: player.id,
      ownerTeam: player.team,
      x: player.x + ox,
      y: player.y + oy,
      angleRad: player.turretAngleRad,
      bulletSpeedOverride: player.bulletSpeed ?? null,
      canDestroyStone: !!player.canDestroyStone,
    });
    bullet.ownerTeam = player.team;
    bullet.tint = projectileTint;
    gameplayRoom.bullets.set(bullet.id, bullet);
    player.activeBulletIds.add(bullet.id);
  };

  if ((player.bulletCount || 1) >= 2) {
    spawnBullet(-DOUBLE_SHOT_SPREAD_PX);
    spawnBullet(+DOUBLE_SHOT_SPREAD_PX);
  } else {
    spawnBullet(0);
  }

  player.lastFireAt = Date.now();
}

function prunePlayerBullets(player) {
  player.activeBulletIds.forEach((bulletId) => {
    if (!gameplayRoom.bullets.has(bulletId)) player.activeBulletIds.delete(bulletId);
  });
}

function handleInput(clientId, payload = {}) {
  const player = gameplayRoom.players.get(clientId);
  if (!player) return;
  player.input = {
    moveX: Number(payload.moveX || 0),
    moveY: Number(payload.moveY || 0),
    aimX: Number(payload.aimX || 0),
    aimY: Number(payload.aimY || 0),
    fire: !!payload.fire,
  };
}

function tryFirePlayer(player) {
  if (!player || player.isDestroyed) return false;
  if (isPlayerFrozen(player)) return false;
  if (gameplayRoom.roundState.matchOver) return false;
  prunePlayerBullets(player);

  const weaponConfig = getWeaponConfigForTankType(player.role.id);
  const cooldownMs = player.fireCooldown ?? weaponConfig.cooldownMs;
  const canFire = player.activeBulletIds.size < MAX_BULLETS_PER_PLAYER && Date.now() - player.lastFireAt >= cooldownMs;
  if (!canFire) return false;
  createBulletForPlayer(player);
  return true;
}

function updateRespawns(now) {
  const classicGameOver = isClassicMatchMode(gameplayRoom.matchConfig) && !!gameplayRoom.classicState?.gameOver;
  gameplayRoom.players.forEach((player) => {
    if (!player || !player.isDestroyed || !player.respawnAt) return;
    if (now < player.respawnAt) return;
    if (classicGameOver) { player.respawnAt = 0; return; }
    resetPlayerForRespawn(player);
  });
}

function updateMissileStrikes(now) {
  gameplayRoom.missileImpactEffects = (gameplayRoom.missileImpactEffects || []).filter((effect) => Number(effect?.expiresAt || 0) > now);
  if (!Array.isArray(gameplayRoom.activeMissileStrikes) || !gameplayRoom.activeMissileStrikes.length) return;
  const remaining = [];
  const stepDist = MISSILE_STRIKE_SPEED * (TICK_MS / 1000);
  gameplayRoom.activeMissileStrikes.forEach((strike) => {
    if (!strike) return;
    const target = gameplayRoom.players.get(strike.targetId) || null;
    if (!target || target.isDestroyed) return;

    const dx = target.x - Number(strike.x || 0);
    const dy = target.y - Number(strike.y || 0);
    const dist = vectorLength(dx, dy);
    strike.angleRad = Math.atan2(dy, dx);

    if (dist <= 24 || now >= Number(strike.hitAt || 0)) {
      strike.x = target.x;
      strike.y = target.y;
      registerMissileImpactEffect(strike, target.x, target.y, now);
      resolveMissileStrike(strike, now);
      return;
    }

    const move = Math.min(stepDist, dist);
    strike.x += (dx / dist) * move;
    strike.y += (dy / dist) * move;
    remaining.push(strike);
  });
  gameplayRoom.activeMissileStrikes = remaining;
}

function tick() {
  const now = Date.now();
  const isClassic = isClassicMatchMode(gameplayRoom.matchConfig);
  let allowInterRoundMovement = false;
  gameplayRoom.chatMessages = (gameplayRoom.chatMessages || []).filter((message) => Number(message?.expiresAt || 0) > now);
  updateOnlinePowerUps(now);
  updateBaseFortressEffects(TICK_MS);
  updateTeamFreezeEffects(TICK_MS);
  updateMissileStrikes(now);
  updateRespawns(now);

  if (isClassic) {
    tickClassicMode(now);
    if (gameplayRoom.classicState?.gameOver) {
      broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
      return;
    }
  } else {
    if (!gameplayRoom.status.winnerTeam && !gameplayRoom.roundState.transitioning && !gameplayRoom.roundState.matchOver) {
      gameplayRoom.status.winnerTeam = getRoundWinnerByTeamElimination(now);
    }
  }

  if (!isClassic && gameplayRoom.roundState.transitioning) {
    const elapsed = now - gameplayRoom.roundState.transitionAt;
    if (elapsed >= Number(gameplayRoom.roundState.transitionDurationMs || ROUND_TRANSITION_MS)) {
      const winner = getMatchWinner();
      if (winner) {
        gameplayRoom.roundState.matchOver = true;
        gameplayRoom.roundState.matchWinner = winner;
        gameplayRoom.roundState.transitioning = false;
        gameplayRoom.roundState.showPartialSummary = false;
      } else {
        startNewRound();
      }
      broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
      return;
    }
    allowInterRoundMovement = true;
  }

  if (!isClassic && gameplayRoom.status.winnerTeam && !gameplayRoom.roundState.transitioning && !gameplayRoom.roundState.matchOver) {
    const colorWinner = colorTeamForGeographicWinner(gameplayRoom.status.winnerTeam, gameplayRoom.roundState.sideSwitched);
    gameplayRoom.roundState.scores[colorWinner] = (gameplayRoom.roundState.scores[colorWinner] || 0) + 1;
    clearRoundFreezeState();

    const matchWinner = getMatchWinner();
    if (matchWinner) {
      gameplayRoom.roundState.matchOver = true;
      gameplayRoom.roundState.matchWinner = matchWinner;
    } else {
      const nextRound = gameplayRoom.roundState.currentRound + 1;
      const nextRoundSideSwitched = nextRound > (gameplayRoom.matchConfig?.sideSwitchAfterRound ?? Math.max(1, Math.floor(gameplayRoom.roundState.totalRounds / 2)));
      const sideSwitchIncoming = nextRoundSideSwitched !== !!gameplayRoom.roundState.sideSwitched;
      gameplayRoom.roundState.transitioning = true;
      gameplayRoom.roundState.transitionAt = now;
      gameplayRoom.roundState.transitionDurationMs = sideSwitchIncoming ? SIDE_SWITCH_PARTIAL_SUMMARY_MS : ROUND_TRANSITION_MS;
      gameplayRoom.roundState.showPartialSummary = sideSwitchIncoming;
    }
    broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
    return;
  }

  if (!isClassic && gameplayRoom.roundState.matchOver) {
    broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
    return;
  }

  // Update bot inputs
  gameplayRoom.players.forEach((player) => {
    if (!player.isBot || player.isDestroyed) return;
    if (isPlayerFrozen(player)) {
      player.input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
      return;
    }
    const now = Date.now();
    const bs = player.botState;
    const profile = player.botProfile || buildBotDifficultyProfile(player.botDifficulty);
    player.botProfile = profile;

    // ── Target selection ──────────────────────────────────────────────────
    const ENEMY_NOTICE_RADIUS = profile.noticeRadius;
    let nearestEnemy = null;
    let nearestEnemyDist = Infinity;

    if (isClassic && gameplayRoom.classicState) {
      // Classic mode: target nearest alive enemy tank
      gameplayRoom.classicState.enemies.forEach((e) => {
        if (e.isDestroyed) return;
        const dist = vectorLength(e.x - player.x, e.y - player.y);
        if (dist < nearestEnemyDist) { nearestEnemyDist = dist; nearestEnemy = e; }
      });
    } else {
      gameplayRoom.players.forEach((other) => {
        if (other === player || other.isDestroyed || other.team === player.team) return;
        const dist = vectorLength(other.x - player.x, other.y - player.y);
        if (dist < nearestEnemyDist) { nearestEnemyDist = dist; nearestEnemy = other; }
      });
    }

    // In classic mode the "enemy base" is the eagle (defend it, not attack it);
    // fall back to the eagle position so the bot patrols near it when no enemies are visible.
    const classicEagle = isClassic ? gameplayRoom.classicState?.eagle : null;
    const enemyBase = isClassic ? null : Array.from(gameplayRoom.bases.values()).find((b) => b.team !== player.team && b.hp > 0);
    const { powerUp: targetPowerUp } = chooseBotPowerUpTarget(player);
    const isCloseCombat = nearestEnemy && nearestEnemyDist < profile.closeCombatRadius;
    const shouldChasePowerUp = !!targetPowerUp && (
      targetPowerUp.type === "shovel"
        ? !isCloseCombat
        : (!nearestEnemy || nearestEnemyDist > profile.powerUpEnemyDistance)
    );
    const isHuntingPlayer = !shouldChasePowerUp && nearestEnemy && nearestEnemyDist < ENEMY_NOTICE_RADIUS;

    // Classic: when nothing to hunt, move toward eagle to protect it
    const fallbackX = classicEagle ? classicEagle.x : (enemyBase?.x ?? player.x);
    const fallbackY = classicEagle ? classicEagle.y : (enemyBase?.y ?? player.y);
    const targetX = shouldChasePowerUp ? targetPowerUp.x : (isHuntingPlayer ? nearestEnemy.x : fallbackX);
    const targetY = shouldChasePowerUp ? targetPowerUp.y : (isHuntingPlayer ? nearestEnemy.y : fallbackY);
    const combatTarget = isHuntingPlayer ? nearestEnemy : (!shouldChasePowerUp && !isClassic ? enemyBase : null);
    const combatTargetDist = combatTarget
      ? vectorLength((combatTarget.x || 0) - player.x, (combatTarget.y || 0) - player.y)
      : Infinity;

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    // Always aim turret at current target, but easier presets leave some error.
    const aimTargetX = combatTarget?.x ?? targetX;
    const aimTargetY = combatTarget?.y ?? targetY;
    const aimAngle = Math.atan2(aimTargetY - player.y, aimTargetX - player.x) + ((Math.random() - 0.5) * 2 * (profile.aimErrorRad || 0));
    player.input.aimX = Math.cos(aimAngle);
    player.input.aimY = Math.sin(aimAngle);

    // ── Stuck detection ──────────────────────────────────────────────────
    if (bs.lastX == null) { bs.lastX = player.x; bs.lastY = player.y; bs.lastProgressAt = now; }
    if (now - bs.lastProgressAt > 350) {
      const moved = vectorLength(player.x - bs.lastX, player.y - bs.lastY);
      bs.stuckTimer = moved < 6 ? (bs.stuckTimer || 0) + (now - bs.lastProgressAt) : 0;
      bs.lastX = player.x; bs.lastY = player.y; bs.lastProgressAt = now;
    }

    const PROBE_DIST = TILE_SIZE * 1.1;

    // ── Unstuck maneuver: kick in when no progress for ~500ms ────────────
    if ((bs.stuckTimer || 0) > profile.stuckThresholdMs) {
      bs.stuckTimer = 0;
      const perp1 = { x: -dy / len, y: dx / len };
      const perp2 = { x: dy / len, y: -dx / len };
      const diag1 = { x: dx / len * 0.5 - dy / len * 0.87, y: dy / len * 0.5 + dx / len * 0.87 };
      const diag2 = { x: dx / len * 0.5 + dy / len * 0.87, y: dy / len * 0.5 - dx / len * 0.87 };
      for (const dir of [perp1, perp2, diag1, diag2, { x: -dx / len, y: -dy / len }]) {
        const dlen = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
        const ndx = dir.x / dlen; const ndy = dir.y / dlen;
        if (canOccupyPlayerPosition(player, player.x + ndx * PROBE_DIST, player.y + ndy * PROBE_DIST)) {
          bs.unstuckDir = { x: ndx, y: ndy };
          bs.unstuckUntil = now + 500 + Math.random() * 400;
          bs.lastDirChangeAt = now;
          break;
        }
      }
    }

    // If an unstuck maneuver is active, use that direction
    if ((bs.unstuckUntil || 0) > now && bs.unstuckDir) {
      player.input.moveX = bs.unstuckDir.x;
      player.input.moveY = bs.unstuckDir.y;
      if (shouldBotFireAtObstacle(player, bs.unstuckDir, PROBE_DIST * 0.95) && Math.random() < 0.88) {
        tryFirePlayer(player);
      } else if (combatTarget && combatTargetDist <= profile.fireRange * 1.08 && Math.random() < Math.min(0.98, profile.fireChance * 0.72)) {
        tryFirePlayer(player);
      }
      return;
    }

    // ── Normal direction update with proactive obstacle avoidance ────────
    if (now - bs.lastDirChangeAt > profile.dirChangeIntervalMs) {
      const jitteredX = targetX + ((Math.random() - 0.5) * profile.movementJitter * TILE_SIZE);
      const jitteredY = targetY + ((Math.random() - 0.5) * profile.movementJitter * TILE_SIZE);
      const navigableDir = chooseNavigableDirection(
        player,
        jitteredX,
        jitteredY,
        PROBE_DIST,
        { x: bs.dirX || 0, y: bs.dirY || 0 },
        { canDestroyStone: !!player.canDestroyStone },
      );

      bs.dirX = navigableDir.x;
      bs.dirY = navigableDir.y;
      bs.lastDirChangeAt = now;
    }

    player.input.moveX = bs.dirX;
    player.input.moveY = bs.dirY;
    if (shouldBotFireAtObstacle(player, { x: bs.dirX, y: bs.dirY }, PROBE_DIST * 0.95) && Math.random() < 0.76) {
      tryFirePlayer(player);
    } else if (combatTarget && combatTargetDist <= profile.fireRange * 1.12 && Math.random() < Math.min(0.985, profile.fireChance * 1.12)) {
      tryFirePlayer(player);
    }
  });

  gameplayRoom.players.forEach((player) => {
    if (player.isDestroyed) return;
    if (isPlayerFrozen(player)) return;
    const control = computeTankControlStep(
      player,
      {
        moveX: player.input.moveX,
        moveY: player.input.moveY,
        aimX: player.input.aimX,
        aimY: player.input.aimY,
      },
      TICK_MS,
      { preserveTurretWhenIdle: true, fallbackTurretToMove: false },
    );

    if (control.hasMove) {
      const { maxX: activeBoardW, maxY: activeBoardH } = getActiveBoardBounds();
      const nextX = clamp(player.x + control.moveDx, MARGIN, activeBoardW - MARGIN);
      const nextY = clamp(player.y + control.moveDy, MARGIN, activeBoardH - MARGIN);
      if (canOccupyPlayerPosition(player, nextX, player.y)) player.x = nextX;
      if (canOccupyPlayerPosition(player, player.x, nextY)) player.y = nextY;
      player.moveAngleDeg = control.nextMoveAngleDeg;
    }

    player.turretAngleRad = control.nextTurretAngleRad;
    prunePlayerBullets(player);
    tryPickupNearbyPowerUp(player);
  });

  const bulletEntries = Array.from(gameplayRoom.bullets.entries());
  const bulletsToDestroy = new Set();
  const queueBulletDestroy = (bulletId) => {
    if (bulletId) bulletsToDestroy.add(bulletId);
  };

  const { maxX: activeBoardW, maxY: activeBoardH } = getActiveBoardBounds();
  bulletEntries.forEach(([bulletId, bullet]) => {
    stepBulletState(bullet, TICK_MS);
    if (isBulletOutsideBoard(bullet, { minX: MARGIN, minY: MARGIN, maxX: activeBoardW - MARGIN, maxY: activeBoardH - MARGIN }, 0)) {
      queueBulletDestroy(bulletId);
      return;
    }
  });

  bulletEntries.forEach(([bulletId, bullet]) => {
    if (!bullet || bulletsToDestroy.has(bulletId)) return;
    const col = worldToGridCol(bullet.x, 0);
    const row = worldToGridRow(bullet.y, 0);
    if (inBoundsForCurrentLevel(col, row)) {
      const obstacle = gameplayRoom.level.obstacles?.[row]?.[col];
      const fortressBaseId = getFortressBaseIdAtCell(col, row);
      const fortressProtected = !!fortressBaseId && gameplayRoom.baseFortressEffects.has(fortressBaseId);
      if (obstacle === TILE.BASE) {
        const baseId = getBaseIdAtCell(col, row);
        const base = baseId ? gameplayRoom.bases.get(baseId) : null;
        if (base && base.hp > 0) {
          base.hp = Math.max(0, base.hp - 1);
          queueBulletDestroy(bulletId);
          if (base.hp <= 0) {
            const owner = gameplayRoom.players.get(bullet.ownerId);
            const ownerStats = ensurePlayerStats(owner, { label: owner?.label });
            if (ownerStats && owner?.team !== base.team) {
              awardEnemyBaseDestroyedStats(ownerStats);
            }
            gameplayRoom.status.winnerTeam = base.team === "south" ? "north" : "south";
          }
          return;
        }
        queueBulletDestroy(bulletId);
        return;
      }
      if (obstacle && obstacle !== TILE.WATER) {
        if (!fortressProtected && (isDestructibleTile(obstacle) || (obstacle === TILE.STEEL && bullet.canDestroyStone))) {
          gameplayRoom.level.obstacles[row][col] = null;
        }
        queueBulletDestroy(bulletId);
        return;
      }
    }
  });

  for (let i = 0; i < bulletEntries.length; i += 1) {
    const [bulletId, bullet] = bulletEntries[i];
    if (!bullet || bulletsToDestroy.has(bulletId)) continue;
    for (let j = i + 1; j < bulletEntries.length; j += 1) {
      const [otherId, otherBullet] = bulletEntries[j];
      if (
        !otherBullet ||
        bulletsToDestroy.has(otherId) ||
        bullet.ownerTeam === otherBullet.ownerTeam
      ) {
        continue;
      }
      const combinedRadius = (bullet.hitRadius || 0) + (otherBullet.hitRadius || 0);
      if (vectorLength(bullet.x - otherBullet.x, bullet.y - otherBullet.y) <= combinedRadius) {
        queueBulletDestroy(bulletId);
        queueBulletDestroy(otherId);
        break;
      }
    }
  }

  bulletEntries.forEach(([bulletId, bullet]) => {
    if (!bullet || bulletsToDestroy.has(bulletId)) return;
    for (const base of gameplayRoom.bases.values()) {
      if (base.hp <= 0) continue;
      if (vectorLength(bullet.x - base.x, bullet.y - base.y) <= (base.radius || 54) + (bullet.hitRadius || 0)) {
        base.hp = Math.max(0, base.hp - 1);
        queueBulletDestroy(bulletId);
        if (base.hp <= 0) {
          const owner = gameplayRoom.players.get(bullet.ownerId);
          const ownerStats = ensurePlayerStats(owner, { label: owner?.label });
          if (ownerStats && owner?.team !== base.team) {
            awardEnemyBaseDestroyedStats(ownerStats);
          }
          gameplayRoom.status.winnerTeam = base.team === "south" ? "north" : "south";
        }
        return;
      }
    }

    for (const player of gameplayRoom.players.values()) {
      if (!player || player.isDestroyed || player.id === bullet.ownerId) continue;
      // In classic mode, player bullets don't hurt allied players — only enemy bullets do
      if (isClassic && gameplayRoom.players.has(bullet.ownerId)) continue;
      if (vectorLength(bullet.x - player.x, bullet.y - player.y) <= TANK_HIT_RADIUS + (bullet.hitRadius || 0)) {
        if (hasActiveShield(player, now)) {
          queueBulletDestroy(bulletId);
          return;
        }
        const owner = gameplayRoom.players.get(bullet.ownerId);
        const ownerStats = ensurePlayerStats(owner, { label: owner?.label });
        const victimStats = ensurePlayerStats(player, { label: player.label });
        const isEnemyKill = !!owner && owner.team !== player.team;
        if (isEnemyKill) awardEnemyKillStats(ownerStats);
        else awardTeamKillStats(ownerStats);
        if (victimStats) victimStats.deaths += 1;
        if (isEnemyKill) registerOnlineKill();
        markPlayerDestroyed(player, now);
        queueBulletDestroy(bulletId);
        return;
      }
    }
  });

  // Classic 80s: player bullets hit enemies, enemy bullets hit eagle
  if (isClassic) resolveClassicBulletCollisions(bulletEntries, bulletsToDestroy);

  bulletsToDestroy.forEach((bulletId) => destroyBullet(bulletId));

  broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
}

wss.on("connection", (ws) => {
  const clientId = `p-${Math.random().toString(36).slice(2, 10)}`;
  const ipAddress = String(
    ws?._socket?.remoteAddress
    || ws?._socket?.socket?.remoteAddress
    || ""
  ).trim() || null;
  clients.set(clientId, {
    ws,
    playerName: "Player1",
    currentLobbyRoomId: null,
    currentMatchRoomId: null,
    lastSeenAt: Date.now(),
    ipAddress,
    browserToken: null,
    reconnectToken: null,
  });

  ws.send(JSON.stringify({ type: MESSAGE.CLIENT_IDENTIFIED, payload: { clientId } }));

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw));
      const client = getClient(clientId);
      if (client) client.lastSeenAt = Date.now();

      switch (message.type) {
        case MESSAGE.CONNECT_LOBBY:
          bindReconnectToken(clientId, message.payload?.reconnectToken);
          if (client && message.payload?.browserToken) client.browserToken = String(message.payload.browserToken).trim() || null;
          if (client && message.payload?.playerName) client.playerName = String(message.payload.playerName).trim() || client.playerName;
          broadcastLobbyList();
          break;
        case MESSAGE.CREATE_ROOM:
          createLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.UPDATE_ROOM:
          updateLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.LIST_ROOMS:
          if (message.payload?.roomId) requestRoomDetail(clientId, message.payload);
          else sendToClient(clientId, MESSAGE.ROOM_LIST, {
            rooms: Array.from(lobbyRooms.values()).map(lobbyRoomToSummary).filter((room) => room.freeSlots > 0),
          });
          break;
        case MESSAGE.JOIN_ROOM:
          joinLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.LEAVE_ROOM:
          removeClientFromLobbyRoom(clientId);
          break;
        case MESSAGE.SET_READY:
          setLobbyReady(clientId, message.payload || {});
          break;
        case MESSAGE.UPDATE_MY_SLOT:
          updateMySlot(clientId, message.payload || {});
          break;
        case MESSAGE.START_MATCH:
          startLobbyMatch(clientId, message.payload || {});
          break;
        case MESSAGE.ROOM_CHAT:
          sendRoomChat(clientId, message.payload || {});
          break;
        case MESSAGE.JOIN:
          handleJoin(clientId, ws, message.payload || {});
          break;
        case MESSAGE.LEAVE:
          leaveGameplay(clientId);
          break;
        case MESSAGE.INPUT: {
          const match = getGameplayRoomForClient(clientId);
          if (match) {
            runInGameplayRoom(match, () => handleInput(clientId, message.payload || {}));
          }
          break;
        }
        case MESSAGE.PLAYER_FIRED: {
          const match = getGameplayRoomForClient(clientId);
          if (match) {
            runInGameplayRoom(match, () => {
              const player = gameplayRoom.players.get(clientId);
              tryFirePlayer(player);
            });
          }
          break;
        }
        case MESSAGE.GAMEPLAY_CHAT: {
          const match = getGameplayRoomForClient(clientId);
          if (match) {
            runInGameplayRoom(match, () => sendGameplayChat(clientId, message.payload || {}));
          }
          break;
        }
        case MESSAGE.PICKUP_POWER_UP: {
          const match = getGameplayRoomForClient(clientId);
          if (match) {
            runInGameplayRoom(match, () => {
              const puId = message.payload?.id;
              const powerUp = gameplayRoom.powerUps.find((pu) => pu.id === puId) || null;
              const player = gameplayRoom.players.get(clientId);
              if (player && powerUp && vectorLength(player.x - powerUp.x, player.y - powerUp.y) <= POWER_UP_PICKUP_RADIUS) {
                consumeOnlinePowerUp(player, powerUp);
              }
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: MESSAGE.ERROR, payload: { message: error.message } }));
    }
  });

  ws.on("close", () => {
    scheduleReconnectCleanup(clientId);
  });
});

setInterval(() => {
  gameplayRooms.forEach((room) => {
    runInGameplayRoom(room, () => tick());
  });
}, TICK_MS);
setInterval(() => {
  const now = Date.now();
  clients.forEach((client, clientId) => {
    if (client.ws.readyState !== 1) return;
    if (now - client.lastSeenAt <= LOBBY_PING_TIMEOUT_MS) return;
    try {
      client.ws.terminate?.();
    } catch {
      // noop
    }
  });
}, LOBBY_SWEEP_MS);

console.log(`[multiplayer] Servidor escuchando en ws://${HOST}:${PORT}`);
console.log(`[multiplayer] La siguiente linea es solo diagnostico de configuracion online, no un error.`);
console.log(`Rondas: ${TOTAL_ROUNDS} | Cambio de lado: ronda ${SIDE_SWITCH_AFTER_ROUND + 1} | HP águila: ${BASE_HP_PER_ROUND}`);

