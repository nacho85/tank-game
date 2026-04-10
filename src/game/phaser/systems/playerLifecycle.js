import { PLAYER_RESPAWN_DELAY } from "../shared/constants";
import { bigCellCenterX, bigCellCenterY } from "../shared/levelGeneration";
import { syncSceneStatusToMatchState, unregisterTank } from "../core/state/matchState";
import { refreshLocalTopHud, showGameOverBanner } from "../ui/hudRenderer";
import { SPAWN_SHIELD_DURATION_MS, applyShield } from "./powerUpSystem";

export function updateLivesText(scene) {
  if (!scene.livesText) return;
  const total = scene.getConfiguredStartingLives();
  const remainingP1 = Math.max(0, scene.playerLivesRemaining || 0);
  const remainingP2 = Math.max(0, scene.playerTwoLivesRemaining || 0);
  const respawnP1 = scene.playerRespawnEvents?.[1] ? " · P1 reapareciendo" : "";
  const respawnP2 = scene.playerRespawnEvents?.[2] ? " · P2 reapareciendo" : "";
  const showP2JoinPrompt =
    (scene.currentGameMode === "survival" || scene.currentGameMode === "classic") &&
    !scene.playerTwo &&
    !scene.playerTwoJoined;
  const p2Label = showP2JoinPrompt
    ? (Math.floor((scene.time?.now || 0) / 1000) % 2 === 0 ? "P2" : "PRESS START")
    : `Vidas P2: ${remainingP2}/${total}${respawnP2}`;
  scene.livesText.setText(`Vidas P1: ${remainingP1}/${total}${respawnP1}\n${p2Label}`);
  if (scene.currentGameMode === "survival") {
    scene.updateWaveText?.();
  } else {
    refreshLocalTopHud(scene);
  }
}

export function destroyPlayerTankVisuals(scene, playerTank) {
  if (!playerTank) return;
  playerTank.activeBullets = [];
  playerTank.container?.destroy();
  if (playerTank.id) {
    unregisterTank(scene, playerTank.id);
  }
  if (playerTank.controlSlot === 2) {
    scene.playerTwo = null;
  } else {
    scene.player = null;
  }
}

export function handlePlayerHit(scene, playerTank = scene.player) {
  if (!playerTank || scene.isGameOver || scene.isTransitioning) return;
  const slot = playerTank.controlSlot || 1;
  if (scene.playerRespawnEvents?.[slot]) return;

  scene.noteCombatDeath(playerTank.type);
  scene.spawnTankHitExplosion(playerTank.x, playerTank.y);
  if (slot === 2) {
    scene.playerTwoLivesRemaining = Math.max(0, scene.playerTwoLivesRemaining - 1);
  } else {
    scene.playerLivesRemaining = Math.max(0, scene.playerLivesRemaining - 1);
  }
  scene.destroyPlayerTankVisuals(playerTank);

  const remainingLives = slot === 2 ? scene.playerTwoLivesRemaining : scene.playerLivesRemaining;

  if (remainingLives <= 0) {
    scene.updateLivesText();
    scene.updateCoopText();
    if (!scene.player && !scene.playerTwo) {
      scene.isGameOver = true;
      syncSceneStatusToMatchState(scene);
      scene.showMessage("Sin vidas\nGame Over");
      showGameOverBanner(scene, scene.destroyedEnemiesCount || 0, 1300);
      scene.saveSettings();
      scene.saveCombatStats();
      scene.time.delayedCall(1300, () => scene.scene.restart());
    }
    return;
  }

  scene.updateLivesText();
  scene.updateCoopText();
  scene.showMessage(slot === 2 ? "P2 perdió una vida" : "P1 perdió una vida");
  scene.schedulePlayerRespawn(slot);
}

export function schedulePlayerRespawn(scene, slot = 1, delay = PLAYER_RESPAWN_DELAY) {
  if (scene.playerRespawnEvents?.[slot]) {
    scene.playerRespawnEvents[slot].remove(false);
    scene.playerRespawnEvents[slot] = null;
  }

  scene.playerRespawnEvents[slot] = scene.time.delayedCall(delay, () => {
    scene.playerRespawnEvents[slot] = null;
    scene.tryRespawnPlayer(slot);
  });
}

export function tryRespawnPlayer(scene, slot = 1) {
  const livesRemaining = slot === 2 ? scene.playerTwoLivesRemaining : scene.playerLivesRemaining;
  const existingTank = slot === 2 ? scene.playerTwo : scene.player;
  if (scene.isTransitioning || scene.isGameOver || livesRemaining <= 0 || existingTank) {
    return;
  }

  const spawn = scene.getPlayerSpawnForSlot(slot);
  const spawnX = bigCellCenterX(spawn.col, scene.boardOriginX);
  const spawnY = bigCellCenterY(spawn.row, scene.boardOriginY);

  if (!scene.canOccupyWorldPosition(spawnX, spawnY, null)) {
    scene.schedulePlayerRespawn(slot, 500);
    return;
  }

  const tank = scene.createPlayerTankForSlot(slot);
  if (tank) {
    applyShield(scene, tank, SPAWN_SHIELD_DURATION_MS, { flickerOnExpire: false });
  }
  scene.updateLivesText();
  scene.updateCoopText();
  scene.showMessage(slot === 2 ? "P2 reapareció" : "P1 reapareció");
}
