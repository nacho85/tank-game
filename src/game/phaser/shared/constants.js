export const MACRO_GRID_WIDTH = 13;
export const MACRO_GRID_HEIGHT = 13;
export const MACRO_GRID_SIZE = MACRO_GRID_HEIGHT;
export const TILE_SUBDIVISION = 2;
export const GRID_WIDTH = MACRO_GRID_WIDTH * TILE_SUBDIVISION;
export const GRID_HEIGHT = MACRO_GRID_HEIGHT * TILE_SUBDIVISION;
export const GRID_SIZE = GRID_HEIGHT;
export const SURVIVAL_MACRO_GRID_WIDTH = 23;
export const SURVIVAL_MACRO_GRID_HEIGHT = 13;
export const SURVIVAL_GRID_WIDTH = SURVIVAL_MACRO_GRID_WIDTH * TILE_SUBDIVISION;
export const SURVIVAL_GRID_HEIGHT = SURVIVAL_MACRO_GRID_HEIGHT * TILE_SUBDIVISION;
export const TILE_SIZE = 82 / TILE_SUBDIVISION;
export const MACRO_TILE_SIZE = TILE_SIZE * TILE_SUBDIVISION;
export const OUTER_BORDER_TILES = 1;
export const OUTER_BORDER_SIZE = OUTER_BORDER_TILES * TILE_SIZE;

