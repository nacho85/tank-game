import { getClassicModeConfig } from "../core/levels.js";
import { applyPlayerUpgrade } from "../factories/playerFactory.js";
import { LEVEL_WAVE_CONFIGS } from "../shared/constants.js";
import { cloneMatrix } from "../shared/levelGeneration.js";
import { SPAWN_SHIELD_DURATION_MS, applyShield } from "../systems/powerUpSystem.js";

export function loadLevel(scene, levelIndex) {
  const friendlyStates = [
    scene.player ? { slot: 1, starCount: Math.max(0, Math.round(Number(scene.player.starCount || 0))) } : null,
    scene.playerTwo ? { slot: 2, starCount: Math.max(0, Math.round(Number(scene.playerTwo.starCount || 0))) } : null,
  ].filter(Boolean);

  scene.clearLevelVisuals();
  scene.enemyAiMetrics = {
    stuckEvents: 0,
    repaths: 0,
    recoveries: 0,
    samples: 0,
    longStucks: 0,
  };

  const modeConfig = getClassicModeConfig(scene.settings?.classicVariant);
  const levels = modeConfig.levels;
  const level = levels[levelIndex] || levels[0];
  const waveConfig =
    modeConfig.waveConfigs?.[levelIndex] ||
    LEVEL_WAVE_CONFIGS[levelIndex] ||
    LEVEL_WAVE_CONFIGS[LEVEL_WAVE_CONFIGS.length - 1];

  scene.classicModeConfig = modeConfig;
  scene.classicLevels = levels;

  scene.level = {
    floor: cloneMatrix(level.floor),
    overlay: cloneMatrix(level.overlay),
    obstacles: cloneMatrix(level.obstacles),
  };

  scene.totalEnemiesForLevel = waveConfig.totalEnemies;
  scene.maxConcurrentEnemies = waveConfig.maxConcurrent;
  scene.spawnedEnemiesCount = 0;
  scene.destroyedEnemiesCount = 0;

  scene.levelText.setText(`${modeConfig.label} · Nivel ${levelIndex + 1}`);

  scene.drawBoard();
  const p1State = friendlyStates.find((state) => state.slot === 1) || null;
  if (scene.playerLivesRemaining > 0) {
    const player = scene.createPlayer();
    if (p1State?.starCount > 0) {
      applyPlayerUpgrade(scene, player, p1State.starCount);
    }
    applyShield(scene, player, SPAWN_SHIELD_DURATION_MS, { flickerOnExpire: false });
  }
  const p2State = friendlyStates.find((state) => state.slot === 2) || null;
  if (p2State && scene.playerTwoLivesRemaining > 0) {
    const playerTwo = scene.createPlayerTwo();
    if (p2State.starCount > 0) {
      applyPlayerUpgrade(scene, playerTwo, p2State.starCount);
    }
    applyShield(scene, playerTwo, SPAWN_SHIELD_DURATION_MS, { flickerOnExpire: false });
  }
  scene.fillEnemyWaveSlots();
  scene.updateWaveText();
  scene.updateLivesText();
  scene.updateCoopText();
}
