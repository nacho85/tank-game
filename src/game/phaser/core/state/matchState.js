export function createMatchState(mode = "classic") {
  return {
    tanksById: {},
    bulletsById: {},
    enemiesById: {},
    basesById: {},
    playersById: {},
    references: {
      playerTankId: null,
      playerTwoTankId: null,
      bossEnemyId: null,
    },
    status: {
      mode,
      isTransitioning: false,
      isGameOver: false,
      isBossBattle: false,
    },
    stats: {
      destroyedEnemiesCount: 0,
      spawnedEnemiesCount: 0,
      totalEnemiesForLevel: 0,
      score: 0,
      currentLevelIndex: 0,
      survivalWaveIndex: 1,
    },
  };
}

export function resetMatchState(scene, mode = scene.currentGameMode || "classic") {
  scene.matchState = createMatchState(mode);
  syncSceneStatusToMatchState(scene);
  syncSceneStatsToMatchState(scene);
  return scene.matchState;
}

export function syncSceneStatusToMatchState(scene) {
  if (!scene.matchState?.status) return;
  scene.matchState.status.mode = scene.currentGameMode;
  scene.matchState.status.isTransitioning = !!scene.isTransitioning;
  scene.matchState.status.isGameOver = !!scene.isGameOver;
  scene.matchState.status.isBossBattle = !!scene.isBossBattle;
}

export function syncSceneStatsToMatchState(scene) {
  if (!scene.matchState?.stats) return;
  scene.matchState.stats.destroyedEnemiesCount = Number(scene.destroyedEnemiesCount || 0);
  scene.matchState.stats.spawnedEnemiesCount = Number(scene.spawnedEnemiesCount || 0);
  scene.matchState.stats.totalEnemiesForLevel = Number(scene.totalEnemiesForLevel || 0);
  scene.matchState.stats.score = Number(scene.score || 0);
  scene.matchState.stats.currentLevelIndex = Number(scene.currentLevelIndex || 0);
  scene.matchState.stats.survivalWaveIndex = Number(scene.survivalWaveIndex || 1);
}

export function registerTank(scene, tank, playerMeta = null) {
  if (!tank?.id) return tank;
  scene.matchState.tanksById[tank.id] = tank;
  if (playerMeta) {
    scene.matchState.playersById[tank.id] = playerMeta;
  }
  if (tank.controlSlot === 2) {
    scene.matchState.references.playerTwoTankId = tank.id;
  } else if (tank.controlSlot === 1 || tank.type === "player") {
    scene.matchState.references.playerTankId = tank.id;
  }
  return tank;
}

export function unregisterTank(scene, tankOrId) {
  const tankId = typeof tankOrId === "string" ? tankOrId : tankOrId?.id;
  if (!tankId) return;
  delete scene.matchState.tanksById[tankId];
  delete scene.matchState.playersById[tankId];
  if (scene.matchState.references.playerTankId === tankId) {
    scene.matchState.references.playerTankId = null;
  }
  if (scene.matchState.references.playerTwoTankId === tankId) {
    scene.matchState.references.playerTwoTankId = null;
  }
}

export function registerEnemy(scene, enemy) {
  if (!enemy?.id) return enemy;
  scene.matchState.enemiesById[enemy.id] = enemy;
  if (enemy.isBoss) {
    scene.matchState.references.bossEnemyId = enemy.id;
  }
  return enemy;
}

export function unregisterEnemy(scene, enemyOrId) {
  const enemyId = typeof enemyOrId === "string" ? enemyOrId : enemyOrId?.id;
  if (!enemyId) return;
  delete scene.matchState.enemiesById[enemyId];
  if (scene.matchState.references.bossEnemyId === enemyId) {
    scene.matchState.references.bossEnemyId = null;
  }
}

export function registerBullet(scene, bullet) {
  if (!bullet?.id) return bullet;
  scene.matchState.bulletsById[bullet.id] = bullet;
  return bullet;
}

export function unregisterBullet(scene, bulletOrId) {
  const bulletId = typeof bulletOrId === "string" ? bulletOrId : bulletOrId?.id;
  if (!bulletId) return;
  delete scene.matchState.bulletsById[bulletId];
}

export function clearEntityCollections(scene) {
  if (!scene.matchState) return;
  scene.matchState.tanksById = {};
  scene.matchState.bulletsById = {};
  scene.matchState.enemiesById = {};
  scene.matchState.basesById = {};
  scene.matchState.playersById = {};
  scene.matchState.references = {
    playerTankId: null,
    playerTwoTankId: null,
    bossEnemyId: null,
  };
}
