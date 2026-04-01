import * as Phaser from "phaser";

// El mapa lógico original sigue siendo 13x13, pero cada tile macro se
// subdivide en 2x2 para obtener una grilla fina sin cambiar el tamaño total
// del tablero en pantalla.
const MACRO_GRID_SIZE = 13;
const TILE_SUBDIVISION = 2;
const GRID_SIZE = MACRO_GRID_SIZE * TILE_SUBDIVISION;
const TILE_SIZE = 82 / TILE_SUBDIVISION;
const MACRO_TILE_SIZE = TILE_SIZE * TILE_SUBDIVISION;

const BOARD_WIDTH = GRID_SIZE * TILE_SIZE;
const BOARD_HEIGHT = GRID_SIZE * TILE_SIZE;
const SETTINGS_STORAGE_KEY = "tank-game-settings-v1";
const PRESETS_STORAGE_KEY = "tank-game-presets-v1";

const TILE = {
  GROUND: "ground",
  ROAD: "road",
  BUSH: "bush",
  BRICK: "brick",
  STEEL: "steel",
  WATER: "water",
  BASE: "base",
};

const PLAYER_SPEED = 235;
const ENEMY_SPEED = 130;
const BULLET_SPEED = 620;
const FIRE_COOLDOWN_PLAYER = 170;
const FIRE_COOLDOWN_ENEMY = 950;
const MESSAGE_DURATION = 1200;
const PLAYER_TURRET_MANUAL_TURN_SPEED = Phaser.Math.DegToRad(160);

const MOVE_DEADZONE = 0.2;
const AIM_DEADZONE = 0.22;
const PLAYER_RESPAWN_DELAY = 2200;
const MENU_AXIS_THRESHOLD = 0.55;

const TANK_RENDER_SIZE = MACRO_TILE_SIZE;
const TANK_COLLISION_SIZE = 58;
const TANK_HIT_RADIUS = 32;

const MACRO_EAGLE_COL = 6;
const MACRO_EAGLE_ROW = 12;
const EAGLE_COL = MACRO_EAGLE_COL * TILE_SUBDIVISION;
const EAGLE_ROW = MACRO_EAGLE_ROW * TILE_SUBDIVISION;

const MACRO_PLAYER_SPAWN_COL = 4;
const MACRO_PLAYER_SPAWN_ROW = 12;
const PLAYER_SPAWN_COL = MACRO_PLAYER_SPAWN_COL * TILE_SUBDIVISION;
const PLAYER_SPAWN_ROW = MACRO_PLAYER_SPAWN_ROW * TILE_SUBDIVISION;

const PLAYER_BODY_BASE_FACING_DEG = 90;
const PLAYER_TURRET_BASE_FACING_RAD = Math.PI / 2;
const PLAYER_BODY_RING_CENTER = { x: 355.0, y: 245.5, w: 712, h: 783 };
const PLAYER_TURRET_CAP_CENTER = { x: 239.0, y: 259.5, w: 556, h: 1191 };
const ENEMY_BODY_RING_CENTER = { x: 355.0, y: 245.5, w: 712, h: 783 };
const ENEMY_TURRET_CAP_CENTER = { x: 239.0, y: 259.5, w: 556, h: 1191 };

const ENEMY_BODY_BASE_FACING_DEG = 90;
const ENEMY_TURRET_BASE_FACING_RAD = Math.PI / 2;

const LEVEL_WAVE_CONFIGS = [
  { totalEnemies: 6, maxConcurrent: 3 },
  { totalEnemies: 8, maxConcurrent: 3 },
  { totalEnemies: 10, maxConcurrent: 3 },
  { totalEnemies: 12, maxConcurrent: 3 },
  { totalEnemies: 14, maxConcurrent: 3 },
];

const PATROL_ZONES = [
  { minCol: 0, maxCol: 7, minRow: 0, maxRow: 9 },
  { minCol: 8, maxCol: 17, minRow: 0, maxRow: 9 },
  { minCol: 18, maxCol: 25, minRow: 0, maxRow: 9 },
  { minCol: 0, maxCol: 9, minRow: 10, maxRow: 17 },
  { minCol: 16, maxCol: 25, minRow: 10, maxRow: 17 },
  { minCol: 4, maxCol: 21, minRow: 18, maxRow: 23 },
];

const SETTINGS_TABS = [
  { key: "combat", label: "Combate" },
  { key: "player", label: "Jugador" },
  { key: "enemyAi", label: "IA enemiga" },
  { key: "turret", label: "Torreta" },
  { key: "presets", label: "Presets" },
];

const SETTINGS_SCHEMA = [
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
    key: "playerBulletSize",
    label: "Tamaño bala jugador",
    category: "combat",
    min: 4,
    max: 14,
    step: 1,
    defaultValue: 6,
  },
  {
    key: "playerBulletHitbox",
    label: "Hitbox bala jugador",
    category: "combat",
    min: 4,
    max: 20,
    step: 1,
    defaultValue: 8,
  },
  {
    key: "enemyBulletSize",
    label: "Tamaño bala enemiga",
    category: "combat",
    min: 4,
    max: 14,
    step: 1,
    defaultValue: 6,
  },
  {
    key: "enemyBulletHitbox",
    label: "Hitbox bala enemiga",
    category: "combat",
    min: 4,
    max: 20,
    step: 1,
    defaultValue: 8,
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
    category: "player",
    min: 1,
    max: 9,
    step: 1,
    defaultValue: 3,
  },
  {
    key: "enemyBasePressure",
    label: "Presión hacia la base",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 72,
  },
  {
    key: "enemyFlankBias",
    label: "Rodeo / flanqueo",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 62,
  },
  {
    key: "enemyPlayerAggro",
    label: "Desvío hacia el jugador",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 38,
  },
  {
    key: "enemyWander",
    label: "Azar / deambular",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 24,
  },
  {
    key: "enemyAimPlayerBias",
    label: "Prioridad de apuntado al jugador",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 58,
  },
  {
    key: "enemyObjectiveFireBias",
    label: "Ganas de disparar a fortaleza/base",
    category: "enemyAi",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 72,
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
function sanitizePresetName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 28);
}

function makeMatrix(fillValue = null) {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => fillValue)
  );
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function makeMacroMatrix(fillValue = null) {
  return Array.from({ length: MACRO_GRID_SIZE }, () =>
    Array.from({ length: MACRO_GRID_SIZE }, () => fillValue)
  );
}

function upscaleMacroMatrix(matrix) {
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

function expandLevelFromMacro({ floor, overlay, obstacles }) {
  const fineFloor = upscaleMacroMatrix(floor);
  const fineOverlay = upscaleMacroMatrix(overlay);
  const fineObstacles = upscaleMacroMatrix(obstacles);

  fineObstacles[EAGLE_ROW][EAGLE_COL] = TILE.BASE;
  fineObstacles[EAGLE_ROW][EAGLE_COL + 1] = TILE.BASE;
  fineObstacles[EAGLE_ROW + 1][EAGLE_COL] = TILE.BASE;
  fineObstacles[EAGLE_ROW + 1][EAGLE_COL + 1] = TILE.BASE;

  return { floor: fineFloor, overlay: fineOverlay, obstacles: fineObstacles };
}

function bigCellCenterX(col, originX) {
  return originX + col * TILE_SIZE + MACRO_TILE_SIZE / 2;
}

function bigCellCenterY(row, originY) {
  return originY + row * TILE_SIZE + MACRO_TILE_SIZE / 2;
}

function isBaseAnchorCell(level, col, row) {
  return (
    level?.obstacles?.[row]?.[col] === TILE.BASE &&
    (col === 0 || level?.obstacles?.[row]?.[col - 1] !== TILE.BASE) &&
    (row === 0 || level?.obstacles?.[row - 1]?.[col] !== TILE.BASE)
  );
}

function cellCenterX(col, originX) {
  return originX + col * TILE_SIZE + TILE_SIZE / 2;
}

function cellCenterY(row, originY) {
  return originY + row * TILE_SIZE + TILE_SIZE / 2;
}

function inBounds(col, row) {
  return col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE;
}

function isBlockingTile(tile) {
  return (
    tile === TILE.BRICK ||
    tile === TILE.STEEL ||
    tile === TILE.WATER ||
    tile === TILE.BASE
  );
}

function isDestructibleTile(tile) {
  return tile === TILE.BRICK;
}

function vectorLength(x, y) {
  return Math.sqrt(x * x + y * y);
}

function normalizeVector(x, y) {
  const len = vectorLength(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function angleDegFromVector(x, y) {
  return Phaser.Math.RadToDeg(Math.atan2(y, x));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapRadDiff(target, current) {
  return Phaser.Math.Angle.Wrap(target - current);
}

function createBaseMacroLevel() {
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

function createBaseLevel() {
  return expandLevelFromMacro(createBaseMacroLevel());
}

function withPattern(macroLevel, fn) {
  const floor = cloneMatrix(macroLevel.floor);
  const overlay = cloneMatrix(macroLevel.overlay);
  const obstacles = cloneMatrix(macroLevel.obstacles);

  fn({ floor, overlay, obstacles });

  obstacles[MACRO_EAGLE_ROW][MACRO_EAGLE_COL] = TILE.BASE;
  obstacles[MACRO_PLAYER_SPAWN_ROW][MACRO_PLAYER_SPAWN_COL] = null;

  return expandLevelFromMacro({ floor, overlay, obstacles });
}

const BASE_MACRO_LEVEL = createBaseMacroLevel();

const LEVELS = [
  expandLevelFromMacro(BASE_MACRO_LEVEL),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles, overlay }) => {
    for (let row = 2; row <= 9; row += 1) {
      obstacles[row][3] = row % 2 === 0 ? TILE.BRICK : TILE.STEEL;
      obstacles[row][9] = row % 2 === 0 ? TILE.BRICK : TILE.STEEL;
    }
    overlay[5][6] = TILE.BUSH;
    overlay[6][6] = TILE.BUSH;
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles }) => {
    for (let col = 2; col <= 10; col += 1) {
      if (col !== 6) {
        obstacles[4][col] = TILE.WATER;
        obstacles[8][col] = TILE.BRICK;
      }
    }
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles, overlay }) => {
    for (let i = 1; i < 12; i += 1) {
      if (i !== 6) {
        obstacles[i][i] = i % 3 === 0 ? TILE.STEEL : TILE.BRICK;
      }
    }
    overlay[3][8] = TILE.BUSH;
    overlay[4][8] = TILE.BUSH;
    overlay[8][3] = TILE.BUSH;
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles }) => {
    for (let row = 2; row <= 10; row += 1) {
      obstacles[row][5] = row % 2 === 0 ? TILE.WATER : TILE.BRICK;
      obstacles[row][7] = row % 2 === 0 ? TILE.WATER : TILE.BRICK;
    }
  }),
];

