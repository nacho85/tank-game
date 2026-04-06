import {
  EAGLE_COL,
  EAGLE_ROW,
  TILE,
} from "../shared/constants";
import {
  applyBaseFortressToFineLevel,
  clearFineRect,
  createProceduralSurvivalLevel,
  worldToGridCol,
  worldToGridRow,
} from "../shared/levelGeneration";

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
  if (scene.playerLivesRemaining > 0) {
    scene.createPlayer();
  }
  if (scene.isKeyboardControlledSlot(2) && scene.playerTwoLivesRemaining > 0) {
    scene.createPlayerTwo();
  }
  scene.fillEnemyWaveSlots();
  scene.updateWaveText();
  scene.updateLivesText();
  scene.updateCoopText();
}

export function reshuffleSurvivalMap(scene) {
  if (scene.currentGameMode !== "survival") return;

  const reservedWorldPoints = [
    scene.player ? { x: scene.player.x, y: scene.player.y } : null,
    scene.playerTwo ? { x: scene.playerTwo.x, y: scene.playerTwo.y } : null,
    ...scene.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y })),
  ].filter(Boolean);

  const newLevel = createProceduralSurvivalLevel(scene.settings);
  reservedWorldPoints.forEach((point) => {
    const col = worldToGridCol(point.x, scene.boardOriginX);
    const row = worldToGridRow(point.y, scene.boardOriginY);
    clearFineRect(newLevel, col - 1, row - 1, 4, 4);
  });

  scene.level = newLevel;
  scene.destroyAllBullets();
  scene.drawBoard();
  scene.showMessage("Mapa remezclado");
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
