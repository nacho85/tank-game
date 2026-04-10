import {
  EAGLE_COL,
  EAGLE_ROW,
  TILE,
} from "../shared/constants.js";
import {
  applyBaseFortressToFineLevel,
  clearFineRect,
  createProceduralSurvivalLevel,
} from "../shared/levelGeneration.js";
import { applyPlayerUpgrade } from "../factories/playerFactory.js";
import { clearEntityCollections, syncSceneStatsToMatchState } from "../core/state/matchState.js";
import { SPAWN_SHIELD_DURATION_MS, applyShield, initPowerUpState, cleanupPowerUps } from "../systems/powerUpSystem.js";
import { showSurvivalWaveBanner } from "../ui/hudRenderer.js";

function rebuildSurvivalWaveActors(scene) {
  const friendlyStates = [
    scene.player ? { slot: 1, starCount: Math.max(0, Math.round(Number(scene.player.starCount || 0))) } : null,
    scene.playerTwo ? { slot: 2, starCount: Math.max(0, Math.round(Number(scene.playerTwo.starCount || 0))) } : null,
  ].filter(Boolean);

  Object.values(scene.playerRespawnEvents || {}).forEach((event) => event?.remove?.(false));
  scene.playerRespawnEvents = { 1: null, 2: null };
  (scene.pendingEnemySpawnEvents || []).forEach((event) => event?.remove?.(false));
  scene.pendingEnemySpawnEvents = [];

  scene.getFriendlyTanks().forEach((tank) => scene.destroyPlayerTankVisuals(tank));
  scene.enemies.forEach((enemy) => enemy?.container?.destroy?.());
  scene.enemies = [];
  scene.boss = null;
  scene.isBossBattle = false;
  clearEntityCollections(scene);

  friendlyStates.forEach(({ slot, starCount }) => {
    const tank = scene.createPlayerTankForSlot(slot);
    if (starCount > 0) {
      applyPlayerUpgrade(scene, tank, starCount);
    }
    applyShield(scene, tank, SPAWN_SHIELD_DURATION_MS, { flickerOnExpire: false });
  });

  scene.nextEnemySpawnIndex = 0;
  scene.fillEnemyWaveSlots();
}

export function loadSurvivalMode(scene) {
  scene.clearLevelVisuals();
  scene.level = createProceduralSurvivalLevel(scene.settings);
  scene.totalEnemiesForLevel = Number.POSITIVE_INFINITY;
  scene.maxConcurrentEnemies = Math.max(
    2,
    Math.round(scene.settings?.survivalMaxConcurrentEnemies || 4)
  );
  scene.spawnedEnemiesCount = 0;
  scene.destroyedEnemiesCount = 0;
  scene.levelText.setText("Modo Survival");
  scene.drawBoard();

  // Inicializar sistema de power-ups
  initPowerUpState(scene);

  if (scene.playerLivesRemaining > 0) {
    scene.createPlayer();
    applyShield(scene, scene.player, SPAWN_SHIELD_DURATION_MS, { flickerOnExpire: false });
  }

  scene.fillEnemyWaveSlots();
  scene.updateWaveText();
  scene.updateLivesText();
  scene.updateCoopText();
  showSurvivalWaveBanner(scene, scene.survivalWaveIndex, 2000);
}

export function reshuffleSurvivalMap(scene) {
  if (scene.currentGameMode !== "survival") return;

  scene.survivalWaveIndex = Math.max(1, Math.round(Number(scene.survivalWaveIndex || 1))) + 1;

  const newLevel = createProceduralSurvivalLevel(scene.settings);
  [1, 2].forEach((slot) => {
    const spawn = scene.getPlayerSpawnForSlot(slot);
    clearFineRect(newLevel, spawn.col - 1, spawn.row - 1, 4, 4);
  });
  applyBaseFortressToFineLevel(newLevel, TILE.BRICK);

  scene.level = newLevel;
  scene.destroyAllBullets();
  // Limpiar power-ups del mapa anterior y reiniciar efectos temporales
  cleanupPowerUps(scene);
  initPowerUpState(scene);
  scene.drawBoard();
  rebuildSurvivalWaveActors(scene);
  syncSceneStatsToMatchState(scene);
  scene.updateWaveText();
  scene.showMessage("Mapa remezclado");
  showSurvivalWaveBanner(scene, scene.survivalWaveIndex, 2000);
}

export function destroyAllBullets(scene) {
  const bullets = Array.isArray(scene.bullets) ? scene.bullets : [];
  bullets.forEach((bullet) => {
    bullet.isAlive = false;
    bullet.alive = false;
    bullet.sprite?.destroy();
  });

  [...scene.getFriendlyTanks(), ...scene.enemies]
    .filter(Boolean)
    .forEach((tank) => {
      tank.activeBullets = [];
      tank.fireLatch = false;
    });

  scene.bullets = [];
}

export function rebuildBaseFortress(scene) {
  if (!scene.level?.obstacles?.[EAGLE_ROW]?.[EAGLE_COL]) {
    return;
  }
  applyBaseFortressToFineLevel(scene.level, TILE.BRICK);
  scene.redrawObstacles();
}
