import * as Phaser from "phaser";
import {
  BULLET_SPEED,
  GRID_HEIGHT,
  GRID_SIZE,
  GRID_WIDTH,
  HUD_GUTTER,
  MACRO_TILE_SIZE,
  MENU_AXIS_THRESHOLD,
  OUTER_BORDER_SIZE,
  OUTER_BORDER_TILES,
  PRESETS_STORAGE_KEY,
  SETTINGS_SCHEMA,
  SETTINGS_STORAGE_KEY,
  SETTINGS_TABS,
  STATS_STORAGE_KEY,
  TILE,
  TILE_SIZE,
} from "../shared/constants";
import {
  bigCellCenterX,
  bigCellCenterY,
  cellCenterX,
  cellCenterY,
  isBaseAnchorCell,
} from "../shared/levelGeneration";
import {
  clamp,
  createEmptyCombatStats,
  sanitizePresetName,
  vectorLength,
} from "../shared/math";
import { createSceneState } from "../core/state/createSceneState";
import { clearEntityCollections, syncSceneStatsToMatchState, syncSceneStatusToMatchState } from "../core/state/matchState";
import { createHud, showMessage as showHudMessage, updateStatsText as renderStatsText, updateWaveText as renderWaveText } from "../ui/hudRenderer";
import { LEVELS } from "../core/levels";
import { createTankSprite, updateTankVisuals } from "../render/tankRendering";
import {
  createPlayer,
  createPlayerTankForSlot,
  createPlayerTwo,
  getFriendlyTanks,
  getPlayerSpawnForSlot,
} from "../factories/playerFactory";
import {
  getBrowserPads,
  getConnectedPads,
  getControlDeviceForSlot,
  getGamepadSlotForPlayerSlot,
  getPadBySlot,
  getPhaserPads,
  getPlayerAimInput,
  getPlayerKeyboardAimInput,
  getPlayerKeyboardMoveInput,
  getPlayerMoveInput,
  isControlledTankFirePressed,
  isKeyboardControlledSlot,
  readPadAxis,
  readPadButtonPressed,
  tryJoinSecondPlayer,
  updateCoopText,
  updatePadStatus,
  updatePlayer,
} from "../input/playerInput";
import {
  canOccupyWorldPosition,
  resolveTankOverlaps,
  shouldTanksCollide,
  tryMoveTank,
  worldToCell,
} from "../systems/movementSystem";
import {
  canTankFire,
  fireBullet,
  isBulletNearTank,
  redrawObstacles,
  removeBulletByIndex,
  spawnTankHitExplosion,
  updateBullets,
} from "../systems/projectileSystem";
import {
  destroyPlayerTankVisuals,
  handlePlayerHit,
  schedulePlayerRespawn,
  tryRespawnPlayer,
  updateLivesText,
} from "../systems/playerLifecycle";
import {
  applyEnemyBehaviorPresetToSettings,
  buildEnemyNavigationFieldForTargets,
  chooseEnemyObjective,
  clearEnemyNavigationStuckState,
  countOpenNeighbourCells,
  createBossHelicopter,
  createEnemyAtSpawn,
  createOrRefreshDebugOverlay,
  ensureEnemyDebugHudText,
  ensureEnemyRouteStats,
  fillEnemyWaveSlots,
  getCriticalBrickObjectives,
  getEnemyApproachObjective,
  getEnemyBehaviorPresetBaseValues,
  getEnemyBehaviorPresetName,
  getEnemyRushTarget,
  getEnemyShotAngle,
  getEnemyBehaviorTuning,
  getEnemyBlockedCause,
  getEnemyNavigationCostAt,
  getEnemyNavigationFieldForObjective,
  getEnemyNavigationVector,
  getEnemyObjectiveShot,
  getEnemySpawnVariant,
  getEnemySteeringPlan,
  getEnemyTraversalCost,
  getEnemyUnstuckDirection,
  getNearestFriendlyTank,
  getObjectiveCells,
  getPrimaryBaseObjective,
  handleEnemyDestroyed,
  noteEnemyRouteMetric,
  noteEnemySpawnUsage,
  pickBossTargetPoint,
  pickPatrolZoneForSpawn,
  pickWaypointInZone,
  rebuildEnemyNavigationField,
  refreshDebugOverlay,
  scheduleEnemyRefill,
  spawnEnemy,
  startBossBattle,
  updateBoss,
  updateEnemy,
  updateEnemyDebugHud,
  updateEnemyRouteSelfEvaluation,
} from "../systems/enemySystem";
import {
  getConfiguredStartingLives as getConfiguredStartingLivesForScene,
  getCurrentGameMode as getCurrentGameModeForScene,
  loadSelectedGameMode as loadSelectedGameModeForScene,
} from "../modes/modeManager";
import { loadLevel as loadClassicLevel } from "../modes/classicMode";
import {
  destroyAllBullets as destroyAllBulletsForScene,
  loadSurvivalMode as loadSurvivalModeForScene,
  rebuildBaseFortress as rebuildBaseFortressForScene,
  reshuffleSurvivalMap as reshuffleSurvivalMapForScene,
} from "../modes/survivalMode";
import { loadOnlineMode as loadOnlineModeForScene, teardownOnlineMode as teardownOnlineModeForScene, updateOnlineMode as updateOnlineModeForScene } from "../modes/onlineMode";
import { getOnlineBaseDefByAnchor } from "../modes/onlineLevel";
import {
  initPowerUpState,
  makeEnemyArmored,
  removeEnemyArmor,
  spawnRandomPowerUp,
  updatePowerUps,
  cleanupPowerUps,
} from "../systems/powerUpSystem";

const PLAYER_MENU_ITEMS = [
  { key: "resume", label: "Reanudar partida" },
  { key: "restart", label: "Reiniciar partida" },
  { key: "controls", label: "Controles" },
  { key: "audio", label: "Audio" },
  { key: "help", label: "Ayuda rapida" },
  { key: "quit", label: "Abandonar partida" },
];

