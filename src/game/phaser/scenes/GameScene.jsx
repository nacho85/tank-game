import * as Phaser from "phaser";
import {
  AIM_DEADZONE,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BULLET_SPEED,
  EAGLE_COL,
  EAGLE_ROW,
  ENEMY_BODY_BASE_FACING_DEG,
  ENEMY_BODY_RING_CENTER,
  ENEMY_SPEED,
  ENEMY_TURRET_BASE_FACING_RAD,
  ENEMY_TURRET_CAP_CENTER,
  FIRE_COOLDOWN_ENEMY,
  FIRE_COOLDOWN_PLAYER,
  GRID_SIZE,
  HUD_GUTTER,
  HUD_SIDEBAR_WIDTH,
  LEVEL_WAVE_CONFIGS,
  MACRO_EAGLE_COL,
  MACRO_EAGLE_ROW,
  MACRO_GRID_SIZE,
  MACRO_PLAYER_SPAWN_COL,
  MACRO_PLAYER_SPAWN_ROW,
  MACRO_TILE_SIZE,
  MENU_AXIS_THRESHOLD,
  MESSAGE_DURATION,
  MOVE_DEADZONE,
  OUTER_BORDER_SIZE,
  OUTER_BORDER_TILES,
  PATROL_ZONES,
  PLAYER_BODY_BASE_FACING_DEG,
  PLAYER_BODY_RING_CENTER,
  PLAYER_RESPAWN_DELAY,
  PLAYER_SPAWN_COL,
  PLAYER_SPAWN_ROW,
  PLAYER_SPEED,
  PLAYER_TURRET_BASE_FACING_RAD,
  PLAYER_TURRET_CAP_CENTER,
  PLAYER_TURRET_MANUAL_TURN_SPEED,
  PLAYER_TWO_SPAWN_COL,
  PLAYER_TWO_SPAWN_ROW,
  PRESETS_STORAGE_KEY,
  SETTINGS_SCHEMA,
  SETTINGS_STORAGE_KEY,
  SETTINGS_TABS,
  STATS_STORAGE_KEY,
  TANK_COLLISION_SIZE,
  TANKETTE_BODY_TURRET_ANCHOR,
  TANKETTE_TURRET_PIVOT,
  TANK_HIT_RADIUS,
  TANK_RENDER_SIZE,
  TILE,
  TILE_SIZE,
  TILE_SUBDIVISION,
} from "../shared/constants";
import {
  BASE_MACRO_LEVEL,
  bigCellCenterX,
  bigCellCenterY,
  cellCenterX,
  cellCenterY,
  clearFineRect,
  cloneMatrix,
  createBaseLevel,
  applyBaseFortressToFineLevel,
  createProceduralSurvivalLevel,
  expandLevelFromMacro,
  inBounds,
  isBaseAnchorCell,
  isBlockingTile,
  isDestructibleTile,
  reserveSafetyAreaAroundWorldPoint,
  withPattern,
  worldToGridCol,
  worldToGridRow,
} from "../shared/levelGeneration";
import {
  angleDegFromVector,
  clamp,
  circlesOverlap,
  cloneCombatStats,
  randomChoice,
  createEmptyCombatStats,
  normalizeVector,
  sanitizePresetName,
  vectorLength,
  wrapRadDiff,
} from "../shared/math";
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
    this.load.image("tile-cliff-dark-1", "/tank-game/tile-cliff-dark-1.png");

    this.load.image("player-body-yellow-v2", "/tank-game/player-body-yellow-V2.png");
    this.load.image("player-turret-yellow-v2", "/tank-game/player-turret-yellow-V2.png");
    this.load.image("player-body-green-v2", "/tank-game/player-body-green-V2.png");
    this.load.image("player-turret-green-v2", "/tank-game/player-turret-green-V2.png");

    this.load.image("enemy-body-gray-v2", "/tank-game/enemy-body-gray-V2.png");
    this.load.image("enemy-turret-gray-v2", "/tank-game/enemy-turret-gray-V2.png");
    this.load.image("enemy-tankette-body", "/tank-game/enemy-tunkett.png");
    this.load.image("enemy-tankette-turret", "/tank-game/enemy-tunkett-turret.png");

    this.load.image("eagle", "/tank-game/eagle.png");
    this.load.image("tank-explosion", "/tank-game/explosion.png");
    this.load.image("tank-projectile", "/tank-game/projectile1.png");
    this.load.image("boss-heli-body", "/tank-game/helicopter.png");
    this.load.image("boss-heli-rotor", "/tank-game/rotor.png");
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.settings = this.loadSettings();
    this.presets = this.loadPresets();
    this.combatStats = this.loadCombatStats();
    this.selectedPresetName = this.getFirstPresetName();
    this.presetPage = 0;
    this.wasMenuPressed = false;
    this.isMenuOpen = false;
    this.activeSettingsTab = "mode";

    this.boardOriginX = Math.max(HUD_SIDEBAR_WIDTH + HUD_GUTTER, width - BOARD_WIDTH - HUD_GUTTER);
    this.boardOriginY = Math.floor((height - BOARD_HEIGHT) / 2);

    this.cameras.main.setBackgroundColor("#111111");

    this.currentLevelIndex = 0;
    this.currentGameMode = this.getCurrentGameMode();
    this.survivalWaveIndex = 1;
    this.survivalKillsForNextFortressRegen = 0;
    this.isTransitioning = false;
    this.isGameOver = false;
    this.isPlayerRespawning = false;
        this.playerLivesRemaining = this.getConfiguredStartingLives();
    this.playerTwoLivesRemaining = this.getConfiguredStartingLives();
    this.playerTwoJoined = false;
    this.playerRespawnEvents = { 1: null, 2: null };
    this.bullets = [];
    this.wasPlayerFireDown = false;
    this.wasPlayerTwoFireDown = false;
    this.wasPadStartPressed = {};
    this.pendingEnemySpawnEvents = [];
    this.enemies = [];
    this.nextEnemySpawnIndex = 0;
    this.boss = null;
    this.isBossBattle = false;

    this.spawnPoints = [
      { col: 1, row: 1 },
      { col: 12, row: 1 },
      { col: 24, row: 1 },
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

    this.hudPanel = this.add
      .rectangle(HUD_SIDEBAR_WIDTH / 2, height / 2, HUD_SIDEBAR_WIDTH - 8, height - 8, 0x0a0f14, 0.9)
      .setStrokeStyle(2, 0x26323d, 0.95)
      .setDepth(990);

    const hudX = 18;
    const hudWrapWidth = HUD_SIDEBAR_WIDTH - 36;

    this.levelText = this.add
      .text(hudX, 18, "", {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#ffffff",
        wordWrap: { width: hudWrapWidth },
      })
      .setDepth(1000);

    this.waveText = this.add
      .text(hudX, 58, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        wordWrap: { width: hudWrapWidth },
      })
      .setDepth(1000);

    this.livesText = this.add
      .text(hudX, 148, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffd166",
        wordWrap: { width: hudWrapWidth },
      })
      .setDepth(1000);

    this.coopText = this.add
      .text(hudX, 238, "P2: pulsa START en gamepad 2 para unirte", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#b4f8c8",
        wordWrap: { width: hudWrapWidth },
      })
      .setDepth(1000);

    this.padStatusText = this.add
      .text(hudX, 312, "Gamepads: esperando...", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#9ad1ff",
        wordWrap: { width: hudWrapWidth },
      })
      .setDepth(1000);

    this.statsText = this.add
      .text(hudX, 374, "", {
        fontFamily: "Arial",
        fontSize: "15px",
        color: "#d7f9ff",
        wordWrap: { width: hudWrapWidth },
        lineSpacing: 6,
      })
      .setDepth(1000);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      i: Phaser.Input.Keyboard.KeyCodes.I,
      j: Phaser.Input.Keyboard.KeyCodes.J,
      k: Phaser.Input.Keyboard.KeyCodes.K,
      l: Phaser.Input.Keyboard.KeyCodes.L,
      t: Phaser.Input.Keyboard.KeyCodes.T,
      f: Phaser.Input.Keyboard.KeyCodes.F,
      g: Phaser.Input.Keyboard.KeyCodes.G,
      h: Phaser.Input.Keyboard.KeyCodes.H,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      rightCtrl: Phaser.Input.Keyboard.KeyCodes.CTRL,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      numpad0: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
      numpad4: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
      numpad5: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
      numpad6: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
      numpad8: Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });

    if (this.input.gamepad) {
      this.input.gamepad.start();
    }

    this.createSettingsMenu();
    this.loadSelectedGameMode();
    this.refreshDebugOverlay();
    this.updateStatsText();
    this.toggleSettingsMenu(true);
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

  loadCombatStats() {
    if (typeof window === "undefined") return createEmptyCombatStats();

    try {
      const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
      if (!raw) return createEmptyCombatStats();
      const parsed = JSON.parse(raw);
      return {
        player1: { ...createEmptyCombatStats().player1, ...(parsed?.player1 || {}) },
        player2: { ...createEmptyCombatStats().player2, ...(parsed?.player2 || {}) },
        enemies: { ...createEmptyCombatStats().enemies, ...(parsed?.enemies || {}) },
        totals: { ...createEmptyCombatStats().totals, ...(parsed?.totals || {}) },
      };
    } catch {
      return createEmptyCombatStats();
    }
  }

  saveCombatStats() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(this.combatStats || createEmptyCombatStats()));
  }

  getCombatStatsBucketKey(ownerType) {
    if (ownerType === "player") return "player1";
    if (ownerType === "player2") return "player2";
    return "enemies";
  }

  noteCombatShot(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].shots += 1;
    this.combatStats.totals.shots += 1;
    this.saveCombatStats();
    this.updateStatsText();
  }

  noteCombatBrickShot(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].brickShots += 1;
    this.combatStats.totals.brickShots += 1;
    this.combatStats[bucket].shots = Math.max(0, this.combatStats[bucket].shots - 1);
    this.combatStats.totals.shots = Math.max(0, this.combatStats.totals.shots - 1);
    this.saveCombatStats();
    this.updateStatsText();
  }

  noteCombatHit(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].hits += 1;
    this.combatStats.totals.hits += 1;
    this.saveCombatStats();
    this.updateStatsText();
  }

  noteCombatKill(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].kills += 1;
    this.combatStats.totals.kills += 1;
    this.saveCombatStats();
    this.updateStatsText();
  }

  noteCombatDeath(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].deaths += 1;
    this.combatStats.totals.deaths += 1;
    this.saveCombatStats();
    this.updateStatsText();
  }

  getAccuracySummary(bucketKey) {
    const stats = this.combatStats || createEmptyCombatStats();
    const bucket = stats[bucketKey] || { shots: 0, hits: 0 };
    const shots = Math.max(0, bucket.shots || 0);
    const hits = Math.max(0, bucket.hits || 0);
    const pct = shots > 0 ? Math.round((hits / shots) * 100) : 0;
    return { shots, hits, pct };
  }

  updateStatsText() {
    if (!this.statsText) return;
    const p1 = this.getAccuracySummary("player1");
    const p2 = this.getAccuracySummary("player2");
    const enemy = this.getAccuracySummary("enemies");
    const totalKills = this.combatStats?.totals?.kills || 0;
    this.statsText.setText(
      "Bajas totales: " + totalKills + "\n" +
      "Acc P1: " + p1.pct + "% (" + p1.hits + "/" + p1.shots + ")\n" +
      "Acc P2: " + p2.pct + "% (" + p2.hits + "/" + p2.shots + ")\n" +
      "Acc EN: " + enemy.pct + "% (" + enemy.hits + "/" + enemy.shots + ")"
    );
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

  /**
   * Devuelve el modo elegido actualmente.
   *
   * 0 = clásico, 1 = survival. Mantenerlo como entero simplifica
   * la persistencia junto al resto de sliders del menú.
   */
  getCurrentGameMode() {
    return Math.round(this.settings?.gameMode || 0) === 1 ? "survival" : "classic";
  }

  getConfiguredStartingLives() {
    if (this.getCurrentGameMode() === "survival") {
      return Math.max(1, Math.round(this.settings?.survivalInitialLives || 3));
    }
    return Math.max(1, Math.round(this.settings?.playerLives || 3));
  }

  /**
   * Reinicia el estado del modo actual y vuelve a cargar el mapa apropiado.
   *
   * Se usa tanto al inicio como cuando el usuario cambia entre clásico y
   * survival desde el menú.
   */
  loadSelectedGameMode() {
    this.currentGameMode = this.getCurrentGameMode();
    this.currentLevelIndex = 0;
    this.isTransitioning = false;
    this.isGameOver = false;
    this.survivalWaveIndex = 1;
    this.survivalKillsForNextFortressRegen = 0;
    this.playerLivesRemaining = this.getConfiguredStartingLives();
    this.playerTwoLivesRemaining = this.getConfiguredStartingLives();
    this.playerTwoJoined = false;
    this.wasPlayerFireDown = false;
    this.wasPlayerTwoFireDown = false;

    if (this.currentGameMode === "survival") {
      this.loadSurvivalMode();
      return;
    }

    this.loadLevel(0);
  }

  loadSurvivalMode() {
    this.clearLevelVisuals();
    this.level = createProceduralSurvivalLevel(this.settings);
    this.totalEnemiesForLevel = Number.POSITIVE_INFINITY;
    this.maxConcurrentEnemies = Math.max(2, Math.round(this.settings?.survivalMaxConcurrentEnemies || 4));
    this.spawnedEnemiesCount = 0;
    this.destroyedEnemiesCount = 0;
    this.levelText.setText("Modo Survival");
    this.drawBoard();
    if (this.playerLivesRemaining > 0) {
      this.createPlayer();
    }
    if (this.isKeyboardControlledSlot(2) && this.playerTwoLivesRemaining > 0) {
      this.createPlayerTwo();
    }
    this.fillEnemyWaveSlots();
    this.updateWaveText();
    this.updateLivesText();
    this.updateCoopText();
  }

  /**
   * Regenera el mapa survival sobre la marcha sin reiniciar la partida.
   *
   * Conserva al jugador y enemigos vivos, pero limpia obstáculos alrededor de
   * sus posiciones actuales para que nadie quede embebido dentro del terreno
   * nuevo luego del reshuffle procedural.
   */
  reshuffleSurvivalMap() {
    if (this.currentGameMode !== "survival") return;

    const reservedWorldPoints = [
      this.player ? { x: this.player.x, y: this.player.y } : null,
      this.playerTwo ? { x: this.playerTwo.x, y: this.playerTwo.y } : null,
      ...this.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y })),
    ].filter(Boolean);

    const newLevel = createProceduralSurvivalLevel(this.settings);
    reservedWorldPoints.forEach((point) => {
      const col = worldToGridCol(point.x, this.boardOriginX);
      const row = worldToGridRow(point.y, this.boardOriginY);
      clearFineRect(newLevel, col - 1, row - 1, 4, 4);
    });

    this.level = newLevel;
    this.destroyAllBullets();
    this.drawBoard();
    this.showMessage("Mapa remezclado");
  }

  /**
   * Elimina todas las balas activas del mundo y limpia las referencias que
   * cada tanque mantiene sobre sus proyectiles vivos. Se usa antes de
   * remezclar el mapa para evitar colisiones fantasma con tiles recién
   * generados.
   */
  destroyAllBullets() {
    const bullets = Array.isArray(this.bullets) ? this.bullets : [];
    bullets.forEach((bullet) => {
      bullet.isAlive = false;
      bullet.alive = false;
      bullet.sprite?.destroy();
    });

    [...this.getFriendlyTanks(), ...this.enemies]
      .filter(Boolean)
      .forEach((tank) => {
        tank.activeBullets = [];
        tank.fireLatch = false;
      });

    this.bullets = [];
  }

  rebuildBaseFortress() {
    if (!this.level?.obstacles?.[EAGLE_ROW]?.[EAGLE_COL]) {
      return;
    }
    applyBaseFortressToFineLevel(this.level, TILE.BRICK);
    this.redrawObstacles();
  }

  handleEnemyDestroyed(enemy, killerType = "player") {
    if (!enemy) return;

    if (enemy.isBoss) {
      this.noteCombatKill(killerType);
      this.noteCombatDeath("enemy");
      this.spawnTankHitExplosion(enemy.x, enemy.y);
      this.spawnTankHitExplosion(enemy.x - 18, enemy.y + 10);
      this.spawnTankHitExplosion(enemy.x + 22, enemy.y - 8);
      enemy.container?.destroy();
      this.enemies = this.enemies.filter((item) => item !== enemy);
      this.boss = null;
      this.isBossBattle = false;
      this.showMessage("Boss destruido\nVictoria");
      this.updateWaveText();
      this.saveSettings();
      this.saveCombatStats();
      this.time.delayedCall(2200, () => this.scene.restart());
      return;
    }

    this.noteCombatKill(killerType);
    this.noteCombatDeath("enemy");
    this.spawnTankHitExplosion(enemy.x, enemy.y);
    enemy.container?.destroy();
    this.enemies = this.enemies.filter((item) => item !== enemy);
    this.destroyedEnemiesCount += 1;

    if (this.currentGameMode === "survival") {
      const regenEvery = Math.max(1, Math.round(this.settings?.survivalFortressRegenEvery || 15));
      if (this.destroyedEnemiesCount % regenEvery === 0) {
        this.rebuildBaseFortress();
        this.showMessage("Fortaleza regenerada");
      }

      const shuffleEvery = Math.max(1, Math.round(this.settings?.survivalShuffleEveryKills || 40));
      if (this.destroyedEnemiesCount > 0 && this.destroyedEnemiesCount % shuffleEvery === 0) {
        this.reshuffleSurvivalMap();
      }

      this.survivalWaveIndex = 1 + Math.floor(this.destroyedEnemiesCount / 10);
    }

    this.scheduleEnemyRefill();
    this.updateWaveText();
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

  /**
   * Guarda el snapshot actual sin usar prompt del navegador.
   *
   * Esto evita overlays/autocomplete externos que se estaban mezclando
   * visualmente con el canvas. Si ya hay un preset seleccionado, lo actualiza.
   * Si no, genera automáticamente un nombre secuencial.
   */
  savePresetFlow() {
    const existingNames = this.getPresetNames();
    const baseName = this.selectedPresetName || `Preset ${existingNames.length + 1}`;
    let name = sanitizePresetName(baseName);

    if (!this.selectedPresetName) {
      let suffix = 1;
      while (this.presets?.[name]) {
        suffix += 1;
        name = sanitizePresetName(`Preset ${existingNames.length + suffix}`);
      }
    }

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

    const panelWidth = Math.min(940, width - 28);
    const panelHeight = Math.min(820, height - 20);
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
      const widthForTab = tab.key === "enemyAi" ? 132 : (tab.key === "mapGen" ? 142 : (tab.key === "controls" ? 120 : (tab.key === "meta" ? 128 : 110)));
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

    // Viewport interno del contenido. Si una categoría no entra completa,
    // se desplaza dentro de esta ventana y aparece una barra a la derecha.
    this.sectionViewportX = this.sectionBg.x + 12;
    this.sectionViewportY = this.sectionBg.y + 12;
    this.sectionViewportWidth = this.sectionBg.width - 36;
    this.sectionViewportHeight = this.sectionBg.height - 24;
    this.menuScrollOffset = 0;
    this.maxMenuScrollOffset = 0;

    this.sectionScrollTrack = this.add
      .rectangle(this.sectionBg.x + this.sectionBg.width - 14, this.sectionViewportY, 8, this.sectionViewportHeight, 0x21303c, 0.95)
      .setOrigin(0, 0)
      .setVisible(false);
    this.sectionScrollThumb = this.add
      .rectangle(this.sectionBg.x + this.sectionBg.width - 14, this.sectionViewportY, 8, 48, 0xa7c7e7, 0.95)
      .setOrigin(0, 0)
      .setVisible(false);
    this.settingsPanel.add([this.sectionScrollTrack, this.sectionScrollThumb]);

    this.sectionMaskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    this.sectionMaskGraphics.fillStyle(0xffffff, 1);
    this.sectionMaskGraphics.fillRect(
      this.sectionViewportX,
      this.sectionViewportY,
      this.sectionViewportWidth,
      this.sectionViewportHeight
    );
    this.sectionContentMask = this.sectionMaskGraphics.createGeometryMask();

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
      [label, track, fill, handle, valueBox, valueText].forEach((obj) => obj.setMask(this.sectionContentMask));

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
    [presetTitle, presetHelp].forEach((obj) => obj.setMask(this.sectionContentMask));
    this.presetSectionObjects.push(presetTitle, presetHelp);

    this.presetNameText = this.add.text(sectionLeft + 16, sectionTop + 88, "Preset seleccionado: -", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#f8fafc",
    });
    this.settingsPanel.add(this.presetNameText);
    this.presetNameText.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetNameText);

    this.presetButtons = [];
    const buttonY = sectionTop + 124;
    const buttons = [
      { label: "Guardar / actualizar", x: sectionLeft + 16, width: 180, action: () => this.savePresetFlow() },
      { label: "Cargar seleccionado", x: sectionLeft + 212, width: 200, action: () => this.loadSelectedPreset() },
      { label: "Borrar seleccionado", x: sectionLeft + 428, width: 190, action: () => this.deleteSelectedPreset() },
    ];

    buttons.forEach((buttonConfig) => {
      const button = this.createMenuButton(buttonConfig.x, buttonY, buttonConfig.width, 38, buttonConfig.label, buttonConfig.action);
      this.settingsPanel.add(button.objects);
      button.objects.forEach((obj) => obj.setMask(this.sectionContentMask));
      this.presetButtons.push(button);
      this.presetSectionObjects.push(...button.objects);
    });

    this.presetListBg = this.add.rectangle(sectionLeft + 16, buttonY + 56, sectionWidth - 32, 216, 0x14202b, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x52657b, 1);
    this.settingsPanel.add(this.presetListBg);
    this.presetListBg.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetListBg);

    this.presetPageText = this.add.text(sectionLeft + sectionWidth - 220, buttonY + 20, "", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#a7c7e7",
    });
    this.settingsPanel.add(this.presetPageText);
    this.presetPageText.setMask(this.sectionContentMask);
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
    prevPageButton.objects.forEach((obj) => obj.setMask(this.sectionContentMask));
    nextPageButton.objects.forEach((obj) => obj.setMask(this.sectionContentMask));
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
      rowBg.setMask(this.sectionContentMask);
      rowText.setMask(this.sectionContentMask);
      this.presetRowControls.push({ rowBg, rowText });
      this.presetSectionObjects.push(rowBg, rowText);
    }

    this.presetEmptyText = this.add.text(sectionLeft + 40, buttonY + 146, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#93a4b4",
    });
    this.settingsPanel.add(this.presetEmptyText);
    this.presetEmptyText.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetEmptyText);

    const footer = this.add.text(panelX + 24, panelY + panelHeight - 34, "START / ESC abre/cierra · Stick izq/flechas navegan · A acepta · B vuelve/cierra", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#93a4b4",
    });
    this.settingsPanel.add(footer);

    this.input.on("wheel", (pointer, _objects, _deltaX, deltaY) => {
      if (!this.isMenuOpen) return;
      const withinX = pointer.worldX >= this.sectionBg.x && pointer.worldX <= this.sectionBg.x + this.sectionBg.width;
      const withinY = pointer.worldY >= this.sectionBg.y && pointer.worldY <= this.sectionBg.y + this.sectionBg.height;
      if (!withinX || !withinY) return;
      this.setMenuScrollOffset((this.menuScrollOffset || 0) + deltaY * 0.7);
    });

    this.menuFocus = { row: -1, column: 0 };
    this.menuNavInputState = { up: false, down: false, left: false, right: false, accept: false, back: false };

    // Al crear el menú escondemos la sección de presets hasta que realmente
    // se active su pestaña. Esto evita que quede montada sobre la primera vista.
    this.setPresetSectionVisible(false);
    this.setActiveSettingsTab(this.activeSettingsTab || "combat");
    this.refreshPresetSection();
  }

  getMenuContentHeightForTab(tabKey) {
    if (tabKey === "presets") {
      return 340;
    }

    const visibleControls = this.sliderControls.filter((control) => control.category === tabKey);
    if (!visibleControls.length) return 0;
    return 24 + Math.max(0, visibleControls.length - 1) * 50 + 44;
  }

  setMenuScrollOffset(nextOffset = 0) {
    this.maxMenuScrollOffset = Math.max(0, this.getMenuContentHeightForTab(this.activeSettingsTab) - this.sectionViewportHeight);
    this.menuScrollOffset = clamp(nextOffset, 0, this.maxMenuScrollOffset);
    this.layoutActiveSettingsSection();
  }

  refreshMenuScrollUI(contentHeight = this.getMenuContentHeightForTab(this.activeSettingsTab)) {
    const needsScroll = contentHeight > this.sectionViewportHeight + 2;
    this.sectionScrollTrack?.setVisible(needsScroll);
    this.sectionScrollThumb?.setVisible(needsScroll);

    if (!needsScroll) {
      return;
    }

    const thumbHeight = Math.max(42, this.sectionViewportHeight * (this.sectionViewportHeight / Math.max(contentHeight, 1)));
    const travel = Math.max(0, this.sectionViewportHeight - thumbHeight);
    const ratio = this.maxMenuScrollOffset <= 0 ? 0 : this.menuScrollOffset / this.maxMenuScrollOffset;
    this.sectionScrollThumb.setDisplaySize(8, thumbHeight);
    this.sectionScrollThumb.setPosition(this.sectionScrollTrack.x, this.sectionViewportY + travel * ratio);
  }

  ensureFocusedMenuRowVisible() {
    if (!this.isMenuOpen || this.activeSettingsTab === "presets") return;

    const focusedRow = this.menuFocus?.row ?? -1;
    if (focusedRow < 0) return;

    const rowTop = 20 + focusedRow * 50;
    const rowBottom = rowTop + 38;
    const visibleTop = this.menuScrollOffset || 0;
    const visibleBottom = visibleTop + this.sectionViewportHeight;

    if (rowTop < visibleTop) {
      this.setMenuScrollOffset(rowTop - 12);
      return;
    }

    if (rowBottom > visibleBottom) {
      this.setMenuScrollOffset(rowBottom - this.sectionViewportHeight + 12);
    }
  }

  layoutActiveSettingsSection() {
    if (!this.sectionBg) return;

    const sectionLeft = this.sectionBg.x;
    const sectionTop = this.sectionBg.y;
    const sectionWidth = this.sectionBg.width;
    const startY = sectionTop + 20 - (this.menuScrollOffset || 0);
    const visibleControls = this.sliderControls.filter((control) => control.category === this.activeSettingsTab);

    visibleControls.forEach((control, index) => {
      const rowY = startY + index * 50;
      control.label.setPosition(sectionLeft + 16, rowY);
      control.trackX = sectionLeft + 360;
      control.trackWidth = Math.max(180, Math.min(280, sectionWidth - 470));
      control.track.setPosition(control.trackX, rowY + 11);
      control.track.width = control.trackWidth;
      control.fill.setPosition(control.trackX, rowY + 11);
      control.valueBox.setPosition(sectionLeft + sectionWidth - 88, rowY - 4);
      control.valueText.setPosition(sectionLeft + sectionWidth - 57, rowY + 11);
      [control.label, control.track, control.fill, control.handle, control.valueBox, control.valueText].forEach((obj) => obj.setVisible(true));
      this.refreshSlider(control);
    });

    this.sliderControls
      .filter((control) => control.category !== this.activeSettingsTab)
      .forEach((control) => {
        [control.label, control.track, control.fill, control.handle, control.valueBox, control.valueText].forEach((obj) => obj.setVisible(false));
      });

    this.refreshMenuScrollUI(this.getMenuContentHeightForTab(this.activeSettingsTab));
  }

  /**
   * Activa una pestaña del menú y reposiciona únicamente los controles visibles
   * de esa categoría. Esto evita superposiciones entre sliders y la sección de presets.
   */
  setActiveSettingsTab(tabKey) {
    this.activeSettingsTab = tabKey;
    const hintMap = {
      mode: "Elegí entre Clásico y Survival. Survival usa oleadas infinitas y regeneración de fortaleza.",
      controls: "Elegí dispositivo y presets por jugador. P1 teclado: WASD + GHJY + Space. P2 teclado: Flechas + NumPad 4/5/6/8 + NumPad 0.",
      mapGen: "Procgen del survival: algoritmo, densidades, lagos/ríos, bushes orgánicos, edificios, puentes y reshuffle automático por bajas.",
      combat: "Balas del jugador/enemigos, hitboxes, fuego continuo y choque entre enemigos.",
      player: "Vidas, respawns y supervivencia de P1/P2, incluyendo vidas iniciales de survival.",
      enemyAi: "Perfiles claros de IA: Asedio, Cazador, Patrulla, Balanceado o Caótico. Los enemigos ahora también pueden tomar ladrillos críticos como objetivo real cuando bloquean rutas hacia la base o jugadores.",
      meta: "Meta / debug: muestra rutas, objetivos actuales, caminos evaluados, estados y métricas útiles para revisar si la IA progresa, se atasca, cambia de meta o necesita autocorrección.",
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

    this.setPresetSectionVisible(tabKey === "presets");
    this.menuScrollOffset = 0;
    this.layoutActiveSettingsSection();
    this.clampMenuFocus?.();
    this.ensureFocusedMenuRowVisible?.();
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
    this.ensureFocusedMenuRowVisible();
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
    this.ensureFocusedMenuRowVisible();
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
    const axisX = this.readPadAxis(0, 0);
    const axisY = this.readPadAxis(1, 0);

    return {
      up: this.cursors.up.isDown || axisY <= -MENU_AXIS_THRESHOLD,
      down: this.cursors.down.isDown || axisY >= MENU_AXIS_THRESHOLD,
      left: this.cursors.left.isDown || axisX <= -MENU_AXIS_THRESHOLD,
      right: this.cursors.right.isDown || axisX >= MENU_AXIS_THRESHOLD,
      accept: this.readPadButtonPressed(0, 0.35, 0) || this.keys.space.isDown || this.keys.enter?.isDown,
      back: this.readPadButtonPressed(1, 0.35, 0),
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
    let displayValue = String(value);
    if (schema.key === "gameMode") {
      displayValue = Math.round(value) === 1 ? "Survival" : "Clásico";
    } else if (schema.key === "survivalMapAlgorithm") {
      displayValue = ["Balanceado", "Carriles", "Islas"][Math.round(value)] || "Balanceado";
    } else if (schema.key === "enemyBehaviorPreset") {
      displayValue = this.getEnemyBehaviorPresetName(value);
    } else if (schema.key === "playerOneControlDevice" || schema.key === "playerTwoControlDevice") {
      displayValue = Math.round(value) === 1 ? "Joystick" : "Teclado";
    } else if (schema.max === 1 && schema.min === 0) {
      displayValue = Math.round(value) === 1 ? "Sí" : "No";
    }
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
      const tanks = [...this.getFriendlyTanks(), ...this.enemies].filter(Boolean);
      tanks.forEach((tank) => {
        const limit = this.getBulletLimitForTank(tank);
        if (tank?.activeBullets?.length > limit) {
          tank.activeBullets = tank.activeBullets.slice(-limit);
        }
      });
    }

    if (changedKey === "gameMode") {
      this.loadSelectedGameMode();
      return;
    }

    if (changedKey === "playerLives" || changedKey === "survivalInitialLives") {
      this.playerLivesRemaining = this.getConfiguredStartingLives();
      this.playerTwoLivesRemaining = this.getConfiguredStartingLives();
      this.updateLivesText();
      this.updateCoopText();
    }

    if (changedKey === "survivalMaxConcurrentEnemies" && this.currentGameMode === "survival") {
      this.maxConcurrentEnemies = Math.max(2, Math.round(this.settings?.survivalMaxConcurrentEnemies || 4));
      this.fillEnemyWaveSlots();
      this.updateWaveText();
    }

    if (
      [
        "survivalShuffleEveryKills",
        "survivalMapAlgorithm",
        "survivalRoadDensity",
        "survivalBrickDensity",
        "survivalBushDensity",
        "survivalBushClustering",
        "survivalBushPatchScale",
        "survivalSteelDensity",
        "survivalWaterDensity",
        "survivalWaterClustering",
        "survivalWaterBridgeChance",
        "survivalBuildingClustering",
        "survivalBuildingComplexity",
        "survivalShuffleVariability",
      ].includes(changedKey) &&
      this.currentGameMode === "survival"
    ) {
      this.reshuffleSurvivalMap();
      return;
    }

    if (changedKey === "playerOneControlDevice" || changedKey === "playerTwoControlDevice") {
      this.updateCoopText();
      this.updatePadStatus();
      if (changedKey === "playerTwoControlDevice" && this.playerTwo && this.isKeyboardControlledSlot(2)) {
        this.playerTwo.controlSlot = 2;
      }
    }

    if (["debugEnemyNavOverlay", "debugSpawnReserveOverlay", "debugEnemyStateText", "debugEnemyTargetOverlay", "debugEnemyPathOptions", "debugEnemyVerboseHud", "autoTestEnemyRoutes", "autoEvaluateEnemyRoutes", "autoCorrectEnemyRoutes"].includes(changedKey)) {
      this.refreshDebugOverlay();
    }

    if (changedKey === "enemyBehaviorPreset") {
      this.applyEnemyBehaviorPresetToSettings(this.settings.enemyBehaviorPreset);
    }

    if (["enemyBehaviorPreset", "enemyAggression", "enemyNavigationSkill", "enemyBreakBricks", "enemyRecoverySkill", "enemyFireDiscipline", "enemyShotFrequency", "bossBurstIntervalMs", "bossBurstCooldownMs"].includes(changedKey)) {
      this.rebuildEnemyNavigationField?.();
      this.enemies?.forEach((enemy) => {
        enemy.objectiveRetargetTimer = 0;
        enemy.patrolRetargetTimer = 0;
        enemy.routeRepathLatch = false;
      });
      if (this.boss) {
        this.boss.burstIntervalMs = Math.round(this.settings?.bossBurstIntervalMs || this.boss.burstIntervalMs || 150);
        this.boss.burstCooldownMs = Math.round(this.settings?.bossBurstCooldownMs || this.boss.burstCooldownMs || 2400);
        if (changedKey === "bossBurstCooldownMs") {
          this.boss.shotCooldown = Math.min(this.boss.shotCooldown || 0, this.boss.burstCooldownMs);
        }
      }
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
      // Al abrir el menú reiniciamos el estado de navegación para que START/A
      // no activen accidentalmente otra acción en el mismo frame.
      this.sliderControls.forEach((control) => this.refreshSlider(control));
      this.setActiveSettingsTab(this.activeSettingsTab || "combat");
      this.refreshPresetSection();
      this.menuNavInputState = this.readMenuNavigationIntent();
      this.setMenuFocus(-1, Math.max(0, SETTINGS_TABS.findIndex((tab) => tab.key === this.activeSettingsTab)));
    }
  }

  handleMenuToggleInput() {
    const menuPressed = this.keys.esc.isDown || this.readPadButtonPressed(9, 0.35, 0);
    if (menuPressed && !this.wasMenuPressed) {
      this.toggleSettingsMenu();
    }
    this.wasMenuPressed = menuPressed;
  }

  loadLevel(levelIndex) {
    this.clearLevelVisuals();
    this.enemyAiMetrics = { stuckEvents: 0, repaths: 0, recoveries: 0, samples: 0, longStucks: 0 };

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

    this.levelText.setText(`Modo Clásico · Nivel ${levelIndex + 1}`);

    this.drawBoard();
    if (this.playerLivesRemaining > 0) {
      this.createPlayer();
    }
    if (this.isKeyboardControlledSlot(2) && this.playerTwoLivesRemaining > 0) {
      this.createPlayerTwo();
    }
    this.fillEnemyWaveSlots();
    this.updateWaveText();
    this.updateLivesText();
    this.updateCoopText();
  }

  clearLevelVisuals() {
    if (this.floorLayer) this.floorLayer.removeAll(true);
    if (this.obstacleLayer) this.obstacleLayer.removeAll(true);
    if (this.entityLayer) this.entityLayer.removeAll(true);
    if (this.overlayLayer) this.overlayLayer.removeAll(true);

    this.bullets?.forEach((bullet) => bullet.sprite.destroy());
    this.bullets = [];
    this.wasPlayerFireDown = false;
    this.wasPlayerTwoFireDown = false;

    Object.values(this.playerRespawnEvents || {}).forEach((event) => event?.remove?.(false));
    this.playerRespawnEvents = { 1: null, 2: null };
    (this.pendingEnemySpawnEvents || []).forEach((event) => event?.remove?.(false));
    this.pendingEnemySpawnEvents = [];

    this.player = null;
    this.playerTwo = null;
    this.boss?.container?.destroy?.();
    this.boss = null;
    this.isBossBattle = false;
    this.enemies = [];
    this.baseSprite = null;
    this.isPlayerRespawning = false;
  }

  drawBoard() {
    if (this.floorLayer) this.floorLayer.removeAll(true);
    if (this.obstacleLayer) this.obstacleLayer.removeAll(true);
    if (this.overlayLayer) this.overlayLayer.removeAll(true);
    this.baseSprite = null;

    for (let borderRow = -OUTER_BORDER_TILES; borderRow < GRID_SIZE + OUTER_BORDER_TILES; borderRow += 1) {
      for (let borderCol = -OUTER_BORDER_TILES; borderCol < GRID_SIZE + OUTER_BORDER_TILES; borderCol += 1) {
        const isPerimeter = (
          borderCol < 0 ||
          borderRow < 0 ||
          borderCol >= GRID_SIZE ||
          borderRow >= GRID_SIZE
        );
        if (!isPerimeter) continue;

        const x = this.boardOriginX + OUTER_BORDER_SIZE + borderCol * TILE_SIZE + TILE_SIZE / 2;
        const y = this.boardOriginY + OUTER_BORDER_SIZE + borderRow * TILE_SIZE + TILE_SIZE / 2;
        this.floorLayer.add(
          this.add
            .image(x, y, "tile-cliff-dark-1")
            .setDisplaySize(TILE_SIZE, TILE_SIZE)
            .setDepth(2)
        );
      }
    }

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

    this.rebuildEnemyNavigationField();
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

  getPlayerSpawnForSlot(slot = 1) {
    if (slot === 2) {
      return { col: PLAYER_TWO_SPAWN_COL, row: PLAYER_TWO_SPAWN_ROW };
    }
    return { col: PLAYER_SPAWN_COL, row: PLAYER_SPAWN_ROW };
  }


  /**
   * Devuelve qué dispositivo controla a cada jugador humano.
   *
   * 0 = teclado, 1 = joystick. Para gamepad se usa el slot 0 en P1 y el slot 1
   * en P2. Esto permite cambiar el origen de input desde el menú sin tocar
   * código.
   */
  getControlDeviceForSlot(slot = 1) {
    if (slot === 2) {
      return Math.round(this.settings?.playerTwoControlDevice || 0);
    }
    return Math.round(this.settings?.playerOneControlDevice || 0);
  }

  isKeyboardControlledSlot(slot = 1) {
    return this.getControlDeviceForSlot(slot) === 0;
  }

  getGamepadSlotForPlayerSlot(slot = 1) {
    return slot === 2 ? 1 : 0;
  }

  getPlayerKeyboardMoveInput(slot = 1) {
    let x = 0;
    let y = 0;

    if (slot === 2) {
      if (this.cursors.left.isDown) x -= 1;
      if (this.cursors.right.isDown) x += 1;
      if (this.cursors.up.isDown) y -= 1;
      if (this.cursors.down.isDown) y += 1;
      return { x, y };
    }

    if (this.keys.a.isDown) x -= 1;
    if (this.keys.d.isDown) x += 1;
    if (this.keys.w.isDown) y -= 1;
    if (this.keys.s.isDown) y += 1;
    return { x, y };
  }

  getPlayerKeyboardAimInput(slot = 1) {
    let x = 0;
    let y = 0;

    if (slot === 2) {
      if (this.keys.numpad4.isDown) x -= 1;
      if (this.keys.numpad6.isDown) x += 1;
      if (this.keys.numpad8.isDown) y -= 1;
      if (this.keys.numpad5.isDown) y += 1;
      return { x, y };
    }

    if (this.cursors.left.isDown) x -= 1;
    if (this.cursors.right.isDown) x += 1;
    if (this.cursors.up.isDown) y -= 1;
    if (this.cursors.down.isDown) y += 1;
    return { x, y };
  }

  getFriendlyTanks() {
    return [this.player, this.playerTwo].filter(Boolean);
  }

  createPlayerTankForSlot(slot = 1) {
    const spawn = this.getPlayerSpawnForSlot(slot);
    const x = bigCellCenterX(spawn.col, this.boardOriginX);
    const y = bigCellCenterY(spawn.row, this.boardOriginY);

    const spriteParts = this.createTankSprite(
      x,
      y,
      slot === 2 ? "player-body-green-v2" : "player-body-yellow-v2",
      slot === 2 ? "player-turret-green-v2" : "player-turret-yellow-v2",
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

    const tank = {
      type: slot === 2 ? "player2" : "player",
      controlSlot: slot,
      ...spriteParts,
      x,
      y,
      col: spawn.col,
      row: spawn.row,
      moveAngleDeg: -90,
      turretAngleRad: -Math.PI / 2,
      moveSpeed: PLAYER_SPEED,
      shotCooldown: 0,
      activeBullets: [],
      fireLatch: false,
    };

    this.updateTankVisuals(tank);
    if (slot === 2) {
      this.playerTwo = tank;
      this.playerTwoJoined = true;
    } else {
      this.player = tank;
    }
    this.updateLivesText();
    this.updateCoopText();
    return tank;
  }

  /**
   * Crea el tanque del jugador en el punto de inicio del nivel.
   *
   * Con la grilla fina del mapa, el tanque vuelve a ocupar visualmente 2x2 tiles
   * actuales (equivalente al tile macro original), mientras que la lógica de
   * colisión sigue usando un tamaño independiente.
   */
  createPlayer() {
    return this.createPlayerTankForSlot(1);
  }

  createPlayerTwo() {
    return this.createPlayerTankForSlot(2);
  }

  getEnemySpawnVariant() {
    const tanketteRatio = clamp(Number(this.settings?.enemyTanketteRatio || 0) / 100, 0, 1);
    const spawnTankette = Math.random() < tanketteRatio;

    if (spawnTankette) {
      return {
        enemyClass: "tankette",
        bodyKey: "enemy-tankette-body",
        turretKey: "enemy-tankette-turret",
        moveSpeed: Math.max(120, Number(this.settings?.enemyTanketteSpeed || 165)),
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

    const variant = this.getEnemySpawnVariant();
    const spriteParts = this.createTankSprite(
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
      spawnIndex: spawn.spawnIndex ?? 0,
    };

    this.noteEnemySpawnUsage(enemy.spawnIndex);
    this.ensureEnemyRouteStats(enemy);
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

  startBossBattle() {
    this.destroyAllBullets();
    this.isBossBattle = true;
    this.levelText.setText("Boss · Helicóptero pesado");

    const spawnX = this.boardOriginX + BOARD_WIDTH * 0.5;
    const spawnY = this.boardOriginY + TILE_SIZE * 2.2;
    const boss = this.createBossHelicopter(spawnX, spawnY);
    this.boss = boss;
    this.enemies.push(boss);
    this.updateWaveText();
  }

  createBossHelicopter(x, y) {
    const container = this.add.container(x, y).setDepth(235);
    const body = this.add.image(0, 0, "boss-heli-body");
    const rotor = this.add.image(0, 0, "boss-heli-rotor");

    const bodyTexture = this.textures.get("boss-heli-body").getSourceImage();
    const rotorTexture = this.textures.get("boss-heli-rotor").getSourceImage();
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
    this.entityLayer.add(container);

    const cannonPointsPx = [
      { x: 171, y: 692 },
      { x: 411, y: 691 },
    ];

    return {
      type: "enemy",
      isBoss: true,
      x,
      y,
      col: worldToGridCol(x, this.boardOriginX),
      row: worldToGridRow(y, this.boardOriginY),
      container,
      body,
      rotor,
      rotorSpinSpeed: Phaser.Math.FloatBetween(0.22, 0.3),
      moveSpeed: TILE_SIZE * 1.9,
      targetPoint: null,
      retargetTimer: 0,
      shotCooldown: 700,
      burstShotsRemaining: 0,
      burstIntervalMs: Math.round(this.settings?.bossBurstIntervalMs || 150),
      burstTimer: 0,
      burstCooldownMs: Math.round(this.settings?.bossBurstCooldownMs || 2400),
      activeBullets: [],
      health: 28,
      maxHealth: 28,
      cannonOffsetsLocal: cannonPointsPx.map((point) => ({
        x: (point.x - bodyTexture.width / 2) * bodyScale,
        y: (point.y - bodyTexture.height / 2) * bodyScale,
      })),
    };
  }

  pickBossTargetPoint() {
    const focus = this.getNearestFriendlyTank(this.boardOriginX + BOARD_WIDTH / 2, this.boardOriginY + BOARD_HEIGHT / 2);
    const targetX = focus ? focus.x + Phaser.Math.Between(-TILE_SIZE * 2, TILE_SIZE * 2) : this.boardOriginX + BOARD_WIDTH * Phaser.Math.FloatBetween(0.2, 0.8);
    const targetY = focus ? focus.y - Phaser.Math.Between(TILE_SIZE * 2, TILE_SIZE * 4) : this.boardOriginY + BOARD_HEIGHT * Phaser.Math.FloatBetween(0.16, 0.48);
    return {
      x: clamp(targetX, this.boardOriginX + TILE_SIZE * 1.2, this.boardOriginX + BOARD_WIDTH - TILE_SIZE * 1.2),
      y: clamp(targetY, this.boardOriginY + TILE_SIZE * 1.1, this.boardOriginY + BOARD_HEIGHT - TILE_SIZE * 1.3),
    };
  }

  updateBoss(boss, delta) {
    if (!boss) return;

    boss.shotCooldown = Math.max(0, (boss.shotCooldown || 0) - delta);
    boss.burstTimer = Math.max(0, (boss.burstTimer || 0) - delta);
    boss.retargetTimer = Math.max(0, (boss.retargetTimer || 0) - delta);

    if (!boss.targetPoint || boss.retargetTimer <= 0 || vectorLength(boss.targetPoint.x - boss.x, boss.targetPoint.y - boss.y) < TILE_SIZE * 0.45) {
      boss.targetPoint = this.pickBossTargetPoint();
      boss.retargetTimer = Phaser.Math.Between(850, 1600);
    }

    const toTarget = normalizeVector(boss.targetPoint.x - boss.x, boss.targetPoint.y - boss.y);
    boss.x = clamp(boss.x + toTarget.x * boss.moveSpeed * (delta / 1000), this.boardOriginX + TILE_SIZE * 1.1, this.boardOriginX + BOARD_WIDTH - TILE_SIZE * 1.1);
    boss.y = clamp(boss.y + toTarget.y * boss.moveSpeed * (delta / 1000), this.boardOriginY + TILE_SIZE * 1.0, this.boardOriginY + BOARD_HEIGHT - TILE_SIZE * 1.2);
    boss.container.x = boss.x;
    boss.container.y = boss.y;

    boss.rotor.rotation += boss.rotorSpinSpeed * (delta / 16.666);

    const focus = this.getNearestFriendlyTank(boss.x, boss.y);
    if (!focus) return;

    boss.burstIntervalMs = Math.round(this.settings?.bossBurstIntervalMs || boss.burstIntervalMs || 150);
    boss.burstCooldownMs = Math.round(this.settings?.bossBurstCooldownMs || boss.burstCooldownMs || 2400);

    if (boss.burstShotsRemaining <= 0 && boss.shotCooldown <= 0) {
      boss.burstShotsRemaining = Phaser.Math.Between(4, 7);
      boss.burstTimer = 0;
      boss.shotCooldown = boss.burstCooldownMs;
    }

    if (boss.burstShotsRemaining > 0 && boss.burstTimer <= 0) {
      this.fireBossVolley(boss, focus);
      boss.burstShotsRemaining -= 1;
      boss.burstTimer = boss.burstIntervalMs;
    }
  }

  fireBossVolley(boss, target) {
    if (!boss || !target) return;

    boss.activeBullets = (boss.activeBullets || []).filter((bullet) => bullet && bullet.isAlive);

    const maxBossBullets = 16;
    if (boss.activeBullets.length >= maxBossBullets) return;

    const cos = Math.cos(0);
    const sin = Math.sin(0);

    boss.cannonOffsetsLocal.forEach((offset, index) => {
      const localX = offset.x * cos - offset.y * sin;
      const localY = offset.x * sin + offset.y * cos;
      const spawnX = boss.x + localX;
      const spawnY = boss.y + localY;
      const targetLeadX = target.x + (index === 0 ? -8 : 8);
      const targetLeadY = target.y + TILE_SIZE * 0.18;
      const shotAngle = Math.atan2(targetLeadY - spawnY, targetLeadX - spawnX);
      const speed = Math.max(260, this.getBulletSpeedForOwner("enemy") * 0.92);
      const bulletWidth = Math.max(18, this.getBulletWidthForOwner("enemy") + 6);
      const bulletLength = Math.max(24, this.getBulletLengthForOwner("enemy") - 6);
      const hitRadius = Math.max(12, this.getBulletHitRadiusForOwner("enemy") + 2);

      const bulletSprite = this.add
        .image(spawnX, spawnY, "tank-projectile")
        .setDepth(232)
        .setDisplaySize(bulletWidth, bulletLength)
        .setRotation(shotAngle + Math.PI / 2)
        .setAlpha(0.98)
        .setTint(0xffb347)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.entityLayer.add(bulletSprite);
      this.noteCombatShot("enemy");

      const bullet = {
        sprite: bulletSprite,
        ownerType: "enemy",
        ownerTank: boss,
        xSpeed: Math.cos(shotAngle) * speed,
        ySpeed: Math.sin(shotAngle) * speed,
        width: bulletWidth,
        length: bulletLength,
        hitRadius,
        isAlive: true,
      };

      this.bullets.push(bullet);
      boss.activeBullets.push(bullet);
    });
  }

  damageBoss(boss, damage = 1, killerType = "player") {
    if (!boss) return;
    boss.health = Math.max(0, (boss.health || 0) - damage);
    this.tweens.add({
      targets: boss.body,
      alpha: 0.45,
      duration: 70,
      yoyo: true,
      repeat: 0,
    });
    this.updateWaveText();
    if (boss.health <= 0) {
      this.handleEnemyDestroyed(boss, killerType);
    }
  }

  getBulletLimitForTank(tank) {
    if (tank?.type === "player" || tank?.type === "player2") {
      return Math.max(1, Math.round(this.settings.playerBulletLimit || 1));
    }
    return Math.max(1, Math.round(this.settings.enemyBulletLimit || 1));
  }

  getBulletWidthForOwner(ownerType) {
    return Math.max(
      8,
      Math.round((ownerType === "player" || ownerType === "player2") ? this.settings.playerBulletWidth || 14 : this.settings.enemyBulletWidth || 14)
    );
  }

  getBulletLengthForOwner(ownerType) {
    return Math.max(
      12,
      Math.round((ownerType === "player" || ownerType === "player2") ? this.settings.playerBulletLength || 36 : this.settings.enemyBulletLength || 36)
    );
  }

  getBulletHitRadiusForOwner(ownerType) {
    return Math.max(
      2,
      Math.round((ownerType === "player" || ownerType === "player2") ? this.settings.playerBulletHitbox || 10 : this.settings.enemyBulletHitbox || 10)
    );
  }

  getBulletSpeedForOwner(ownerType) {
    return Math.max(
      120,
      Math.round((ownerType === "player" || ownerType === "player2") ? this.settings.playerBulletSpeed || BULLET_SPEED : this.settings.enemyBulletSpeed || BULLET_SPEED)
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

    if ((tank.type === "player" || tank.type === "player2") && bodyFacingUp && turretFacingUp) {
      extraTurretOffsetX = this.settings.playerTurretUpExtraOffsetX;
      extraTurretOffsetY = this.settings.playerTurretUpExtraOffsetY;
    }

    tank.turret.x = localX + (tank.turretOffsetX || 0) + extraTurretOffsetX;
    tank.turret.y = localY + (tank.turretOffsetY || 0) + extraTurretOffsetY;
    tank.turret.rotation = tank.turretAngleRad - tank.turretBaseFacingRad;
  }

  getBrowserPads() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
    const pads = Array.from(navigator.getGamepads() || []).filter((pad) => pad && pad.connected);
    return pads;
  }

  getPhaserPads() {
    return (this.input?.gamepad?.gamepads || []).filter((pad) => pad && pad.connected);
  }

  getConnectedPads() {
    const phaserPads = this.getPhaserPads();
    if (phaserPads.length > 0) return phaserPads;
    return this.getBrowserPads();
  }

  getPadBySlot(slot = 0) {
    return this.getConnectedPads()[slot] || null;
  }

  readPadAxis(index, slot = 0) {
    const pad = this.getPadBySlot(slot);
    if (!pad) return 0;

    if (pad.axes && pad.axes[index] !== undefined) {
      const axis = pad.axes[index];
      if (typeof axis === "number") return axis;
      if (axis && typeof axis.getValue === "function") return axis.getValue();
      if (axis && typeof axis.value === "number") return axis.value;
    }

    return 0;
  }

  readPadButtonPressed(index, threshold = 0.35, slot = 0) {
    const pad = this.getPadBySlot(slot);
    if (!pad || !pad.buttons || !pad.buttons[index]) return false;

    const button = pad.buttons[index];
    if (typeof button === "number") return button > threshold;
    return !!button.pressed || (typeof button.value === "number" && button.value > threshold);
  }

  updatePadStatus() {
    const pads = this.getConnectedPads();
    if (pads.length === 0) {
      this.padStatusText.setText("Gamepads: esperando...");
      return;
    }
    const labels = pads.map((pad, index) => `Pad ${index + 1}: ${pad.id || "conectado"}`);
    const deviceInfo = ` · P1=${this.isKeyboardControlledSlot(1) ? "teclado" : "joystick"} · P2=${this.isKeyboardControlledSlot(2) ? "teclado" : "joystick"}`;
    this.padStatusText.setText(labels.join(" | ") + deviceInfo);
  }

  updateCoopText() {
    if (!this.coopText) return;
    const deviceLabel = this.isKeyboardControlledSlot(2) ? "teclado" : "START gamepad 2";
    if (this.playerTwo) {
      this.coopText.setText(`P2 unido · vidas: ${Math.max(0, this.playerTwoLivesRemaining || 0)} · control: ${this.isKeyboardControlledSlot(2) ? "teclado" : "joystick"}`);
      return;
    }
    this.coopText.setText(`P2: ${this.isKeyboardControlledSlot(2) ? "pulsa P para unirte" : "pulsa START en gamepad 2 para unirte"} · control: ${deviceLabel}`);
  }

  tryJoinSecondPlayer() {
    const usingKeyboard = this.isKeyboardControlledSlot(2);
    const joinPressed = usingKeyboard ? this.keys.p.isDown : this.readPadButtonPressed(9, 0.35, 1);
    const latchKey = usingKeyboard ? "keyboard-p2" : 1;
    const wasPressed = !!this.wasPadStartPressed[latchKey];
    this.wasPadStartPressed[latchKey] = joinPressed;

    if (!joinPressed || wasPressed || this.playerTwo || this.isGameOver || this.isTransitioning) return;

    if (this.playerTwoLivesRemaining <= 0) {
      this.playerTwoLivesRemaining = this.getConfiguredStartingLives();
    }

    const spawn = this.getPlayerSpawnForSlot(2);
    const spawnX = bigCellCenterX(spawn.col, this.boardOriginX);
    const spawnY = bigCellCenterY(spawn.row, this.boardOriginY);
    if (!this.canOccupyWorldPosition(spawnX, spawnY, null)) return;

    this.createPlayerTwo();
    this.showMessage("Jugador 2 unido");
  }

  scheduleEnemyRefill() {
    const delay = Math.max(0, Math.round(this.settings?.enemySpawnDelayMs || 0));
    const event = this.time.delayedCall(delay, () => {
      this.pendingEnemySpawnEvents = (this.pendingEnemySpawnEvents || []).filter((item) => item !== event);
      this.fillEnemyWaveSlots();
      this.updateWaveText();
    });
    this.pendingEnemySpawnEvents.push(event);
  }

  fillEnemyWaveSlots() {
    if (this.isTransitioning) return;

    const isSurvival = this.currentGameMode === "survival";

    while (
      this.enemies.length < this.maxConcurrentEnemies &&
      (isSurvival || this.spawnedEnemiesCount < this.totalEnemiesForLevel)
    ) {
      const enemy = this.spawnEnemy();
      if (!enemy) break;
      this.enemies.push(enemy);
      this.spawnedEnemiesCount += 1;
    }

    this.updateWaveText();
  }

  spawnEnemy() {
    const spawnOrder = [...this.spawnPoints];
    const startIndex = this.nextEnemySpawnIndex || 0;
    const ordered = [
      ...spawnOrder.slice(startIndex),
      ...spawnOrder.slice(0, startIndex),
    ];

    const freeSpawn = ordered.find((spawn) => {
      const x = bigCellCenterX(spawn.col, this.boardOriginX);
      const y = bigCellCenterY(spawn.row, this.boardOriginY);
      return this.canOccupyWorldPosition(x, y, null);
    });

    if (!freeSpawn) return null;
    const chosenIndex = this.spawnPoints.findIndex((spawn) => spawn.col === freeSpawn.col && spawn.row === freeSpawn.row);
    this.nextEnemySpawnIndex = (chosenIndex + 1) % this.spawnPoints.length;
    return this.createEnemyAtSpawn({ ...freeSpawn, spawnIndex: chosenIndex });
  }

  update(_, delta) {
    this.handleMenuToggleInput();
    this.updatePadStatus();
    this.tryJoinSecondPlayer();

    if (this.isMenuOpen) {
      this.handleMenuNavigationInput();
    }

    if (this.isTransitioning || this.isMenuOpen || this.isGameOver) return;

    this.getFriendlyTanks().forEach((tank) => {
      tank.shotCooldown = Math.max(0, tank.shotCooldown - delta);
      this.updatePlayer(tank, delta);
    });

    this.enemies.forEach((enemy) => {
      if (enemy?.isBoss) this.updateBoss(enemy, delta);
      else this.updateEnemy(enemy, delta);
    });

    this.resolveTankOverlaps();
    this.getFriendlyTanks().forEach((tank) => this.updateTankVisuals(tank));
    this.enemies.forEach((enemy) => { if (!enemy?.isBoss) this.updateTankVisuals(enemy); });

    this.updateBullets(delta);
    this.checkLevelComplete();
    this.updateCoopText();
    if (
      Math.round(this.settings?.debugEnemyNavOverlay || 0) === 1 ||
      Math.round(this.settings?.debugSpawnReserveOverlay || 0) === 1 ||
      Math.round(this.settings?.debugEnemyStateText || 0) === 1 ||
      Math.round(this.settings?.autoTestEnemyRoutes || 0) === 1
    ) {
      this.refreshDebugOverlay();
    } else {
      this.updateEnemyDebugHud();
    }
  }

  updatePlayer(tank, delta) {
    if (!tank) return;

    const moveInput = this.getPlayerMoveInput(tank);
    const aimInput = this.getPlayerAimInput(tank);

    if (vectorLength(moveInput.x, moveInput.y) > MOVE_DEADZONE) {
      const moveNorm = normalizeVector(moveInput.x, moveInput.y);
      const moveAmount = (tank.moveSpeed * delta) / 1000;
      const moved = this.tryMoveTank(
        tank,
        moveNorm.x * moveAmount,
        moveNorm.y * moveAmount
      );
      if (moved) {
        tank.moveAngleDeg = angleDegFromVector(moveNorm.x, moveNorm.y);
      }
    }

    if (vectorLength(aimInput.x, aimInput.y) > AIM_DEADZONE) {
      const targetAngle = Math.atan2(aimInput.y, aimInput.x);
      const maxStep = PLAYER_TURRET_MANUAL_TURN_SPEED * (delta / 1000);
      const diff = wrapRadDiff(targetAngle, tank.turretAngleRad);

      if (Math.abs(diff) <= maxStep) {
        tank.turretAngleRad = targetAngle;
      } else {
        tank.turretAngleRad += Math.sign(diff) * maxStep;
        tank.turretAngleRad = Phaser.Math.Angle.Wrap(tank.turretAngleRad);
      }
    }

    this.updateTankVisuals(tank);

    if (this.isControlledTankFirePressed(tank)) {
      this.fireBullet(tank);
    }
  }

  getPlayerMoveInput(tank = this.player) {
    const slot = tank?.controlSlot || 1;

    if (this.isKeyboardControlledSlot(slot)) {
      return this.getPlayerKeyboardMoveInput(slot);
    }

    let x = 0;
    let y = 0;
    const padSlot = this.getGamepadSlotForPlayerSlot(slot);
    const lx = this.readPadAxis(0, padSlot);
    const ly = this.readPadAxis(1, padSlot);

    if (Math.abs(lx) > MOVE_DEADZONE) x = lx;
    if (Math.abs(ly) > MOVE_DEADZONE) y = ly;

    return { x, y };
  }

  getPlayerAimInput(tank = this.player) {
    const slot = tank?.controlSlot || 1;

    if (this.isKeyboardControlledSlot(slot)) {
      return this.getPlayerKeyboardAimInput(slot);
    }

    let x = 0;
    let y = 0;
    const padSlot = this.getGamepadSlotForPlayerSlot(slot);
    const rx = this.readPadAxis(2, padSlot);
    const ry = this.readPadAxis(3, padSlot);

    if (Math.abs(rx) > AIM_DEADZONE) x = rx;
    if (Math.abs(ry) > AIM_DEADZONE) y = ry;

    return { x, y };
  }

  isControlledTankFirePressed(tank) {
    const slot = tank?.controlSlot || 1;
    const padSlot = this.getGamepadSlotForPlayerSlot(slot);
    const keyboardFire = this.isKeyboardControlledSlot(slot)
      ? (slot === 2 ? this.keys.numpad0.isDown : this.keys.space.isDown)
      : false;
    const fireDown = keyboardFire || this.readPadButtonPressed(5, 0.35, padSlot) || this.readPadButtonPressed(7, 0.35, padSlot);
    const continuous = Math.round(this.settings.playerContinuousFire || 0) === 1;

    if (continuous) {
      return fireDown;
    }

    const limit = this.getBulletLimitForTank(tank);
    const hasNoBullets = (tank.activeBullets || []).filter((bullet) => bullet?.isAlive).length === 0;

    if (!fireDown) {
      tank.fireLatch = false;
      return false;
    }

    if (!tank.fireLatch) {
      tank.fireLatch = true;
      return true;
    }

    if (limit === 1 && hasNoBullets && tank.shotCooldown <= 0) {
      return true;
    }

    return false;
  }

  getObjectiveCells() {
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

  getPrimaryBaseObjective() {
    return this.getObjectiveCells()[0] || {
      col: EAGLE_COL,
      row: EAGLE_ROW,
      x: bigCellCenterX(EAGLE_COL, this.boardOriginX),
      y: bigCellCenterY(EAGLE_ROW, this.boardOriginY),
      goalType: "base",
    };
  }

  getCriticalBrickObjectives(referenceTarget = null) {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (col, row, reason, weight = 1) => {
      if (!inBounds(col, row)) return;
      if (this.level?.obstacles?.[row]?.[col] !== TILE.BRICK) return;
      const key = `${col},${row}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        col,
        row,
        x: bigCellCenterX(col, this.boardOriginX),
        y: bigCellCenterY(row, this.boardOriginY),
        goalType: "brick",
        brickReason: reason,
        weight,
      });
    };

    const base = this.getPrimaryBaseObjective();
    const baseRingRadius = 3;
    for (let row = base.row - baseRingRadius; row <= base.row + baseRingRadius; row += 1) {
      for (let col = base.col - baseRingRadius; col <= base.col + baseRingRadius; col += 1) {
        if (!inBounds(col, row)) continue;
        const manhattan = Math.abs(col - base.col) + Math.abs(row - base.row);
        if (manhattan < 2 || manhattan > baseRingRadius + 1) continue;
        const openNeighbours = [
          { col: col + 1, row },
          { col: col - 1, row },
          { col, row: row + 1 },
          { col, row: row - 1 },
        ].reduce((acc, cell) => acc + ((inBounds(cell.col, cell.row) && !isBlockingTile(this.level?.obstacles?.[cell.row]?.[cell.col])) ? 1 : 0), 0);
        addCandidate(col, row, "bloquea base", 1.4 + openNeighbours * 0.12);
      }
    }

    const players = referenceTarget ? [referenceTarget] : this.getFriendlyTanks().filter((tank) => tank && !tank.isDestroyed);
    players.forEach((tank) => {
      const cell = this.worldToCell(tank.x, tank.y);
      for (let row = cell.row - 2; row <= cell.row + 2; row += 1) {
        for (let col = cell.col - 2; col <= cell.col + 2; col += 1) {
          if (!inBounds(col, row)) continue;
          const manhattan = Math.abs(col - cell.col) + Math.abs(row - cell.row);
          if (manhattan < 2 || manhattan > 4) continue;
          addCandidate(col, row, tank.type === "player2" ? "bloquea p2" : "bloquea p1", 1.15);
        }
      }
    });

    const spawnPoints = this.enemySpawnPoints || [];
    const corridorTargets = [base, ...players.map((tank) => ({ ...this.worldToCell(tank.x, tank.y), x: tank.x, y: tank.y }))]
;
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

  getEnemyApproachObjective(referenceTarget = null) {
    const objectiveCells = this.getObjectiveCells();
    const brickObjectives = this.getCriticalBrickObjectives(referenceTarget);
    if (brickObjectives.length > 0 && Math.random() < 0.58) {
      brickObjectives.sort((a, b) => b.weight - a.weight);
      return brickObjectives[Math.min(brickObjectives.length - 1, Phaser.Math.Between(0, Math.min(2, brickObjectives.length - 1)))];
    }
    return randomChoice(objectiveCells);
  }

  getNearestFriendlyTank(fromX, fromY) {
    const friendlies = this.getFriendlyTanks().filter((tank) => tank && !tank.isDestroyed);
    if (friendlies.length === 0) return null;
    return friendlies.reduce((best, tank) => {
      if (!best) return tank;
      const bestDist = vectorLength(best.x - fromX, best.y - fromY);
      const nextDist = vectorLength(tank.x - fromX, tank.y - fromY);
      if (nextDist === bestDist && tank.type === "player2") {
        return tank;
      }
      return nextDist < bestDist ? tank : best;
    }, null);
  }


  /**
   * Reconstruye el mapa de costos que usa la IA enemiga para leer topografía.
   *
   * El campo resultante favorece suelo/road/bush, penaliza ladrillo
   * (destructible) y bloquea steel/agua. Así los enemigos pueden percibir qué
   * rutas están abiertas, cuáles requieren romper ladrillos y cuáles son
   * realmente imposibles.
   */
  rebuildEnemyNavigationField() {
    const objectiveCells = this.getObjectiveCells().map((cell) => ({ col: cell.col, row: cell.row }));
    const rows = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Number.POSITIVE_INFINITY));
    const queue = [];

    objectiveCells.forEach(({ col, row }) => {
      if (!inBounds(col, row)) return;
      rows[row][col] = 0;
      queue.push({ col, row, cost: 0 });
    });

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (!current) break;
      if (current.cost !== rows[current.row][current.col]) continue;

      const neighbours = [
        { col: current.col + 1, row: current.row },
        { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 },
        { col: current.col, row: current.row - 1 },
      ];

      neighbours.forEach(({ col, row }) => {
        if (!inBounds(col, row)) return;
        const stepCost = this.getEnemyTraversalCost(col, row);
        if (!Number.isFinite(stepCost)) return;
        const nextCost = current.cost + stepCost;
        if (nextCost >= rows[row][col]) return;
        rows[row][col] = nextCost;
        queue.push({ col, row, cost: nextCost });
      });
    }

    this.enemyNavigationField = rows;
    this.enemyNavigationFieldCache = {};
    this.refreshDebugOverlay();
  }

  getEnemyTraversalCost(col, row) {
    const obstacle = this.level?.obstacles?.[row]?.[col];
    if (obstacle === TILE.WATER || obstacle === TILE.STEEL) return Number.POSITIVE_INFINITY;
    if (obstacle === TILE.BRICK) {
      const breakBias = this.getEnemyBehaviorTuning?.().breakBricks ?? 0.58;
      return Phaser.Math.Linear(5.6, 2.2, breakBias);
    }
    return 1;
  }

  getEnemyNavigationCostAt(col, row) {
    if (!inBounds(col, row)) return Number.POSITIVE_INFINITY;
    return this.enemyNavigationField?.[row]?.[col] ?? Number.POSITIVE_INFINITY;
  }

  countOpenNeighbourCells(col, row) {
    let openCount = 0;
    [
      { col: col + 1, row },
      { col: col - 1, row },
      { col, row: row + 1 },
      { col, row: row - 1 },
    ].forEach((cell) => {
      if (!inBounds(cell.col, cell.row)) return;
      if (!isBlockingTile(this.level?.obstacles?.[cell.row]?.[cell.col])) {
        openCount += 1;
      }
    });
    return openCount;
  }

  getEnemyNavigationVector(enemy, objective) {
    const direct = normalizeVector(objective.x - enemy.x, objective.y - enemy.y);
    const currentCell = this.worldToCell(enemy.x, enemy.y);
    const field = this.getEnemyNavigationFieldForObjective(objective);
    const currentCost = field?.[currentCell.row]?.[currentCell.col] ?? Number.POSITIVE_INFINITY;
    const candidates = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 0.7071, y: 0.7071 },
      { x: -0.7071, y: 0.7071 },
      { x: 0.7071, y: -0.7071 },
      { x: -0.7071, y: -0.7071 },
    ];

    let best = null;
    candidates.forEach((dir) => {
      const probeX = enemy.x + dir.x * TILE_SIZE * 1.2;
      const probeY = enemy.y + dir.y * TILE_SIZE * 1.2;
      if (!this.canOccupyWorldPosition(probeX, probeY, enemy)) return;
      const probeCell = this.worldToCell(probeX, probeY);
      const fieldCost = field?.[probeCell.row]?.[probeCell.col] ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(fieldCost)) return;
      const alignment = dir.x * direct.x + dir.y * direct.y;
      const openness = this.countOpenNeighbourCells(probeCell.col, probeCell.row);
      const centerX = bigCellCenterX(probeCell.col, this.boardOriginX);
      const centerY = bigCellCenterY(probeCell.row, this.boardOriginY);
      const centerDir = normalizeVector(centerX - enemy.x, centerY - enemy.y);
      const centerAlignment = centerDir.x * direct.x + centerDir.y * direct.y;
      const score = fieldCost - alignment * 0.65 - centerAlignment * 0.2 - openness * 0.08;
      if (!best || score < best.score) {
        best = { score, dir, fieldCost, probeCell };
      }
    });

    if (best && (best.fieldCost <= currentCost + 2.4 || !Number.isFinite(currentCost))) {
      return normalizeVector(best.dir.x, best.dir.y);
    }

    this.noteEnemyRouteMetric("navFallbacks");
    return direct;
  }

  clearEnemyNavigationStuckState(enemy) {
    enemy.unstuckTimer = 0;
    enemy.unstuckDirection = null;
    enemy.routeStats = { stuckEvents: 0, repaths: 0, recoveries: 0, noProgressMs: 0, state: "avance" };
    enemy.lastObjectiveDistance = null;
    enemy.lastMeaningfulProgressAt = this.time.now;
    enemy.routeRepathLatch = false;
    enemy.blockedTimer = 0;
  }

  createOrRefreshDebugOverlay() {
    if (!this.debugGraphics) {
      this.debugGraphics = this.add.graphics().setDepth(890);
      this.entityLayer.add(this.debugGraphics);
    }
    return this.debugGraphics;
  }

  refreshDebugOverlay() {
    const graphics = this.createOrRefreshDebugOverlay();
    graphics.clear();

    const showSpawnReserve = Math.round(this.settings?.debugSpawnReserveOverlay || 0) === 1;
    const showNav = Math.round(this.settings?.debugEnemyNavOverlay || 0) === 1;
    const showState = Math.round(this.settings?.debugEnemyStateText || 0) === 1;
    const showTargets = Math.round(this.settings?.debugEnemyTargetOverlay || 0) === 1;
    const showPaths = Math.round(this.settings?.debugEnemyPathOptions || 0) === 1;

    if (!showSpawnReserve && !showNav && !showState && !showTargets && !showPaths) {
      graphics.setVisible(false);
      this.debugEnemyStateTexts?.forEach((text) => text.destroy());
      this.debugEnemyStateTexts = [];
      this.updateEnemyDebugHud();
      return;
    }

    graphics.setVisible(true);
    this.debugEnemyStateTexts?.forEach((text) => text.destroy());
    this.debugEnemyStateTexts = [];

    if (showSpawnReserve) {
      graphics.lineStyle(2, 0x7dd3fc, 0.85);
      const reservedAreas = [
        { col: 1, row: 1, size: 4 },
        { col: 12, row: 1, size: 4 },
        { col: 24, row: 1, size: 4 },
        { col: PLAYER_SPAWN_COL, row: PLAYER_SPAWN_ROW, size: 4 },
        { col: PLAYER_TWO_SPAWN_COL, row: PLAYER_TWO_SPAWN_ROW, size: 4 },
      ];

      reservedAreas.forEach(({ col, row, size }) => {
        const startCol = clamp(col - 1, 0, GRID_SIZE - size);
        const startRow = clamp(row - 1, 0, GRID_SIZE - size);
        const x = this.boardOriginX + OUTER_BORDER_SIZE + startCol * TILE_SIZE;
        const y = this.boardOriginY + OUTER_BORDER_SIZE + startRow * TILE_SIZE;
        graphics.strokeRect(x, y, size * TILE_SIZE, size * TILE_SIZE);
      });
    }

    if (showNav) {
      graphics.lineStyle(2, 0xffd166, 0.9);
      this.enemies.forEach((enemy) => {
        const goal = enemy.currentObjective || this.getEnemyApproachObjective();
        graphics.strokeLineShape(new Phaser.Geom.Line(enemy.x, enemy.y, goal.x, goal.y));
      });
    }

    if (showTargets || showPaths) {
      this.enemies.forEach((enemy) => {
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
      this.enemies.forEach((enemy) => {
        const plan = enemy.debugPlan || {};
        const objectiveType = plan.objective?.goalType || enemy?.routeStats?.goalType || enemy?.currentObjective?.goalType || "base";
        const candidateSummary = (plan.candidateObjectives || []).slice(0, 3).map((candidate) => candidate.goalType || "ruta").join(",");
        const stateText = (enemy?.routeStats?.state || "avance") + " · obj: " + objectiveType + (enemy?.routeStats?.blockedBy && enemy?.routeStats?.blockedBy !== "ninguno" ? " · " + enemy.routeStats.blockedBy : "") + (candidateSummary ? "\nplan: " + candidateSummary : "");
        const label = this.add.text(enemy.x + 10, enemy.y - 22, stateText, {
          fontFamily: "Arial",
          fontSize: "11px",
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.4)",
        }).setDepth(891);
        this.entityLayer.add(label);
        this.debugEnemyStateTexts.push(label);
      });
    }

    this.updateEnemyDebugHud();
  }

  getEnemyBehaviorPresetBaseValues(rawValue) {
    const presetIndex = Math.round(rawValue ?? this.settings?.enemyBehaviorPreset ?? 3);
    return [
      { aggression: 84, navigation: 76, breakBricks: 82, recovery: 70, fireDiscipline: 68, shotFrequency: 62 },
      { aggression: 78, navigation: 72, breakBricks: 42, recovery: 74, fireDiscipline: 84, shotFrequency: 76 },
      { aggression: 54, navigation: 66, breakBricks: 46, recovery: 64, fireDiscipline: 48, shotFrequency: 42 },
      { aggression: 62, navigation: 70, breakBricks: 58, recovery: 72, fireDiscipline: 66, shotFrequency: 58 },
      { aggression: 70, navigation: 58, breakBricks: 64, recovery: 68, fireDiscipline: 60, shotFrequency: 72 },
    ][presetIndex] || { aggression: 62, navigation: 70, breakBricks: 58, recovery: 72, fireDiscipline: 66, shotFrequency: 58 };
  }

  applyEnemyBehaviorPresetToSettings(rawValue) {
    const preset = this.getEnemyBehaviorPresetBaseValues(rawValue);
    this.settings.enemyAggression = preset.aggression;
    this.settings.enemyNavigationSkill = preset.navigation;
    this.settings.enemyBreakBricks = preset.breakBricks;
    this.settings.enemyRecoverySkill = preset.recovery;
    this.settings.enemyFireDiscipline = preset.fireDiscipline;
    this.settings.enemyShotFrequency = preset.shotFrequency;
    this.sliderControls?.forEach((control) => {
      if (["enemyAggression", "enemyNavigationSkill", "enemyBreakBricks", "enemyRecoverySkill", "enemyFireDiscipline", "enemyShotFrequency"].includes(control.schema.key)) {
        this.refreshSlider(control);
      }
    });
  }

  getEnemyBehaviorPresetName(rawValue) {
    return ["Asedio", "Cazador", "Patrulla", "Balanceado", "Caótico"][Math.round(rawValue)] || "Balanceado";
  }

  getEnemyBehaviorTuning() {
    const presetIndex = Math.round(this.settings?.enemyBehaviorPreset || 3);
    const presets = [
      { base: 92, flank: 22, player: 24, wander: 8, aim: 28, objectiveFire: 92, commit: 1500, notice: 5.8 },
      { base: 42, flank: 34, player: 92, wander: 12, aim: 94, objectiveFire: 30, commit: 1100, notice: 7.8 },
      { base: 56, flank: 82, player: 42, wander: 46, aim: 48, objectiveFire: 42, commit: 980, notice: 6.2 },
      { base: 70, flank: 52, player: 58, wander: 18, aim: 66, objectiveFire: 64, commit: 1300, notice: 6.8 },
      { base: 58, flank: 68, player: 66, wander: 62, aim: 58, objectiveFire: 58, commit: 760, notice: 7.2 },
    ];
    const preset = presets[presetIndex] || presets[3];
    const aggression = clamp((this.settings?.enemyAggression || 0) / 100, 0, 1);
    const navigation = clamp((this.settings?.enemyNavigationSkill || 0) / 100, 0, 1);
    const breakBricks = clamp((this.settings?.enemyBreakBricks || 0) / 100, 0, 1);
    const recovery = clamp((this.settings?.enemyRecoverySkill || 0) / 100, 0, 1);
    const fire = clamp((this.settings?.enemyFireDiscipline || 0) / 100, 0, 1);
    const shotFrequency = clamp((this.settings?.enemyShotFrequency || 0) / 100, 0, 1);
    const turretTurnDeg = clamp(Number(this.settings?.enemyTurretTurnSpeed || 110), 20, 240);

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
      fire,
      shotFrequency,
      turnRateNormalDeg: 135 + navigation * 85,
      turnRateBlockedDeg: 210 + navigation * 105 + recovery * 55,
      blockedRetargetMs: 620 - recovery * 260,
      hardResetMs: 1280 - recovery * 380,
      shootBrickMs: 280 - breakBricks * 140,
      progressForgetMs: 960 - navigation * 300,
      routeCommitMs,
      pathRefreshMs: 520 - navigation * 180,
      playerNoticeRadius: TILE_SIZE * Phaser.Math.Linear(preset.notice, preset.notice + 2.1, aggression),
      obstacleProbeDistance: TILE_SIZE * Phaser.Math.Linear(1.1, 1.6, navigation),
      repathBias: 0.35 + navigation * 0.55 + recovery * 0.25,
      turretTurnDeg,
    };
  }

  createEmptyEnemyMetrics() {
    return {
      stuckEvents: 0,
      repaths: 0,
      recoveries: 0,
      samples: 0,
      longStucks: 0,
      blockedByTank: 0,
      blockedByTerrain: 0,
      brickShots: 0,
      goalPlayer: 0,
      goalBase: 0,
      goalBrick: 0,
      goalFlank: 0,
      navFallbacks: 0,
      progressEvents: 0,
      noProgressEvents: 0,
      routeSwitches: 0,
      spawnUse: [0, 0, 0],
    };
  }

  ensureEnemyRouteStats(enemy) {
    if (!enemy.routeStats) {
      enemy.routeStats = {
        stuckEvents: 0,
        repaths: 0,
        recoveries: 0,
        noProgressMs: 0,
        state: "avance",
        blockedBy: "ninguno",
        goalType: enemy?.currentObjective?.goalType || "base",
        routeCommitUntil: 0,
        lastProgressSample: 0,
      };
    }
    if (!this.enemyAiMetrics) {
      this.enemyAiMetrics = this.createEmptyEnemyMetrics();
    }
    return enemy.routeStats;
  }

  noteEnemyRouteMetric(kind, amount = 1) {
    if (!this.enemyAiMetrics) {
      this.enemyAiMetrics = this.createEmptyEnemyMetrics();
    }
    this.enemyAiMetrics[kind] = (this.enemyAiMetrics[kind] || 0) + amount;
  }

  noteEnemySpawnUsage(spawnIndex) {
    if (!this.enemyAiMetrics) {
      this.enemyAiMetrics = this.createEmptyEnemyMetrics();
    }
    if (Number.isInteger(spawnIndex) && this.enemyAiMetrics.spawnUse?.[spawnIndex] != null) {
      this.enemyAiMetrics.spawnUse[spawnIndex] += 1;
    }
  }

  getEnemyBlockedCause(enemy) {
    const angle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
    const probeDistance = this.getEnemyBehaviorTuning().obstacleProbeDistance;
    const probeX = enemy.x + Math.cos(angle) * probeDistance;
    const probeY = enemy.y + Math.sin(angle) * probeDistance;
    const probeCell = this.worldToCell(probeX, probeY);
    const obstacle = this.level?.obstacles?.[probeCell.row]?.[probeCell.col];
    if (obstacle === TILE.BRICK) return "ladrillo";
    if (obstacle === TILE.WATER) return "agua";
    if (obstacle === TILE.STEEL) return "steel";
    const blockingTank = [...this.enemies, ...this.getFriendlyTanks()].find((other) => other && other !== enemy && !other.isDestroyed && circlesOverlap(probeX, probeY, TANK_COLLISION_SIZE * 0.72, other.x, other.y, TANK_COLLISION_SIZE * 0.72));
    if (blockingTank) return blockingTank.type?.startsWith("player") ? "jugador" : "tanque";
    return obstacle ? "terreno" : "desconocido";
  }

  chooseEnemyObjective(enemy, tuning, forceNew = false) {
    const stats = this.ensureEnemyRouteStats(enemy);
    const now = this.time.now;
    if (!forceNew && enemy.currentObjective && now < (stats.routeCommitUntil || 0)) {
      if (enemy.currentObjective.goalType !== "player") {
        return enemy.currentObjective;
      }
      const trackedPlayer = this.getFriendlyTanks().find((tank) => tank && !tank.isDestroyed && tank.playerSlot === enemy.currentObjective.playerSlot);
      if (trackedPlayer) {
        enemy.currentObjective.x = trackedPlayer.x;
        enemy.currentObjective.y = trackedPlayer.y;
        const trackedCell = this.worldToCell(trackedPlayer.x, trackedPlayer.y);
        enemy.currentObjective.col = trackedCell.col;
        enemy.currentObjective.row = trackedCell.row;
        return enemy.currentObjective;
      }
    }

    const nearestFriendly = this.getNearestFriendlyTank(enemy.x, enemy.y);
    const distToPlayer = nearestFriendly ? vectorLength(nearestFriendly.x - enemy.x, nearestFriendly.y - enemy.y) : Number.POSITIVE_INFINITY;
    let nextObjective = this.getPrimaryBaseObjective();
    let goalType = nextObjective.goalType || "base";

    const shouldHuntPlayer = nearestFriendly && !nearestFriendly.isDestroyed && (
      distToPlayer <= tuning.playerNoticeRadius &&
      (tuning.playerAggro >= tuning.basePressure * 0.82 || enemy.lastDamagedByPlayerUntil > now || goalType === "player")
    );

    const brickObjectives = this.getCriticalBrickObjectives(nearestFriendly);
    const shouldBreakCriticalBrick = brickObjectives.length > 0 && (
      tuning.breakBricks > 0.38 ||
      enemy.blockedTimer > 140 ||
      stats.noProgressMs > 420 ||
      Math.random() < (0.08 + tuning.breakBricks * 0.34)
    );

    if (shouldHuntPlayer) {
      const cell = this.worldToCell(nearestFriendly.x, nearestFriendly.y);
      const playerPressureBrick = brickObjectives.find((candidate) => candidate.brickReason?.includes("p"));
      if (playerPressureBrick && tuning.breakBricks > 0.48 && distToPlayer > TILE_SIZE * 1.6 && Math.random() < 0.32) {
        nextObjective = playerPressureBrick;
        goalType = "brick";
      } else {
        nextObjective = {
          goalType: "player",
          x: nearestFriendly.x,
          y: nearestFriendly.y,
          col: cell.col,
          row: cell.row,
          playerSlot: nearestFriendly.playerSlot || (nearestFriendly.type === "player2" ? 2 : 1),
        };
        goalType = "player";
      }
    } else if (shouldBreakCriticalBrick) {
      brickObjectives.sort((a, b) => {
        const da = vectorLength(a.x - enemy.x, a.y - enemy.y) / Math.max(0.1, a.weight || 1);
        const db = vectorLength(b.x - enemy.x, b.y - enemy.y) / Math.max(0.1, b.weight || 1);
        return da - db;
      });
      nextObjective = brickObjectives[0] || this.getEnemyApproachObjective(nearestFriendly);
      goalType = nextObjective.goalType || "base";
    } else if (tuning.flankBias > 0.55 && Math.random() < 0.32 + tuning.flankBias * 0.24) {
      const flankTarget = this.pickWaypointInZone(enemy.patrolZone);
      if (flankTarget) {
        nextObjective = { ...flankTarget, goalType: "flank" };
        goalType = "flank";
      }
    }

    if (enemy.currentObjective?.goalType !== goalType) {
      this.noteEnemyRouteMetric("routeSwitches");
    }
    if (goalType === "player") this.noteEnemyRouteMetric("goalPlayer");
    else if (goalType === "brick") this.noteEnemyRouteMetric("goalBrick");
    else if (goalType === "flank") this.noteEnemyRouteMetric("goalFlank");
    else this.noteEnemyRouteMetric("goalBase");

    stats.goalType = goalType;
    stats.routeCommitUntil = now + tuning.routeCommitMs;
    enemy.currentObjective = nextObjective;
    return nextObjective;
  }

  buildEnemyNavigationFieldForTargets(targetCells) {
    const rows = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Number.POSITIVE_INFINITY));
    const queue = [];
    targetCells.forEach(({ col, row }) => {
      if (!inBounds(col, row)) return;
      rows[row][col] = 0;
      queue.push({ col, row, cost: 0 });
    });

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (!current || current.cost !== rows[current.row][current.col]) continue;
      const neighbours = [
        { col: current.col + 1, row: current.row },
        { col: current.col - 1, row: current.row },
        { col: current.col, row: current.row + 1 },
        { col: current.col, row: current.row - 1 },
      ];
      neighbours.forEach(({ col, row }) => {
        if (!inBounds(col, row)) return;
        const stepCost = this.getEnemyTraversalCost(col, row);
        if (!Number.isFinite(stepCost)) return;
        const nextCost = current.cost + stepCost;
        if (nextCost >= rows[row][col]) return;
        rows[row][col] = nextCost;
        queue.push({ col, row, cost: nextCost });
      });
    }

    return rows;
  }

  getEnemyNavigationFieldForObjective(objective) {
    if (!objective || objective.goalType === "base") {
      return this.enemyNavigationField;
    }
    if (!this.enemyNavigationFieldCache) {
      this.enemyNavigationFieldCache = {};
    }
    const cacheKey = `${objective.goalType}:${objective.col}:${objective.row}`;
    const cached = this.enemyNavigationFieldCache[cacheKey];
    if (cached && cached.expiresAt > this.time.now) {
      return cached.rows;
    }
    const rows = this.buildEnemyNavigationFieldForTargets([{ col: objective.col, row: objective.row }]);
    this.enemyNavigationFieldCache = { [cacheKey]: { rows, expiresAt: this.time.now + 260 } };
    return rows;
  }

  updateEnemyRouteSelfEvaluation(enemy, distanceToObjective, delta, tuning) {
    const stats = this.ensureEnemyRouteStats(enemy);
    const evaluate = Math.round(this.settings?.autoEvaluateEnemyRoutes || 0) === 1;
    const autocorrect = Math.round(this.settings?.autoCorrectEnemyRoutes || 0) === 1;

    if (enemy.lastObjectiveDistance == null || distanceToObjective + 8 < enemy.lastObjectiveDistance) {
      enemy.lastObjectiveDistance = distanceToObjective;
      enemy.lastMeaningfulProgressAt = this.time.now;
      stats.noProgressMs = 0;
      stats.lastProgressSample = distanceToObjective;
      if (stats.state === "sin progreso" || stats.state === "bloqueado") stats.state = "avance";
      this.noteEnemyRouteMetric("progressEvents");
      return;
    }

    const sinceProgress = this.time.now - (enemy.lastMeaningfulProgressAt || this.time.now);
    stats.noProgressMs = sinceProgress;
    enemy.lastObjectiveDistance = Math.min(enemy.lastObjectiveDistance || distanceToObjective, distanceToObjective);

    if (!evaluate) return;

    if (sinceProgress > tuning.progressForgetMs) {
      stats.state = enemy.blockedTimer > 0 ? "atascado" : "sin progreso";
      this.noteEnemyRouteMetric("noProgressEvents");
      if (sinceProgress > tuning.progressForgetMs * 1.7) {
        this.noteEnemyRouteMetric("longStucks");
      }
    }

    if (sinceProgress > tuning.blockedRetargetMs && !enemy.routeRepathLatch) {
      enemy.routeRepathLatch = true;
      stats.repaths += 1;
      this.noteEnemyRouteMetric("repaths");
      enemy.currentObjective = this.chooseEnemyObjective(enemy, tuning, true);
      enemy.patrolTarget = this.pickWaypointInZone(enemy.patrolZone);
      enemy.objectiveRetargetTimer = Phaser.Math.Between(180, 420);
      enemy.patrolRetargetTimer = Phaser.Math.Between(180, 420);
    }

    if (autocorrect && sinceProgress > tuning.hardResetMs) {
      stats.stuckEvents += 1;
      stats.recoveries += 1;
      this.noteEnemyRouteMetric("stuckEvents");
      this.noteEnemyRouteMetric("recoveries");
      enemy.routeRepathLatch = false;
      enemy.orbitSign *= -1;
      const unstuck = this.getEnemyUnstuckDirection(enemy, enemy.unstuckDirection || { x: Math.cos(enemy.steeringAngleRad || 0), y: Math.sin(enemy.steeringAngleRad || 0) });
      enemy.unstuckDirection = unstuck.dir;
      enemy.unstuckTimer = Phaser.Math.Between(520, 920);
      enemy.steeringAngleRad = unstuck.angle;
      enemy.currentObjective = this.chooseEnemyObjective(enemy, tuning, true);
      enemy.lastMeaningfulProgressAt = this.time.now;
      enemy.lastObjectiveDistance = distanceToObjective + TILE_SIZE;
      stats.state = "recovery";
    }
  }

  ensureEnemyDebugHudText() {
    if (!this.add || !this.entityLayer || !this.sys || this.sys.isDestroyed) {
      return null;
    }

    const needsNewText = !this.debugHudText || !this.debugHudText.scene || !this.debugHudText.active || !this.debugHudText.canvas;
    if (needsNewText) {
      try {
        this.debugHudText?.destroy?.();
      } catch (error) {
      }

      this.debugHudText = this.add.text(this.boardOriginX + 12, this.boardOriginY + 12, "", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#ffd166",
        backgroundColor: "rgba(0,0,0,0.35)",
      }).setDepth(892).setVisible(false);
      this.entityLayer.add(this.debugHudText);
    }

    return this.debugHudText;
  }

  updateEnemyDebugHud() {
    const showState = Math.round(this.settings?.debugEnemyStateText || 0) === 1;
    const autoTest = Math.round(this.settings?.autoTestEnemyRoutes || 0) === 1;
    const hudText = this.ensureEnemyDebugHudText();
    if (!hudText) {
      return;
    }
    if (!showState && !autoTest) {
      hudText.setVisible(false);
      return;
    }
    const metrics = this.enemyAiMetrics || this.createEmptyEnemyMetrics();
    const stuckNow = (this.enemies || []).filter((enemy) => ["atascado", "recovery", "sin progreso", "bloqueado"].includes(enemy?.routeStats?.state)).length;
    const totalEnemies = Math.max(1, (this.enemies || []).length);
    const lines = [
      "IA: " + this.getEnemyBehaviorPresetName(this.settings?.enemyBehaviorPreset || 3) + " · activos: " + totalEnemies,
      "Trabados: " + stuckNow + " · repaths: " + (metrics.repaths || 0) + " · recoveries: " + (metrics.recoveries || 0),
      "Bloqueos terreno/tanque: " + (metrics.blockedByTerrain || 0) + "/" + (metrics.blockedByTank || 0) + " · tiros a ladrillo: " + (metrics.brickShots || 0),
      "Metas base/ladrillo/jugador/flanco: " + (metrics.goalBase || 0) + "/" + (metrics.goalBrick || 0) + "/" + (metrics.goalPlayer || 0) + "/" + (metrics.goalFlank || 0) + (autoTest ? " · autotest activo" : ""),
    ];

    try {
      hudText.setText(lines.join("\n"));
      hudText.setVisible(true);
    } catch (error) {
      this.debugHudText = null;
    }
  }

  getEnemySteeringPlan(enemy) {
    const tuning = this.getEnemyBehaviorTuning();
    const objective = this.chooseEnemyObjective(enemy, tuning, false);
    const fallback = enemy.patrolTarget || this.pickWaypointInZone(enemy.patrolZone);
    const basePressure = tuning.basePressure;
    const flankBias = tuning.flankBias;
    const wander = tuning.wander;

    const toObjective = this.getEnemyNavigationVector(enemy, objective);
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

    const steering = normalizeVector(
      toObjective.x * (0.95 + basePressure * 0.95) +
        orbitDir.x * (0.12 + flankBias * 0.82) +
        fallbackDir.x * (0.08 + wander * 0.45) +
        pursuitDir.x * pursuitWeight +
        jitterDir.x * (wander * 0.32),
      toObjective.y * (0.95 + basePressure * 0.95) +
        orbitDir.y * (0.12 + flankBias * 0.82) +
        fallbackDir.y * (0.08 + wander * 0.45) +
        pursuitDir.y * pursuitWeight +
        jitterDir.y * (wander * 0.32)
    );

    const candidateObjectives = [objective, fallback].filter(Boolean);
    const brickCandidates = this.getCriticalBrickObjectives(this.getNearestFriendlyTank(enemy.x, enemy.y)).slice(0, 3);
    brickCandidates.forEach((candidate) => candidateObjectives.push(candidate));
    enemy.debugPlan = {
      objective: { x: objective.x, y: objective.y, goalType: objective.goalType || "base", col: objective.col, row: objective.row },
      fallback: fallback ? { x: fallback.x, y: fallback.y, goalType: fallback.goalType || "fallback", col: fallback.col, row: fallback.row } : null,
      candidateObjectives: candidateObjectives.map((candidate) => ({ x: candidate.x, y: candidate.y, goalType: candidate.goalType || "extra", col: candidate.col, row: candidate.row })),
      vectors: {
        toObjective: { ...toObjective },
        orbitDir: { ...orbitDir },
        fallbackDir: { ...fallbackDir },
        pursuitDir: { ...pursuitDir },
        jitterDir: { ...jitterDir },
      },
    };

    return {
      objective,
      steering,
      goalType: objective.goalType || "base",
      fallback,
      playerWeight: pursuitWeight,
    };
  }

  getEnemyObjectiveShot(enemy) {
    const fireBias = this.getEnemyBehaviorTuning().objectiveFireBias;
    if (Math.random() > fireBias) return null;

    const objectiveCells = [];
    if (enemy.currentObjective?.goalType === "brick") {
      objectiveCells.push(enemy.currentObjective);
    }
    objectiveCells.push(...this.getCriticalBrickObjectives(this.getNearestFriendlyTank(enemy.x, enemy.y)).slice(0, 6));
    objectiveCells.push(...this.getObjectiveCells());
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

  getEnemyUnstuckDirection(enemy, preferredSteering, localRandom = Math.random) {
    const preferredAngle = Math.atan2(preferredSteering.y, preferredSteering.x);
    const candidateAngles = [
      preferredAngle + Math.PI / 2,
      preferredAngle - Math.PI / 2,
      preferredAngle + Math.PI,
      preferredAngle + Math.PI / 4,
      preferredAngle - Math.PI / 4,
      preferredAngle + (localRandom() < 0.5 ? 0.72 : -0.72) * Math.PI,
    ];

    for (const angle of candidateAngles) {
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      const probeDistance = Math.max(TILE_SIZE * 1.35, TANK_COLLISION_SIZE * 0.9);
      if (this.canOccupyWorldPosition(enemy.x + dir.x * probeDistance, enemy.y + dir.y * probeDistance, enemy)) {
        return { dir, angle };
      }
    }

    return {
      dir: {
        x: -preferredSteering.x,
        y: -preferredSteering.y,
      },
      angle: Phaser.Math.Angle.Wrap(preferredAngle + Math.PI),
    };
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
    enemy.blockedTimer = Math.max(0, enemy.blockedTimer || 0);
    enemy.unstuckTimer = Math.max(0, (enemy.unstuckTimer || 0) - delta);

    if (enemy.patrolRetargetTimer <= 0 || !enemy.patrolTarget) {
      enemy.patrolTarget = this.pickWaypointInZone(enemy.patrolZone);
      enemy.patrolRetargetTimer = Phaser.Math.Between(900, 1900);
    }

    const tuning = this.getEnemyBehaviorTuning();
    if (enemy.objectiveRetargetTimer <= 0 || !enemy.currentObjective) {
      enemy.orbitSign *= Math.random() < 0.35 ? -1 : 1;
      enemy.currentObjective = this.chooseEnemyObjective(enemy, tuning, true);
      enemy.objectiveRetargetTimer = Phaser.Math.Between(Math.max(220, tuning.pathRefreshMs), Math.max(420, tuning.pathRefreshMs + 280));
    }

    if (enemy.wanderRetargetTimer <= 0) {
      enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      enemy.wanderRetargetTimer = Phaser.Math.Between(620, 1180);
    }

    const plan = this.getEnemySteeringPlan(enemy);
    enemy.currentGoalType = plan.goalType;
    enemy.currentObjective = plan.objective;
    const objectiveDistance = vectorLength(plan.objective.x - enemy.x, plan.objective.y - enemy.y);
    this.updateEnemyRouteSelfEvaluation(enemy, objectiveDistance, delta, tuning);

    let desiredSteering = plan.steering;
    if (vectorLength(desiredSteering.x, desiredSteering.y) < 0.001) {
      desiredSteering = normalizeVector(plan.fallback.x - enemy.x, plan.fallback.y - enemy.y);
    }

    if (enemy.unstuckTimer > 0 && enemy.unstuckDirection) {
      desiredSteering = enemy.unstuckDirection;
    }

    const targetMoveAngle = Math.atan2(desiredSteering.y, desiredSteering.x);
    const currentMoveAngle = enemy.steeringAngleRad ?? Phaser.Math.DegToRad(enemy.moveAngleDeg || 0);
    const baseTurnRateRad = Phaser.Math.DegToRad(enemy.unstuckTimer > 0 ? tuning.turnRateBlockedDeg : tuning.turnRateNormalDeg) * (delta / 1000);
    const angleDelta = wrapRadDiff(targetMoveAngle, currentMoveAngle);
    const nextMoveAngle = currentMoveAngle + clamp(angleDelta, -baseTurnRateRad, baseTurnRateRad);
    enemy.steeringAngleRad = nextMoveAngle;

    let steering = { x: Math.cos(nextMoveAngle), y: Math.sin(nextMoveAngle) };
    const moveAmount = (enemy.moveSpeed * delta) / 1000;
    let moved = this.tryMoveTank(enemy, steering.x * moveAmount, steering.y * moveAmount);

    if (!moved) {
      enemy.blockedTimer += delta;
      const stats = this.ensureEnemyRouteStats(enemy);
      stats.state = "bloqueado";
      stats.blockedBy = this.getEnemyBlockedCause(enemy);
      if (["tanque", "jugador"].includes(stats.blockedBy)) this.noteEnemyRouteMetric("blockedByTank");
      else this.noteEnemyRouteMetric("blockedByTerrain");

      const sidestepOptions = [
        { x: -steering.y * enemy.orbitSign, y: steering.x * enemy.orbitSign },
        { x: steering.y * enemy.orbitSign, y: -steering.x * enemy.orbitSign },
        { x: -steering.x, y: -steering.y },
      ].map((dir) => normalizeVector(dir.x, dir.y));

      for (const candidate of sidestepOptions) {
        moved = this.tryMoveTank(enemy, candidate.x * moveAmount, candidate.y * moveAmount);
        if (moved) {
          steering = candidate;
          enemy.steeringAngleRad = Math.atan2(candidate.y, candidate.x);
          enemy.unstuckTimer = 260;
          enemy.unstuckDirection = candidate;
          break;
        }
      }

      if (!moved && enemy.blockedTimer >= tuning.shootBrickMs) {
        const unstuck = this.getEnemyUnstuckDirection(enemy, desiredSteering);
        enemy.unstuckDirection = unstuck.dir;
        enemy.unstuckTimer = Phaser.Math.Between(420, 760);
        enemy.steeringAngleRad = unstuck.angle;
        moved = this.tryMoveTank(enemy, unstuck.dir.x * moveAmount, unstuck.dir.y * moveAmount);
        if (moved) {
          steering = unstuck.dir;
        }
      }

      if (!moved && enemy.blockedTimer >= 320) {
        const aheadX = enemy.x + Math.cos(enemy.steeringAngleRad) * TILE_SIZE * 1.1;
        const aheadY = enemy.y + Math.sin(enemy.steeringAngleRad) * TILE_SIZE * 1.1;
        const aheadCell = this.worldToCell(aheadX, aheadY);
        const aheadObstacle = this.level?.obstacles?.[aheadCell.row]?.[aheadCell.col];
        if (aheadObstacle === TILE.BRICK) {
          enemy.turretAngleRad = enemy.steeringAngleRad;
          if (enemy.shotCooldown <= 0) {
            this.noteEnemyRouteMetric("brickShots");
            this.fireBullet(enemy);
          }
        }
      }

      if (!moved && enemy.blockedTimer >= tuning.hardResetMs) {
        enemy.orbitSign *= -1;
        enemy.currentObjective = this.chooseEnemyObjective(enemy, tuning, true);
        enemy.patrolTarget = this.pickWaypointInZone(enemy.patrolZone);
        enemy.patrolRetargetTimer = Phaser.Math.Between(240, 520);
        enemy.objectiveRetargetTimer = Phaser.Math.Between(240, 520);
        enemy.wanderAngleRad = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
    }

    if (moved) {
      enemy.blockedTimer = 0;
      enemy.routeRepathLatch = false;
      if (enemy.routeStats) enemy.routeStats.state = "avance";
      enemy.moveAngleDeg = angleDegFromVector(steering.x, steering.y);
    }

    const aimTarget = this.getNearestFriendlyTank(enemy.x, enemy.y);
    const dxToPlayer = aimTarget ? aimTarget.x - enemy.x : 0;
    const dyToPlayer = aimTarget ? aimTarget.y - enemy.y : 0;
    const distToPlayer = aimTarget ? vectorLength(dxToPlayer, dyToPlayer) : Infinity;
    const playerAimBias = this.getEnemyBehaviorTuning().aimPlayerBias;
    const playerVisible = !!aimTarget && distToPlayer < TILE_SIZE * 5.4;

    const objectiveShot = this.getEnemyObjectiveShot(enemy);
    const shouldTrackPlayer = playerVisible && Math.random() < (0.28 + playerAimBias * 0.72);

    let desiredTurretAngle = null;
    if (shouldTrackPlayer) {
      desiredTurretAngle = Math.atan2(dyToPlayer, dxToPlayer);
    } else if (objectiveShot) {
      desiredTurretAngle = objectiveShot.angle;
    } else {
      const forwardAngle = Phaser.Math.DegToRad(enemy.moveAngleDeg);
      desiredTurretAngle = Phaser.Math.Angle.Wrap(forwardAngle + enemy.turretSweepSpeed * (delta / 1000) * 0.18);
    }

    if (desiredTurretAngle != null) {
      const turretTurnStep = Phaser.Math.DegToRad(tuning.turretTurnDeg) * (delta / 1000);
      const turretDelta = wrapRadDiff(desiredTurretAngle, enemy.turretAngleRad);
      enemy.turretAngleRad = Phaser.Math.Angle.Wrap(
        enemy.turretAngleRad + clamp(turretDelta, -turretTurnStep, turretTurnStep)
      );
    }

    this.updateTankVisuals(enemy);

    const aimedAtPlayer =
      shouldTrackPlayer &&
      Math.abs(Phaser.Math.Angle.Wrap(enemy.turretAngleRad - Math.atan2(dyToPlayer, dxToPlayer))) < 0.3;

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

    const startCol = worldToGridCol(left, this.boardOriginX);
    const endCol = worldToGridCol(right, this.boardOriginX);
    const startRow = worldToGridRow(top, this.boardOriginY);
    const endRow = worldToGridRow(bottom, this.boardOriginY);

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

    const others = [...this.getFriendlyTanks(), ...this.enemies].filter(
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

    if (tankA?.isBoss || tankB?.isBoss) return false;

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

    const tanks = [...this.getFriendlyTanks(), ...this.enemies].filter(Boolean);
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
        worldToGridCol(x, this.boardOriginX),
        0,
        GRID_SIZE - 1
      ),
      row: Phaser.Math.Clamp(
        worldToGridRow(y, this.boardOriginY),
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

    tank.shotCooldown = (tank.type === "player" || tank.type === "player2")
      ? FIRE_COOLDOWN_PLAYER
      : Math.max(90, Math.round(this.getEnemyBehaviorTuning().enemyShotCooldownMs || FIRE_COOLDOWN_ENEMY));

    const angle = tank.turretAngleRad;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const bulletWidth = this.getBulletWidthForOwner(tank.type);
    const bulletLength = this.getBulletLengthForOwner(tank.type);
    const hitRadius = this.getBulletHitRadiusForOwner(tank.type);
    const bulletSpeed = this.getBulletSpeedForOwner(tank.type);

    const bulletSprite = this.add
      .image(tank.x + dirX * 34, tank.y + dirY * 34, "tank-projectile")
      .setDepth(180)
      .setDisplaySize(bulletWidth, bulletLength)
      .setRotation(angle + Math.PI / 2)
      .setAlpha(0.98)
      .setTint(0xfff3a8)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.entityLayer.add(bulletSprite);

    this.noteCombatShot(tank.type);

    const bullet = {
      sprite: bulletSprite,
      ownerType: tank.type,
      ownerTank: tank,
      xSpeed: dirX * bulletSpeed,
      ySpeed: dirY * bulletSpeed,
      width: bulletWidth,
      length: bulletLength,
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
      alpha: 0.75,
      duration: 400,
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
    });

    for (let i = 0; i < this.bullets.length; i += 1) {
      const bullet = this.bullets[i];
      if (!bullet || bulletsToRemove.has(i)) continue;

      const col = worldToGridCol(bullet.sprite.x, this.boardOriginX);
      const row = worldToGridRow(bullet.sprite.y, this.boardOriginY);

      if (!inBounds(col, row)) {
        bulletsToRemove.add(i);
        continue;
      }

      const obstacle = this.level.obstacles[row][col];
      if (obstacle && obstacle !== TILE.WATER) {
        if (isDestructibleTile(obstacle)) {
          this.noteCombatBrickShot(bullet.ownerType);
          this.level.obstacles[row][col] = null;
          this.redrawObstacles();
          this.enemies.forEach((enemy) => this.clearEnemyNavigationStuckState(enemy));
        } else if (obstacle === TILE.BASE) {
          this.isGameOver = true;
          this.showMessage("La base fue destruida");
          this.saveSettings();
          this.saveCombatStats();
          this.time.delayedCall(1100, () => this.scene.restart());
        }

        bulletsToRemove.add(i);
        continue;
      }

      for (let j = i + 1; j < this.bullets.length; j += 1) {
        const other = this.bullets[j];
        if (!other || bulletsToRemove.has(j) || ((bullet.ownerType === "enemy") === (other.ownerType === "enemy"))) continue;
        const combinedRadius = (bullet.hitRadius || bullet.radius || 0) + (other.hitRadius || other.radius || 0);
        if (vectorLength(bullet.sprite.x - other.sprite.x, bullet.sprite.y - other.sprite.y) <= combinedRadius) {
          bulletsToRemove.add(i);
          bulletsToRemove.add(j);
          break;
        }
      }

      if (bulletsToRemove.has(i)) continue;

      if (bullet.ownerType !== "player" && bullet.ownerType !== "player2") {
        const hitPlayerTank = this.getFriendlyTanks().find((tank) =>
          this.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, tank, bullet.hitRadius)
        );
        if (hitPlayerTank) {
          bulletsToRemove.add(i);
          this.noteCombatHit(bullet.ownerType);
          this.handlePlayerHit(hitPlayerTank);
          continue;
        }
      } else {
        const hitEnemy = this.enemies.find((enemy) =>
          this.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, enemy, bullet.hitRadius)
        );

        if (hitEnemy) {
          bulletsToRemove.add(i);
          this.noteCombatHit(bullet.ownerType);
          if (hitEnemy.isBoss) {
            this.damageBoss(hitEnemy, 1, bullet.ownerType);
          } else {
            this.handleEnemyDestroyed(hitEnemy, bullet.ownerType);
          }
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
    const hitRadius = tank.isBoss ? TANK_HIT_RADIUS * 1.85 : TANK_HIT_RADIUS;
    return vectorLength(x - tank.x, y - tank.y) < hitRadius + bulletHitRadius;
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

    this.rebuildEnemyNavigationField();
  }

  updateLivesText() {
    if (!this.livesText) return;
    const total = this.getConfiguredStartingLives();
    const remainingP1 = Math.max(0, Math.min(total, this.playerLivesRemaining || 0));
    const remainingP2 = Math.max(0, Math.min(total, this.playerTwoLivesRemaining || 0));
    const respawnP1 = this.playerRespawnEvents?.[1] ? " · P1 reapareciendo" : "";
    const respawnP2 = this.playerRespawnEvents?.[2] ? " · P2 reapareciendo" : "";
    this.livesText.setText(`Vidas P1: ${remainingP1}/${total}\nVidas P2: ${remainingP2}/${total}${respawnP1}${respawnP2}`);
  }

  destroyPlayerTankVisuals(playerTank) {
    if (!playerTank) return;
    playerTank.activeBullets = [];
    playerTank.container?.destroy();
    if (playerTank.controlSlot === 2) {
      this.playerTwo = null;
    } else {
      this.player = null;
    }
  }

  handlePlayerHit(playerTank = this.player) {
    if (!playerTank || this.isGameOver || this.isTransitioning) return;
    const slot = playerTank.controlSlot || 1;
    if (this.playerRespawnEvents?.[slot]) return;

    this.noteCombatDeath(playerTank.type);
    this.spawnTankHitExplosion(playerTank.x, playerTank.y);
    if (slot === 2) {
      this.playerTwoLivesRemaining = Math.max(0, this.playerTwoLivesRemaining - 1);
    } else {
      this.playerLivesRemaining = Math.max(0, this.playerLivesRemaining - 1);
    }
    this.destroyPlayerTankVisuals(playerTank);

    const remainingLives = slot === 2 ? this.playerTwoLivesRemaining : this.playerLivesRemaining;

    if (remainingLives <= 0) {
      this.updateLivesText();
      this.updateCoopText();
      if (!this.player && !this.playerTwo) {
        this.isGameOver = true;
        this.showMessage("Sin vidas\nGame Over");
        this.saveSettings();
        this.saveCombatStats();
        this.time.delayedCall(1300, () => this.scene.restart());
      }
      return;
    }

    this.updateLivesText();
    this.updateCoopText();
    this.showMessage(slot === 2 ? "P2 perdió una vida" : "P1 perdió una vida");
    this.schedulePlayerRespawn(slot);
  }

  schedulePlayerRespawn(slot = 1, delay = PLAYER_RESPAWN_DELAY) {
    if (this.playerRespawnEvents?.[slot]) {
      this.playerRespawnEvents[slot].remove(false);
      this.playerRespawnEvents[slot] = null;
    }

    this.playerRespawnEvents[slot] = this.time.delayedCall(delay, () => {
      this.playerRespawnEvents[slot] = null;
      this.tryRespawnPlayer(slot);
    });
  }

  tryRespawnPlayer(slot = 1) {
    const livesRemaining = slot === 2 ? this.playerTwoLivesRemaining : this.playerLivesRemaining;
    const existingTank = slot === 2 ? this.playerTwo : this.player;
    if (this.isTransitioning || this.isGameOver || livesRemaining <= 0 || existingTank) {
      return;
    }

    const spawn = this.getPlayerSpawnForSlot(slot);
    const spawnX = bigCellCenterX(spawn.col, this.boardOriginX);
    const spawnY = bigCellCenterY(spawn.row, this.boardOriginY);

    if (!this.canOccupyWorldPosition(spawnX, spawnY, null)) {
      this.schedulePlayerRespawn(slot, 500);
      return;
    }

    this.createPlayerTankForSlot(slot);
    this.updateLivesText();
    this.updateCoopText();
    this.showMessage(slot === 2 ? "P2 reapareció" : "P1 reapareció");
  }

  updateWaveText() {
    const totalShots = this.combatStats?.totals?.shots || 0;
    const totalHits = this.combatStats?.totals?.hits || 0;
    const totalAcc = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;

    if (this.isBossBattle && this.boss) {
      this.waveText.setText(
        "Boss\n" +
        "Helicóptero pesado\n" +
        "Vida: " + Math.max(0, this.boss.health || 0) + "/" + (this.boss.maxHealth || 0) + "\n" +
        "Ráfaga: " + (this.boss.burstShotsRemaining > 0 ? "activa" : "cargando") + "\n" +
        "Acc total: " + totalAcc + "%"
      );
      return;
    }

    if (this.currentGameMode === "survival") {
      this.waveText.setText(
        "Survival\n" +
        "Ola: " + this.survivalWaveIndex + "\n" +
        "Bajas: " + this.destroyedEnemiesCount + "\n" +
        "En pantalla: " + this.enemies.length + "\n" +
        "Acc total: " + totalAcc + "%"
      );
      return;
    }

    const remainingToSpawn = this.totalEnemiesForLevel - this.spawnedEnemiesCount;
    this.waveText.setText(
      "Nivel\n" +
      "Enemigos: " + this.destroyedEnemiesCount + "/" + this.totalEnemiesForLevel + "\n" +
      "En pantalla: " + this.enemies.length + "\n" +
      "Restan: " + remainingToSpawn + "\n" +
      "Acc total: " + totalAcc + "%"
    );
  }

  checkLevelComplete() {
    if (this.currentGameMode === "survival") return;
    if (this.isTransitioning) return;
    if (this.isBossBattle) return;
    if (this.enemies.length > 0) return;
    if (this.spawnedEnemiesCount < this.totalEnemiesForLevel) return;

    this.isTransitioning = true;

    if (this.currentLevelIndex >= LEVELS.length - 1) {
      this.showMessage("Nivel 5 completado\nEntrando boss...");
      this.time.delayedCall(1200, () => {
        this.isTransitioning = false;
        this.startBossBattle();
      });
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