export class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  preload() {
    this.load.image("tile-ground", "/tank-game/tile-ground.png");
    this.load.image("tile-road", "/tank-game/tile-road.png");
    this.load.image("tile-brick", "/tank-game/tile-brick.png");
    this.load.image("tile-steel", "/tank-game/tile-steel.png");
    this.load.image("tile-water", "/tank-game/tile-water.png");
    this.load.image("tile-bush", "/tank-game/tile-bush.png");

    this.load.image("player-body-yellow-v2", "/tank-game/player-body-yellow-V2.png");
    this.load.image("player-turret-yellow-v2", "/tank-game/player-turret-yellow-V2.png");

    this.load.image("enemy-body-gray-v2", "/tank-game/enemy-body-gray-V2.png");
    this.load.image("enemy-turret-gray-v2", "/tank-game/enemy-turret-gray-V2.png");

    this.load.image("eagle", "/tank-game/eagle.png");
    this.load.image("tank-explosion", "/tank-game/explosion.png");
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.settings = this.loadSettings();
    this.presets = this.loadPresets();
    this.selectedPresetName = this.getFirstPresetName();
    this.presetPage = 0;
    this.wasMenuPressed = false;
    this.isMenuOpen = false;
    this.activeSettingsTab = "combat";

    this.boardOriginX = Math.floor((width - BOARD_WIDTH) / 2);
    this.boardOriginY = Math.floor((height - BOARD_HEIGHT) / 2);

    this.cameras.main.setBackgroundColor("#111111");

    this.currentLevelIndex = 0;
    this.isTransitioning = false;
    this.isGameOver = false;
    this.isPlayerRespawning = false;
    this.playerRespawnEvent = null;
    this.playerLivesRemaining = Math.max(1, Math.round(this.settings.playerLives || 3));
    this.bullets = [];
    this.wasPlayerFireDown = false;
    this.enemies = [];

    this.spawnPoints = [
      { col: 0, row: 0 },
      { col: 6, row: 0 },
      { col: 12, row: 0 },
    ];

    this.floorLayer = this.add.layer();
    this.obstacleLayer = this.add.layer();
    this.entityLayer = this.add.layer();
    this.overlayLayer = this.add.layer();

