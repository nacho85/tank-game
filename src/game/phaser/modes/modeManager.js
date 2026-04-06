import { resetMatchState, syncSceneStatusToMatchState } from "../core/state/matchState";

export function getCurrentGameMode(scene) {
  const rawMode = Math.round(scene.settings?.gameMode || 0);
  if (rawMode === 1) return "survival";
  if (rawMode === 2) return "online_2v2";
  return "classic";
}

export function getConfiguredStartingLives(scene) {
  if (getCurrentGameMode(scene) === "survival") {
    return Math.max(1, Math.round(scene.settings?.survivalInitialLives || 3));
  }
  return Math.max(1, Math.round(scene.settings?.playerLives || 3));
}

export function loadSelectedGameMode(scene) {
  scene.teardownOnlineMode?.();
  scene.currentGameMode = getCurrentGameMode(scene);
  scene.currentLevelIndex = 0;
  scene.isTransitioning = false;
  scene.isGameOver = false;
  scene.survivalWaveIndex = 1;
  scene.survivalKillsForNextFortressRegen = 0;
  scene.playerLivesRemaining = getConfiguredStartingLives(scene);
  scene.playerTwoLivesRemaining = getConfiguredStartingLives(scene);
  scene.playerTwoJoined = false;
  scene.wasPlayerFireDown = false;
  scene.wasPlayerTwoFireDown = false;

  resetMatchState(scene, scene.currentGameMode);
  syncSceneStatusToMatchState(scene);

  if (scene.currentGameMode === "survival") {
    scene.loadSurvivalMode();
    return;
  }

  if (scene.currentGameMode === "online_2v2") {
    scene.loadOnlineMode();
    return;
  }

  scene.loadLevel(0);
}
