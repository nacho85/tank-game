import { LEVELS } from "../core/levels";
import { LEVEL_WAVE_CONFIGS } from "../shared/constants";
import { cloneMatrix } from "../shared/levelGeneration";

export function loadLevel(scene, levelIndex) {
  scene.clearLevelVisuals();
  scene.enemyAiMetrics = {
    stuckEvents: 0,
    repaths: 0,
    recoveries: 0,
    samples: 0,
    longStucks: 0,
  };

  const level = LEVELS[levelIndex];
  const waveConfig =
    LEVEL_WAVE_CONFIGS[levelIndex] ||
    LEVEL_WAVE_CONFIGS[LEVEL_WAVE_CONFIGS.length - 1];

  scene.level = {
    floor: cloneMatrix(level.floor),
    overlay: cloneMatrix(level.overlay),
    obstacles: cloneMatrix(level.obstacles),
  };

  scene.totalEnemiesForLevel = waveConfig.totalEnemies;
  scene.maxConcurrentEnemies = waveConfig.maxConcurrent;
  scene.spawnedEnemiesCount = 0;
  scene.destroyedEnemiesCount = 0;

  scene.levelText.setText(`Modo Clásico · Nivel ${levelIndex + 1}`);

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