export const BOARD_WIDTH = (GRID_WIDTH + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
export const BOARD_HEIGHT = (GRID_HEIGHT + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
export const SURVIVAL_BOARD_WIDTH = (SURVIVAL_GRID_WIDTH + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
export const SURVIVAL_BOARD_HEIGHT = (SURVIVAL_GRID_HEIGHT + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
export const HUD_SIDEBAR_WIDTH = 260;
export const HUD_GUTTER = 16;
export const SETTINGS_STORAGE_KEY = "tank-game-settings-v1";
export const PRESETS_STORAGE_KEY = "tank-game-presets-v1";
export const STATS_STORAGE_KEY = "tank-game-runtime-stats-v1";

export const TILE = {
  GROUND: "ground",
  ROAD: "road",
  BUSH: "bush",
  BRICK: "brick",
  STEEL: "steel",
  WATER: "water",
  BASE: "base",
};

export const PLAYER_SPEED = 200;
export const ENEMY_SPEED = 170;
export const BULLET_SPEED = 620;
export const FIRE_COOLDOWN_PLAYER = 170;
export const FIRE_COOLDOWN_ENEMY = 950;
export const MESSAGE_DURATION = 1200;
export const PLAYER_TURRET_MANUAL_TURN_SPEED = (160 * Math.PI) / 180;

export const MOVE_DEADZONE = 0.2;
export const AIM_DEADZONE = 0.22;
export const PLAYER_RESPAWN_DELAY = 2200;
export const MENU_AXIS_THRESHOLD = 0.55;

export const TANK_RENDER_SIZE = MACRO_TILE_SIZE;
export const TANK_COLLISION_SIZE = 58;
export const TANK_HIT_RADIUS = 32;

export const MACRO_EAGLE_COL = Math.floor((MACRO_GRID_WIDTH - 1) / 2);
export const MACRO_EAGLE_ROW = MACRO_GRID_HEIGHT - 1;
export const EAGLE_COL = MACRO_EAGLE_COL * TILE_SUBDIVISION;
export const EAGLE_ROW = MACRO_EAGLE_ROW * TILE_SUBDIVISION;

export const MACRO_PLAYER_SPAWN_COL = MACRO_EAGLE_COL - 2;
export const MACRO_PLAYER_SPAWN_ROW = MACRO_GRID_HEIGHT - 1;
export const PLAYER_SPAWN_COL = MACRO_PLAYER_SPAWN_COL * TILE_SUBDIVISION;
export const PLAYER_SPAWN_ROW = MACRO_PLAYER_SPAWN_ROW * TILE_SUBDIVISION;
export const MACRO_PLAYER_TWO_SPAWN_COL = MACRO_EAGLE_COL + 2;
export const MACRO_PLAYER_TWO_SPAWN_ROW = MACRO_GRID_HEIGHT - 1;
export const PLAYER_TWO_SPAWN_COL = MACRO_PLAYER_TWO_SPAWN_COL * TILE_SUBDIVISION;
export const PLAYER_TWO_SPAWN_ROW = MACRO_PLAYER_TWO_SPAWN_ROW * TILE_SUBDIVISION;

export const PLAYER_BODY_BASE_FACING_DEG = 90;
export const PLAYER_TURRET_BASE_FACING_RAD = Math.PI / 2;
export const PLAYER_BODY_RING_CENTER = { x: 355.0, y: 245.5, w: 712, h: 783 };
export const PLAYER_TURRET_CAP_CENTER = { x: 300.0, y: 300.0, w: 600, h: 1155 };
export const ENEMY_BODY_RING_CENTER = { x: 355.0, y: 245.5, w: 712, h: 783 };
export const ENEMY_TURRET_CAP_CENTER = { x: 239.0, y: 259.5, w: 556, h: 1191 };
export const TANKETTE_BODY_TURRET_ANCHOR = { x: 479.0, y: 489.0, w: 1024, h: 1024 };
export const TANKETTE_TURRET_PIVOT = { x: 118.0, y: 119.0, w: 239, h: 479 };

export const ENEMY_BODY_BASE_FACING_DEG = 90;
export const ENEMY_TURRET_BASE_FACING_RAD = Math.PI / 2;

export const LEVEL_WAVE_CONFIGS = [
  { totalEnemies: 6, maxConcurrent: 3 },
  { totalEnemies: 8, maxConcurrent: 3 },
  { totalEnemies: 10, maxConcurrent: 3 },
  { totalEnemies: 12, maxConcurrent: 3 },
  { totalEnemies: 14, maxConcurrent: 3 },
];

export const PATROL_ZONES = [
  { minCol: 0, maxCol: Math.floor(GRID_WIDTH * 0.3) - 1, minRow: 0, maxRow: Math.floor(GRID_HEIGHT * 0.38) - 1 },
  { minCol: Math.floor(GRID_WIDTH * 0.3), maxCol: Math.floor(GRID_WIDTH * 0.7) - 1, minRow: 0, maxRow: Math.floor(GRID_HEIGHT * 0.38) - 1 },
  { minCol: Math.floor(GRID_WIDTH * 0.7), maxCol: GRID_WIDTH - 1, minRow: 0, maxRow: Math.floor(GRID_HEIGHT * 0.38) - 1 },
  { minCol: 0, maxCol: Math.floor(GRID_WIDTH * 0.28), minRow: Math.floor(GRID_HEIGHT * 0.38), maxRow: Math.floor(GRID_HEIGHT * 0.7) - 1 },
  { minCol: Math.floor(GRID_WIDTH * 0.72), maxCol: GRID_WIDTH - 1, minRow: Math.floor(GRID_HEIGHT * 0.38), maxRow: Math.floor(GRID_HEIGHT * 0.7) - 1 },
  { minCol: Math.floor(GRID_WIDTH * 0.2), maxCol: Math.floor(GRID_WIDTH * 0.8) - 1, minRow: Math.floor(GRID_HEIGHT * 0.7), maxRow: GRID_HEIGHT - 3 },
];

export const SETTINGS_TABS = [
  { key: "mode", label: "Modo" },
  { key: "controls", label: "Controles" },
  { key: "mapGen", label: "Mapa" },
  { key: "combat", label: "Combate" },
  { key: "enemyAi", label: "Enemigos / IA" },
  { key: "meta", label: "Debug" },
  { key: "turret", label: "Torreta" },
  { key: "presets", label: "Presets" },
];

export const SETTINGS_SCHEMA = [
  {
    key: "gameMode",
    label: "Modo de juego",
    category: "mode",
    min: 0,
    max: 3,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "playerOneControlDevice",
    label: "P1: control",
    category: "controls",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "playerTwoControlDevice",
    label: "P2: control",
    category: "controls",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "p1MoveUpKeyCode",
    label: "P1 mover arriba",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 87,
  },
  {
    key: "p1MoveDownKeyCode",
    label: "P1 mover abajo",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 83,
  },
  {
    key: "p1MoveLeftKeyCode",
    label: "P1 mover izquierda",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 65,
  },
  {
    key: "p1MoveRightKeyCode",
    label: "P1 mover derecha",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 68,
  },
  {
    key: "p1AimUpKeyCode",
    label: "P1 apuntar arriba",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 73,
  },
  {
    key: "p1AimDownKeyCode",
    label: "P1 apuntar abajo",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 75,
  },
  {
    key: "p1AimLeftKeyCode",
    label: "P1 apuntar izquierda",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 74,
  },
  {
    key: "p1AimRightKeyCode",
    label: "P1 apuntar derecha",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 76,
  },
  {
    key: "p1FireKeyCode",
    label: "P1 disparar",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 32,
  },
  {
    key: "p1ChatKeyCode",
    label: "P1 chat online",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 13,
  },
  {
    key: "p2MoveUpKeyCode",
    label: "P2 mover arriba",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 38,
  },
  {
    key: "p2MoveDownKeyCode",
    label: "P2 mover abajo",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 40,
  },
  {
    key: "p2MoveLeftKeyCode",
    label: "P2 mover izquierda",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 37,
  },
  {
    key: "p2MoveRightKeyCode",
    label: "P2 mover derecha",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 39,
  },
  {
    key: "p2AimUpKeyCode",
    label: "P2 apuntar arriba",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 104,
  },
  {
    key: "p2AimDownKeyCode",
    label: "P2 apuntar abajo",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 101,
  },
  {
    key: "p2AimLeftKeyCode",
    label: "P2 apuntar izquierda",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 100,
  },
  {
    key: "p2AimRightKeyCode",
    label: "P2 apuntar derecha",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 102,
  },
  {
    key: "p2FireKeyCode",
    label: "P2 disparar",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 96,
  },
  {
    key: "p2JoinKeyCode",
    label: "P2 unirse",
    category: "bindings",
    min: 0,
    max: 255,
    step: 1,
    defaultValue: 80,
  },
  {
    key: "survivalInitialLives",
    label: "Survival: vidas iniciales",
    category: "mode",
    min: 1,
    max: 9,
    step: 1,
    defaultValue: 3,
  },
  {
    key: "survivalFortressRegenEvery",
    label: "Survival: regenerar fortaleza cada N bajas",
    category: "mode",
    min: 5,
    max: 40,
    step: 1,
    defaultValue: 10,
  },
  {
    key: "survivalMaxConcurrentEnemies",
    label: "Survival: enemigos simultáneos",
    category: "mode",
    min: 2,
    max: 8,
    step: 1,
    defaultValue: 4,
  },
  {
    key: "survivalShuffleEveryKills",
    label: "Survival: reshuffle cada N bajas",
    category: "mapGen",
    min: 10,
    max: 120,
    step: 5,
    defaultValue: 20,
  },
  {
    key: "survivalMapAlgorithm",
    label: "Algoritmo de mapa",
    category: "mapGen",
    min: 0,
    max: 3,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "survivalRoadDensity",
    label: "Densidad de caminos",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 28,
  },
  {
    key: "survivalBrickDensity",
    label: "Densidad de ladrillos",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 34,
  },
  {
    key: "survivalBushDensity",
    label: "Densidad de bushes",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 20,
  },
  {
    key: "survivalBushClustering",
    label: "Agrupación orgánica de bushes",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 64,
  },
  {
    key: "survivalBushPatchScale",
    label: "Tamaño de manchones de bushes",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 52,
  },
  {
    key: "survivalSteelDensity",
    label: "Densidad de steel",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 8,
  },
  {
    key: "survivalWaterDensity",
    label: "Densidad de agua",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 6,
  },
  {
    key: "survivalWaterClustering",
    label: "Agua agrupada en lagos/ríos",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 72,
  },
  {
    key: "survivalWaterBridgeChance",
    label: "Puentes de tierra sobre agua",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 38,
  },
  {
    key: "survivalBuildingClustering",
    label: "Agrupación ladrillo/steel en edificios",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 76,
  },
  {
    key: "survivalBuildingComplexity",
    label: "Complejidad de edificios",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 58,
  },
  {
    key: "survivalShuffleVariability",
    label: "Variabilidad entre reshuffles",
    category: "mapGen",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 48,
  },
  {
    key: "playerBulletLimit",
    label: "Balas jugador simultáneas",
    category: "combat",
    min: 1,
    max: 6,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "enemyBulletLimit",
    label: "Balas enemigas simultáneas",
    category: "combat",
    min: 1,
    max: 6,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "playerContinuousFire",
    label: "Disparo continuo jugador",
    category: "combat",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "playerBulletWidth",
    label: "Ancho bala jugador",
    category: "combat",
    min: 8,
    max: 28,
    step: 1,
    defaultValue: 14,
  },
  {
    key: "playerBulletLength",
    label: "Largo bala jugador",
    category: "combat",
    min: 16,
    max: 56,
    step: 1,
    defaultValue: 36,
  },
  {
    key: "playerBulletHitbox",
    label: "Hitbox bala jugador",
    category: "combat",
    min: 4,
    max: 28,
    step: 1,
    defaultValue: 10,
  },
  {
    key: "playerBulletSpeed",
    label: "Velocidad bala jugador",
    category: "combat",
    min: 220,
    max: 1200,
    step: 10,
    defaultValue: 620,
  },
  {
    key: "enemyBulletWidth",
    label: "Ancho bala enemiga",
    category: "combat",
    min: 8,
    max: 28,
    step: 1,
    defaultValue: 14,
  },
  {
    key: "enemyBulletLength",
    label: "Largo bala enemiga",
    category: "combat",
    min: 16,
    max: 56,
    step: 1,
    defaultValue: 36,
  },
  {
    key: "enemyBulletHitbox",
    label: "Hitbox bala enemiga",
    category: "combat",
    min: 4,
    max: 28,
    step: 1,
    defaultValue: 10,
  },
  {
    key: "enemyBulletSpeed",
    label: "Velocidad bala enemiga",
    category: "combat",
    min: 220,
    max: 1200,
    step: 10,
    defaultValue: 620,
  },
  {
    key: "enemySpawnDelayMs",
    label: "Delay respawn enemigo (ms)",
    category: "combat",
    min: 0,
    max: 5000,
    step: 100,
    defaultValue: 700,
  },
  {
    key: "enemyTankCollision",
    label: "Choque físico entre enemigos",
    category: "combat",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "playerLives",
    label: "Vidas del jugador",
    category: "combat",
    min: 1,
    max: 9,
    step: 1,
    defaultValue: 3,
  },
  {
    key: "enemyBehaviorPreset",
    label: "Perfil táctico",
    category: "enemyAi",
    min: 0,
    max: 4,
    step: 1,
    defaultValue: 3,
  },
  {
    key: "enemyAggression",
    label: "Presión ofensiva",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 62,
  },
  {
    key: "enemyNavigationSkill",
    label: "Calidad de navegación",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 70,
  },
  {
    key: "enemyBreakBricks",
    label: "Uso de ladrillos rompibles",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 58,
  },
  {
    key: "enemyRecoverySkill",
    label: "Recuperación al atasco",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 72,
  },
  {
    key: "enemyFireDiscipline",
    label: "Disciplina de tiro",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 66,
  },
  {
    key: "enemyShotFrequency",
    label: "Frecuencia de disparo",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 58,
  },
  {
    key: "bossBurstIntervalMs",
    label: "Boss · intervalo entre tiros",
    category: "enemyAi",
    min: 60,
    max: 360,
    step: 10,
    defaultValue: 150,
  },
  {
    key: "bossBurstCooldownMs",
    label: "Boss · pausa entre ráfagas",
    category: "enemyAi",
    min: 800,
    max: 5000,
    step: 100,
    defaultValue: 2400,
  },
  {
    key: "enemyTurretTurnSpeed",
    label: "Velocidad giro torreta enemiga",
    category: "enemyAi",
    min: 20,
    max: 240,
    step: 5,
    defaultValue: 110,
  },
  {
    key: "enemyTanketteRatio",
    label: "Proporción de tanquetas",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 18,
  },
  {
    key: "enemyTanketteSpeed",
    label: "Velocidad de tanquetas",
    category: "enemyAi",
    min: 120,
    max: 260,
    step: 5,
    defaultValue: 250,
  },
  {
    key: "debugEnemyNavOverlay",
    label: "Mostrar rutas IA",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "debugSpawnReserveOverlay",
    label: "Mostrar reservas de spawn",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "debugEnemyStateText",
    label: "Mostrar estado IA",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "debugEnemyTargetOverlay",
    label: "Mostrar objetivo actual",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "debugEnemyPathOptions",
    label: "Mostrar caminos evaluados",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "debugEnemyVerboseHud",
    label: "HUD IA detallado",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "autoEvaluateEnemyRoutes",
    label: "Registrar atascos y repaths",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "autoCorrectEnemyRoutes",
    label: "Autocorregir rutas",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 1,
  },
  {
    key: "autoTestEnemyRoutes",
    label: "Autotest / métricas continuas",
    category: "meta",
    min: 0,
    max: 1,
    step: 1,
    defaultValue: 0,
  },
  {
    key: "playerTurretUpExtraOffsetX",
    label: "Torreta arriba: offset X",
    category: "turret",
    min: -10,
    max: 10,
    step: 1,
    defaultValue: 2,
  },
  {
    key: "playerTurretUpExtraOffsetY",
    label: "Torreta arriba: offset atrás",
    category: "turret",
    min: 0,
    max: 24,
    step: 1,
    defaultValue: 12,
  },
];