const PLAYER_BINDING_ROWS = [
  { key: "moveUp", label: "Mover arriba", settingKey: (slot) => `p${slot}MoveUpKeyCode` },
  { key: "moveDown", label: "Mover abajo", settingKey: (slot) => `p${slot}MoveDownKeyCode` },
  { key: "moveLeft", label: "Mover izquierda", settingKey: (slot) => `p${slot}MoveLeftKeyCode` },
  { key: "moveRight", label: "Mover derecha", settingKey: (slot) => `p${slot}MoveRightKeyCode` },
  { key: "aimUp", label: "Apuntar arriba", settingKey: (slot) => `p${slot}AimUpKeyCode` },
  { key: "aimDown", label: "Apuntar abajo", settingKey: (slot) => `p${slot}AimDownKeyCode` },
  { key: "aimLeft", label: "Apuntar izquierda", settingKey: (slot) => `p${slot}AimLeftKeyCode` },
  { key: "aimRight", label: "Apuntar derecha", settingKey: (slot) => `p${slot}AimRightKeyCode` },
  { key: "fire", label: "Disparar", settingKey: (slot) => `p${slot}FireKeyCode` },
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
    this.load.image("player-turret-yellow-s1", "/tank-game/player-turret-yellow-s1.png");
    this.load.image("player-body-yellow-s2", "/tank-game/player-body-yellow-s2.png");
    this.load.image("player-turret-yellow-s2", "/tank-game/player-turret-yellow-s2.png");
    this.load.image("player-turret-yellow-s3", "/tank-game/player-turret-yellow-s3.png");
    this.load.image("player-body-green-v2", "/tank-game/player-body-green-V2.png");
    this.load.image("player-turret-green-v2", "/tank-game/player-turret-green-V2.png");
    this.load.image("player-turret-green-s1", "/tank-game/player-turret-green-s1.png");
    this.load.image("player-body-green-s2", "/tank-game/player-body-green-s2.png");
    this.load.image("player-turret-green-s2", "/tank-game/player-turret-green-s2.png");
    this.load.image("player-turret-green-s3", "/tank-game/player-turret-green-s3.png");
    this.load.image("player-body-white-v2", "/tank-game/player-body-white-V2.png");
    this.load.image("player-body-white-s2", "/tank-game/player-body-white-s2.png");
    this.load.image("player-turret-white-v2", "/tank-game/player-turret-white-V2.png");
    this.load.image("player-turret-white-s1", "/tank-game/player-turret-white-s1.png");
    this.load.image("player-turret-white-s2", "/tank-game/player-turret-white-s2.png");
    this.load.image("player-turret-white-s3", "/tank-game/player-turret-white-s3.png");

    this.load.image("enemy-body-gray-v2", "/tank-game/enemy-body-gray-V2.png");
    this.load.image("enemy-turret-gray-v2", "/tank-game/enemy-turret-gray-V2.png");
    this.load.image("enemy-tankette-body", "/tank-game/enemy-tunkett.png");
    this.load.image("enemy-tankette-turret", "/tank-game/enemy-tunkett-turret.png");

    this.load.image("eagle", "/tank-game/eagle.png");
    this.load.image("tank-explosion", "/tank-game/explosion.png");
    this.load.image("tank-projectile", "/tank-game/projectile1.png");
    this.load.image("boss-heli-body", "/tank-game/helicopter.png");
    this.load.image("boss-heli-rotor", "/tank-game/rotor.png");

    // Power-ups
    this.load.image("power-shovel",   "/tank-game/shovel.png");
    this.load.image("power-shield",   "/tank-game/shield.png");
    this.load.image("power-tank",     "/tank-game/tank.png");
    this.load.image("power-star",     "/tank-game/star.png");
    this.load.image("power-clock",    "/tank-game/clock.png");
    this.load.image("power-missiles", "/tank-game/missiles.png");
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
    this.activeMenuKind = "player";
    this.activeSettingsTab = "mode";
    this.playerMenuIndex = 0;
    this.playerMenuFocusArea = "menu";
    this.playerMenuContentIndex = 0;
    this.playerMenuActiveSlot = 1;
    this.playerMenuStatus = "Configuracion lista para jugar.";
    this.playerMenuModal = null;
    this.abandonConfirm = false;
    this.abandonConfirmIndex = 0;
    this.bindingCapture = null;
    this.bindingConflict = null;

    createSceneState(this, width, height);

    this.cameras.main.setBackgroundColor("#111111");

    this.floorLayer = this.add.layer();
    this.obstacleLayer = this.add.layer();
    this.entityLayer = this.add.layer();
    this.overlayLayer = this.add.layer();
    this.pickupLayer = this.add.layer();

    createHud(this, width, height);

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
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
    });

    if (this.input.gamepad) {
      this.input.gamepad.start();
    }

    this.refreshInputBindingKeys();
    this.input.keyboard.on("keydown", (event) => this.handleBindingCaptureKeyDown(event));

    this.createSettingsMenu();
    this.loadSelectedGameMode();
    this.updateStatsText();
    syncSceneStatusToMatchState(this);
    syncSceneStatsToMatchState(this);
    this.toggleSettingsMenu(false);
  }

  loadSettings() {
    const defaults = {};
    SETTINGS_SCHEMA.forEach((item) => {
      defaults[item.key] = item.defaultValue;
    });
    defaults.enemyAimErrorDeg = 0;
    defaults.enemyRushMode = 0;

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

      const enemyAimErrorDeg = Number(parsed?.enemyAimErrorDeg);
      if (!Number.isNaN(enemyAimErrorDeg)) {
        merged.enemyAimErrorDeg = clamp(enemyAimErrorDeg, 0, 25);
      }

      const enemyRushMode = Number(parsed?.enemyRushMode);
      if (!Number.isNaN(enemyRushMode)) {
        merged.enemyRushMode = clamp(Math.round(enemyRushMode), 0, 3);
      }

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
    syncSceneStatsToMatchState(this);
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
    syncSceneStatsToMatchState(this);
    this.updateStatsText();
  }

  noteCombatHit(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].hits += 1;
    this.combatStats.totals.hits += 1;
    this.saveCombatStats();
    syncSceneStatsToMatchState(this);
    this.updateStatsText();
  }

  noteCombatKill(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].kills += 1;
    this.combatStats.totals.kills += 1;
    this.saveCombatStats();
    syncSceneStatsToMatchState(this);
    this.updateStatsText();
  }

  noteCombatDeath(ownerType) {
    if (!this.combatStats) this.combatStats = createEmptyCombatStats();
    const bucket = this.getCombatStatsBucketKey(ownerType);
    this.combatStats[bucket].deaths += 1;
    this.combatStats.totals.deaths += 1;
    this.saveCombatStats();
    syncSceneStatsToMatchState(this);
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
    syncSceneStatsToMatchState(this);
    return renderStatsText(this);
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
   * 0 = clásico, 1 = survival, 2 = online 2v2. Mantenerlo como entero
   * simplifica la persistencia junto al resto de sliders del menú.
   */
  getCurrentGameMode() {
    return getCurrentGameModeForScene(this);
  }

  getConfiguredStartingLives() {
    return getConfiguredStartingLivesForScene(this);
  }

  /**
   * Reinicia el estado del modo actual y vuelve a cargar el mapa apropiado.
   *
   * Se usa tanto al inicio como cuando el usuario cambia entre clásico y
   * survival desde el menú.
   */
  loadSelectedGameMode() {
    return loadSelectedGameModeForScene(this);
  }

  loadSurvivalMode() {
    return loadSurvivalModeForScene(this);
  }

  loadOnlineMode() {
    return loadOnlineModeForScene(this);
  }

  teardownOnlineMode() {
    return teardownOnlineModeForScene(this);
  }

  updateOnlineMode(delta) {
    return updateOnlineModeForScene(this, delta);
  }

  /**
   * Regenera el mapa survival sobre la marcha sin reiniciar la partida.
   *
   * Conserva al jugador y enemigos vivos, pero limpia obstáculos alrededor de
   * sus posiciones actuales para que nadie quede embebido dentro del terreno
   * nuevo luego del reshuffle procedural.
   */
  reshuffleSurvivalMap() {
    return reshuffleSurvivalMapForScene(this);
  }

  /**
   * Elimina todas las balas activas del mundo y limpia las referencias que
   * cada tanque mantiene sobre sus proyectiles vivos. Se usa antes de
   * remezclar el mapa para evitar colisiones fantasma con tiles recién
   * generados.
   */
  destroyAllBullets() {
    return destroyAllBulletsForScene(this);
  }

  rebuildBaseFortress() {
    return rebuildBaseFortressForScene(this);
  }

  handleEnemyDestroyed(enemy, killerType = "player") {
    return handleEnemyDestroyed(this, enemy, killerType);
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
    this.refreshInputBindingKeys();
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

  refreshInputBindingKeys() {
    const reverseKeyCodes = Object.entries(Phaser.Input.Keyboard.KeyCodes).reduce((acc, [name, value]) => {
      if (typeof value === "number" && acc[value] == null) {
        acc[value] = name;
      }
      return acc;
    }, {});

    this.keyCodeLabels = reverseKeyCodes;
    this.bindingKeys = this.bindingKeys || {};

    SETTINGS_SCHEMA
      .filter((item) => item.category === "bindings")
      .forEach((item) => {
        const keyCode = Math.round(Number(this.settings?.[item.key] || 0));
        if (!keyCode) {
          delete this.bindingKeys[item.key];
          return;
        }
        this.bindingKeys[item.key] = this.input.keyboard.addKey(keyCode, true, false);
      });
  }

  installDebugMenuConsoleHelpers() {
    if (typeof window === "undefined") return;
    try {
      delete window.tankGameDebugMenu;
      delete window.tankGamePlayerMenu;
    } catch (error) {}
  }

  getKeyLabel(keyCode) {
    const code = Math.round(Number(keyCode || 0));
    if (!code) return "Sin asignar";
    const rawLabel = this.keyCodeLabels?.[code] || `KEY_${code}`;
    const labelMap = {
      SPACE: "Space",
      UP: "Arriba",
      DOWN: "Abajo",
      LEFT: "Izquierda",
      RIGHT: "Derecha",
      ESC: "Esc",
      ENTER: "Enter",
      CTRL: "Ctrl",
      NUMPAD_ZERO: "Num 0",
      NUMPAD_FOUR: "Num 4",
      NUMPAD_FIVE: "Num 5",
      NUMPAD_SIX: "Num 6",
      NUMPAD_EIGHT: "Num 8",
    };

    if (labelMap[rawLabel]) return labelMap[rawLabel];
    return rawLabel.replace(/^NUMPAD_/, "Num ").replace(/_/g, " ");
  }

  getDefaultBindingFor(settingKey) {
    return SETTINGS_SCHEMA.find((item) => item.key === settingKey)?.defaultValue ?? 0;
  }

  getGamepadBindingLabel(bindingKey, slot = 1) {
    const bindingMap = {
      moveUp: "Stick izquierdo",
      moveDown: "Stick izquierdo",
      moveLeft: "Stick izquierdo",
      moveRight: "Stick izquierdo",
      aimUp: "Stick derecho",
      aimDown: "Stick derecho",
      aimLeft: "Stick derecho",
      aimRight: "Stick derecho",
      fire: "RT / RB",
      p2JoinKeyCode: slot === 2 ? "Start" : "A",
    };

    return bindingMap[bindingKey] || "Gamepad";
  }

  clearBinding(settingKey) {
    this.settings[settingKey] = 0;
    this.saveSettings();
    this.refreshInputBindingKeys();
    this.refreshPlayerMenuUI?.();
  }

  findBindingConflict(settingKey, newCode) {
    if (!newCode) return null;
    return SETTINGS_SCHEMA
      .filter((item) => item.category === "bindings" && item.key !== settingKey)
      .find((item) => Math.round(Number(this.settings?.[item.key] || 0)) === newCode) || null;
  }

  /**
   * Construye el menú de pausa/configuración completo.
   *
   * El menú vive dentro de un Container de Phaser para poder mostrar/ocultar
   * todo junto. Cada pestaña reutiliza el mismo panel lateral y sólo deja
   * visibles los controles que correspondan a la categoría activa.
   */
  // Helper: creates a text object that stays crisp even with pixelArt:true.
  // pixelArt mode sets NEAREST filtering on every texture update, so we
  // patch updateText() to re-apply LINEAR right after Phaser does its thing.
  makeMenuText(x, y, text, style) {
    const t = this.add.text(x, y, text, { ...style, resolution: 2 });
    const applyLinear = () => {
      try {
        const gl = this.sys.game.renderer.gl;
        const src = t.texture?.source?.[0];
        if (gl && src?.glTexture) {
          gl.bindTexture(gl.TEXTURE_2D, src.glTexture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
      } catch (e) {}
    };
    const origUpdate = t.updateText.bind(t);
    t.updateText = function () { origUpdate(); applyLinear(); return t; };
    applyLinear();
    return t;
  }

  createSettingsMenu() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.settingsBackdrop = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.75)
      .setOrigin(0)
      .setDepth(3000)
      .setVisible(false)
      .setInteractive();

    this.settingsPanel = this.add.container(0, 0).setDepth(3001).setVisible(false);

    const panelWidth = Math.min(940, width - 28);
    const panelHeight = Math.min(820, height - 20);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.floor((height - panelHeight) / 2);

    // ── CARPETA MILITAR ────────────────────────────────────────────────────
    // Fondo de carpeta (olive drab)
    const folderBg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x2e3d1c, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x1a2410, 1);
    // Franja superior (lomo de carpeta, más oscuro)
    const folderTop = this.add.rectangle(panelX, panelY, panelWidth, 66, 0x1e2a10, 1)
      .setOrigin(0, 0);
    // Remaches metálicos
    const r1 = this.add.circle(panelX + 20, panelY + 33, 6, 0x8a9870, 1).setStrokeStyle(1, 0x4a5830, 1);
    const r2 = this.add.circle(panelX + panelWidth - 20, panelY + 33, 6, 0x8a9870, 1).setStrokeStyle(1, 0x4a5830, 1);
    // Título en el lomo
    const title = this.makeMenuText(panelX + 42, panelY + 14, 'CONFIGURACIÓN', {
      fontFamily: 'Arial', fontSize: '20px', color: '#a8c080', fontStyle: 'bold',
    });
    const help = this.makeMenuText(panelX + 42, panelY + 40, 'ESC / START  ·  cambios inmediatos', {
      fontFamily: 'Arial', fontSize: '12px', color: '#5a6840',
    });
    this.settingsPanel.add([folderBg, folderTop, r1, r2, title, help]);

    // ── SOLAPAS (TABS) ─────────────────────────────────────────────────────
    this.tabButtons = [];
    const tabsY = panelY + 68;   // margen del lomo
    const TAB_H = 36;
    const TAB_R = 6;             // radio esquinas superiores
    let curX = panelX + 16;

    const drawTabGfx = (gfx, w, fillColor, strokeColor, sw = 1) => {
      gfx.clear();
      gfx.fillStyle(fillColor, 1);
      gfx.fillRoundedRect(0, 0, w, TAB_H, { tl: TAB_R, tr: TAB_R, bl: 0, br: 0 });
      gfx.lineStyle(sw, strokeColor, 1);
      gfx.strokeRoundedRect(0, 0, w, TAB_H, { tl: TAB_R, tr: TAB_R, bl: 0, br: 0 });
    };

    SETTINGS_TABS.forEach((tab) => {
      const w = tab.key === 'enemyAi' ? 122 : (tab.key === 'mapGen' ? 112 : (tab.key === 'controls' ? 110 : (tab.key === 'meta' ? 102 : 100)));
      const gfx = this.add.graphics().setPosition(curX, tabsY);
      drawTabGfx(gfx, w, 0x243018, 0x182010);
      gfx.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, TAB_H), Phaser.Geom.Rectangle.Contains);

      const tabText = this.makeMenuText(curX + w / 2, tabsY + TAB_H / 2, tab.label, {
        fontFamily: 'Arial', fontSize: '13px', color: '#7a9860', fontStyle: 'bold',
      }).setOrigin(0.5);

      gfx.on('pointerover', () => {
        if (!this.isMenuOpen || tab.key === this.activeSettingsTab) return;
        drawTabGfx(gfx, w, 0x344020, 0x182010);
        tabText.setColor('#c8e090');
      });
      gfx.on('pointerout', () => {
        if (tab.key === this.activeSettingsTab) return;
        drawTabGfx(gfx, w, 0x243018, 0x182010);
        tabText.setColor('#7a9860');
      });
      gfx.on('pointerdown', () => { if (this.isMenuOpen) this.setActiveSettingsTab(tab.key); });

      const button = {
        gfx, text: tabText,
        objects: [gfx, tabText],
        tabKey: tab.key,
        w,
        drawTab: (color, strokeColor, sw) => drawTabGfx(gfx, w, color, strokeColor, sw),
        onClick: () => this.setActiveSettingsTab(tab.key),
        label: tab.label,
        bg: { setFillStyle: () => {}, setStrokeStyle: () => {} }, // legacy shim
      };
      this.tabButtons.push(button);
      this.settingsPanel.add([gfx, tabText]);
      curX += w + 4;
    });

    // ── PAPEL (content area) ───────────────────────────────────────────────
    // El papel es crema, arranca justo donde terminan las solapas
    const paperY = panelY + 106;
    const paperH = panelHeight - 136;
    this.sectionBg = this.add.rectangle(panelX + 16, paperY, panelWidth - 32, paperH, 0xede8d5, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xb8b098, 1);
    // Línea de margen izquierdo del papel (roja claro, como cuaderno)
    const margin = this.add.rectangle(panelX + 16 + 36, paperY, 1.5, paperH, 0xd49090, 0.7)
      .setOrigin(0, 0);
    // Hint text arriba del papel
    this.tabHintText = this.makeMenuText(panelX + 60, paperY + 10, '', {
      fontFamily: 'Arial', fontSize: '13px', color: '#807060',
      wordWrap: { width: panelWidth - 120 },
    });
    this.settingsPanel.add([this.sectionBg, margin, this.tabHintText]);

    // ── VIEWPORT Y SCROLL ─────────────────────────────────────────────────
    this.sectionViewportX = this.sectionBg.x + 44;
    this.sectionViewportY = this.sectionBg.y + 52;
    this.sectionViewportWidth = this.sectionBg.width - 60;
    this.sectionViewportHeight = this.sectionBg.height - 66;
    this.menuScrollOffset = 0;
    this.maxMenuScrollOffset = 0;

    this.sectionScrollTrack = this.add
      .rectangle(this.sectionBg.x + this.sectionBg.width - 12, this.sectionViewportY, 4, this.sectionViewportHeight, 0xc8c0a8, 0.8)
      .setOrigin(0, 0).setVisible(false);
    this.sectionScrollThumb = this.add
      .rectangle(this.sectionBg.x + this.sectionBg.width - 12, this.sectionViewportY, 4, 48, 0x3d5226, 1)
      .setOrigin(0, 0).setVisible(false);
    this.settingsPanel.add([this.sectionScrollTrack, this.sectionScrollThumb]);

    this.sectionMaskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    this.sectionMaskGraphics.fillStyle(0xffffff, 1);
    this.sectionMaskGraphics.fillRect(this.sectionViewportX, this.sectionViewportY, this.sectionViewportWidth, this.sectionViewportHeight);
    this.sectionContentMask = this.sectionMaskGraphics.createGeometryMask();

    // ── SLIDERS (tinta sobre papel) ────────────────────────────────────────
    this.sliderControls = [];
    SETTINGS_SCHEMA.forEach((schema) => {
      const label = this.makeMenuText(0, 0, schema.label, {
        fontFamily: 'Arial', fontSize: '20px', color: '#000000',
      });
      const track = this.add.rectangle(0, 0, 300, 5, 0xc0b898, 1)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      const fill = this.add.rectangle(0, 0, 0, 5, 0x3d5226, 1).setOrigin(0, 0.5);
      const handle = this.add.circle(0, 0, 9, 0xf0a020, 1)
        .setStrokeStyle(2, 0x2a3a18, 1)
        .setInteractive({ draggable: true, useHandCursor: true });
      // Value box: estilo sello/stamp azul oscuro militar
      const valueBox = this.add.rectangle(0, 0, 104, 30, 0x1e4a2e, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x0e3020, 1);
      const valueText = this.makeMenuText(0, 0, '', {
        fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const control = { schema, category: schema.category, label, track, fill, handle, valueBox, valueText, trackX: 0, trackWidth: 300 };
      this.sliderControls.push(control);
      this.settingsPanel.add([label, track, fill, handle, valueBox, valueText]);
      [label, track, fill, handle, valueBox, valueText].forEach((obj) => obj.setMask(this.sectionContentMask));

      track.on('pointerdown', (pointer) => {
        if (!this.isMenuOpen || this.activeSettingsTab !== schema.category) return;
        this.setSliderValueFromPointer(control, pointer.worldX);
      });
      handle.on('drag', (pointer, dragX) => {
        if (!this.isMenuOpen || this.activeSettingsTab !== schema.category) return;
        this.setSliderValueFromPointer(control, dragX);
      });
      this.refreshSlider(control);
    });

    // ── PRESET SECTION ────────────────────────────────────────────────────
    this.presetSectionObjects = [];
    const sectionTop = this.sectionBg.y;
    const sectionLeft = this.sectionBg.x;
    const sectionWidth = this.sectionBg.width;
    const presetTitle = this.makeMenuText(sectionLeft + 48, sectionTop + 52, 'Presets guardados', {
      fontFamily: 'Arial', fontSize: '18px', color: '#1a1710', fontStyle: 'bold',
    });
    const presetHelp = this.makeMenuText(sectionLeft + 48, sectionTop + 80, 'Guardá, cargá o borrá configuraciones para reutilizarlas.', {
      fontFamily: 'Arial', fontSize: '13px', color: '#807060',
    });
    this.settingsPanel.add([presetTitle, presetHelp]);
    [presetTitle, presetHelp].forEach((obj) => obj.setMask(this.sectionContentMask));
    this.presetSectionObjects.push(presetTitle, presetHelp);

    this.presetNameText = this.makeMenuText(sectionLeft + 48, sectionTop + 112, 'Preset seleccionado: —', {
      fontFamily: 'Arial', fontSize: '14px', color: '#3d5226', fontStyle: 'bold',
    });
    this.settingsPanel.add(this.presetNameText);
    this.presetNameText.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetNameText);

    this.presetButtons = [];
    const buttonY = sectionTop + 144;
    const btns = [
      { label: 'Guardar / actualizar', x: sectionLeft + 48, width: 176, action: () => this.savePresetFlow() },
      { label: 'Cargar seleccionado',  x: sectionLeft + 236, width: 180, action: () => this.loadSelectedPreset() },
      { label: 'Borrar seleccionado',  x: sectionLeft + 428, width: 168, action: () => this.deleteSelectedPreset() },
    ];
    btns.forEach((bc) => {
      const button = this.createMenuButton(bc.x, buttonY, bc.width, 34, bc.label, bc.action);
      this.settingsPanel.add(button.objects);
      button.objects.forEach((obj) => obj.setMask(this.sectionContentMask));
      this.presetButtons.push(button);
      this.presetSectionObjects.push(...button.objects);
    });

    this.presetListBg = this.add.rectangle(sectionLeft + 48, buttonY + 48, sectionWidth - 80, 210, 0xe0dac4, 1)
      .setOrigin(0, 0).setStrokeStyle(1, 0xb0a888, 1);
    this.settingsPanel.add(this.presetListBg);
    this.presetListBg.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetListBg);

    this.presetPageText = this.makeMenuText(sectionLeft + sectionWidth - 210, buttonY + 16, '', {
      fontFamily: 'Arial', fontSize: '13px', color: '#807060',
    });
    this.settingsPanel.add(this.presetPageText);
    this.presetPageText.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetPageText);

    const prevBtn = this.createMenuButton(sectionLeft + sectionWidth - 188, buttonY + 8, 68, 28, '< Prev', () => {
      const mp = Math.max(0, Math.ceil(this.getPresetNames().length / 6) - 1);
      this.presetPage = Math.max(0, Math.min(mp, this.presetPage - 1));
      this.refreshPresetSection();
    });
    const nextBtn = this.createMenuButton(sectionLeft + sectionWidth - 112, buttonY + 8, 68, 28, 'Next >', () => {
      const mp = Math.max(0, Math.ceil(this.getPresetNames().length / 6) - 1);
      this.presetPage = Math.max(0, Math.min(mp, this.presetPage + 1));
      this.refreshPresetSection();
    });
    this.prevPresetPageButton = prevBtn;
    this.nextPresetPageButton = nextBtn;
    this.settingsPanel.add(prevBtn.objects);
    this.settingsPanel.add(nextBtn.objects);
    prevBtn.objects.forEach((o) => o.setMask(this.sectionContentMask));
    nextBtn.objects.forEach((o) => o.setMask(this.sectionContentMask));
    this.presetSectionObjects.push(...prevBtn.objects, ...nextBtn.objects);

    this.presetRowControls = [];
    for (let i = 0; i < 6; i += 1) {
      const rt = buttonY + 58 + i * 30;
      const rowBg = this.add.rectangle(sectionLeft + 56, rt, sectionWidth - 96, 26, 0xd8d2bc, i % 2 === 0 ? 0.6 : 0.3)
        .setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const rowText = this.makeMenuText(sectionLeft + 68, rt + 13, '', {
        fontFamily: 'Arial', fontSize: '14px', color: '#1a1710',
      }).setOrigin(0, 0.5);
      rowBg.on('pointerdown', () => {
        if (!this.isMenuOpen) return;
        const names = this.getPresetNames();
        const name = names[(this.presetPage || 0) * 6 + i];
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

    this.presetEmptyText = this.makeMenuText(sectionLeft + 68, buttonY + 138, '', {
      fontFamily: 'Arial', fontSize: '14px', color: '#a09070',
    });
    this.settingsPanel.add(this.presetEmptyText);
    this.presetEmptyText.setMask(this.sectionContentMask);
    this.presetSectionObjects.push(this.presetEmptyText);

    // ── FOOTER ─────────────────────────────────────────────────────────────
    const footer = this.makeMenuText(panelX + 20, panelY + panelHeight - 22,
      'START / ESC  ·  flechas / stick navegan  ·  A acepta  ·  B cierra', {
      fontFamily: 'Arial', fontSize: '12px', color: '#5a6840',
    });
    this.settingsPanel.add(footer);

    this.createPlayerMenuUI();
    this.refreshPlayerMenuUI();

    this.input.on('wheel', (pointer, _o, _dx, deltaY) => {
      if (!this.isMenuOpen || this.activeMenuKind !== "dev") return;
      const wx = pointer.worldX, wy = pointer.worldY;
      if (wx < this.sectionBg.x || wx > this.sectionBg.x + this.sectionBg.width) return;
      if (wy < this.sectionBg.y || wy > this.sectionBg.y + this.sectionBg.height) return;
      this.setMenuScrollOffset((this.menuScrollOffset || 0) + deltaY * 0.7);
    });

    this.menuFocus = { row: -1, column: 0 };
    this.menuNavInputState = { up: false, down: false, left: false, right: false, accept: false, back: false };
    this.setPresetSectionVisible(false);
    this.setActiveSettingsTab(this.activeSettingsTab || 'combat');
    this.refreshPresetSection();
  }

  createPlayerMenuUI() {
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = Math.min(1020, width - 40);
    const panelHeight = Math.min(760, height - 26);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.floor((height - panelHeight) / 2);

    this.playerMenuPanel = this.add.container(0, 0).setDepth(3001).setVisible(false);
    this.playerMenuBounds = { panelX, panelY, panelWidth, panelHeight };

    const dropShadow = this.add.rectangle(panelX + 18, panelY + 18, panelWidth, panelHeight, 0x0b0805, 0.42).setOrigin(0, 0);
    const folderBg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0xe6dcc1, 1).setOrigin(0, 0);
    const folderBorderLeft = this.add.rectangle(panelX, panelY, 2, panelHeight, 0x92764e, 1).setOrigin(0, 0);
    const folderBorderRight = this.add.rectangle(panelX + panelWidth - 2, panelY, 2, panelHeight, 0x92764e, 1).setOrigin(0, 0);
    const folderBorderBottom = this.add.rectangle(panelX, panelY + panelHeight - 2, panelWidth, 2, 0x92764e, 1).setOrigin(0, 0);
    const folderBorderTopLeft = this.add.rectangle(panelX, panelY, 46, 2, 0x92764e, 1).setOrigin(0, 0);
    const folderBorderTopRight = this.add.rectangle(panelX + 214, panelY, panelWidth - 214, 2, 0x92764e, 1).setOrigin(0, 0);
    const folderMenuTab = this.add.rectangle(panelX + 46, panelY - 28, 168, 52, 0xe6dcc1, 1).setOrigin(0, 0);
    const folderMenuTabTopBorder = this.add.rectangle(panelX + 46, panelY - 28, 168, 2, 0x92764e, 1).setOrigin(0, 0);
    const folderMenuTabLeftBorder = this.add.rectangle(panelX + 46, panelY - 28, 2, 28, 0x92764e, 1).setOrigin(0, 0);
    const folderMenuTabRightBorder = this.add.rectangle(panelX + 212, panelY - 28, 2, 28, 0x92764e, 1).setOrigin(0, 0);
    const folderHeader = this.add.rectangle(panelX + 24, panelY + 26, panelWidth - 48, 84, 0x556238, 1).setOrigin(0, 0);
    const paperBg = this.add.rectangle(panelX + 34, panelY + 136, panelWidth - 68, panelHeight - 172, 0xf6efdc, 1).setOrigin(0, 0);
    const marginLine = this.add.rectangle(panelX + 88, panelY + 154, 2, panelHeight - 208, 0xd5a09a, 0.72).setOrigin(0, 0);
    const separatorLine = this.add.rectangle(panelX + 365, panelY + 174, 1.5, panelHeight - 248, 0xd6c8a7, 1).setOrigin(0, 0);

    this.playerMenuPanel.add([dropShadow, folderBg, folderBorderLeft, folderBorderRight, folderBorderBottom, folderBorderTopLeft, folderBorderTopRight, folderMenuTab, folderMenuTabTopBorder, folderMenuTabLeftBorder, folderMenuTabRightBorder, folderHeader, paperBg, marginLine, separatorLine]);

    this.playerMenuPanel.add([
      this.makeMenuText(panelX + 62, panelY + 48, "PAUSA / BRIEFING", {
        fontFamily: "Arial",
        fontSize: "28px",
        color: "#e9f0dd",
        fontStyle: "bold",
      }),
      this.makeMenuText(panelX + 62, panelY + 82, "MISION ACTIVA  |  AJUSTES DEL JUGADOR", {
        fontFamily: "Courier New",
        fontSize: "12px",
        color: "#dbe7c6",
        fontStyle: "bold",
      }),
      this.makeMenuText(panelX + 74, panelY - 12, "MENU", {
        fontFamily: "Courier New",
        fontSize: "20px",
        color: "#5d584b",
        fontStyle: "bold",
      }),
    ]);

    this.playerMenuTitle = this.makeMenuText(panelX + 410, panelY + 178, "", {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#473f33",
      fontStyle: "bold",
    });
    this.playerMenuBody = this.makeMenuText(panelX + 410, panelY + 220, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#786d5c",
      wordWrap: { width: panelWidth - 480 },
    });
    this.playerMenuHint = this.makeMenuText(panelX + 410, panelY + panelHeight - 118, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#6f614f",
      wordWrap: { width: panelWidth - 480 },
    });
    this.playerMenuStatusText = this.makeMenuText(panelX + 410, panelY + panelHeight - 78, "", {
      fontFamily: "Courier New",
      fontSize: "13px",
      color: "#86725b",
      wordWrap: { width: panelWidth - 480 },
    });
    this.playerMenuFooter = this.makeMenuText(panelX + 42, panelY + panelHeight - 30, "ESC / START cerrar  ·  flechas / stick navegan  ·  ENTER / A confirma", {
      fontFamily: "Courier New",
      fontSize: "12px",
      color: "#76684f",
    });
    this.playerMenuPanel.add([this.playerMenuTitle, this.playerMenuBody, this.playerMenuHint, this.playerMenuStatusText, this.playerMenuFooter]);

    this.playerMenuButtons = PLAYER_MENU_ITEMS.map((item, index) => {
      const bg = this.add.rectangle(panelX + 108, panelY + 192 + index * 74, 250, 46, 0xead89f, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const label = this.makeMenuText(panelX + 128, panelY + 202 + index * 74, item.label, {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#7a7061",
        fontStyle: "bold",
      });
      bg.on("pointerover", () => this.hoverPlayerMenuButton(index));
      bg.on("pointerdown", () => this.clickPlayerMenuButton(index));
      this.playerMenuPanel.add([bg, label]);
      return { bg, label, item };
    });

    this.playerMenuRows = [];
    for (let index = 0; index < 12; index += 1) {
      const y = panelY + 284 + index * 34;
      const bg = this.add.rectangle(panelX + 404, y - 4, panelWidth - 470, 30, 0xf1e5bf, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const label = this.makeMenuText(panelX + 424, y, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#534c43",
        fontStyle: "bold",
      });
      const value = this.makeMenuText(panelX + panelWidth - 92, y, "", {
        fontFamily: "Courier New",
        fontSize: "17px",
        color: "#6b5a34",
        fontStyle: "bold",
      }).setOrigin(1, 0);
      bg.on("pointerover", () => this.hoverPlayerMenuRow(index));
      bg.on("pointerdown", () => this.clickPlayerMenuRow(index));
      this.playerMenuPanel.add([bg, label, value]);
      this.playerMenuRows.push({ bg, label, value });
    }

    this.playerMenuModalBackdrop = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x000000, 0.28).setOrigin(0, 0).setVisible(false);
    this.playerMenuModalCard = this.add.rectangle(panelX + 490, panelY + 246, 420, 210, 0xf6efdc, 1).setOrigin(0, 0).setStrokeStyle(2, 0x9c724d, 1).setVisible(false);
    this.playerMenuModalTitle = this.makeMenuText(panelX + 520, panelY + 272, "", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#41382d",
      fontStyle: "bold",
    }).setVisible(false);
    this.playerMenuModalBody = this.makeMenuText(panelX + 520, panelY + 322, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#766857",
      wordWrap: { width: 360 },
    }).setVisible(false);
    this.playerMenuModalButtons = [
      {
        bg: this.add.rectangle(panelX + 520, panelY + 406, 128, 40, 0x4f5e3e, 1).setOrigin(0, 0).setStrokeStyle(1, 0x334025, 1).setVisible(false).setInteractive({ useHandCursor: true }),
        text: this.makeMenuText(panelX + 584, panelY + 417, "Cancelar", {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#f4f0e2",
          fontStyle: "bold",
        }).setOrigin(0.5, 0).setVisible(false),
      },
      {
        bg: this.add.rectangle(panelX + 670, panelY + 406, 190, 40, 0xa85d3f, 1).setOrigin(0, 0).setStrokeStyle(1, 0x6f3927, 1).setVisible(false).setInteractive({ useHandCursor: true }),
        text: this.makeMenuText(panelX + 765, panelY + 417, "Confirmar", {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#fff4ea",
          fontStyle: "bold",
        }).setOrigin(0.5, 0).setVisible(false),
      },
    ];
    this.playerMenuModalButtons.forEach((button, index) => {
      button.bg.on("pointerover", () => this.hoverPlayerMenuModalButton(index));
      button.bg.on("pointerdown", () => this.clickPlayerMenuModalButton(index));
    });
    this.playerMenuPanel.add([
      this.playerMenuModalBackdrop,
      this.playerMenuModalCard,
      this.playerMenuModalTitle,
      this.playerMenuModalBody,
      ...this.playerMenuModalButtons.flatMap((button) => [button.bg, button.text]),
    ]);
  }

  getVisiblePlayerMenuItems() {
    if (this.currentGameMode === "online_2v2") {
      return PLAYER_MENU_ITEMS.filter((item) => item.key !== "restart");
    }
    return PLAYER_MENU_ITEMS;
  }

  getPlayerMenuEntry() {
    const items = this.getVisiblePlayerMenuItems();
    return items[this.playerMenuIndex] || items[0] || PLAYER_MENU_ITEMS[0];
  }

  getPlayerMenuContentRows() {
    const entry = this.getPlayerMenuEntry();
    if (entry.key !== "controls") return [];

    const slot = this.playerMenuActiveSlot;
    const isGamepad = Math.round(this.settings?.[slot === 1 ? "playerOneControlDevice" : "playerTwoControlDevice"] || 0) === 1;
    const rows = [
      { type: "slot", label: "Jugador activo", value: `Jugador ${slot}` },
      {
        type: "device",
        label: "Dispositivo",
        settingKey: slot === 1 ? "playerOneControlDevice" : "playerTwoControlDevice",
        value: isGamepad ? "Gamepad" : "Teclado",
      },
      ...PLAYER_BINDING_ROWS.map((item) => {
        const settingKey = item.settingKey(slot);
        return {
          type: "binding",
          bindingKey: item.key,
          label: item.label,
          settingKey,
          value: isGamepad ? this.getGamepadBindingLabel(item.key, slot) : this.getKeyLabel(this.settings?.[settingKey]),
          editable: !isGamepad,
        };
      }),
    ];

    if (slot === 2) {
      rows.push({
        type: "binding",
        bindingKey: "p2JoinKeyCode",
        label: "Unirse a partida",
        settingKey: "p2JoinKeyCode",
        value: isGamepad ? this.getGamepadBindingLabel("p2JoinKeyCode", slot) : this.getKeyLabel(this.settings?.p2JoinKeyCode),
        editable: !isGamepad,
      });
    }

    rows.push({ type: "restore", label: "Restaurar predeterminados", value: "Aplicar" });
    return rows;
  }

  openPlayerMenuModal(config) {
    this.playerMenuModal = { selectedIndex: 0, ...config };
    this.refreshPlayerMenuUI();
  }

  closePlayerMenuModal() {
    this.playerMenuModal = null;
    this.refreshPlayerMenuUI();
  }

  restoreBindingsForActiveSlot() {
    const slot = this.playerMenuActiveSlot;
    const bindingKeys = PLAYER_BINDING_ROWS.map((item) => item.settingKey(slot));
    if (slot === 2) bindingKeys.push("p2JoinKeyCode");
    bindingKeys.forEach((key) => {
      this.settings[key] = this.getDefaultBindingFor(key);
    });
    this.saveSettings();
    this.refreshInputBindingKeys();
    this.playerMenuStatus = `Se restauraron los controles del Jugador ${slot}.`;
    this.refreshPlayerMenuUI();
  }

  dispatchReturnToMenu() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tank-game:return-to-menu"));
    }
  }

  applyBindingValue(settingKey, keyCode) {
    this.settings[settingKey] = keyCode;
    this.saveSettings();
    this.refreshInputBindingKeys();
    this.playerMenuStatus = `${this.getKeyLabel(keyCode)} asignada a ${settingKey}.`;
    this.bindingCapture = null;
    this.bindingConflict = null;
    this.refreshPlayerMenuUI();
  }

  startBindingCapture(row) {
    this.bindingCapture = row;
    this.playerMenuStatus = `Esperando nueva tecla para ${row.label}.`;
    this.refreshPlayerMenuUI();
  }

  handleBindingCaptureKeyDown(event) {
    if (!this.bindingCapture) return;
    event.preventDefault();

    if (event.key === "Escape") {
      this.bindingCapture = null;
      this.playerMenuStatus = "Captura cancelada.";
      this.refreshPlayerMenuUI();
      return;
    }

    const keyCode = Math.round(Number(event.keyCode || event.which || 0));
    if (!keyCode) return;

    const conflict = this.findBindingConflict(this.bindingCapture.settingKey, keyCode);
    if (conflict) {
      this.bindingConflict = {
        settingKey: this.bindingCapture.settingKey,
        targetLabel: this.bindingCapture.label,
        conflictingKey: conflict.key,
        conflictingLabel: conflict.label,
        nextCode: keyCode,
      };
      this.bindingCapture = null;
      this.openPlayerMenuModal({
        title: "Conflicto de tecla",
        body: `${this.getKeyLabel(keyCode)} ya esta asignada a ${conflict.label}. Si reemplazas, la asignacion anterior queda vacia.`,
        confirmLabel: "Reemplazar",
        cancelLabel: "Cancelar",
        onConfirm: () => {
          this.settings[conflict.key] = 0;
          this.applyBindingValue(this.bindingConflict.settingKey, this.bindingConflict.nextCode);
        },
      });
      return;
    }

    this.applyBindingValue(this.bindingCapture.settingKey, keyCode);
  }

  refreshPlayerMenuUI() {
    if (!this.playerMenuPanel) return;

    const visibleItems = this.getVisiblePlayerMenuItems();
    if (!visibleItems.length) return;
    this.playerMenuIndex = clamp(this.playerMenuIndex, 0, visibleItems.length - 1);
    const entry = this.getPlayerMenuEntry();
    const contentRows = this.getPlayerMenuContentRows();
    const contentVisible = entry.key === "controls";

    this.playerMenuButtons.forEach((button, index) => {
      const item = visibleItems[index];
      const selected = index === this.playerMenuIndex;
      const focused = this.playerMenuFocusArea === "menu" && selected && !this.playerMenuModal;
      button.bg.setVisible(!!item);
      button.label.setVisible(!!item);
      if (!item) return;
      button.label.setText(item.label);
      button.bg.setFillStyle(selected ? 0xead89f : 0xead89f, selected ? 1 : 0);
      button.label.setColor(focused ? "#3a342c" : selected ? "#4b4438" : "#7a7061");
    });

    const titleMap = {
      resume: "REANUDAR PARTIDA",
      restart: "REINICIAR PARTIDA",
      controls: "CONFIGURACION DE CONTROLES",
      audio: "AUDIO",
      help: "AYUDA RAPIDA",
      quit: "ABANDONAR PARTIDA",
    };
    const bodyMap = {
      resume: "Volves al combate exactamente donde quedaste.",
      restart: "Arranca de nuevo la partida actual desde cero, manteniendo el modo y la configuracion elegidos.",
      controls: "Remapea teclado, elegi dispositivo y ajusta la entrada de cada jugador.",
      audio: "Por ahora dejamos este bloque listo para sumar volumen general, musica y efectos.",
      help: "Esc / Start abre el menu. Enter / A confirma. Si capturas una tecla nueva, Escape cancela.",
      quit: "Volves al menu principal del juego. Siempre te vamos a pedir confirmacion antes de salir.",
    };
    const hintMap = {
      resume: "Pulsa Enter o A para cerrar el menu y seguir jugando.",
      restart: "Enter o A abre la confirmacion. La partida vuelve a empezar enseguida.",
      controls: this.bindingCapture
        ? `Capturando tecla para ${this.bindingCapture.label}.`
        : Math.round(this.settings?.[this.playerMenuActiveSlot === 1 ? "playerOneControlDevice" : "playerTwoControlDevice"] || 0) === 1
          ? "Gamepad muestra el esquema activo actual. El remapeo fino queda pendiente."
          : "Izquierda vuelve al listado. Derecha entra en el panel de controles.",
      audio: "Placeholder visual por ahora, listo para crecer sin mezclar debug con UX de jugador.",
      help: "El menu de desarrollo queda oculto y solo se habilita desde consola.",
      quit: "Enter o A abre la confirmacion. Cancelar queda siempre primero.",
    };

    this.playerMenuTitle.setText(titleMap[entry.key] || "MENU");
    this.playerMenuBody.setText(bodyMap[entry.key] || "");
    this.playerMenuHint.setText(hintMap[entry.key] || "");
    this.playerMenuStatusText.setText(this.playerMenuStatus || "");

    this.playerMenuRows.forEach((row, index) => {
      const data = contentRows[index];
      const focused = this.playerMenuFocusArea === "content" && index === this.playerMenuContentIndex && !this.playerMenuModal;
      row.bg.setVisible(!!data);
      row.label.setVisible(!!data);
      row.value.setVisible(!!data);
      if (!data) return;
      row.bg.setFillStyle(0xf1e5bf, focused ? 1 : 0);
      row.label.setText(data.label);
      row.value.setText(data.value || "");
      row.label.setColor(focused ? "#3f372e" : "#5b5247");
      row.value.setColor(focused ? "#4f3d1c" : "#866f3f");
    });

    if (!contentVisible) {
      this.playerMenuRows.forEach((row) => {
        row.bg.setVisible(false);
        row.label.setVisible(false);
        row.value.setVisible(false);
      });
    }

    const modal = this.playerMenuModal;
    const modalVisible = !!modal;
    this.playerMenuModalBackdrop.setVisible(modalVisible);
    this.playerMenuModalCard.setVisible(modalVisible);
    this.playerMenuModalTitle.setVisible(modalVisible);
    this.playerMenuModalBody.setVisible(modalVisible);

    if (modalVisible) {
      this.playerMenuModalTitle.setText(modal.title || "");
      this.playerMenuModalBody.setText(modal.body || "");
    }

    this.playerMenuModalButtons.forEach((button, index) => {
      const focused = modalVisible && (modal.selectedIndex || 0) === index;
      button.bg.setVisible(modalVisible);
      button.text.setVisible(modalVisible);
      if (!modalVisible) return;
      button.text.setText(index === 0 ? (modal.cancelLabel || "Cancelar") : (modal.confirmLabel || "Confirmar"));
      if (index === 0) {
        button.bg.setFillStyle(focused ? 0x627052 : 0x4f5e3e, 1);
      } else {
        button.bg.setFillStyle(focused ? 0xbf6f4d : 0xa85d3f, 1);
      }
    });
  }

  hoverPlayerMenuButton(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || this.playerMenuModal) return;
    if (!this.getVisiblePlayerMenuItems()[index]) return;
    this.playerMenuFocusArea = "menu";
    this.playerMenuIndex = clamp(index, 0, this.getVisiblePlayerMenuItems().length - 1);
    this.playerMenuContentIndex = 0;
    this.refreshPlayerMenuUI();
  }

  clickPlayerMenuButton(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || this.playerMenuModal) return;
    if (!this.getVisiblePlayerMenuItems()[index]) return;
    this.playerMenuFocusArea = "menu";
    this.playerMenuIndex = clamp(index, 0, this.getVisiblePlayerMenuItems().length - 1);
    this.playerMenuContentIndex = 0;
    this.refreshPlayerMenuUI();
    this.activatePlayerMenuSelection();
  }

  hoverPlayerMenuRow(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || this.playerMenuModal) return;
    if (this.getPlayerMenuEntry().key !== "controls") return;
    const rows = this.getPlayerMenuContentRows();
    if (!rows[index]) return;
    this.playerMenuFocusArea = "content";
    this.playerMenuContentIndex = index;
    this.refreshPlayerMenuUI();
  }

  clickPlayerMenuRow(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || this.playerMenuModal) return;
    if (this.getPlayerMenuEntry().key !== "controls") return;
    const rows = this.getPlayerMenuContentRows();
    if (!rows[index]) return;
    this.playerMenuFocusArea = "content";
    this.playerMenuContentIndex = index;
    this.refreshPlayerMenuUI();
    this.activatePlayerMenuSelection();
  }

  hoverPlayerMenuModalButton(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || !this.playerMenuModal) return;
    this.playerMenuModal.selectedIndex = clamp(index, 0, 1);
    this.refreshPlayerMenuUI();
  }

  clickPlayerMenuModalButton(index) {
    if (!this.isMenuOpen || this.activeMenuKind !== "player" || !this.playerMenuModal) return;
    this.playerMenuModal.selectedIndex = clamp(index, 0, 1);
    this.refreshPlayerMenuUI();
    this.activatePlayerMenuSelection();
  }

  movePlayerMenuVertical(delta) {
    if (this.playerMenuModal) {
      const next = clamp((this.playerMenuModal.selectedIndex || 0) + delta, 0, 1);
      this.playerMenuModal.selectedIndex = next;
      this.refreshPlayerMenuUI();
      return;
    }

    if (this.playerMenuFocusArea === "content") {
      const rows = this.getPlayerMenuContentRows();
      if (!rows.length) return;
      this.playerMenuContentIndex = clamp(this.playerMenuContentIndex + delta, 0, rows.length - 1);
      this.refreshPlayerMenuUI();
      return;
    }

    this.playerMenuIndex = clamp(this.playerMenuIndex + delta, 0, this.getVisiblePlayerMenuItems().length - 1);
    this.playerMenuContentIndex = 0;
    this.refreshPlayerMenuUI();
  }

  movePlayerMenuHorizontal(delta) {
    if (this.playerMenuModal) {
      this.playerMenuModal.selectedIndex = delta > 0 ? 1 : 0;
      this.refreshPlayerMenuUI();
      return;
    }

    const entry = this.getPlayerMenuEntry();
    if (this.playerMenuFocusArea === "menu") {
      if (delta > 0 && entry.key === "controls") {
        this.playerMenuFocusArea = "content";
        this.playerMenuContentIndex = 0;
        this.refreshPlayerMenuUI();
      }
      return;
    }

    const rows = this.getPlayerMenuContentRows();
    const row = rows[this.playerMenuContentIndex];
    if (!row) return;

    if (delta < 0) {
      this.playerMenuFocusArea = "menu";
      this.refreshPlayerMenuUI();
      return;
    }

    if (row.type === "slot") {
      this.playerMenuActiveSlot = delta > 0 ? 2 : 1;
      this.playerMenuContentIndex = 0;
      this.refreshPlayerMenuUI();
      return;
    }

    if (row.type === "device") {
      const currentValue = Math.round(this.settings?.[row.settingKey] || 0);
      this.settings[row.settingKey] = currentValue === 1 ? 0 : 1;
      this.saveSettings();
      this.applySettingsAfterChange(row.settingKey);
      this.playerMenuStatus = `Dispositivo actualizado para Jugador ${this.playerMenuActiveSlot}.`;
      this.refreshPlayerMenuUI();
    }
  }

  activatePlayerMenuSelection() {
    if (this.playerMenuModal) {
      if ((this.playerMenuModal.selectedIndex || 0) === 1) {
        this.playerMenuModal.onConfirm?.();
      } else {
        this.playerMenuModal = null;
      }
      this.bindingConflict = null;
      this.refreshPlayerMenuUI();
      return;
    }

    if (this.playerMenuFocusArea === "menu") {
      const entry = this.getPlayerMenuEntry();
      if (entry.key === "resume") {
        this.toggleSettingsMenu(false);
        return;
      }
      if (entry.key === "restart") {
        this.openPlayerMenuModal({
          title: "Reiniciar partida",
          body: "La partida actual va a comenzar de nuevo desde cero. Se pierde el progreso de esta run.",
          confirmLabel: "Si, reiniciar",
          cancelLabel: "Cancelar",
          onConfirm: () => this.restartCurrentMatch(),
        });
        return;
      }
      if (entry.key === "controls") {
        this.playerMenuFocusArea = "content";
        this.playerMenuContentIndex = 0;
        this.refreshPlayerMenuUI();
        return;
      }
      if (entry.key === "quit") {
        this.openPlayerMenuModal({
          title: "Abandonar partida",
          body: "Vas a volver al menu principal del juego. Se perdera el progreso no guardado.",
          confirmLabel: "Si, abandonar",
          cancelLabel: "Cancelar",
          onConfirm: () => this.dispatchReturnToMenu(),
        });
        return;
      }
      this.playerMenuStatus = entry.key === "audio"
        ? "Audio queda listo para la siguiente iteracion."
        : "Mostrando ayuda rapida para el jugador.";
      this.refreshPlayerMenuUI();
      return;
    }

    const rows = this.getPlayerMenuContentRows();
    const row = rows[this.playerMenuContentIndex];
    if (!row) return;
    if (row.type === "slot") {
      this.playerMenuActiveSlot = this.playerMenuActiveSlot === 1 ? 2 : 1;
      this.refreshPlayerMenuUI();
      return;
    }
    if (row.type === "device") {
      this.movePlayerMenuHorizontal(1);
      return;
    }
    if (row.type === "binding") {
      if (row.editable === false) {
        this.playerMenuStatus = "El esquema de gamepad se muestra como referencia. El remapeo de gamepad lo sumamos en la siguiente pasada.";
        this.refreshPlayerMenuUI();
        return;
      }
      this.startBindingCapture(row);
      return;
    }
    if (row.type === "restore") {
      this.restoreBindingsForActiveSlot();
    }
  }

  handlePlayerMenuBackAction() {
    if (this.playerMenuModal) {
      this.closePlayerMenuModal();
      return;
    }
    if (this.bindingCapture) {
      this.bindingCapture = null;
      this.playerMenuStatus = "Captura cancelada.";
      this.refreshPlayerMenuUI();
      return;
    }
    if (this.playerMenuFocusArea === "content") {
      this.playerMenuFocusArea = "menu";
      this.refreshPlayerMenuUI();
      return;
    }
    this.toggleSettingsMenu(false);
  }

  restartCurrentMatch() {
    if (this.currentGameMode === "online_2v2") return;
    this.playerMenuModal = null;
    this.playerMenuStatus = "La partida se reinicio desde el menu.";
    this.toggleSettingsMenu(false);
    this.loadSelectedGameMode();
  }

  getMenuContentHeightForTab(tabKey) {
    if (tabKey === "presets") {
      return 340;
    }

    const visibleControls = this.sliderControls.filter((control) => control.category === tabKey);
    if (!visibleControls.length) return 0;
    return 20 + visibleControls.length * 62 + 20;
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

    const rowTop = 20 + focusedRow * 62;
    const rowBottom = rowTop + 62;
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
    const startY = sectionTop + 58 - (this.menuScrollOffset || 0);
    const visibleControls = this.sliderControls.filter((control) => control.category === this.activeSettingsTab);

    visibleControls.forEach((control, index) => {
      const rowY = startY + index * 58;
      const labelCol = this.sectionViewportX;
      const valueW = 104;
      const valueBoxX = sectionLeft + sectionWidth - valueW - 12;
      const trackEnd = valueBoxX - 10;
      const trackStart = labelCol + Math.min(300, Math.floor(this.sectionViewportWidth * 0.48));
      control.label.setPosition(labelCol, rowY + 7);
      control.trackX = trackStart;
      control.trackWidth = Math.max(100, trackEnd - trackStart);
      control.track.setPosition(control.trackX, rowY + 27);
      control.track.width = control.trackWidth;
      control.fill.setPosition(control.trackX, rowY + 27);
      control.handle.setPosition(control.trackX, rowY + 27);
      control.valueBox.setDisplaySize(valueW, 30);
      control.valueBox.setPosition(valueBoxX, rowY + 12);
      control.valueText.setPosition(valueBoxX + valueW / 2, rowY + 27);
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
      mode: 'Elegí entre Clásico y Survival. Survival usa oleadas infinitas y regeneración de fortaleza.',
      controls: 'Elegí dispositivo y presets por jugador. P1 teclado: WASD + GHJY + Space. P2 teclado: Flechas + NumPad 4/5/6/8 + NumPad 0.',
      mapGen: 'Procgen del survival: algoritmo, densidades, lagos/ríos, bushes orgánicos, edificios, puentes y reshuffle automático por bajas.',
      combat: 'Balas del jugador/enemigos, hitboxes, fuego continuo y choque entre enemigos.',
      enemyAi: 'IA: Asedio, Cazador, Patrulla, Balanceado o Caótico. Los enemigos toman ladrillos como objetivo cuando bloquean rutas.',
      meta: 'Meta / debug: rutas, objetivos, caminos evaluados, estados y métricas de IA.',
      turret: 'Ajustes finos de alineación visual de la torreta.',
      presets: 'Guardar, cargar y borrar configuraciones persistentes.',
    };

    // Solapa activa = crema (papel); inactivas = olive oscuro
    this.tabButtons?.forEach((button) => {
      const active = button.tabKey === tabKey;
      if (button.drawTab) {
        button.drawTab(active ? 0xede8d5 : 0x243018, active ? 0xb8b098 : 0x182010, 1);
      }
      button.text.setColor(active ? '#1a1710' : '#7a9860');
    });

    if (this.tabHintText) {
      this.tabHintText.setText(hintMap[tabKey] || '');
    }

    this.setPresetSectionVisible(tabKey === 'presets');
    this.menuScrollOffset = 0;
    this.layoutActiveSettingsSection();
    this.clampMenuFocus?.();
    this.ensureFocusedMenuRowVisible?.();
    this.refreshMenuFocusVisuals?.();
  }

  createMenuButton(x, y, width, height, label, onClick) {
    // Botón estilo carpeta: olive oscuro idle, más claro hover
    const BG_IDLE  = 0x2e4018;
    const BG_HOVER = 0x3d5226;
    const BORDER   = 0x1a2810;
    const bg = this.add.rectangle(x, y, width, height, BG_IDLE, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(1, BORDER, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x + width / 2, y + height / 2, label, {
      fontFamily: 'Arial', fontSize: '14px', color: '#90b868', fontStyle: 'bold',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      if (!this.isMenuOpen) return;
      bg.setFillStyle(BG_HOVER, 1);
      bg.setStrokeStyle(1, 0xf0a020, 1);
      text.setColor('#e8f0d0');
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(BG_IDLE, 1);
      bg.setStrokeStyle(1, BORDER, 1);
      text.setColor('#90b868');
    });
    bg.on('pointerdown', () => { if (this.isMenuOpen) onClick(); });

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

    // Tabs
    this.tabButtons?.forEach((button, index) => {
      const active = button.tabKey === this.activeSettingsTab;
      const focused = focusedRow === -1 && index === focusedColumn;
      // Active always wins — focused only affects inactive tabs
      if (button.drawTab) {
        const color  = active ? 0xede8d5 : (focused ? 0x3d5226 : 0x243018);
        const stroke = active ? 0xb8b098 : (focused ? 0xf0a020 : 0x182010);
        const sw     = active ? 1 : (focused ? 2 : 1);
        button.drawTab(color, stroke, sw);
      }
      button.text.setColor(active ? '#1a1710' : (focused ? '#f0e080' : '#7a9860'));
    });

    // Sliders (sobre papel crema: tinta oscura)
    this.sliderControls?.forEach((control) => {
      const visible = control.category === this.activeSettingsTab;
      const focused = visible && focusedRow >= 0 && this.getMenuNavigationRows()[focusedRow]?.control === control;
      control.label.setColor(focused ? '#000000' : '#1a1710');
      control.valueBox.setFillStyle(focused ? 0x2a3e60 : 0x1e4a2e, 1);
      control.valueBox.setStrokeStyle(focused ? 2 : 1, focused ? 0xf0a020 : 0x0e3020, 1);
      control.handle.setStrokeStyle(focused ? 3 : 2, focused ? 0xffffff : 0x2a3a18, 1);
    });

    // Botones preset
    this.presetButtons?.forEach((button, index) => {
      const focused = this.activeSettingsTab === 'presets' && focusedRow === 0 && index === focusedColumn;
      button.bg.setFillStyle(focused ? 0x3d5226 : 0x2e4018, 1);
      button.bg.setStrokeStyle(focused ? 2 : 1, focused ? 0xf0a020 : 0x1a2810, 1);
      button.text.setColor(focused ? '#e8f0d0' : '#90b868');
    });

    [this.prevPresetPageButton, this.nextPresetPageButton].filter(Boolean).forEach((button, index) => {
      const focused = this.activeSettingsTab === 'presets' && focusedRow === 1 && index === focusedColumn;
      button.bg.setFillStyle(focused ? 0x3d5226 : 0x2e4018, 1);
      button.bg.setStrokeStyle(focused ? 2 : 1, focused ? 0xf0a020 : 0x1a2810, 1);
      button.text.setColor(focused ? '#e8f0d0' : '#90b868');
    });

    // Filas de preset list
    this.presetRowControls?.forEach((control, index) => {
      const names = this.getPresetNames();
      const name = names.slice((this.presetPage || 0) * 6, (this.presetPage || 0) * 6 + 6)[index];
      if (!name) return;
      const selected = name === this.selectedPresetName;
      const focused = this.activeSettingsTab === 'presets' && focusedRow === index + 2;
      control.rowBg.setFillStyle(selected ? 0xc8b88a : 0xd8d2bc, focused ? 0.95 : (selected ? 0.85 : (index % 2 === 0 ? 0.6 : 0.3)));
      control.rowBg.setStrokeStyle(focused ? 2 : 0, focused ? 0xf0a020 : 0xb0a888, focused ? 1 : 0);
      control.rowText.setColor(focused ? '#1a0800' : (selected ? '#1a0a00' : '#1a1710'));
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
    if (this.bindingCapture) return;
    const nextState = this.readMenuNavigationIntent();
    const prevState = this.menuNavInputState || {};

    if (nextState.up && !prevState.up) this.movePlayerMenuVertical(-1);
    if (nextState.down && !prevState.down) this.movePlayerMenuVertical(1);
    if (nextState.left && !prevState.left) this.movePlayerMenuHorizontal(-1);
    if (nextState.right && !prevState.right) this.movePlayerMenuHorizontal(1);
    if (nextState.accept && !prevState.accept) this.activatePlayerMenuSelection();
    if (nextState.back && !prevState.back) this.handlePlayerMenuBackAction();

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
      const modeLabelMap = { 0: "Clásico", 1: "Survival", 2: "Online 2v2" };
      displayValue = modeLabelMap[Math.round(value)] || "Clásico";
    } else if (schema.key === "survivalMapAlgorithm") {
      displayValue = ["Normal", "Río", "Isla abierta", "Archipiélago"][Math.round(value)] || "Normal";
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
      this.refreshPlayerMenuUI?.();
    }

    if (changedKey.endsWith("KeyCode")) {
      this.refreshInputBindingKeys();
      this.refreshPlayerMenuUI?.();
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
    this.settingsPanel?.setVisible(false);
    this.playerMenuPanel?.setVisible(nextState);

    // pixelArt:true sets image-rendering:pixelated on the canvas, which makes
    // text look terrible. Switch to smooth rendering while the menu is open.
    const canvas = this.sys.game.canvas;
    if (canvas) {
      canvas.style.imageRendering = nextState ? 'auto' : 'pixelated';
    }

    if (nextState) {
      // Al abrir el menú reiniciamos el estado de navegación para que START/A
      // no activen accidentalmente otra acción en el mismo frame.
      this.playerMenuFocusArea = "menu";
      this.playerMenuContentIndex = 0;
      this.playerMenuModal = null;
      this.bindingCapture = null;
      this.bindingConflict = null;
      this.menuNavInputState = this.readMenuNavigationIntent();
      this.refreshPlayerMenuUI();
    }
  }

  handleMenuToggleInput() {
    const menuPressed = this.keys.esc.isDown || this.readPadButtonPressed(9, 0.35, 0);
    if (menuPressed && !this.wasMenuPressed) {
      if (this.isMenuOpen) {
        this.handlePlayerMenuBackAction();
      } else {
        this.toggleSettingsMenu();
      }
    }
    this.wasMenuPressed = menuPressed;
  }

  loadLevel(levelIndex) {
    return loadClassicLevel(this, levelIndex);
  }

  clearLevelVisuals() {
    if (this.floorLayer) this.floorLayer.removeAll(true);
    if (this.obstacleLayer) this.obstacleLayer.removeAll(true);
    if (this.entityLayer) this.entityLayer.removeAll(true);
    if (this.overlayLayer) this.overlayLayer.removeAll(true);
    if (this.pickupLayer) this.pickupLayer.removeAll(true);

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
    clearEntityCollections(this);
    syncSceneStatusToMatchState(this);
    syncSceneStatsToMatchState(this);
    this.baseSprite = null;
    this.isPlayerRespawning = false;
  }

  drawBoard() {
    if (this.floorLayer) this.floorLayer.removeAll(true);
    if (this.obstacleLayer) this.obstacleLayer.removeAll(true);

    if (this.overlayLayer) this.overlayLayer.removeAll(true);
    this.baseSprite = null;

    const gridHeight = this.level?.floor?.length || GRID_HEIGHT;
    const gridWidth = this.level?.floor?.[0]?.length || GRID_WIDTH;
    const boardWidth = (gridWidth + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
    const boardHeight = (gridHeight + (OUTER_BORDER_TILES * 2)) * TILE_SIZE;
    if (this.currentGameMode === "online_2v2" || this.currentGameMode === "classic") {
      this.boardOriginX = Math.floor((this.scale.width - boardWidth) / 2);
      this.boardOriginY = Math.max(8, Math.floor((this.scale.height - boardHeight) / 2));
    } else {
      this.boardOriginX = Math.floor((this.scale.width - boardWidth) / 2);
      this.boardOriginY = Math.floor((this.scale.height - boardHeight) / 2);
    }
    this.boardPixelWidth = boardWidth;
    this.boardPixelHeight = boardHeight;
    this.spawnPoints = [
      { col: 1, row: 1 },
      { col: Math.floor((gridWidth - 1) / 2), row: 1 },
      { col: Math.max(1, gridWidth - 2), row: 1 },
    ];

    for (let borderRow = -OUTER_BORDER_TILES; borderRow < gridHeight + OUTER_BORDER_TILES; borderRow += 1) {
      for (let borderCol = -OUTER_BORDER_TILES; borderCol < gridWidth + OUTER_BORDER_TILES; borderCol += 1) {
        const isPerimeter = (
          borderCol < 0 ||
          borderRow < 0 ||
          borderCol >= gridWidth ||
          borderRow >= gridHeight
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

    for (let row = 0; row < gridHeight; row += 1) {

      for (let col = 0; col < gridWidth; col += 1) {
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
              if (this.currentGameMode === "online_2v2") {
                const onlineBaseDef = getOnlineBaseDefByAnchor(col, row);
                if (onlineBaseDef) this.baseSprite.setRotation(onlineBaseDef.spriteRotation || 0);
              }
              this.obstacleLayer.add(this.baseSprite);
            }
          } else {
            this.obstacleLayer.add(this.makeTileSprite(obstacle, x, y));
          }
        }
      }
    }

    for (let row = 0; row < gridHeight; row += 1) {
      for (let col = 0; col < gridWidth; col += 1) {
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

  createTankSprite(...args) {
    return createTankSprite(this, ...args);
  }

  getPlayerSpawnForSlot(slot = 1) {
    return getPlayerSpawnForSlot(slot, this.level);
  }


  /**
   * Devuelve qué dispositivo controla a cada jugador humano.
   *
   * 0 = teclado, 1 = joystick. Para gamepad se usa el slot 0 en P1 y el slot 1
   * en P2. Esto permite cambiar el origen de input desde el menú sin tocar
   * código.
   */
  getControlDeviceForSlot(slot = 1) {
    return getControlDeviceForSlot(this, slot);
  }

  isKeyboardControlledSlot(slot = 1) {
    return isKeyboardControlledSlot(this, slot);
  }

  getGamepadSlotForPlayerSlot(slot = 1) {
    return getGamepadSlotForPlayerSlot(slot);
  }

  getPlayerKeyboardMoveInput(slot = 1) {
    return getPlayerKeyboardMoveInput(this, slot);
  }

  getPlayerKeyboardAimInput(slot = 1) {
    return getPlayerKeyboardAimInput(this, slot);
  }

  getFriendlyTanks() {
    return getFriendlyTanks(this);
  }

  createPlayerTankForSlot(slot = 1) {
    return createPlayerTankForSlot(this, slot);
  }

  /**
   * Crea el tanque del jugador en el punto de inicio del nivel.
   *
   * Con la grilla fina del mapa, el tanque vuelve a ocupar visualmente 2x2 tiles
   * actuales (equivalente al tile macro original), mientras que la lógica de
   * colisión sigue usando un tamaño independiente.
   */
  createPlayer() {
    return createPlayer(this);
  }

  createPlayerTwo() {
    return createPlayerTwo(this);
  }

  getEnemySpawnVariant() {
    return getEnemySpawnVariant(this);
  }

  /**
   * Crea un tanque enemigo en uno de los spawn points superiores.
   *
   * Cada enemigo nace con estado inicial para patrulla, objetivo principal,
   * deambular y steering 360°, así la IA puede mezclar presión hacia la base
   * con variaciones laterales sin recalcular todo de cero cada frame.
   */
  createEnemyAtSpawn(spawn) {
    return createEnemyAtSpawn(this, spawn);
  }

  pickPatrolZoneForSpawn(col, row) {
    return pickPatrolZoneForSpawn(this, col, row);
  }

  pickWaypointInZone(zone) {
    return pickWaypointInZone(this, zone);
  }

  startBossBattle() {
    return startBossBattle(this);
  }

  createBossHelicopter(x, y) {
    return createBossHelicopter(this, x, y);
  }

  pickBossTargetPoint() {
    return pickBossTargetPoint(this);
  }

  updateBoss(boss, delta) {
    return updateBoss(this, boss, delta);
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
      return Math.max(1, Math.round((tank?.bulletLimit ?? this.settings.playerBulletLimit) || 1));
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
    return updateTankVisuals(this, tank);
  }

  getBrowserPads() {
    return getBrowserPads();
  }

  getPhaserPads() {
    return getPhaserPads(this);
  }

  getConnectedPads() {
    return getConnectedPads(this);
  }

  getPadBySlot(slot = 0) {
    return getPadBySlot(this, slot);
  }

  readPadAxis(index, slot = 0) {
    return readPadAxis(this, index, slot);
  }

  readPadButtonPressed(index, threshold = 0.35, slot = 0) {
    return readPadButtonPressed(this, index, threshold, slot);
  }

  updatePadStatus() {
    return updatePadStatus(this);
  }

  updateCoopText() {
    return updateCoopText(this);
  }

  tryJoinSecondPlayer() {
    return tryJoinSecondPlayer(this);
  }

  scheduleEnemyRefill() {
    return scheduleEnemyRefill(this);
  }

  fillEnemyWaveSlots() {
    return fillEnemyWaveSlots(this);
  }

  spawnEnemy() {
    return spawnEnemy(this);
  }

  // ── Power-up system ────────────────────────────────────────────────────────
  initPowerUpState() {
    return initPowerUpState(this);
  }

  makeEnemyArmored(enemy) {
    return makeEnemyArmored(this, enemy);
  }

  removeEnemyArmor(enemy) {
    return removeEnemyArmor(this, enemy);
  }

  spawnRandomPowerUp(forcedType = null) {
    return spawnRandomPowerUp(this, forcedType);
  }

  updatePowerUps(delta) {
    return updatePowerUps(this, delta);
  }

  cleanupPowerUps() {
    return cleanupPowerUps(this);
  }

  update(_, delta) {
    this.handleMenuToggleInput();
    this.updatePadStatus();
    if (this.currentGameMode !== "online_2v2") {
      this.tryJoinSecondPlayer();
    }

    if (this.isMenuOpen) {
      this.handleMenuNavigationInput();
    }

    if (this.isTransitioning || this.isMenuOpen || this.isGameOver) return;

    if (this.currentGameMode === "online_2v2") {
      this.updateOnlineMode(delta);
      return;
    }

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
    this.updatePowerUps(delta);
    this.checkLevelComplete();
    this.updateCoopText();
    this.updateEnemyDebugHud();
  }

  updatePlayer(tank, delta) {
    return updatePlayer(this, tank, delta);
  }

  getPlayerMoveInput(tank = this.player) {
    return getPlayerMoveInput(this, tank);
  }

  getPlayerAimInput(tank = this.player) {
    return getPlayerAimInput(this, tank);
  }

  isControlledTankFirePressed(tank) {
    return isControlledTankFirePressed(this, tank);
  }

  getObjectiveCells() {
    return getObjectiveCells(this);
  }

  getPrimaryBaseObjective() {
    return getPrimaryBaseObjective(this);
  }

  getCriticalBrickObjectives(referenceTarget = null) {
    return getCriticalBrickObjectives(this, referenceTarget);
  }

  getEnemyApproachObjective(referenceTarget = null) {
    return getEnemyApproachObjective(this, referenceTarget);
  }

  getNearestFriendlyTank(fromX, fromY) {
    return getNearestFriendlyTank(this, fromX, fromY);
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
    return rebuildEnemyNavigationField(this);
  }

  getEnemyTraversalCost(col, row) {
    return getEnemyTraversalCost(this, col, row);
  }

  getEnemyNavigationCostAt(col, row) {
    return getEnemyNavigationCostAt(this, col, row);
  }

  countOpenNeighbourCells(col, row) {
    return countOpenNeighbourCells(this, col, row);
  }

  getEnemyNavigationVector(enemy, objective) {
    return getEnemyNavigationVector(this, enemy, objective);
  }

  clearEnemyNavigationStuckState(enemy) {
    return clearEnemyNavigationStuckState(this, enemy);
  }

  createOrRefreshDebugOverlay() {
    return createOrRefreshDebugOverlay(this);
  }

  refreshDebugOverlay() {
    return refreshDebugOverlay(this);
  }

  getEnemyBehaviorPresetBaseValues(rawValue) {
    return getEnemyBehaviorPresetBaseValues(this, rawValue);
  }

  applyEnemyBehaviorPresetToSettings(rawValue) {
    return applyEnemyBehaviorPresetToSettings(this, rawValue);
  }

  getEnemyBehaviorPresetName(rawValue) {
    return getEnemyBehaviorPresetName(this, rawValue);
  }

  getEnemyBehaviorTuning() {
    return getEnemyBehaviorTuning(this);
  }

  getEnemyRushTarget(enemy, tuning) {
    return getEnemyRushTarget(this, enemy, tuning);
  }

  getEnemyShotAngle(enemy, targetAngle = enemy?.turretAngleRad ?? 0) {
    return getEnemyShotAngle(this, enemy, targetAngle);
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
    return ensureEnemyRouteStats(this, enemy);
  }

  noteEnemyRouteMetric(kind, amount = 1) {
    return noteEnemyRouteMetric(this, kind, amount);
  }

  noteEnemySpawnUsage(spawnIndex) {
    return noteEnemySpawnUsage(this, spawnIndex);
  }

  getEnemyBlockedCause(enemy) {
    return getEnemyBlockedCause(this, enemy);
  }

  chooseEnemyObjective(enemy, tuning, forceNew = false) {
    return chooseEnemyObjective(this, enemy, tuning, forceNew);
  }

  buildEnemyNavigationFieldForTargets(targetCells) {
    return buildEnemyNavigationFieldForTargets(this, targetCells);
  }

  getEnemyNavigationFieldForObjective(objective) {
    return getEnemyNavigationFieldForObjective(this, objective);
  }

  updateEnemyRouteSelfEvaluation(enemy, distanceToObjective, delta, tuning) {
    return updateEnemyRouteSelfEvaluation(this, enemy, distanceToObjective, delta, tuning);
  }

  ensureEnemyDebugHudText() {
    return ensureEnemyDebugHudText(this);
  }

  updateEnemyDebugHud() {
    return updateEnemyDebugHud(this);
  }

  getEnemySteeringPlan(enemy) {
    return getEnemySteeringPlan(this, enemy);
  }

  getEnemyObjectiveShot(enemy) {
    return getEnemyObjectiveShot(this, enemy);
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
    return getEnemyUnstuckDirection(this, enemy, preferredSteering, localRandom);
  }

  /**
   * Actualiza la IA 360° de un enemigo.
   *
   * Combina: presión a la base, interés por el jugador, rodeo lateral, algo de
   * wander y un steering suavizado para evitar el temblequeo de ángulo.
   */
  updateEnemy(enemy, delta) {
    return updateEnemy(this, enemy, delta);
  }

  tryMoveTank(tank, moveX, moveY) {
    return tryMoveTank(this, tank, moveX, moveY);
  }

  /**
   * Devuelve si un tanque puede ocupar una posición del mundo sin salirse del
   * tablero, atravesar obstáculos o solaparse con otros tanques.
   */
  canOccupyWorldPosition(x, y, movingTank) {
    return canOccupyWorldPosition(this, x, y, movingTank);
  }

  shouldTanksCollide(tankA, tankB) {
    return shouldTanksCollide(this, tankA, tankB);
  }

  /**
   * Separa suavemente tanques que hayan quedado demasiado cerca por acumulación
   * de movimiento durante el frame. No destruye tanques ni los teletransporta:
   * sólo empuja lo justo para que recuperen separación física.
   */
  resolveTankOverlaps() {
    return resolveTankOverlaps(this);
  }

  worldToCell(x, y) {
    return worldToCell(this, x, y);
  }

  canTankFire(tank) {
    return canTankFire(this, tank);
  }

  fireBullet(tank, angleRad = tank?.turretAngleRad) {
    return fireBullet(this, tank, angleRad);
  }

  spawnTankHitExplosion(x, y) {
    return spawnTankHitExplosion(this, x, y);
  }

  removeBulletByIndex(index) {
    return removeBulletByIndex(this, index);
  }

  updateBullets(delta) {
    return updateBullets(this, delta);
  }

  isBulletNearTank(x, y, tank, bulletHitRadius = 0) {
    return isBulletNearTank(x, y, tank, bulletHitRadius);
  }

  redrawObstacles() {
    return redrawObstacles(this);
  }

  updateLivesText() {
    return updateLivesText(this);
  }

  destroyPlayerTankVisuals(playerTank) {
    return destroyPlayerTankVisuals(this, playerTank);
  }

  handlePlayerHit(playerTank = this.player) {
    return handlePlayerHit(this, playerTank);
  }

  schedulePlayerRespawn(slot = 1, delay) {
    return schedulePlayerRespawn(this, slot, delay);
  }

  tryRespawnPlayer(slot = 1) {
    return tryRespawnPlayer(this, slot);
  }

  updateWaveText() {
    syncSceneStatsToMatchState(this);
    return renderWaveText(this);
  }

  checkLevelComplete() {
    if (this.currentGameMode === "survival") return;
    if (this.isTransitioning) return;
    if (this.isBossBattle) return;
    if (this.enemies.length > 0) return;
    if (this.spawnedEnemiesCount < this.totalEnemiesForLevel) return;

    this.isTransitioning = true;
    syncSceneStatusToMatchState(this);

    if (this.currentLevelIndex >= LEVELS.length - 1) {
      this.showMessage("Nivel 5 completado\nEntrando boss...");
      this.time.delayedCall(1200, () => {
        this.isTransitioning = false;
        syncSceneStatusToMatchState(this);
        this.startBossBattle();
      });
      return;
    }

    this.showMessage(`Nivel ${this.currentLevelIndex + 1} completado`);

    this.time.delayedCall(1300, () => {
      this.currentLevelIndex += 1;
      this.isTransitioning = false;
      syncSceneStatusToMatchState(this);
      syncSceneStatsToMatchState(this);
      this.loadLevel(this.currentLevelIndex);
    });
  }

  showMessage(text) {
    return showHudMessage(this, text);
  }
}
