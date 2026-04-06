import { TILE_SIZE } from "../shared/constants";
import { clearEntityCollections, syncSceneStatsToMatchState, syncSceneStatusToMatchState } from "../core/state/matchState";
import { createTankSprite, updateTankVisuals } from "../render/tankRendering";
import { BOARD_HEIGHT, BOARD_WIDTH, ENEMY_BODY_BASE_FACING_DEG, ENEMY_TURRET_BASE_FACING_RAD, PLAYER_BODY_BASE_FACING_DEG, PLAYER_BODY_RING_CENTER, PLAYER_TURRET_BASE_FACING_RAD, PLAYER_TURRET_CAP_CENTER, TANK_RENDER_SIZE } from "../shared/constants";
import { createOnlineSocketClient } from "../online/network/socketClient";
import { createOnline2v2Level, ONLINE_BASE_DEFS, getOnlineBaseWorld } from "./onlineLevel";
import { spawnTankHitExplosion } from "../systems/projectileSystem";

const COLOR_CONFIG = {
  yellow: { bodyKey: "player-body-yellow-v2", turretKey: "player-turret-yellow-v2", tint: null },
  green: { bodyKey: "player-body-green-v2", turretKey: "player-turret-green-v2", tint: null },
  red: { bodyKey: "player-body-yellow-v2", turretKey: "player-turret-yellow-v2", tint: 0xff5c5c },
  blue: { bodyKey: "player-body-yellow-v2", turretKey: "player-turret-yellow-v2", tint: 0x5ca9ff },
};

const TEAM_LABELS = { team1: "Equipo 1 (🟡🟢)", team2: "Equipo 2 (🔴🔵)" };
const TEAM_SHORT = { team1: "Eq.1", team2: "Eq.2" };

function wrapAngleDeg(angle) {
  let result = angle;
  while (result <= -180) result += 360;
  while (result > 180) result -= 360;
  return result;
}