    this.messageText = this.add
      .text(width / 2, 28, "", {
        fontFamily: "Arial",
        fontSize: "28px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setVisible(false);

    this.levelText = this.add
      .text(18, 18, "", {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#ffffff",
      })
      .setDepth(1000);

    this.waveText = this.add
      .text(18, 48, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setDepth(1000);

    this.livesText = this.add
      .text(18, 76, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffd166",
      })
      .setDepth(1000);

    this.padStatusText = this.add
      .text(18, 104, "Gamepad: esperando...", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#9ad1ff",
      })
      .setDepth(1000);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });

    if (this.input.gamepad) {
      this.input.gamepad.start();
    }

    this.createSettingsMenu();
    this.loadLevel(this.currentLevelIndex);
  }

  loadSettings() {
    const defaults = {};
    SETTINGS_SCHEMA.forEach((item) => {
      defaults[item.key] = item.defaultValue;
    });

    if (typeof window === "undefined") {
      return defaults;
    }

    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const merged = { ...defaults };

      SETTINGS_SCHEMA.forEach((item) => {
        const rawValue = Number(parsed?.[item.key]);
        if (!Number.isNaN(rawValue)) {
          merged[item.key] = this.quantizeSetting(rawValue, item);
        }
      });

      return merged;
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
  }

  loadPresets() {
    if (typeof window === "undefined") return {};

    try {
      const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const presets = {};

      Object.entries(parsed || {}).forEach(([rawName, rawSettings]) => {
        const name = sanitizePresetName(rawName);
        if (!name || typeof rawSettings !== "object" || !rawSettings) return;

        const snapshot = this.normalizeSettingsSnapshot(rawSettings);
        presets[name] = snapshot;
      });

      return presets;
    } catch {
      return {};
    }
  }

  savePresets() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(this.presets || {}));
  }

  getSettingsSnapshot() {
    const snapshot = {};
    SETTINGS_SCHEMA.forEach((item) => {
      snapshot[item.key] = this.quantizeSetting(this.settings[item.key], item);
    });
    return snapshot;
  }

  normalizeSettingsSnapshot(rawSettings) {
    const snapshot = {};
    SETTINGS_SCHEMA.forEach((item) => {
      const rawValue = Number(rawSettings?.[item.key]);
      snapshot[item.key] = Number.isNaN(rawValue)
        ? item.defaultValue
        : this.quantizeSetting(rawValue, item);
    });
    return snapshot;
  }

  applySettingsSnapshot(snapshot) {
    this.settings = this.normalizeSettingsSnapshot(snapshot);
    this.saveSettings();
    this.sliderControls?.forEach((control) => this.refreshSlider(control));
    SETTINGS_SCHEMA.forEach((item) => this.applySettingsAfterChange(item.key));
  }

  getPresetNames() {
    return Object.keys(this.presets || {}).sort((a, b) => a.localeCompare(b));
  }

  getFirstPresetName() {
    const names = this.getPresetNames();
    return names[0] || null;
  }

  savePresetFlow() {
    const suggested = this.selectedPresetName || "Preset 1";
    const rawName = typeof window !== "undefined"
      ? window.prompt("Nombre del preset", suggested)
      : suggested;
    const name = sanitizePresetName(rawName);
    if (!name) return;

    this.presets[name] = this.getSettingsSnapshot();
    this.selectedPresetName = name;
    this.presetPage = Math.floor(Math.max(0, this.getPresetNames().indexOf(name)) / 6);
    this.savePresets();
    this.refreshPresetSection();
  }

  loadSelectedPreset() {
    if (!this.selectedPresetName || !this.presets?.[this.selectedPresetName]) return;
    this.applySettingsSnapshot(this.presets[this.selectedPresetName]);
    this.refreshPresetSection();
  }

  deleteSelectedPreset() {
    const name = this.selectedPresetName;
    if (!name || !this.presets?.[name]) return;

    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Borrar preset "${name}"?`);
    if (!confirmed) return;

    delete this.presets[name];
    this.selectedPresetName = this.getFirstPresetName();
    this.savePresets();
    this.refreshPresetSection();
  }

  /**
   * Activa o esconde todo el bloque visual de presets.
   *
   * Centralizar esto evita que algún elemento de la pestaña de presets quede
   * visible por error cuando el menú abre en otra categoría.
   */
  setPresetSectionVisible(isVisible) {
    this.isPresetSectionVisible = isVisible;
    this.presetSectionObjects?.forEach((obj) => obj.setVisible(isVisible));

    if (this.presetRowControls) {
      this.refreshPresetSection();
    }
  }

  quantizeSetting(value, schema) {
    const stepped = Math.round((value - schema.min) / schema.step) * schema.step + schema.min;
    return clamp(stepped, schema.min, schema.max);
  }

  /**
   * Construye el menú de pausa/configuración completo.
   *
   * El menú vive dentro de un Container de Phaser para poder mostrar/ocultar
   * todo junto. Cada pestaña reutiliza el mismo panel lateral y sólo deja
   * visibles los controles que correspondan a la categoría activa.
   */
  createSettingsMenu() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.settingsBackdrop = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.62)
      .setOrigin(0)
      .setDepth(3000)
      .setVisible(false)
      .setInteractive();

    this.settingsPanel = this.add.container(0, 0).setDepth(3001).setVisible(false);

    const panelWidth = Math.min(860, width - 60);
    const panelHeight = Math.min(742, height - 40);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.floor((height - panelHeight) / 2);

    const panelBg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x10161d, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0x3b4b5d, 1);
    const title = this.add.text(panelX + 24, panelY + 18, "Configuración", {
      fontFamily: "Arial",
      fontSize: "28px",
      color: "#ffffff",
    });
    const help = this.add.text(
      panelX + 24,
      panelY + 54,
      "ESC o START abre/cierra. Cambios aplican al instante y quedan guardados.",
      {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#a7c7e7",
      }
    );

    this.settingsPanel.add([panelBg, title, help]);
    this.tabButtons = [];
    const tabsY = panelY + 92;
    let currentTabX = panelX + 24;

    SETTINGS_TABS.forEach((tab) => {
      const widthForTab = tab.key === "enemyAi" ? 128 : 110;
      const button = this.createMenuButton(
        currentTabX,
        tabsY,
        widthForTab,
        34,
        tab.label,
        () => this.setActiveSettingsTab(tab.key)
      );
      button.tabKey = tab.key;
      this.tabButtons.push(button);
      this.settingsPanel.add(button.objects);
      currentTabX += widthForTab + 10;
    });

    this.tabHintText = this.add.text(panelX + 24, panelY + 140, "", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#93a4b4",
    });
    this.settingsPanel.add(this.tabHintText);

    this.sectionBg = this.add.rectangle(panelX + 24, panelY + 170, panelWidth - 48, panelHeight - 224, 0x0b1117, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x52657b, 1);
    this.settingsPanel.add(this.sectionBg);

    this.sliderControls = [];
    SETTINGS_SCHEMA.forEach((schema) => {
      const label = this.add.text(0, 0, schema.label, {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#f3f4f6",
      });
      const track = this.add.rectangle(0, 0, 280, 8, 0x26313d, 1)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      const fill = this.add.rectangle(0, 0, 0, 8, 0xf59e0b, 1).setOrigin(0, 0.5);
      const handle = this.add.circle(0, 0, 10, 0xffd166, 1)
        .setStrokeStyle(2, 0x111111, 1)
        .setInteractive({ draggable: true, useHandCursor: true });
      const valueBox = this.add.rectangle(0, 0, 62, 30, 0x0b1117, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x52657b, 1);
      const valueText = this.add.text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffffff",
      }).setOrigin(0.5);
      const control = { schema, category: schema.category, label, track, fill, handle, valueBox, valueText, trackX: 0, trackWidth: 280 };
      this.sliderControls.push(control);
      this.settingsPanel.add([label, track, fill, handle, valueBox, valueText]);

      track.on("pointerdown", (pointer) => {
        if (!this.isMenuOpen || this.activeSettingsTab !== schema.category) return;
        this.setSliderValueFromPointer(control, pointer.worldX);
      });

      handle.on("drag", (pointer, dragX) => {
        if (!this.isMenuOpen || this.activeSettingsTab !== schema.category) return;
        this.setSliderValueFromPointer(control, dragX);
      });

      this.refreshSlider(control);
    });

    this.presetSectionObjects = [];
    const sectionTop = this.sectionBg.y;
    const sectionLeft = this.sectionBg.x;
    const sectionWidth = this.sectionBg.width;
    const presetTitle = this.add.text(sectionLeft + 16, sectionTop + 18, "Presets persistentes", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
    });
    const presetHelp = this.add.text(sectionLeft + 16, sectionTop + 50, "Guardar, cargar o borrar configuraciones para reutilizarlas cuando quieras.", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#a7c7e7",
    });
    this.settingsPanel.add([presetTitle, presetHelp]);
    this.presetSectionObjects.push(presetTitle, presetHelp);

    this.presetNameText = this.add.text(sectionLeft + 16, sectionTop + 88, "Preset seleccionado: -", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#f8fafc",
    });
    this.settingsPanel.add(this.presetNameText);
    this.presetSectionObjects.push(this.presetNameText);

    this.presetButtons = [];
    const buttonY = sectionTop + 124;
    const buttons = [
      { label: "Guardar actual", x: sectionLeft + 16, width: 180, action: () => this.savePresetFlow() },
      { label: "Cargar seleccionado", x: sectionLeft + 212, width: 200, action: () => this.loadSelectedPreset() },
      { label: "Borrar seleccionado", x: sectionLeft + 428, width: 190, action: () => this.deleteSelectedPreset() },
    ];

    buttons.forEach((buttonConfig) => {
      const button = this.createMenuButton(buttonConfig.x, buttonY, buttonConfig.width, 38, buttonConfig.label, buttonConfig.action);
      this.settingsPanel.add(button.objects);
      this.presetButtons.push(button);
      this.presetSectionObjects.push(...button.objects);
    });

    this.presetListBg = this.add.rectangle(sectionLeft + 16, buttonY + 56, sectionWidth - 32, 216, 0x14202b, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x52657b, 1);
    this.settingsPanel.add(this.presetListBg);
    this.presetSectionObjects.push(this.presetListBg);

    this.presetPageText = this.add.text(sectionLeft + sectionWidth - 220, buttonY + 20, "", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#a7c7e7",
    });
    this.settingsPanel.add(this.presetPageText);
    this.presetSectionObjects.push(this.presetPageText);

    const prevPageButton = this.createMenuButton(sectionLeft + sectionWidth - 196, buttonY + 12, 72, 30, "< Prev", () => {
      const maxPage = Math.max(0, Math.ceil(this.getPresetNames().length / 6) - 1);
      this.presetPage = Math.max(0, Math.min(maxPage, this.presetPage - 1));
      this.refreshPresetSection();
    });
    const nextPageButton = this.createMenuButton(sectionLeft + sectionWidth - 114, buttonY + 12, 72, 30, "Next >", () => {
      const maxPage = Math.max(0, Math.ceil(this.getPresetNames().length / 6) - 1);
      this.presetPage = Math.max(0, Math.min(maxPage, this.presetPage + 1));
      this.refreshPresetSection();
    });
    this.prevPresetPageButton = prevPageButton;
    this.nextPresetPageButton = nextPageButton;
    this.settingsPanel.add(prevPageButton.objects);
    this.settingsPanel.add(nextPageButton.objects);
    this.presetSectionObjects.push(...prevPageButton.objects, ...nextPageButton.objects);

    this.presetRowControls = [];
    for (let i = 0; i < 6; i += 1) {
      const rowTop = buttonY + 68 + i * 30;
      const rowBg = this.add.rectangle(sectionLeft + 28, rowTop, sectionWidth - 56, 24, 0x14202b, i % 2 === 0 ? 0.55 : 0.32)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const rowText = this.add.text(sectionLeft + 40, rowTop + 12, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#dbe4ee",
      }).setOrigin(0, 0.5);
      rowBg.on("pointerdown", () => {
        if (!this.isMenuOpen) return;
        const names = this.getPresetNames();
        const startIndex = this.presetPage * 6;
        const name = names[startIndex + i];
        if (!name) return;
        this.selectedPresetName = name;
        this.refreshPresetSection();
      });
      this.settingsPanel.add([rowBg, rowText]);
      this.presetRowControls.push({ rowBg, rowText });
      this.presetSectionObjects.push(rowBg, rowText);
    }

    this.presetEmptyText = this.add.text(sectionLeft + 40, buttonY + 146, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#93a4b4",
    });
    this.settingsPanel.add(this.presetEmptyText);
    this.presetSectionObjects.push(this.presetEmptyText);

    const footer = this.add.text(panelX + 24, panelY + panelHeight - 34, "START / ESC para volver al juego · A acepta · B vuelve/cierrra", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#93a4b4",
    });
    this.settingsPanel.add(footer);

    this.menuFocus = { row: -1, column: 0 };
    this.menuNavInputState = { up: false, down: false, left: false, right: false, accept: false, back: false };

    // Al crear el menú escondemos la sección de presets hasta que realmente
    // se active su pestaña. Esto evita que quede montada sobre la primera vista.
    this.setPresetSectionVisible(false);
    this.setActiveSettingsTab(this.activeSettingsTab || "combat");
    this.refreshPresetSection();
  }

  /**
   * Activa una pestaña del menú y reposiciona únicamente los controles visibles
   * de esa categoría. Esto evita superposiciones entre sliders y la sección de presets.
   */
  setActiveSettingsTab(tabKey) {
    this.activeSettingsTab = tabKey;
    const hintMap = {
      combat: "Balas del jugador/enemigos, hitboxes, fuego continuo y choque entre enemigos.",
      player: "Vidas y supervivencia del jugador.",
      enemyAi: "IA 360°: presión sobre la base, rodeo lateral, desvío al jugador y algo de azar.",
      turret: "Ajustes finos de alineación visual de la torreta.",
      presets: "Guardar, cargar y borrar configuraciones persistentes.",
    };

    this.tabButtons?.forEach((button) => {
      const active = button.tabKey === tabKey;
      button.bg.setFillStyle(active ? 0x36536d : 0x1b2a38, 1);
      button.bg.setStrokeStyle(1, active ? 0xa7c7e7 : 0x60758c, 1);
    });

    if (this.tabHintText) {
      this.tabHintText.setText(hintMap[tabKey] || "");
    }

    const sectionLeft = this.sectionBg.x;
    const sectionTop = this.sectionBg.y;
    const sectionWidth = this.sectionBg.width;
    const startY = sectionTop + 20;
    const visibleControls = this.sliderControls.filter((control) => control.category === tabKey);

    visibleControls.forEach((control, index) => {
      const rowY = startY + index * 50;
      control.label.setPosition(sectionLeft + 16, rowY);
      control.trackX = sectionLeft + 360;
      control.trackWidth = Math.max(180, Math.min(280, sectionWidth - 470));
      control.track.setPosition(control.trackX, rowY + 11);
      control.track.width = control.trackWidth;
      control.fill.setPosition(control.trackX, rowY + 11);
      control.valueBox.setPosition(sectionLeft + sectionWidth - 78, rowY - 4);
      control.valueText.setPosition(sectionLeft + sectionWidth - 47, rowY + 11);
      [control.label, control.track, control.fill, control.handle, control.valueBox, control.valueText].forEach((obj) => obj.setVisible(true));
      this.refreshSlider(control);
    });

    this.sliderControls.filter((control) => control.category !== tabKey).forEach((control) => {
      [control.label, control.track, control.fill, control.handle, control.valueBox, control.valueText].forEach((obj) => obj.setVisible(false));
    });

    this.setPresetSectionVisible(tabKey === "presets");
    this.clampMenuFocus?.();
    this.refreshMenuFocusVisuals?.();
  }

  createMenuButton(x, y, width, height, label, onClick) {
    const bg = this.add.rectangle(x, y, width, height, 0x1b2a38, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x60758c, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
    }).setOrigin(0.5);

    bg.on("pointerover", () => {
      if (!this.isMenuOpen) return;
      bg.setFillStyle(0x274055, 1);
    });
    bg.on("pointerout", () => bg.setFillStyle(0x1b2a38, 1));
    bg.on("pointerdown", () => {
      if (!this.isMenuOpen) return;
      onClick();
    });

    return { bg, text, objects: [bg, text], onClick, label };
  }

  /**
   * Refresca la lista paginada de presets persistidos.
   *
   * Mantiene seleccionada la fila actual si todavía existe y apaga por completo
   * las filas vacías para que no aparezcan restos visuales al abrir el menú.
   */
  refreshPresetSection() {
    if (!this.presetNameText) return;

    const names = this.getPresetNames();
    if (this.selectedPresetName && !this.presets?.[this.selectedPresetName]) {
      this.selectedPresetName = names[0] || null;
    }

    const maxPage = Math.max(0, Math.ceil(names.length / 6) - 1);
    this.presetPage = Math.max(0, Math.min(maxPage, this.presetPage || 0));

    if (this.selectedPresetName) {
      const selectedIndex = names.indexOf(this.selectedPresetName);
      if (selectedIndex >= 0) {
        this.presetPage = Math.floor(selectedIndex / 6);
      }
    }

    const startIndex = this.presetPage * 6;
    const visibleNames = names.slice(startIndex, startIndex + 6);

    this.presetNameText.setText(`Preset seleccionado: ${this.selectedPresetName || "-"}`);
    if (this.presetPageText) {
      this.presetPageText.setText(names.length > 0 ? `Página ${this.presetPage + 1}/${maxPage + 1}` : "");
    }

    this.presetRowControls?.forEach((control, index) => {
      const name = visibleNames[index] || "";
      const hasName = Boolean(name);
      const shouldShow = hasName && !!this.isPresetSectionVisible;
      control.rowBg.setVisible(shouldShow);
      control.rowText.setVisible(shouldShow);

      if (!hasName) {
        control.rowText.setText("");
        return;
      }

      const selected = name === this.selectedPresetName;
      control.rowBg.setFillStyle(selected ? 0x36536d : 0x14202b, selected ? 0.95 : (index % 2 === 0 ? 0.55 : 0.32));
      control.rowText.setText(name);
      control.rowText.setColor(selected ? "#ffffff" : "#dbe4ee");
    });

    if (this.presetEmptyText) {
      this.presetEmptyText.setText(names.length === 0 ? "Todavía no hay presets guardados." : "");
      this.presetEmptyText.setVisible(!!this.isPresetSectionVisible && names.length === 0);
    }

    this.refreshMenuFocusVisuals?.();
  }

  /**
   * Devuelve una representación navegable del menú actual.
   *
   * row = -1 representa la fila de pestañas. El resto depende de la pestaña
   * activa: sliders en pestañas normales, o botones/lista en presets.
   */
  getMenuNavigationRows() {
    if (this.activeSettingsTab === "presets") {
      const presetNames = this.getPresetNames();
      const startIndex = (this.presetPage || 0) * 6;
      const visiblePresetNames = presetNames.slice(startIndex, startIndex + 6);

      return [
        { type: "presetActions", items: this.presetButtons || [] },
        { type: "presetPages", items: [this.prevPresetPageButton, this.nextPresetPageButton].filter(Boolean) },
        ...visiblePresetNames.map((name, index) => ({ type: "presetRow", presetName: name, presetIndex: index })),
      ];
    }

    return this.sliderControls
      .filter((control) => control.category === this.activeSettingsTab)
      .map((control) => ({ type: "slider", control }));
  }

  clampMenuFocus() {
    const rows = this.getMenuNavigationRows();
    const maxRow = rows.length - 1;

    if (maxRow < 0) {
      this.menuFocus = { row: -1, column: Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab)) };
      return;
    }

    this.menuFocus.row = clamp(this.menuFocus?.row ?? -1, -1, maxRow);

    if (this.menuFocus.row === -1) {
      this.menuFocus.column = clamp(this.menuFocus?.column ?? 0, 0, Math.max(0, this.tabButtons.length - 1));
      return;
    }

    const rowData = rows[this.menuFocus.row];
    const maxColumn = rowData.items ? Math.max(0, rowData.items.length - 1) : 0;
    this.menuFocus.column = clamp(this.menuFocus?.column ?? 0, 0, maxColumn);
  }

  setMenuFocus(row, column = 0) {
    this.menuFocus = { row, column };
    this.clampMenuFocus();
    this.refreshMenuFocusVisuals();
  }

  moveMenuFocusVertical(delta) {
    const rows = this.getMenuNavigationRows();
    const maxRow = rows.length - 1;
    const nextRow = clamp((this.menuFocus?.row ?? -1) + delta, -1, Math.max(-1, maxRow));
    const fallbackColumn = nextRow === -1
      ? Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab))
      : 0;
    this.setMenuFocus(nextRow, this.menuFocus?.column ?? fallbackColumn);
  }

  moveMenuFocusHorizontal(delta) {
    if ((this.menuFocus?.row ?? -1) === -1) {
      const nextColumn = clamp((this.menuFocus?.column ?? 0) + delta, 0, Math.max(0, this.tabButtons.length - 1));
      this.setMenuFocus(-1, nextColumn);
      return;
    }

    const rows = this.getMenuNavigationRows();
    const rowData = rows[this.menuFocus.row];
    if (!rowData) return;

    if (rowData.type === "slider") {
      const { control } = rowData;
      const nextValue = this.quantizeSetting(this.settings[control.schema.key] + delta * control.schema.step, control.schema);
      this.settings[control.schema.key] = nextValue;
      this.refreshSlider(control);
      this.saveSettings();
      this.applySettingsAfterChange(control.schema.key);
      this.refreshMenuFocusVisuals();
      return;
    }

    const maxColumn = rowData.items ? Math.max(0, rowData.items.length - 1) : 0;
    this.setMenuFocus(this.menuFocus.row, clamp((this.menuFocus?.column ?? 0) + delta, 0, maxColumn));
  }

  activateFocusedMenuItem() {
    const focusedRow = this.menuFocus?.row ?? -1;

    if (focusedRow === -1) {
      const button = this.tabButtons?.[this.menuFocus?.column ?? 0];
      if (button?.tabKey) {
        this.setActiveSettingsTab(button.tabKey);
        this.setMenuFocus(0, 0);
      }
      return;
    }

    const rows = this.getMenuNavigationRows();
    const rowData = rows[focusedRow];
    if (!rowData) return;

    if (rowData.type === "slider") {
      return;
    }

    if (rowData.type === "presetActions" || rowData.type === "presetPages") {
      const button = rowData.items?.[this.menuFocus?.column ?? 0];
      button?.onClick?.();
      this.refreshPresetSection();
      this.refreshMenuFocusVisuals();
      return;
    }

    if (rowData.type === "presetRow") {
      this.selectedPresetName = rowData.presetName;
      this.refreshPresetSection();
    }
  }

  goBackFromMenu() {
    if ((this.menuFocus?.row ?? -1) >= 0) {
      this.setMenuFocus(-1, Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab)));
      return;
    }

    this.toggleSettingsMenu(false);
  }

  refreshMenuFocusVisuals() {
    const focusedRow = this.menuFocus?.row ?? -1;
    const focusedColumn = this.menuFocus?.column ?? 0;
    const activeTabIndex = Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab));

    this.tabButtons?.forEach((button, index) => {
      const active = button.tabKey === this.activeSettingsTab;
      const focused = focusedRow === -1 && index === focusedColumn;
      button.bg.setFillStyle(active ? 0x36536d : (focused ? 0x274055 : 0x1b2a38), 1);
      button.bg.setStrokeStyle(focused ? 2 : 1, focused ? 0xffd166 : (active ? 0xa7c7e7 : 0x60758c), 1);
    });

    this.sliderControls?.forEach((control) => {
      const visible = control.category === this.activeSettingsTab;
      const focused = visible && focusedRow >= 0 && this.getMenuNavigationRows()[focusedRow]?.control === control;
      control.label.setColor(focused ? "#ffd166" : "#f3f4f6");
      control.valueBox.setStrokeStyle(focused ? 2 : 1, focused ? 0xffd166 : 0x52657b, 1);
      control.handle.setStrokeStyle(focused ? 3 : 2, focused ? 0xffd166 : 0x111111, 1);
    });

    this.presetButtons?.forEach((button, index) => {
      const focused = this.activeSettingsTab === "presets" && focusedRow === 0 && index === focusedColumn;
      button.bg.setFillStyle(focused ? 0x274055 : 0x1b2a38, 1);
      button.bg.setStrokeStyle(focused ? 2 : 1, focused ? 0xffd166 : 0x60758c, 1);
    });

    [this.prevPresetPageButton, this.nextPresetPageButton].filter(Boolean).forEach((button, index) => {
      const focused = this.activeSettingsTab === "presets" && focusedRow === 1 && index === focusedColumn;
      button.bg.setFillStyle(focused ? 0x274055 : 0x1b2a38, 1);
      button.bg.setStrokeStyle(focused ? 2 : 1, focused ? 0xffd166 : 0x60758c, 1);
    });

    this.presetRowControls?.forEach((control, index) => {
      const names = this.getPresetNames();
      const visibleNames = names.slice((this.presetPage || 0) * 6, (this.presetPage || 0) * 6 + 6);
      const name = visibleNames[index];
      if (!name) return;
      const selected = name === this.selectedPresetName;
      const focused = this.activeSettingsTab === "presets" && focusedRow === index + 2;
      control.rowBg.setStrokeStyle(focused ? 2 : 1, focused ? 0xffd166 : 0x52657b, focused ? 1 : 0.5);
      control.rowBg.setFillStyle(selected ? 0x36536d : 0x14202b, selected ? 0.95 : (index % 2 === 0 ? 0.55 : 0.32));
      control.rowText.setColor(focused ? "#ffd166" : (selected ? "#ffffff" : "#dbe4ee"));
    });
  }

  readMenuNavigationIntent() {
    const axisX = this.readPadAxis(0);
    const axisY = this.readPadAxis(1);

    return {
      up: this.cursors.up.isDown || axisY <= -MENU_AXIS_THRESHOLD,
      down: this.cursors.down.isDown || axisY >= MENU_AXIS_THRESHOLD,
      left: this.cursors.left.isDown || axisX <= -MENU_AXIS_THRESHOLD,
      right: this.cursors.right.isDown || axisX >= MENU_AXIS_THRESHOLD,
      accept: this.readPadButtonPressed(0) || this.keys.space.isDown || this.keys.enter?.isDown,
      back: this.readPadButtonPressed(1),
    };
  }

  handleMenuNavigationInput() {
    if (!this.isMenuOpen) return;

    const nextState = this.readMenuNavigationIntent();
    const prevState = this.menuNavInputState || {};

    if (nextState.up && !prevState.up) this.moveMenuFocusVertical(-1);
    if (nextState.down && !prevState.down) this.moveMenuFocusVertical(1);
    if (nextState.left && !prevState.left) this.moveMenuFocusHorizontal(-1);
    if (nextState.right && !prevState.right) this.moveMenuFocusHorizontal(1);
    if (nextState.accept && !prevState.accept) this.activateFocusedMenuItem();
    if (nextState.back && !prevState.back) this.goBackFromMenu();

    this.menuNavInputState = nextState;
  }

  refreshSlider(control) {
    const { schema, trackX, trackWidth, fill, handle, valueText } = control;
    const value = this.settings[schema.key];
    const ratio = (value - schema.min) / (schema.max - schema.min || 1);
    const x = trackX + trackWidth * ratio;
    fill.width = Math.max(0, x - trackX);
    handle.x = x;
    const displayValue = schema.max === 1 && schema.min === 0 ? (Math.round(value) === 1 ? "Sí" : "No") : String(value);
    valueText.setText(displayValue);
  }

  setSliderValueFromPointer(control, pointerX) {
    const { schema, trackX, trackWidth } = control;
    const ratio = clamp((pointerX - trackX) / trackWidth, 0, 1);
    const rawValue = schema.min + ratio * (schema.max - schema.min);
    this.settings[schema.key] = this.quantizeSetting(rawValue, schema);
    this.refreshSlider(control);
    this.saveSettings();
    this.applySettingsAfterChange(schema.key);
  }

  applySettingsAfterChange(changedKey) {
    if (
      changedKey === "playerBulletLimit" ||
      changedKey === "enemyBulletLimit"
    ) {
      const tanks = [this.player, ...this.enemies].filter(Boolean);
      tanks.forEach((tank) => {
        const limit = this.getBulletLimitForTank(tank);
        if (tank?.activeBullets?.length > limit) {
          tank.activeBullets = tank.activeBullets.slice(-limit);
        }
      });
    }

    if (changedKey === "playerLives") {
      const desiredLives = Math.max(1, Math.round(this.settings.playerLives || 1));
      this.playerLivesRemaining = desiredLives;
      this.updateLivesText();
    }

    if (
      changedKey === "playerTurretUpExtraOffsetX" ||
      changedKey === "playerTurretUpExtraOffsetY"
    ) {
      if (this.player) {
        this.updateTankVisuals(this.player);
      }
    }
  }

  toggleSettingsMenu(forceValue = null) {
    const nextState = forceValue == null ? !this.isMenuOpen : !!forceValue;
    this.isMenuOpen = nextState;
    this.settingsBackdrop.setVisible(nextState);
    this.settingsPanel.setVisible(nextState);
    if (nextState) {
      this.sliderControls.forEach((control) => this.refreshSlider(control));
      this.setActiveSettingsTab(this.activeSettingsTab || "combat");
      this.refreshPresetSection();
      this.menuNavInputState = { up: false, down: false, left: false, right: false, accept: false, back: false };
      this.setMenuFocus(-1, Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab)));
    }
  }

  handleMenuToggleInput() {
    const menuPressed = this.keys.esc.isDown || this.readPadButtonPressed(9);
    if (menuPressed && !this.wasMenuPressed) {
      this.toggleSettingsMenu();
    }
    this.wasMenuPressed = menuPressed;
  }

  loadLevel(levelIndex) {
    this.clearLevelVisuals();

    const level = LEVELS[levelIndex];
    const waveConfig =
      LEVEL_WAVE_CONFIGS[levelIndex] ||
      LEVEL_WAVE_CONFIGS[LEVEL_WAVE_CONFIGS.length - 1];

    this.level = {
      floor: cloneMatrix(level.floor),
      overlay: cloneMatrix(level.overlay),
      obstacles: cloneMatrix(level.obstacles),
    };

    this.totalEnemiesForLevel = waveConfig.totalEnemies;
    this.maxConcurrentEnemies = waveConfig.maxConcurrent;
    this.spawnedEnemiesCount = 0;
    this.destroyedEnemiesCount = 0;

    this.levelText.setText(`Nivel ${levelIndex + 1}`);

    this.drawBoard();
    if (this.playerLivesRemaining > 0) {
      this.createPlayer();
    }
    this.fillEnemyWaveSlots();
    this.updateWaveText();
    this.updateLivesText();
  }

  clearLevelVisuals() {
    if (this.floorLayer) this.floorLayer.removeAll(true);
    if (this.obstacleLayer) this.obstacleLayer.removeAll(true);
    if (this.entityLayer) this.entityLayer.removeAll(true);
    if (this.overlayLayer) this.overlayLayer.removeAll(true);

    this.bullets?.forEach((bullet) => bullet.sprite.destroy());
    this.bullets = [];
    this.wasPlayerFireDown = false;

    if (this.playerRespawnEvent) {
      this.playerRespawnEvent.remove(false);
      this.playerRespawnEvent = null;
    }

    this.player = null;
    this.enemies = [];
    this.baseSprite = null;
    this.isPlayerRespawning = false;
  }

  drawBoard() {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const x = cellCenterX(col, this.boardOriginX);
        const y = cellCenterY(row, this.boardOriginY);

        const floorTile = this.level.floor[row][col] || TILE.GROUND;
        this.floorLayer.add(this.makeTileSprite(floorTile, x, y));

        const obstacle = this.level.obstacles[row][col];
        if (obstacle) {
          if (obstacle === TILE.BASE) {
            if (isBaseAnchorCell(this.level, col, row)) {
              this.baseSprite = this.add
                .image(bigCellCenterX(col, this.boardOriginX), bigCellCenterY(row, this.boardOriginY), "eagle")
                .setDisplaySize(MACRO_TILE_SIZE, MACRO_TILE_SIZE)
                .setDepth(20);
              this.obstacleLayer.add(this.baseSprite);
            }
          } else {
            this.obstacleLayer.add(this.makeTileSprite(obstacle, x, y));
          }
        }
      }
    }

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const overlay = this.level.overlay[row][col];
        if (!overlay) continue;

        const x = cellCenterX(col, this.boardOriginX);
        const y = cellCenterY(row, this.boardOriginY);

        const overlaySprite = this.makeTileSprite(overlay, x, y);
        overlaySprite.setDepth(220);
        this.overlayLayer.add(overlaySprite);
      }
    }
  }

  makeTileSprite(tile, x, y) {
    const keyMap = {
      [TILE.GROUND]: "tile-ground",
      [TILE.ROAD]: "tile-road",
      [TILE.BRICK]: "tile-brick",
      [TILE.STEEL]: "tile-steel",
      [TILE.WATER]: "tile-water",
      [TILE.BUSH]: "tile-bush",
    };

    return this.add
      .image(x, y, keyMap[tile])
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setDepth(10);
  }

  createTankSprite(
    x,
    y,
    bodyKey,
    turretKey,
    displaySize,
    bodyBaseFacingDeg,
    initialBodyFacingDeg,
    turretBaseFacingRad,
    options = {}
  ) {
    const {
      bodyMaxFactor = 1.06,
      turretMaxFactor = 1.02,
      bodyAnchorPx = null,
      turretPivotPx = null,
      turretScaleX = 1,
      turretScaleY = 1,
      turretOffsetX = 0,
      turretOffsetY = 0,
    } = options;

    const container = this.add.container(x, y).setDepth(140);

    const body = this.add.image(0, 0, bodyKey);
    const bodyTexture = this.textures.get(bodyKey).getSourceImage();
    const bodyMaxSize = displaySize * bodyMaxFactor;
    const bodyScale = Math.min(
      bodyMaxSize / bodyTexture.width,
      bodyMaxSize / bodyTexture.height
    );
    body.setScale(bodyScale);
    body.angle = initialBodyFacingDeg - bodyBaseFacingDeg;

    const turret = this.add.image(0, 0, turretKey);
    const turretTexture = this.textures.get(turretKey).getSourceImage();
    const turretMaxSize = displaySize * turretMaxFactor;
    const turretScale = Math.min(
      turretMaxSize / turretTexture.width,
      turretMaxSize / turretTexture.height
    );
    turret.setScale(turretScale * turretScaleX, turretScale * turretScaleY);

    if (turretPivotPx) {
      turret.setOrigin(
        turretPivotPx.x / turretPivotPx.w,
        turretPivotPx.y / turretPivotPx.h
      );
    } else {
      turret.setOrigin(0.5, 0.5);
    }

    let bodyAnchorLocalX = 0;
    let bodyAnchorLocalY = 0;

    if (bodyAnchorPx) {
      bodyAnchorLocalX = (bodyAnchorPx.x - bodyAnchorPx.w / 2) * bodyScale;
      bodyAnchorLocalY = (bodyAnchorPx.y - bodyAnchorPx.h / 2) * bodyScale;
    }

    turret.x = bodyAnchorLocalX + turretOffsetX;
    turret.y = bodyAnchorLocalY + turretOffsetY;

    container.add([body, turret]);
    this.entityLayer.add(container);

    return {
      container,
      body,
      turret,
      bodyBaseFacingDeg,
      turretBaseFacingRad,
      bodyAnchorLocalX,
      bodyAnchorLocalY,
      turretOffsetX,
      turretOffsetY,
    };
  }

  /**
   * Crea el tanque del jugador en el punto de inicio del nivel.
   *
   * Con la grilla fina del mapa, el tanque vuelve a ocupar visualmente 2x2 tiles
   * actuales (equivalente al tile macro original), mientras que la lógica de
   * colisión sigue usando un tamaño independiente.
   */
  createPlayer() {
    const x = bigCellCenterX(PLAYER_SPAWN_COL, this.boardOriginX);
    const y = bigCellCenterY(PLAYER_SPAWN_ROW, this.boardOriginY);

    const spriteParts = this.createTankSprite(
      x,
      y,
      "player-body-yellow-v2",
      "player-turret-yellow-v2",
      TANK_RENDER_SIZE,
      PLAYER_BODY_BASE_FACING_DEG,
      -90,
      PLAYER_TURRET_BASE_FACING_RAD,
      {
        bodyMaxFactor: 0.95,
        turretMaxFactor: 1.0,
        turretScaleX: 1.0,
        turretScaleY: 1.0,
        turretOffsetX: 2,
        turretOffsetY: -2,
        bodyAnchorPx: PLAYER_BODY_RING_CENTER,
        turretPivotPx: PLAYER_TURRET_CAP_CENTER,
      }
    );

    this.player = {
      type: "player",
      ...spriteParts,
      x,
      y,
      col: PLAYER_SPAWN_COL,
      row: PLAYER_SPAWN_ROW,
      moveAngleDeg: -90,
      turretAngleRad: -Math.PI / 2,
      moveSpeed: PLAYER_SPEED,
      shotCooldown: 0,
      activeBullets: [],
    };

    this.updateTankVisuals(this.player);
    this.updateLivesText();
  }

  /**
   * Crea un tanque enemigo en uno de los spawn points superiores.
   *
   * Cada enemigo nace con estado inicial para patrulla, objetivo principal,
   * deambular y steering 360°, así la IA puede mezclar presión hacia la base
   * con variaciones laterales sin recalcular todo de cero cada frame.
   */
  createEnemyAtSpawn(spawn) {
    const x = bigCellCenterX(spawn.col, this.boardOriginX);
    const y = bigCellCenterY(spawn.row, this.boardOriginY);

    const spriteParts = this.createTankSprite(
      x,
      y,
      "enemy-body-gray-v2",
      "enemy-turret-gray-v2",
      TANK_RENDER_SIZE,
      ENEMY_BODY_BASE_FACING_DEG,
      ENEMY_BODY_BASE_FACING_DEG,
      ENEMY_TURRET_BASE_FACING_RAD,
      {
        bodyMaxFactor: 0.95,
        turretMaxFactor: 1.0,
        turretScaleX: 1.1,
        turretScaleY: 1.0,
        turretOffsetY: 3,
        bodyAnchorPx: ENEMY_BODY_RING_CENTER,
        turretPivotPx: ENEMY_TURRET_CAP_CENTER,
      }
    );

    const zone = this.pickPatrolZoneForSpawn(spawn.col, spawn.row);
    const waypoint = this.pickWaypointInZone(zone);
    const startAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);

    const enemy = {
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
      currentObjective: this.getEnemyApproachObjective(),
      wanderAngleRad: startAngle,
      wanderRetargetTimer: Phaser.Math.Between(260, 620),
      steeringAngleRad: startAngle,
    };

    this.updateTankVisuals(enemy);
    return enemy;
  }

  pickPatrolZoneForSpawn(col, row) {
    const containing = PATROL_ZONES.find(
      (zone) =>
        col >= zone.minCol &&
        col <= zone.maxCol &&
        row >= zone.minRow &&
        row <= zone.maxRow
    );
    return containing || randomChoice(PATROL_ZONES);
  }

  pickWaypointInZone(zone) {
    for (let i = 0; i < 30; i += 1) {
      const col = Phaser.Math.Between(zone.minCol, zone.maxCol);
      const row = Phaser.Math.Between(zone.minRow, zone.maxRow);

      if (!isBlockingTile(this.level?.obstacles?.[row]?.[col])) {
        return {
          col,
          row,
          x: bigCellCenterX(col, this.boardOriginX),
          y: bigCellCenterY(row, this.boardOriginY),
          goalType: "patrol",
        };
      }
    }

    const col = clamp(zone.minCol, 0, GRID_SIZE - 1);
    const row = clamp(zone.minRow, 0, GRID_SIZE - 1);

    return {
      col,
      row,
      x: bigCellCenterX(col, this.boardOriginX),
      y: bigCellCenterY(row, this.boardOriginY),
      goalType: "patrol",
    };
  }

  getBulletLimitForTank(tank) {
    if (tank?.type === "player") {
      return Math.max(1, Math.round(this.settings.playerBulletLimit || 1));
    }
    return Math.max(1, Math.round(this.settings.enemyBulletLimit || 1));
  }

  getBulletRadiusForOwner(ownerType) {
    return Math.max(
      2,
      Math.round(ownerType === "player" ? this.settings.playerBulletSize || 6 : this.settings.enemyBulletSize || 6)
    );
  }

  getBulletHitRadiusForOwner(ownerType) {
    return Math.max(
      2,
      Math.round(ownerType === "player" ? this.settings.playerBulletHitbox || 8 : this.settings.enemyBulletHitbox || 8)
    );
  }

  updateTankVisuals(tank) {
    tank.container.x = tank.x;
    tank.container.y = tank.y;

    const bodyRotationDeg = tank.moveAngleDeg - tank.bodyBaseFacingDeg;
    tank.body.angle = bodyRotationDeg;

    const bodyRotationRad = Phaser.Math.DegToRad(bodyRotationDeg);
    const cos = Math.cos(bodyRotationRad);
    const sin = Math.sin(bodyRotationRad);

    const localX = tank.bodyAnchorLocalX * cos - tank.bodyAnchorLocalY * sin;
    const localY = tank.bodyAnchorLocalX * sin + tank.bodyAnchorLocalY * cos;

    let extraTurretOffsetX = 0;
    let extraTurretOffsetY = 0;

    const bodyFacingUp = Math.abs(Phaser.Math.Angle.Wrap(bodyRotationRad + Math.PI / 2)) < 0.001;
    const turretFacingUp =
      Math.abs(Phaser.Math.Angle.Wrap(tank.turretAngleRad + Math.PI / 2)) < 0.001;

    if (tank.type === "player" && bodyFacingUp && turretFacingUp) {
      extraTurretOffsetX = this.settings.playerTurretUpExtraOffsetX;
      extraTurretOffsetY = this.settings.playerTurretUpExtraOffsetY;
    }

    tank.turret.x = localX + (tank.turretOffsetX || 0) + extraTurretOffsetX;
    tank.turret.y = localY + (tank.turretOffsetY || 0) + extraTurretOffsetY;
    tank.turret.rotation = tank.turretAngleRad - tank.turretBaseFacingRad;
  }

  getBrowserPad() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;

    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  getPhaserPad() {
    const pads = this.input?.gamepad?.gamepads || [];
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  getActivePad() {
    return this.getPhaserPad() || this.getBrowserPad();
  }

  readPadAxis(index) {
    const pad = this.getActivePad();
    if (!pad) return 0;

    if (pad.axes && pad.axes[index] !== undefined) {
      const axis = pad.axes[index];
      if (typeof axis === "number") return axis;
      if (axis && typeof axis.getValue === "function") return axis.getValue();
      if (axis && typeof axis.value === "number") return axis.value;
    }

    return 0;
  }

  readPadButtonPressed(index, threshold = 0.35) {
    const pad = this.getActivePad();
    if (!pad || !pad.buttons || !pad.buttons[index]) return false;

    const button = pad.buttons[index];
    if (typeof button === "number") return button > threshold;
    return !!button.pressed || (typeof button.value === "number" && button.value > threshold);
  }

  updatePadStatus() {
    const pad = this.getActivePad();
    this.padStatusText.setText(pad ? `Gamepad: ${pad.id || "conectado"}` : "Gamepad: esperando...");
  }

  fillEnemyWaveSlots() {
    if (this.isTransitioning) return;

    while (
      this.enemies.length < this.maxConcurrentEnemies &&
      this.spawnedEnemiesCount < this.totalEnemiesForLevel
    ) {
      const enemy = this.spawnEnemy();
      if (!enemy) break;
      this.enemies.push(enemy);
      this.spawnedEnemiesCount += 1;
    }

    this.updateWaveText();
  }

  spawnEnemy() {
    const shuffled = [...this.spawnPoints].sort(() => Math.random() - 0.5);

    const freeSpawn = shuffled.find((spawn) => {
      const x = bigCellCenterX(spawn.col, this.boardOriginX);
      const y = bigCellCenterY(spawn.row, this.boardOriginY);
      return this.canOccupyWorldPosition(x, y, null);
    });

    if (!freeSpawn) return null;
    return this.createEnemyAtSpawn(freeSpawn);
  }

  update(_, delta) {
    this.handleMenuToggleInput();
    this.updatePadStatus();

    if (this.isMenuOpen) {
      this.handleMenuNavigationInput();
    }

    if (this.isTransitioning || this.isMenuOpen || this.isGameOver) return;

    if (this.player) {
      this.player.shotCooldown = Math.max(0, this.player.shotCooldown - delta);
      this.updatePlayer(delta);
    }

    this.enemies.forEach((enemy) => {
      this.updateEnemy(enemy, delta);
    });

    this.resolveTankOverlaps();
    if (this.player) this.updateTankVisuals(this.player);
    this.enemies.forEach((enemy) => this.updateTankVisuals(enemy));

    this.updateBullets(delta);
    this.checkLevelComplete();
  }

  updatePlayer(delta) {
    const moveInput = this.getPlayerMoveInput();
    const aimInput = this.getPlayerAimInput();

    if (vectorLength(moveInput.x, moveInput.y) > MOVE_DEADZONE) {
      const moveNorm = normalizeVector(moveInput.x, moveInput.y);
      const moveAmount = (this.player.moveSpeed * delta) / 1000;
      const moved = this.tryMoveTank(
        this.player,
        moveNorm.x * moveAmount,
        moveNorm.y * moveAmount
      );
      if (moved) {
        this.player.moveAngleDeg = angleDegFromVector(moveNorm.x, moveNorm.y);
      }
    }

    if (vectorLength(aimInput.x, aimInput.y) > AIM_DEADZONE) {
      const targetAngle = Math.atan2(aimInput.y, aimInput.x);
      const maxStep = PLAYER_TURRET_MANUAL_TURN_SPEED * (delta / 1000);
      const diff = wrapRadDiff(targetAngle, this.player.turretAngleRad);

      if (Math.abs(diff) <= maxStep) {
        this.player.turretAngleRad = targetAngle;
      } else {
        this.player.turretAngleRad += Math.sign(diff) * maxStep;
        this.player.turretAngleRad = Phaser.Math.Angle.Wrap(this.player.turretAngleRad);
      }
    }

    this.updateTankVisuals(this.player);

    if (this.isPlayerFirePressed()) {
      this.fireBullet(this.player);
    }
  }

  getPlayerMoveInput() {
    let x = 0;
    let y = 0;

    if (this.keys.a.isDown) x -= 1;
    if (this.keys.d.isDown) x += 1;
    if (this.keys.w.isDown) y -= 1;
    if (this.keys.s.isDown) y += 1;

    const lx = this.readPadAxis(0);
    const ly = this.readPadAxis(1);

    if (Math.abs(lx) > MOVE_DEADZONE) x = lx;
    if (Math.abs(ly) > MOVE_DEADZONE) y = ly;

    return { x, y };
  }

  getPlayerAimInput() {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown) x -= 1;
    if (this.cursors.right.isDown) x += 1;
    if (this.cursors.up.isDown) y -= 1;
    if (this.cursors.down.isDown) y += 1;

    const rx = this.readPadAxis(2);
    const ry = this.readPadAxis(3);

    if (Math.abs(rx) > AIM_DEADZONE) x = rx;
    if (Math.abs(ry) > AIM_DEADZONE) y = ry;

    return { x, y };
  }

  isPlayerFirePressed() {
    const fireDown = this.keys.space.isDown || this.readPadButtonPressed(5) || this.readPadButtonPressed(7);
    const continuous = Math.round(this.settings.playerContinuousFire || 0) === 1;

    if (continuous) {
      this.wasPlayerFireDown = fireDown;
      return fireDown;
    }

    const justPressed = fireDown && !this.wasPlayerFireDown;
    this.wasPlayerFireDown = fireDown;
    return justPressed;
  }

  getObjectiveCells() {
    const fortressCells = [
      { col: 5, row: 11 },
      { col: 6, row: 11 },
      { col: 7, row: 11 },
      { col: 5, row: 12 },
      { col: 7, row: 12 },
    ];

    const intactFortress = fortressCells.filter(
      ({ col, row }) => this.level?.obstacles?.[row]?.[col] === TILE.BRICK
    );

    if (intactFortress.length > 0) {
      return intactFortress.map(({ col, row }) => ({
        col,
        row,
        x: bigCellCenterX(col, this.boardOriginX),
        y: bigCellCenterY(row, this.boardOriginY),
        goalType: "fortress",
      }));
    }

    return [
      {
        col: EAGLE_COL,
        row: EAGLE_ROW,
        x: bigCellCenterX(EAGLE_COL, this.boardOriginX),
        y: bigCellCenterY(EAGLE_ROW, this.boardOriginY),
        goalType: "base",
      },
    ];
  }

  getEnemyApproachObjective() {
    const objectiveCells = this.getObjectiveCells();
    return randomChoice(objectiveCells);
  }

  getEnemySteeringPlan(enemy) {
    const objective = enemy.currentObjective || this.getEnemyApproachObjective();
    const fallback = enemy.patrolTarget || this.pickWaypointInZone(enemy.patrolZone);
    const basePressure = (this.settings.enemyBasePressure || 0) / 100;
    const flankBias = (this.settings.enemyFlankBias || 0) / 100;
    const playerAggro = (this.settings.enemyPlayerAggro || 0) / 100;
    const wander = (this.settings.enemyWander || 0) / 100;

    const toObjective = normalizeVector(objective.x - enemy.x, objective.y - enemy.y);
    const orbitSign = enemy.orbitSign || 1;
    const orbitDir = { x: -toObjective.y * orbitSign, y: toObjective.x * orbitSign };

    let toPlayer = { x: 0, y: 0 };
    let playerWeight = 0;
    if (this.player) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const dist = vectorLength(dx, dy);
      if (dist < TILE_SIZE * 4.8) {
        const normalizedDist = clamp(1 - dist / (TILE_SIZE * 4.8), 0, 1);
        toPlayer = normalizeVector(dx, dy);
        playerWeight = playerAggro * (0.35 + normalizedDist * 0.85);
      }
    }

    const fallbackDir = normalizeVector(fallback.x - enemy.x, fallback.y - enemy.y);
    const jitterAngle = enemy.wanderAngleRad ?? 0;
    const jitterDir = { x: Math.cos(jitterAngle), y: Math.sin(jitterAngle) };

    const steering = normalizeVector(
      toObjective.x * (0.55 + basePressure * 1.2) +
        orbitDir.x * (0.15 + flankBias * 0.95) +
        fallbackDir.x * (0.12 + wander * 0.5) +
        toPlayer.x * playerWeight +
        jitterDir.x * (wander * 0.5),
      toObjective.y * (0.55 + basePressure * 1.2) +
        orbitDir.y * (0.15 + flankBias * 0.95) +
        fallbackDir.y * (0.12 + wander * 0.5) +
        toPlayer.y * playerWeight +
        jitterDir.y * (wander * 0.5)
    );

    let goalType = objective.goalType || "fortress";
    if (playerWeight > 0.38 && Math.random() < 0.25 + playerAggro * 0.45) {
      goalType = "player";
    }

    return {
      objective,
      steering,
      goalType,
      fallback,
      playerWeight,
    };
  }

  getEnemyObjectiveShot(enemy) {
    const fireBias = this.settings.enemyObjectiveFireBias / 100;
    if (Math.random() > fireBias) return null;

    const objectiveCells = this.getObjectiveCells();
    for (const target of objectiveCells) {
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const dist = vectorLength(dx, dy);
      if (dist > TILE_SIZE * 5.2) continue;

      const axisAligned = Math.abs(dx) < 26 || Math.abs(dy) < 26;
      if (!axisAligned) continue;

      const angle = Math.atan2(dy, dx);
      const clear = this.isLineToObjectiveClear(enemy.x, enemy.y, target.x, target.y, target);
      if (!clear) continue;

      return { angle, target };
    }

    return null;
  }

  isLineToObjectiveClear(fromX, fromY, toX, toY, objectiveTarget) {
    const distance = vectorLength(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(distance / 16));

    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = Phaser.Math.Linear(fromX, toX, t);
      const y = Phaser.Math.Linear(fromY, toY, t);
      const { col, row } = this.worldToCell(x, y);
      const obstacle = this.level?.obstacles?.[row]?.[col];

      if (!obstacle) continue;
      if (col === objectiveTarget.col && row === objectiveTarget.row) return true;
      if (obstacle === TILE.WATER) continue;
      return false;
    }

    return true;
  }

  /**
   * Actualiza la IA 360° de un enemigo.
   *
   * Combina: presión a la base, interés por el jugador, rodeo lateral, algo de
   * wander y un steering suavizado para evitar el temblequeo de ángulo.
   */
  updateEnemy(enemy, delta) {
    enemy.shotCooldown = Math.max(0, enemy.shotCooldown - delta);
    enemy.patrolRetargetTimer -= delta;
    enemy.objectiveRetargetTimer -= delta;
    enemy.wanderRetargetTimer -= delta;

    if (enemy.patrolRetargetTimer <= 0 || !enemy.patrolTarget) {
      enemy.patrolTarget = this.pickWaypointInZone(enemy.patrolZone);
      enemy.patrolRetargetTimer = Phaser.Math.Between(900, 1900);
    }

    if (enemy.objectiveRetargetTimer <= 0 || !enemy.currentObjective) {
      enemy.orbitSign *= Math.random() < 0.35 ? -1 : 1;
      enemy.currentObjective = this.getEnemyApproachObjective();
      enemy.objectiveRetargetTimer = Phaser.Math.Between(650, 1350);
    }

    if (enemy.wanderRetargetTimer <= 0) {
      enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      enemy.wanderRetargetTimer = Phaser.Math.Between(260, 620);
    }

    const plan = this.getEnemySteeringPlan(enemy);
    enemy.currentGoalType = plan.goalType;

    let steering = plan.steering;
    if (vectorLength(steering.x, steering.y) < 0.001) {
      steering = normalizeVector(plan.fallback.x - enemy.x, plan.fallback.y - enemy.y);
    }

    const targetMoveAngle = Math.atan2(steering.y, steering.x);
    const currentMoveAngle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
    const turnRateRad = Phaser.Math.DegToRad(220) * (delta / 1000);
    const angleDelta = wrapRadDiff(targetMoveAngle, currentMoveAngle);
    const nextMoveAngle = currentMoveAngle + clamp(angleDelta, -turnRateRad, turnRateRad);
    enemy.steeringAngleRad = nextMoveAngle;
    steering = { x: Math.cos(nextMoveAngle), y: Math.sin(nextMoveAngle) };

    const moveAmount = (enemy.moveSpeed * delta) / 1000;
    const moved = this.tryMoveTank(enemy, steering.x * moveAmount, steering.y * moveAmount);

    if (!moved) {
      enemy.orbitSign *= -1;
      enemy.sidestepBias = Phaser.Math.FloatBetween(-1, 1);
      const obstacleBypass = normalizeVector(
        steering.x + (-steering.y * enemy.orbitSign) * 0.85,
        steering.y + (steering.x * enemy.orbitSign) * 0.85
      );
      const bypassMoved = this.tryMoveTank(enemy, obstacleBypass.x * moveAmount, obstacleBypass.y * moveAmount);
      if (bypassMoved) {
        enemy.steeringAngleRad = Math.atan2(obstacleBypass.y, obstacleBypass.x);
        enemy.moveAngleDeg = angleDegFromVector(obstacleBypass.x, obstacleBypass.y);
      } else {
        enemy.currentObjective = this.getEnemyApproachObjective();
        enemy.patrolTarget = this.pickWaypointInZone(enemy.patrolZone);
        enemy.patrolRetargetTimer = Phaser.Math.Between(360, 760);
        enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
    } else {
      enemy.moveAngleDeg = angleDegFromVector(steering.x, steering.y);
    }

    const dxToPlayer = this.player ? this.player.x - enemy.x : 0;
    const dyToPlayer = this.player ? this.player.y - enemy.y : 0;
    const distToPlayer = this.player ? vectorLength(dxToPlayer, dyToPlayer) : Infinity;
    const playerAimBias = (this.settings.enemyAimPlayerBias || 0) / 100;
    const playerVisible = this.player && distToPlayer < TILE_SIZE * 3.8;

    const objectiveShot = this.getEnemyObjectiveShot(enemy);
    const shouldTrackPlayer = playerVisible && Math.random() < (0.15 + playerAimBias * 0.8);

    if (shouldTrackPlayer) {
      enemy.turretAngleRad = Math.atan2(dyToPlayer, dxToPlayer);
    } else if (objectiveShot) {
      enemy.turretAngleRad = objectiveShot.angle;
    } else {
      const forwardAngle = Phaser.Math.DegToRad(enemy.moveAngleDeg);
      const currentToForward = wrapRadDiff(forwardAngle, enemy.turretAngleRad);
      enemy.turretAngleRad = Phaser.Math.Angle.Wrap(
        enemy.turretAngleRad + currentToForward * 0.09 + enemy.turretSweepSpeed * (delta / 1000) * 0.35
      );
    }

    this.updateTankVisuals(enemy);

    const aimedAtPlayer =
      shouldTrackPlayer &&
      Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - Math.atan2(dyToPlayer, dxToPlayer))) < 0.26;

    const aimedAtObjective =
      objectiveShot &&
      Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - objectiveShot.angle)) < 0.2;

    const opportunisticSuppression = Math.random() > 0.9975;

    if (enemy.shotCooldown <= 0 && (aimedAtPlayer || aimedAtObjective || opportunisticSuppression)) {
      this.fireBullet(enemy);
    }
  }

  tryMoveTank(tank, moveX, moveY) {
    let moved = false;

    if (moveX !== 0) {
      const nextX = tank.x + moveX;
      if (this.canOccupyWorldPosition(nextX, tank.y, tank)) {
        tank.x = nextX;
        moved = true;
      }
    }

    if (moveY !== 0) {
      const nextY = tank.y + moveY;
      if (this.canOccupyWorldPosition(tank.x, nextY, tank)) {
        tank.y = nextY;
        moved = true;
      }
    }

    const cell = this.worldToCell(tank.x, tank.y);
    tank.col = cell.col;
    tank.row = cell.row;

    return moved;
  }

  /**
   * Devuelve si un tanque puede ocupar una posición del mundo sin salirse del
   * tablero, atravesar obstáculos o solaparse con otros tanques.
   */
  canOccupyWorldPosition(x, y, movingTank) {
    const half = TANK_COLLISION_SIZE / 2;
    const left = x - half;
    const right = x + half;
    const top = y - half;
    const bottom = y + half;

    const startCol = Math.floor((left - this.boardOriginX) / TILE_SIZE);
    const endCol = Math.floor((right - this.boardOriginX) / TILE_SIZE);
    const startRow = Math.floor((top - this.boardOriginY) / TILE_SIZE);
    const endRow = Math.floor((bottom - this.boardOriginY) / TILE_SIZE);

    if (!inBounds(startCol, startRow) || !inBounds(endCol, endRow)) {
      return false;
    }

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const obstacle = this.level.obstacles[row][col];
        if (isBlockingTile(obstacle)) {
          return false;
        }
      }
    }

    const others = [...(this.player ? [this.player] : []), ...this.enemies].filter(
      (tank) => tank && tank !== movingTank
    );

    return !others.some((tank) => {
      const mustRespectOccupancy = !movingTank;
      if (!mustRespectOccupancy && !this.shouldTanksCollide(movingTank, tank)) {
        return false;
      }
      return vectorLength(x - tank.x, y - tank.y) < TANK_COLLISION_SIZE * 0.82;
    });
  }

  shouldTanksCollide(tankA, tankB) {
    if (!tankB) return false;

    if (!tankA) {
      return true;
    }

    if (tankA.type === "enemy" && tankB.type === "enemy") {
      return Math.round(this.settings.enemyTankCollision || 0) === 1;
    }
    return true;
  }

  /**
   * Separa suavemente tanques que hayan quedado demasiado cerca por acumulación
   * de movimiento durante el frame. No destruye tanques ni los teletransporta:
   * sólo empuja lo justo para que recuperen separación física.
   */
  resolveTankOverlaps() {
    if (Math.round(this.settings.enemyTankCollision || 0) !== 1) return;

    const tanks = [this.player, ...this.enemies].filter(Boolean);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < tanks.length; i += 1) {
        for (let j = i + 1; j < tanks.length; j += 1) {
          const a = tanks[i];
          const b = tanks[j];
          if (!this.shouldTanksCollide(a, b)) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = vectorLength(dx, dy);
          const minDist = TANK_COLLISION_SIZE * 0.84;
          if (dist >= minDist) continue;

          const dir = dist > 0.001 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
          const push = (minDist - dist) * 0.5;

          const ax = a.x - dir.x * push;
          const ay = a.y - dir.y * push;
          const bx = b.x + dir.x * push;
          const by = b.y + dir.y * push;

          if (this.canOccupyWorldPosition(ax, ay, a)) {
            a.x = ax;
            a.y = ay;
            const cellA = this.worldToCell(a.x, a.y);
            a.col = cellA.col;
            a.row = cellA.row;
          }

          if (this.canOccupyWorldPosition(bx, by, b)) {
            b.x = bx;
            b.y = by;
            const cellB = this.worldToCell(b.x, b.y);
            b.col = cellB.col;
            b.row = cellB.row;
          }
        }
      }
    }
  }

  worldToCell(x, y) {
    return {
      col: Phaser.Math.Clamp(
        Math.floor((x - this.boardOriginX) / TILE_SIZE),
        0,
        GRID_SIZE - 1
      ),
      row: Phaser.Math.Clamp(
        Math.floor((y - this.boardOriginY) / TILE_SIZE),
        0,
        GRID_SIZE - 1
      ),
    };
  }

  canTankFire(tank) {
    if (tank.shotCooldown > 0) return false;
    tank.activeBullets = (tank.activeBullets || []).filter((bullet) => bullet && bullet.isAlive);
    return tank.activeBullets.length < this.getBulletLimitForTank(tank);
  }

  fireBullet(tank) {
    if (!this.canTankFire(tank)) return;

    tank.shotCooldown = tank.type === "player" ? FIRE_COOLDOWN_PLAYER : FIRE_COOLDOWN_ENEMY;

    const angle = tank.turretAngleRad;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const radius = this.getBulletRadiusForOwner(tank.type);
    const hitRadius = this.getBulletHitRadiusForOwner(tank.type);

    const bulletSprite = this.add
      .circle(
        tank.x + dirX * 34,
        tank.y + dirY * 34,
        radius,
        tank.type === "player" ? 0xfff07a : 0xff6b6b
      )
      .setDepth(180);

    this.entityLayer.add(bulletSprite);

    const bullet = {
      sprite: bulletSprite,
      ownerType: tank.type,
      ownerTank: tank,
      xSpeed: dirX * BULLET_SPEED,
      ySpeed: dirY * BULLET_SPEED,
      radius,
      hitRadius,
      isAlive: true,
    };

    this.bullets.push(bullet);
    tank.activeBullets.push(bullet);
  }

  spawnTankHitExplosion(x, y) {
    const explosion = this.add
      .image(x, y, "tank-explosion")
      .setDepth(260)
      .setAlpha(1)
      .setDisplaySize(80, 80);

    this.entityLayer.add(explosion);

    this.tweens.add({
      targets: explosion,
      displayWidth: 110,
      displayHeight: 220,
      alpha: 0.08,
      duration: 500,
      ease: "Cubic.Out",
      onComplete: () => explosion.destroy(),
    });
  }

  removeBulletByIndex(index) {
    const bullet = this.bullets[index];
    if (!bullet) return;
    bullet.isAlive = false;
    if (bullet.ownerTank?.activeBullets) {
      bullet.ownerTank.activeBullets = bullet.ownerTank.activeBullets.filter((item) => item !== bullet);
    }
    bullet.sprite?.destroy();
    this.bullets.splice(index, 1);
  }

  updateBullets(delta) {
    const bulletsToRemove = new Set();

    this.bullets.forEach((bullet) => {
      bullet.sprite.x += (bullet.xSpeed * delta) / 1000;
      bullet.sprite.y += (bullet.ySpeed * delta) / 1000;
      if (typeof bullet.sprite.setRadius === "function" && bullet.radius != null) {
        bullet.sprite.setRadius(bullet.radius);
      }
    });

    for (let i = 0; i < this.bullets.length; i += 1) {
      const bullet = this.bullets[i];
      if (!bullet || bulletsToRemove.has(i)) continue;

      const col = Math.floor((bullet.sprite.x - this.boardOriginX) / TILE_SIZE);
      const row = Math.floor((bullet.sprite.y - this.boardOriginY) / TILE_SIZE);

      if (!inBounds(col, row)) {
        bulletsToRemove.add(i);
        continue;
      }

      const obstacle = this.level.obstacles[row][col];
      if (obstacle && obstacle !== TILE.WATER) {
        if (isDestructibleTile(obstacle)) {
          this.level.obstacles[row][col] = null;
          this.redrawObstacles();
        } else if (obstacle === TILE.BASE) {
          this.isGameOver = true;
          this.showMessage("La base fue destruida");
          this.time.delayedCall(1100, () => this.scene.restart());
        }

        bulletsToRemove.add(i);
        continue;
      }

      for (let j = i + 1; j < this.bullets.length; j += 1) {
        const other = this.bullets[j];
        if (!other || bulletsToRemove.has(j) || bullet.ownerType === other.ownerType) continue;
        const combinedRadius = (bullet.hitRadius || bullet.radius || 0) + (other.hitRadius || other.radius || 0);
        if (vectorLength(bullet.sprite.x - other.sprite.x, bullet.sprite.y - other.sprite.y) <= combinedRadius) {
          bulletsToRemove.add(i);
          bulletsToRemove.add(j);
          break;
        }
      }

      if (bulletsToRemove.has(i)) continue;

      if (bullet.ownerType !== "player") {
        if (this.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, this.player, bullet.hitRadius)) {
          bulletsToRemove.add(i);
          this.handlePlayerHit();
          continue;
        }
      } else {
        const hitEnemy = this.enemies.find((enemy) =>
          this.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, enemy, bullet.hitRadius)
        );

        if (hitEnemy) {
          bulletsToRemove.add(i);
          this.spawnTankHitExplosion(hitEnemy.x, hitEnemy.y);
          hitEnemy.container.destroy();
          this.enemies = this.enemies.filter((enemy) => enemy !== hitEnemy);
          this.destroyedEnemiesCount += 1;
          this.fillEnemyWaveSlots();
          this.updateWaveText();
        }
      }
    }

    [...bulletsToRemove]
      .sort((a, b) => b - a)
      .forEach((index) => {
        this.removeBulletByIndex(index);
      });
  }

  isBulletNearTank(x, y, tank, bulletHitRadius = 0) {
    if (!tank) return false;
    return vectorLength(x - tank.x, y - tank.y) < TANK_HIT_RADIUS + bulletHitRadius;
  }

  redrawObstacles() {
    this.obstacleLayer.removeAll(true);
    this.baseSprite = null;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const obstacle = this.level.obstacles[row][col];
        if (!obstacle) continue;

        const x = cellCenterX(col, this.boardOriginX);
        const y = cellCenterY(row, this.boardOriginY);

        if (obstacle === TILE.BASE) {
          if (isBaseAnchorCell(this.level, col, row)) {
            this.baseSprite = this.add
              .image(bigCellCenterX(col, this.boardOriginX), bigCellCenterY(row, this.boardOriginY), "eagle")
              .setDisplaySize(MACRO_TILE_SIZE, MACRO_TILE_SIZE)
              .setDepth(20);
            this.obstacleLayer.add(this.baseSprite);
          }
        } else {
          this.obstacleLayer.add(this.makeTileSprite(obstacle, x, y));
        }
      }
    }
  }

  updateLivesText() {
    if (!this.livesText) return;
    const total = Math.max(1, Math.round(this.settings.playerLives || 1));
    const remaining = Math.max(0, Math.min(total, this.playerLivesRemaining || 0));
    const respawnSuffix = this.isPlayerRespawning ? "  |  Reapareciendo..." : "";
    this.livesText.setText(`Vidas: ${remaining}/${total}${respawnSuffix}`);
  }

  destroyPlayerTankVisuals() {
    if (!this.player) return;

    this.player.activeBullets = [];
    this.player.container?.destroy();
    this.player = null;
  }

  handlePlayerHit() {
    if (!this.player || this.isPlayerRespawning || this.isGameOver || this.isTransitioning) return;

    this.spawnTankHitExplosion(this.player.x, this.player.y);
    this.playerLivesRemaining = Math.max(0, this.playerLivesRemaining - 1);
    this.destroyPlayerTankVisuals();

    if (this.playerLivesRemaining <= 0) {
      this.isGameOver = true;
      this.updateLivesText();
      this.showMessage(`Sin vidas
Game Over`);
      this.time.delayedCall(1300, () => this.scene.restart());
      return;
    }

    this.isPlayerRespawning = true;
    this.updateLivesText();
    this.showMessage("Perdiste una vida");
    this.schedulePlayerRespawn();
  }

  schedulePlayerRespawn(delay = PLAYER_RESPAWN_DELAY) {
    if (this.playerRespawnEvent) {
      this.playerRespawnEvent.remove(false);
      this.playerRespawnEvent = null;
    }

    this.playerRespawnEvent = this.time.delayedCall(delay, () => {
      this.playerRespawnEvent = null;
      this.tryRespawnPlayer();
    });
  }

  tryRespawnPlayer() {
    if (this.isTransitioning || this.isGameOver || this.playerLivesRemaining <= 0 || this.player) {
      return;
    }

    const spawnX = bigCellCenterX(PLAYER_SPAWN_COL, this.boardOriginX);
    const spawnY = bigCellCenterY(PLAYER_SPAWN_ROW, this.boardOriginY);

    if (!this.canOccupyWorldPosition(spawnX, spawnY, null)) {
      this.schedulePlayerRespawn(500);
      return;
    }

    this.createPlayer();
    this.isPlayerRespawning = false;
    this.updateLivesText();
    this.showMessage("Reapareciste");
  }

  updateWaveText() {
    const remainingToSpawn = this.totalEnemiesForLevel - this.spawnedEnemiesCount;
    this.waveText.setText(
      `Enemigos: ${this.destroyedEnemiesCount}/${this.totalEnemiesForLevel}  |  En pantalla: ${this.enemies.length}  |  Restan por salir: ${remainingToSpawn}`
    );
  }

  checkLevelComplete() {
    if (this.isTransitioning) return;
    if (this.enemies.length > 0) return;
    if (this.spawnedEnemiesCount < this.totalEnemiesForLevel) return;

    this.isTransitioning = true;

    if (this.currentLevelIndex >= LEVELS.length - 1) {
      this.showMessage("Nivel 5 completado\nBoss próximamente...");
      this.time.delayedCall(1700, () => this.scene.restart());
      return;
    }

    this.showMessage(`Nivel ${this.currentLevelIndex + 1} completado`);

    this.time.delayedCall(1300, () => {
      this.currentLevelIndex += 1;
      this.isTransitioning = false;
      this.loadLevel(this.currentLevelIndex);
    });
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);

    if (this.messageHideEvent) {
      this.messageHideEvent.remove(false);
    }

    this.messageHideEvent = this.time.delayedCall(MESSAGE_DURATION, () => {
      this.messageText.setVisible(false);
    });
  }
}
