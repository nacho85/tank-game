import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  GRID_WIDTH,
  HUD_GUTTER,
  HUD_SIDEBAR_WIDTH,
} from "../../shared/constants";
import { createMatchState } from "./matchState";

export function createSceneState(scene, width, height) {
  const boardOriginX = Math.max(
    HUD_SIDEBAR_WIDTH + HUD_GUTTER,
    width - BOARD_WIDTH - HUD_GUTTER
  );
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
  scene.wasPlayerFireDown = false;
  scene.wasPlayerTwoFireDown = false;
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