function wrapDegDiff(target, current) {
  return wrapAngleDeg(target - current);
}
function wrapAngleRad(angle) {
  let result = angle;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function destroyRemoteTankVisual(tank) {
  tank?.label?.destroy?.();
  tank?.container?.destroy?.();
}

function destroyRemoteBulletVisual(bullet) {
  bullet?.sprite?.destroy?.();
}

function createRemoteBulletVisual(scene, remoteBullet) {
  const sprite = scene.add
    .image(scene.boardOriginX + remoteBullet.x, scene.boardOriginY + remoteBullet.y, "tank-projectile")
    .setDepth(180)
    .setDisplaySize(remoteBullet.width || 11, remoteBullet.length || 24)
    .setRotation((remoteBullet.angleRad || 0) + Math.PI / 2)
    .setAlpha(0.98)
    .setTint(remoteBullet.tint || 0xfff3a8);
  scene.entityLayer.add(sprite);
  return {
    id: remoteBullet.id,
    sprite,
    x: sprite.x,
    y: sprite.y,
    targetX: sprite.x,
    targetY: sprite.y,
    angleRad: remoteBullet.angleRad || 0,
    targetAngleRad: remoteBullet.angleRad || 0,
  };
}

function destroyOnlineBaseVisual(base) {
  base?.sprite?.destroy?.();
  base?.label?.destroy?.();
}

function ensureOnlineBases(scene) {
  if (scene.onlineState.baseVisualsById) {
    Object.values(scene.onlineState.baseVisualsById).forEach(destroyOnlineBaseVisual);
  }
  scene.onlineState.baseVisualsById = {};
  Object.values(ONLINE_BASE_DEFS).forEach((def) => {
    const world = getOnlineBaseWorld(def.id);
    const label = scene.add.text(
      scene.boardOriginX + world.x,
      scene.boardOriginY + world.y - 52,
      def.label,
      {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      }
    ).setOrigin(0.5).setDepth(200);
    scene.overlayLayer.add(label);
    scene.onlineState.baseVisualsById[def.id] = { id: def.id, label, hp: def.hp };
  });
}

function syncOnlineBaseVisuals(scene, bases = []) {
  bases.forEach((base) => {
    const visual = scene.onlineState.baseVisualsById?.[base.id];
    if (!visual) return;
    visual.hp = base.hp;
    if (visual.label) {
      const hpText = base.hp <= 0 ? "✗" : `HP: ${Math.max(0, base.hp || 0)}`;
      visual.label.setText(`${base.label || visual.id} ${hpText}`);
    }
    if (visual.sprite?.active) {
      visual.sprite.setAlpha(base.hp <= 0 ? 0.35 : 1);
    }
    scene.matchState.basesById[base.id] = { ...base };
  });
}

function createRemoteTankVisual(scene, remoteTank) {
  const colorConfig = COLOR_CONFIG[remoteTank.color] || COLOR_CONFIG.yellow;
  const spriteParts = createTankSprite(
    scene,
    scene.boardOriginX + remoteTank.x,
    scene.boardOriginY + remoteTank.y,
    colorConfig.bodyKey,
    colorConfig.turretKey,
    TANK_RENDER_SIZE,
    colorConfig.bodyKey.startsWith("enemy-") ? ENEMY_BODY_BASE_FACING_DEG : PLAYER_BODY_BASE_FACING_DEG,
    remoteTank.moveAngleDeg ?? -90,
    colorConfig.bodyKey.startsWith("enemy-") ? ENEMY_TURRET_BASE_FACING_RAD : PLAYER_TURRET_BASE_FACING_RAD,
    colorConfig.bodyKey.startsWith("enemy-")
      ? {}
      : {
          bodyMaxFactor: 0.95,
          turretMaxFactor: 1.0,
          turretScaleX: 1.0,
          turretScaleY: 1.0,
          turretOffsetX: 2,
          turretOffsetY: -2,
          bodyAnchorPx: PLAYER_BODY_RING_CENTER,
          turretPivotPx: PLAYER_TURRET_CAP_CENTER,
        }
  );

  if (colorConfig.tint) {
    spriteParts.body.setTint(colorConfig.tint);
    spriteParts.turret.setTint(colorConfig.tint);
  }

  const tank = {
    id: remoteTank.id,
    type: remoteTank.id === scene.onlineState.localPlayerId ? "online-local" : "online-remote",
    ...spriteParts,
    x: scene.boardOriginX + remoteTank.x,
    y: scene.boardOriginY + remoteTank.y,
    targetX: scene.boardOriginX + remoteTank.x,
    targetY: scene.boardOriginY + remoteTank.y,
    moveAngleDeg: remoteTank.moveAngleDeg ?? -90,
    targetMoveAngleDeg: remoteTank.moveAngleDeg ?? -90,
    turretAngleRad: remoteTank.turretAngleRad ?? -Math.PI / 2,
    targetTurretAngleRad: remoteTank.turretAngleRad ?? -Math.PI / 2,
    isDestroyed: false,
  };

  const label = scene.add
    .text(tank.x, tank.y - 44, remoteTank.label || remoteTank.color || remoteTank.id, {
      fontFamily: "Arial",
      fontSize: "16px",
      color: remoteTank.id === scene.onlineState.localPlayerId ? "#ffd166" : "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(200);
  scene.overlayLayer.add(label);
  tank.label = label;

  updateTankVisuals(scene, tank);
  return tank;
}

function buildLocalInput(scene) {
  const move = scene.getPlayerMoveInput({ controlSlot: 1 });
  const aim = scene.getPlayerAimInput({ controlSlot: 1 });
  const fireDown = scene.isControlledTankFirePressed({ type: "player", controlSlot: 1, activeBullets: [], fireLatch: scene.onlineState.localFireLatch, shotCooldown: 0 });
  return {
    moveX: Number(move?.x || 0),
    moveY: Number(move?.y || 0),
    aimX: Number(aim?.x || 0),
    aimY: Number(aim?.y || 0),
    fire: !!fireDown,
  };
}

// ── Round HUD ────────────────────────────────────────────────────────────
function updateRoundHUD(scene, roundState, winnerTeam) {
  if (!roundState) return;
  const { currentRound, totalRounds, scores, matchOver, matchWinner, transitioning, sideSwitched } = roundState;
  const t1 = scores?.team1 ?? 0;
  const t2 = scores?.team2 ?? 0;
  const scoreStr = `${TEAM_SHORT.team1}: ${t1}  -  ${TEAM_SHORT.team2}: ${t2}`;

  // Quién ocupa qué lado esta ronda (para contexto visual)
  const side1 = sideSwitched ? "Este" : "Oeste";
  const side2 = sideSwitched ? "Oeste" : "Este";

  if (matchOver && matchWinner) {
    const winLabel = TEAM_LABELS[matchWinner] || matchWinner;
    scene.levelText.setText(`🏆 ¡${winLabel} ganó el partido!`);
    scene.coopText.setText(`${scoreStr} | Fin del partido`);
  } else if (transitioning && winnerTeam) {
    // winnerTeam aquí es geográfico; el cliente no sabe sideSwitched fácilmente,
    // así que usamos el roundWinnerColorTeam que viene en el snapshot
    const roundWinLabel = TEAM_LABELS[roundState.roundWinnerColorTeam] || winnerTeam;
    scene.levelText.setText(`Ronda ${currentRound}/${totalRounds} | ¡Ganó ${roundWinLabel}!`);
    scene.coopText.setText(scoreStr);
  } else {
    scene.levelText.setText(`Online 2v2 | Ronda ${currentRound}/${totalRounds}`);
    scene.coopText.setText(scoreStr);
  }
}

function spawnOnlineTankExplosion(scene, worldX, worldY) {
  try {
    spawnTankHitExplosion(scene, worldX, worldY);
  } catch (_) {
    // Fallback: simple expanding circle if explosion sprite not available
    const gfx = scene.add.graphics().setDepth(260);
    gfx.fillStyle(0xff6600, 0.9);
    gfx.fillCircle(worldX, worldY, 20);
    scene.entityLayer.add(gfx);
    scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 3,
      scaleY: 3,
      duration: 450,
      ease: "Cubic.Out",
      onComplete: () => gfx.destroy(),
    });
  }
}

function syncSnapshot(scene, snapshot) {
  scene.onlineState.snapshot = snapshot;
  const seenTankIds = new Set();
  const seenBulletIds = new Set();
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const bullets = Array.isArray(snapshot?.bullets) ? snapshot.bullets : [];
  const bases = Array.isArray(snapshot?.bases) ? snapshot.bases : [];
  const floor = snapshot?.floor || null;
  const overlay = snapshot?.overlay || null;
  const obstacles = snapshot?.obstacles || null;
  const roundState = snapshot?.roundState || null;
  const winnerTeam = snapshot?.status?.winnerTeam || null;

  scene.matchState.tanksById = {};
  scene.matchState.bulletsById = {};
  scene.matchState.basesById = {};

  if (floor && overlay && obstacles) {
    scene.level.floor = floor.map((row) => [...row]);
    scene.level.overlay = overlay.map((row) => [...row]);
    scene.level.obstacles = obstacles.map((row) => [...row]);
    scene.redrawObstacles();
    ensureOnlineBases(scene);
  }

  players.forEach((remoteTank) => {
    seenTankIds.add(remoteTank.id);
    let tank = scene.onlineState.remoteTanksById[remoteTank.id];
    if (!tank) {
      tank = createRemoteTankVisual(scene, remoteTank);
      scene.onlineState.remoteTanksById[remoteTank.id] = tank;
    }

    // ── Explosion detection: tank just died ──────────────────────────────
    const prevDestroyed = scene.onlineState.prevDestroyedById[remoteTank.id] ?? false;
    if (!prevDestroyed && remoteTank.isDestroyed) {
      const ex = scene.boardOriginX + remoteTank.x;
      const ey = scene.boardOriginY + remoteTank.y;
      spawnOnlineTankExplosion(scene, ex, ey);
    }
    scene.onlineState.prevDestroyedById[remoteTank.id] = remoteTank.isDestroyed;

    tank.isDestroyed = remoteTank.isDestroyed;
    const visible = !remoteTank.isDestroyed;
    tank.container?.setVisible?.(visible);
    tank.label?.setVisible?.(visible);

    const targetX = scene.boardOriginX + remoteTank.x;
    const targetY = scene.boardOriginY + remoteTank.y;
    tank.targetX = targetX;
    tank.targetY = targetY;
    tank.targetMoveAngleDeg = remoteTank.moveAngleDeg ?? tank.targetMoveAngleDeg;
    tank.targetTurretAngleRad = remoteTank.turretAngleRad ?? tank.targetTurretAngleRad;
    if (tank.label) {
      tank.label.setText(remoteTank.label || remoteTank.color || remoteTank.id);
    }
    scene.matchState.tanksById[remoteTank.id] = { ...remoteTank };
  });

  bullets.forEach((remoteBullet) => {
    seenBulletIds.add(remoteBullet.id);
    let bullet = scene.onlineState.remoteBulletsById[remoteBullet.id];
    if (!bullet) {
      bullet = createRemoteBulletVisual(scene, remoteBullet);
      scene.onlineState.remoteBulletsById[remoteBullet.id] = bullet;
    }
    const targetX = scene.boardOriginX + remoteBullet.x;
    const targetY = scene.boardOriginY + remoteBullet.y;
    bullet.targetX = targetX;
    bullet.targetY = targetY;
    bullet.targetAngleRad = remoteBullet.angleRad || bullet.targetAngleRad || 0;
    if (!bullet.sprite.active) return;
    scene.matchState.bulletsById[remoteBullet.id] = { ...remoteBullet };
  });

  Object.entries(scene.onlineState.remoteTanksById).forEach(([id, tank]) => {
    if (seenTankIds.has(id)) return;
    destroyRemoteTankVisual(tank);
    delete scene.onlineState.remoteTanksById[id];
    delete scene.onlineState.prevDestroyedById[id];
  });

  Object.entries(scene.onlineState.remoteBulletsById).forEach(([id, bullet]) => {
    if (seenBulletIds.has(id)) return;
    destroyRemoteBulletVisual(bullet);
    delete scene.onlineState.remoteBulletsById[id];
  });

  syncOnlineBaseVisuals(scene, bases);

  // ── Round state HUD + notifications ────────────────────────────────────
  if (roundState) {
    updateRoundHUD(scene, roundState, winnerTeam);

    // Detect round change → show message
    const prevRound = scene.onlineState.lastKnownRound ?? 1;
    if (roundState.currentRound !== prevRound && roundState.currentRound > 1) {
      const sideMsg = roundState.sideSwitched && roundState.currentRound === 4
        ? " | ¡Cambio de lado!"
        : "";
      scene.showMessage(`Ronda ${roundState.currentRound}/${roundState.totalRounds}${sideMsg}`);
    }
    scene.onlineState.lastKnownRound = roundState.currentRound;

    // Detect match over
    if (roundState.matchOver && !scene.onlineState.matchOverShown) {
      const winLabel = TEAM_LABELS[roundState.matchWinner] || roundState.matchWinner || "?";
      scene.showMessage(`🏆 ¡${winLabel} ganó el partido!`);
      scene.onlineState.matchOverShown = true;
    }
  }

  syncSceneStatsToMatchState(scene);
}

export function teardownOnlineMode(scene) {
  scene.onlineClient?.disconnect?.();
  scene.onlineClient = null;
  Object.values(scene.onlineState?.remoteTanksById || {}).forEach(destroyRemoteTankVisual);
  Object.values(scene.onlineState?.remoteBulletsById || {}).forEach(destroyRemoteBulletVisual);
  scene.onlineState = {
    connectionState: "idle",
    latestSnapshot: null,
    localPlayerId: null,
    localRoleLabel: null,
    remoteTanksById: {},
    remoteBulletsById: {},
    snapshot: null,
    fireHeld: false,
    localFireLatch: false,
    lastFireSentAt: 0,
    baseVisualsById: {},
    prevDestroyedById: {},
    lastKnownRound: 1,
    matchOverShown: false,
  };
  Object.values(scene.onlineState?.baseVisualsById || {}).forEach(destroyOnlineBaseVisual);
  clearEntityCollections(scene);
}

export function loadOnlineMode(scene) {
  scene.clearLevelVisuals();
  teardownOnlineMode(scene);

  const onlineMapAlgorithm = Number(scene.settings?.survivalMapAlgorithm ?? 0);
  scene.level = createOnline2v2Level({ mapAlgorithm: onlineMapAlgorithm });
  scene.totalEnemiesForLevel = 0;
  scene.maxConcurrentEnemies = 0;
  scene.spawnedEnemiesCount = 0;
  scene.destroyedEnemiesCount = 0;
  scene.playerLivesRemaining = 0;
  scene.playerTwoLivesRemaining = 0;
  scene.levelText.setText("Online 2v2 | Ronda 1/6");
  scene.coopText.setText("Conectando...");
  scene.drawBoard();
  ensureOnlineBases(scene);
  scene.updateWaveText();
  scene.updateLivesText();

  scene.onlineState.connectionState = "conectando";
  scene.onlineClient = createOnlineSocketClient({
    mapAlgorithm: onlineMapAlgorithm,
    onConnectionStateChange: (state) => {
      scene.onlineState.connectionState = state;
      scene.updateWaveText();
      if (state === "desconectado") {
        scene.coopText.setText("Online: conexión cerrada");
      }
    },
    onWelcome: (payload) => {
      scene.onlineState.localPlayerId = payload.playerId || null;
      scene.onlineState.localRoleLabel = payload.roleLabel || null;
      const rs = payload.roundState;
      if (rs) {
        scene.levelText.setText(`Online 2v2 | Ronda ${rs.currentRound}/${rs.totalRounds}`);
        scene.coopText.setText(`${TEAM_SHORT.team1}: ${rs.scores?.team1 ?? 0}  -  ${TEAM_SHORT.team2}: ${rs.scores?.team2 ?? 0}`);
      } else {
        scene.coopText.setText(`Online: ${payload.roleLabel || "conectado"}`);
      }
      syncSceneStatusToMatchState(scene);
    },
    onSnapshot: (snapshot) => {
      scene.onlineState.latestSnapshot = snapshot;
    },
    onError: () => {
      scene.showMessage("No se pudo conectar al server online");
    },
  });
  scene.onlineClient.connect();
  scene.showMessage("Conectando al modo online...");
}

function smoothRemoteState(scene, delta) {
  const positionLerp = Math.min(1, delta / 85);
  const turretLerp = Math.min(1, delta / 110);
  const bodyLerp = Math.min(1, delta / 110);
  const localPositionLerp = Math.min(1, delta / 55);
  const localRotationLerp = Math.min(1, delta / 75);
  const labelOffset = 44;

  Object.values(scene.onlineState.remoteTanksById || {}).forEach((tank) => {
    const isLocal = tank.id === scene.onlineState.localPlayerId;
    const posBlend = isLocal ? localPositionLerp : positionLerp;
    const rotBlend = isLocal ? localRotationLerp : bodyLerp;
    const turretBlend = isLocal ? localRotationLerp : turretLerp;
    tank.x += (tank.targetX - tank.x) * posBlend;
    tank.y += (tank.targetY - tank.y) * posBlend;
    tank.moveAngleDeg = wrapAngleDeg(tank.moveAngleDeg + wrapDegDiff(tank.targetMoveAngleDeg, tank.moveAngleDeg) * rotBlend);
    const turretDiff = wrapAngleRad(tank.targetTurretAngleRad - tank.turretAngleRad);
    tank.turretAngleRad = wrapAngleRad(tank.turretAngleRad + turretDiff * turretBlend);
    if (tank.label) {
      tank.label.x += (tank.x - tank.label.x) * posBlend;
      tank.label.y += ((tank.y - labelOffset) - tank.label.y) * posBlend;
    }
    // Keep visibility synced with isDestroyed state
    const visible = !tank.isDestroyed;
    tank.container?.setVisible?.(visible);
    tank.label?.setVisible?.(visible);
    if (visible) {
      updateTankVisuals(scene, tank);
    }
  });

  Object.values(scene.onlineState.remoteBulletsById || {}).forEach((bullet) => {
    bullet.x += (bullet.targetX - bullet.x) * Math.min(1, delta / 65);
    bullet.y += (bullet.targetY - bullet.y) * Math.min(1, delta / 65);
    const angleDiff = wrapAngleRad(bullet.targetAngleRad - bullet.angleRad);
    bullet.angleRad = wrapAngleRad(bullet.angleRad + angleDiff * Math.min(1, delta / 85));
    if (bullet.sprite?.active) {
      bullet.sprite.x = bullet.x;
      bullet.sprite.y = bullet.y;
      bullet.sprite.rotation = bullet.angleRad + Math.PI / 2;
    }
  });
}

export function updateOnlineMode(scene, delta) {
  const snapshot = scene.onlineClient?.consumeLatestSnapshot?.();
  if (snapshot) {
    syncSnapshot(scene, snapshot);
    scene.updateWaveText();
  }

  smoothRemoteState(scene, delta);

  const rs = scene.onlineState.snapshot?.roundState;
  const isTransitioning = rs?.transitioning || rs?.matchOver;

  if (scene.onlineClient?.isConnected?.() && !isTransitioning) {
    const input = buildLocalInput(scene);
    scene.onlineClient.sendInput({
      moveX: input.moveX,
      moveY: input.moveY,
      aimX: input.aimX,
      aimY: input.aimY,
      fire: false,
    });

    const now = performance.now();
    if (input.fire && now - (scene.onlineState.lastFireSentAt || 0) >= 120) {
      scene.onlineClient.sendFire({
        aimX: input.aimX,
        aimY: input.aimY,
      });
      scene.onlineState.lastFireSentAt = now;
    }
  }
}
