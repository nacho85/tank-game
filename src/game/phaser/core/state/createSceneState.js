import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  GRID_WIDTH,
  HUD_GUTTER,
} from "../../shared/constants.js";
import { createMatchState } from "./matchState.js";

export function createSceneState(scene, width, height) {
  const boardOriginX = Math.floor((width - BOARD_WIDTH) / 2);
  const boardOriginY = Math.floor((height - BOARD_HEIGHT) / 2);

  scene.boardOriginX = boardOriginX;
  scene.boardOriginY = boardOriginY;

  scene.currentLevelIndex = 0;
  scene.currentGameMode = scene.getCurrentGameMode();
  scene.survivalWaveIndex = 1;
  scene.survivalKillsForNextFortressRegen = 0;
  scene.isTransitioning = false;
  scene.isGameOver = false;
  scene.isPlayerRespawning = false;
  scene.playerLivesRemaining = scene.getConfiguredStartingLives();
  scene.playerTwoLivesRemaining = scene.getConfiguredStartingLives();
  scene.playerTwoJoined = false;
  scene.playerRespawnEvents = { 1: null, 2: null };
  scene.bullets = [];
  scene.powerUps = [];
  scene.activePowerEffects = {};
  scene.wasPlayerFireDown = false;
  scene.wasPlayerTwoFireDown = false;
  scene.localJoinPromptBlinkTick = -1;
  scene.wasPadStartPressed = {};
  scene.pendingEnemySpawnEvents = [];
  scene.enemies = [];
  scene.nextEnemySpawnIndex = 0;
  scene.boss = null;
  scene.isBossBattle = false;
  scene.matchState = createMatchState(scene.currentGameMode);

  scene.onlineState = {
    connectionState: "idle",
    latestSnapshot: null,
    localPlayerId: null,
    localRoleLabel: null,
    remoteTanksById: {},
    snapshot: null,
  };
  scene.onlineClient = null;

  scene.spawnPoints = [
    { col: 1, row: 1 },
    { col: Math.floor((GRID_WIDTH - 1) / 2), row: 1 },
    { col: GRID_WIDTH - 2, row: 1 },
  ];
}
