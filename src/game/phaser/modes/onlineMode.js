import * as Phaser from "phaser";
import { BOARD_HEIGHT, BOARD_WIDTH, ENEMY_BODY_BASE_FACING_DEG, ENEMY_TURRET_BASE_FACING_RAD, MACRO_TILE_SIZE, PLAYER_BODY_BASE_FACING_DEG, PLAYER_BODY_RING_CENTER, PLAYER_TURRET_BASE_FACING_RAD, PLAYER_TURRET_CAP_CENTER, TANK_RENDER_SIZE, TILE_SIZE } from "../shared/constants";
import { vectorLength } from "../shared/math";
import { POWER_TYPE } from "../systems/powerUpSystem";
import { clearEntityCollections, syncSceneStatsToMatchState, syncSceneStatusToMatchState } from "../core/state/matchState";
import { createTankSprite, swapTankSprites, updateTankVisuals } from "../render/tankRendering";
import { createOnlineSocketClient } from "../online/network/socketClient";
import { readOnlineSession, updateOnlineSession } from "../online/session";
import { showOnlineRoundBanner, showOnlineRoundWinnerBanner } from "../ui/hudRenderer";
import { createOnline2v2Level, ONLINE_BASE_DEFS, getOnlineBaseWorld } from "./onlineLevel";

const ONLINE_PLAYER_SPRITE_OPTIONS = {
  bodyMaxFactor: 0.95,
  turretMaxFactor: 1.0,
  turretScaleX: 1.0,
  turretScaleY: 1.0,
  turretOffsetX: 2,
  turretOffsetY: -2,
  bodyAnchorPx: PLAYER_BODY_RING_CENTER,
  turretPivotPx: PLAYER_TURRET_CAP_CENTER,
};

const ONLINE_MISSILE_VISUAL_SPEED = 640;
const ONLINE_MISSILE_VISUAL_MIN_MS = 260;
const ONLINE_MISSILE_VISUAL_MAX_MS = 1200;
const ONLINE_MISSILE_OPTIMISTIC_LEAD_MS = 120;
const ONLINE_MISSILE_DESPAWN_GRACE_MS = 120;
const ONLINE_MISSILE_RENDER_LEAD_MS = 12;

function parseTintColor(value, fallback = 0xd8b13a) {
  const normalized = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }
  return fallback;
}

function brightenTint(tint, amount = 0.35) {
  const base = Number(tint || 0);
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  const nextR = Math.round(r + ((0xff - r) * amount));
  const nextG = Math.round(g + ((0xff - g) * amount));
  const nextB = Math.round(b + ((0xff - b) * amount));
  return (nextR << 16) | (nextG << 8) | nextB;
}

function darkenTint(tint, amount = 0.18) {
  const base = Number(tint || 0);
  const factor = Math.max(0, 1 - amount);
  const r = Math.round(((base >> 16) & 0xff) * factor);
  const g = Math.round(((base >> 8) & 0xff) * factor);
  const b = Math.round((base & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function drawBulletShape(graphics, width, length, fillColor, alpha = 1) {
  if (!graphics?.clear) return;
  const w = Math.max(4, Number(width || 0));
  const h = Math.max(10, Number(length || 0));
  const halfW = w / 2;
  const noseY = -(h / 2);
  const shoulderY = -(h * 0.16);
  const tailY = h / 2;
  const tailInsetY = h * 0.22;

  graphics.clear();
  graphics.fillStyle(fillColor, alpha);
  graphics.beginPath();
  graphics.moveTo(0, noseY);
  graphics.lineTo(halfW, shoulderY);
  graphics.lineTo(halfW, tailInsetY);
  graphics.lineTo(halfW * 0.72, tailY);
  graphics.lineTo(-(halfW * 0.72), tailY);
  graphics.lineTo(-halfW, tailInsetY);
  graphics.lineTo(-halfW, shoulderY);
  graphics.closePath();
  graphics.fillPath();
}

function getOnlineMissilePairKey(ownerId, targetId) {
  return `${String(ownerId || "")}:${String(targetId || "")}`;
}

function estimateOnlineMissileDurationMs(fromX, fromY, toX, toY) {
  const distance = vectorLength(Number(toX || 0) - Number(fromX || 0), Number(toY || 0) - Number(fromY || 0));
  return Math.max(
    ONLINE_MISSILE_VISUAL_MIN_MS,
    Math.min(ONLINE_MISSILE_VISUAL_MAX_MS, Math.round((distance / ONLINE_MISSILE_VISUAL_SPEED) * 1000)),
  );
}

function forgetOptimisticOnlineMissile(state, missile) {
  if (!state?.onlineOptimisticMissileIdsByKey || !missile) return;
  const pairKey = missile.pairKey || getOnlineMissilePairKey(missile.ownerId, missile.targetId);
  if (!pairKey) return;
  if (state.onlineOptimisticMissileIdsByKey[pairKey] === missile.id) {
    delete state.onlineOptimisticMissileIdsByKey[pairKey];
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function getEstimatedOnlineServerNow(state, now = Date.now()) {
  const serverClockOffsetMs = Number(state?.serverClockOffsetMs || 0);
  const snapshotLatencyMs = Number(state?.snapshotLatencyMs || 0);
  return now - serverClockOffsetMs + snapshotLatencyMs + ONLINE_MISSILE_RENDER_LEAD_MS;
}

function getOnlineMissileTargetWorld(scene, missile) {
  const targetVisual = missile?.targetId ? scene.onlineState?.remoteTanksById?.[missile.targetId] : null;
  if (targetVisual?.container?.active && !targetVisual.isDestroyed) {
    return {
      x: Number(targetVisual.x || 0) - scene.boardOriginX,
      y: Number(targetVisual.y || 0) - scene.boardOriginY,
    };
  }
  const targetState = missile?.targetId ? scene.matchState?.tanksById?.[missile.targetId] : null;
  if (targetState && !targetState.isDestroyed) {
    return {
      x: Number(targetState.x || 0),
      y: Number(targetState.y || 0),
    };
  }
  return {
    x: Number(missile?.endServerX || missile?.startServerX || 0),
    y: Number(missile?.endServerY || missile?.startServerY || 0),
  };
}

function lerpChannel(from, to, t) {
  return Math.round(from + ((to - from) * t));
}

function getBaseHealthBarColor(ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio || 0)));
  const red = lerpChannel(0xc3, 0x2f, clamped);
  const green = lerpChannel(0x4c, 0x8e, clamped);
  const blue = lerpChannel(0x3c, 0x3d, clamped);
  return (red << 16) | (green << 8) | blue;
}

function redrawOnlineBaseBar(graphics, ratio) {
  if (!graphics?.clear) return;
  const clamped = Math.max(0, Math.min(1, Number(ratio || 0)));
  const barWidth = 8;
  graphics.clear();
  if (clamped <= 0) {
    graphics.setVisible(false);
    return;
  }
  graphics.setVisible(true);
  graphics.fillStyle(getBaseHealthBarColor(clamped), 1);
  const totalHeight = TILE_SIZE * 2;
  const fillHeight = Math.max(0, totalHeight * clamped);
  graphics.fillRect(0, totalHeight - fillHeight, barWidth, fillHeight);
}

function positionOnlineBaseBar(scene, visual, fallbackX, fallbackY) {
  if (!visual) return;
  if ((visual.maxHp ?? 1) <= 1) return;
  const bounds = visual.sprite?.getBounds?.() || null;
  const leftX = bounds?.left ?? ((visual.sprite?.x ?? fallbackX) - 28);
  const rightX = bounds?.right ?? ((visual.sprite?.x ?? fallbackX) + 28);
  const centerY = bounds?.centerY ?? visual.sprite?.y ?? fallbackY;
  const barWidth = 8;
  const barHeight = TILE_SIZE * 2;
  const barCenterX = visual.side === "east" ? leftX - 6 : rightX + 6;
  visual.barBg?.setPosition?.(barCenterX, centerY);
  visual.barFill?.setPosition?.(barCenterX - (barWidth / 2), centerY - (barHeight / 2));
}

function getOnlinePlayerSpriteConfig(starCount) {
  const level = Math.max(0, Math.min(3, Math.floor(Number(starCount || 0))));
  if (level >= 3) {
    return { bodyKey: "player-body-white-s2", turretKey: "player-turret-white-s3" };
  }
  if (level >= 2) {
    return { bodyKey: "player-body-white-s2", turretKey: "player-turret-white-s2" };
  }
  if (level >= 1) {
    return { bodyKey: "player-body-white-v2", turretKey: "player-turret-white-s1" };
  }
  return { bodyKey: "player-body-white-v2", turretKey: "player-turret-white-v2" };
}

const TEAM_LABELS = { team1: "Equipo 1", team2: "Equipo 2" };
const TEAM_SHORT = { team1: "Eq.1", team2: "Eq.2" };

function emitOnlineOverlay(scene, payload) {
  if (typeof window === "undefined") return;
  const signature = JSON.stringify(payload);
  if (scene.onlineState.overlaySignature === signature) return;
  scene.onlineState.overlaySignature = signature;
  window.dispatchEvent(new CustomEvent("tank-game:online-overlay", { detail: payload }));
}

function hideOnlineOverlay(scene) {
  emitOnlineOverlay(scene, null);
  scene.onlineState.overlaySignature = "";
}

function formatOverlaySummary(summary, isFinal) {
  if (!summary) return null;

  return {
    showSummary: true,
    summaryFinal: !!isFinal,
    summaryTitle: isFinal ? `${summary.winnerTeamName || "Partida terminada"} gano el partido` : "Marcador parcial",
    teams: [
      {
        id: "team1",
        name: summary.team1?.name || "Equipo 1",
        accent: "#d7e86f",
        players: Array.isArray(summary.team1?.players) ? summary.team1.players : [],
      },
      {
        id: "team2",
        name: summary.team2?.name || "Equipo 2",
        accent: "#7fc2ff",
        players: Array.isArray(summary.team2?.players) ? summary.team2.players : [],
      },
    ],
  };
}

function buildOnlineOverlay(scene) {
  const online = scene.onlineState || {};
  const snapshot = online.snapshot || null;
  const roundState = snapshot?.roundState || null;
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const localPlayer = players.find((player) => player.id === online.localPlayerId) || null;
  const teammate = localPlayer
    ? players.find((player) => player.id !== localPlayer.id && player.colorTeam === localPlayer.colorTeam) || null
    : null;
  const summary = snapshot?.matchSummary || null;
  const wantsStatsPanel = scene.keys.tab?.isDown || scene.readPadButtonPressed(8, 0.35, 0);
  const summaryVisible = !!summary && (!!roundState?.matchOver || wantsStatsPanel);
  const summaryData = summaryVisible ? formatOverlaySummary(summary, !!roundState?.matchOver) : null;

  return {
    connected: online.connectionState === "conectado",
    roundLabel: roundState
      ? `Online 2v2 - Ronda ${roundState.currentRound}/${roundState.totalRounds}`
      : "Online 2v2 - Ronda 1/6",
    resultLabel: roundState
      ? `Resultado ${roundState.scores?.team1 ?? 0} - ${roundState.scores?.team2 ?? 0}`
      : "Resultado 0 - 0",
    myLives: localPlayer ? `${localPlayer.livesRemaining ?? (localPlayer.isDestroyed ? 0 : 1)}/${localPlayer.roundLives ?? 1}` : "--",
    mateLives: teammate ? `${teammate.livesRemaining ?? (teammate.isDestroyed ? 0 : 1)}/${teammate.roundLives ?? 1}` : "--",
    showSummary: !!summaryVisible,
    summaryFinal: !!summaryData?.summaryFinal,
    summaryTitle: summaryData?.summaryTitle || "",
    teams: summaryData?.teams || [],
  };
}

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

function safeSetSceneText(node, text) {
  if (!node || !node.scene || node.active === false) return;
  try {
    node.setText(text);
  } catch {
    // El objeto puede seguir referenciado pero con la textura destruida.
  }
}

function destroyRemoteTankVisual(tank) {
  tank?.label?.destroy?.();
  tank?.container?.destroy?.();
}

function destroyRemoteBulletVisual(bullet) {
  bullet?.glow?.destroy?.();
  bullet?.body?.destroy?.();
  bullet?.core?.destroy?.();
}

function destroyOnlineMissileVisual(missile) {
  missile?.smokeTimer?.remove?.(false);
  missile?.glow?.destroy?.();
  missile?.body?.destroy?.();
  missile?.core?.destroy?.();
}

function createRemoteBulletVisual(scene, remoteBullet) {
  const bulletTint = Number(remoteBullet.tint || 0xfff3a8);
  const shellTint = darkenTint(bulletTint, 0.2);
  const outerGasTint = darkenTint(bulletTint, 0.1);
  const innerGasTint = brightenTint(bulletTint, 0.05);
  const coreTint = brightenTint(bulletTint, 0.1);
  const width = remoteBullet.width || 11;
  const length = remoteBullet.length || 24;
  const x = scene.boardOriginX + remoteBullet.x;
  const y = scene.boardOriginY + remoteBullet.y;
  const glow = scene.add.graphics().setDepth(178);
  const body = scene.add.graphics().setDepth(179);
  const core = scene.add.graphics().setDepth(180).setBlendMode(Phaser.BlendModes.ADD);
  drawBulletShape(glow, Math.max(6, width * 0.88), Math.max(12, length * 0.8), shellTint, 0.12);
  drawBulletShape(body, Math.max(6, width * 0.9), Math.max(13, length * 0.84), shellTint, 0.64);
  drawBulletShape(body, Math.max(5, width * 0.8), Math.max(11, length * 0.76), outerGasTint, 0.36);
  drawBulletShape(body, Math.max(4, width * 0.68), Math.max(9, length * 0.64), innerGasTint, 0.26);
  drawBulletShape(core, Math.max(2, width * 0.24), Math.max(4, length * 0.28), coreTint, 0.3);
  glow.x = x;
  glow.y = y;
  body.x = x;
  body.y = y;
  core.x = x;
  core.y = y;
  const rotation = (remoteBullet.angleRad || 0) + Math.PI / 2;
  glow.rotation = rotation;
  body.rotation = rotation;
  core.rotation = rotation;
  scene.entityLayer.add(glow);
  scene.entityLayer.add(body);
  scene.entityLayer.add(core);
  return {
    id: remoteBullet.id,
    glow,
    body,
    core,
    x,
    y,
    targetX: x,
    targetY: y,
    angleRad: remoteBullet.angleRad || 0,
    targetAngleRad: remoteBullet.angleRad || 0,
  };
}

function createOnlineMissileVisual(scene, strike) {
  const startX = scene.boardOriginX + Number(strike.x || 0);
  const startY = scene.boardOriginY + Number(strike.y || 0);
  const missileTint = 0xb21d1d;
  const glowTint = 0xe96f68;
  const coreTint = 0xe45454;
  const glow = scene.add.graphics().setDepth(188).setBlendMode(Phaser.BlendModes.ADD);
  const body = scene.add.graphics().setDepth(189);
  const core = scene.add.graphics().setDepth(190).setBlendMode(Phaser.BlendModes.ADD);
  drawBulletShape(glow, 9, 38, glowTint, 0.08);
  drawBulletShape(body, 7, 34, missileTint, 0.94);
  drawBulletShape(core, 2, 16, coreTint, 0.54);
  glow.x = startX;
  glow.y = startY;
  body.x = startX;
  body.y = startY;
  core.x = startX;
  core.y = startY;
  const initialRotation = (Number(strike.angleRad || 0)) + Math.PI / 2;
  glow.rotation = initialRotation;
  body.rotation = initialRotation;
  core.rotation = initialRotation;
  scene.entityLayer.add(glow);
  scene.entityLayer.add(body);
  scene.entityLayer.add(core);

  const smokeTimer = scene.time.addEvent({
    delay: 45,
    repeat: -1,
    callback: () => {
      if (!body?.active) return;
      const trailAngle = Number(body.rotation || 0) - (Math.PI / 2);
      const tailOffset = 14;
      const tailX = body.x - (Math.cos(trailAngle) * tailOffset);
      const tailY = body.y - (Math.sin(trailAngle) * tailOffset);
      const emberCore = scene.add
        .circle(
          tailX + ((Math.random() - 0.5) * 3),
          tailY + ((Math.random() - 0.5) * 3),
          3.2,
          Math.random() < 0.5 ? 0xffd166 : 0xff7a00,
          0.82,
        )
        .setDepth(186)
        .setBlendMode(Phaser.BlendModes.ADD);
      const emberGlow = scene.add
        .circle(emberCore.x, emberCore.y, 6.5, 0xff6a00, 0.28)
        .setDepth(185)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.entityLayer.add(emberGlow);
      scene.entityLayer.add(emberCore);
      scene.tweens.add({
        targets: [emberCore, emberGlow],
        alpha: 0,
        scaleX: 0.35,
        scaleY: 0.35,
        x: tailX - (Math.cos(trailAngle) * 10),
        y: tailY - (Math.sin(trailAngle) * 10),
        duration: 220,
        onComplete: () => {
          emberCore.destroy();
          emberGlow.destroy();
        },
      });
    },
  });

  return {
    id: strike.id,
    ownerId: strike.ownerId,
    targetId: strike.targetId,
    pairKey: getOnlineMissilePairKey(strike.ownerId, strike.targetId),
    glow,
    body,
    core,
    smokeTimer,
    x: startX,
    y: startY,
    targetX: startX,
    targetY: startY,
    angleRad: Number(strike.angleRad || 0),
    targetAngleRad: Number(strike.angleRad || 0),
    startServerX: Number(strike.x || 0),
    startServerY: Number(strike.y || 0),
    endServerX: Number(strike.x || 0),
    endServerY: Number(strike.y || 0),
    startedAt: Number(strike.startedAt || Date.now()),
    hitAt: Number(strike.hitAt || Date.now()),
    durationMs: Number(strike.durationMs || 0),
    optimistic: !!strike.optimistic,
    lastSeenAt: strike.optimistic ? 0 : Date.now(),
    expiresAt: Number(strike.expiresAt || 0),
  };
}

function syncOnlineMissileStrikes(scene, activeMissileStrikes = [], serverTime = Date.now()) {
  const state = scene.onlineState;
  if (!state.onlineMissileStrikesById) state.onlineMissileStrikesById = {};
  if (!state.onlineOptimisticMissileIdsByKey) state.onlineOptimisticMissileIdsByKey = {};
  const seenIds = new Set(activeMissileStrikes.map((strike) => strike.id));
  const now = Date.now();
  const estimatedLatencyMs = Math.max(0, Math.min(220, now - Number(serverTime || now)));
  state.serverClockOffsetMs = estimatedLatencyMs;
  state.snapshotLatencyMs = Number.isFinite(state.snapshotLatencyMs)
    ? ((state.snapshotLatencyMs * 0.82) + (estimatedLatencyMs * 0.18))
    : estimatedLatencyMs;

  activeMissileStrikes.forEach((strike) => {
    if (!strike?.id) return;
    let missile = state.onlineMissileStrikesById[strike.id];
    if (!missile) {
      const pairKey = getOnlineMissilePairKey(strike.ownerId, strike.targetId);
      const optimisticId = state.onlineOptimisticMissileIdsByKey[pairKey];
      const optimisticMissile = optimisticId ? state.onlineMissileStrikesById[optimisticId] : null;
      if (optimisticMissile) {
        delete state.onlineMissileStrikesById[optimisticId];
        missile = optimisticMissile;
        missile.id = strike.id;
        missile.optimistic = false;
        state.onlineMissileStrikesById[strike.id] = missile;
        delete state.onlineOptimisticMissileIdsByKey[pairKey];
      } else {
        missile = createOnlineMissileVisual(scene, strike);
        state.onlineMissileStrikesById[strike.id] = missile;
      }
    }
    missile.ownerId = strike.ownerId;
    missile.targetId = strike.targetId;
    missile.pairKey = getOnlineMissilePairKey(strike.ownerId, strike.targetId);
    missile.startServerX = Number(strike.x || missile.startServerX || 0);
    missile.startServerY = Number(strike.y || missile.startServerY || 0);
    missile.startedAt = Number(strike.startedAt || missile.startedAt || now);
    missile.hitAt = Number(strike.hitAt || missile.hitAt || now);
    missile.durationMs = Math.max(1, Number(strike.durationMs || missile.durationMs || 0));
    missile.lastSeenAt = now;
    missile.expiresAt = Math.max(missile.hitAt + ONLINE_MISSILE_DESPAWN_GRACE_MS, now + ONLINE_MISSILE_DESPAWN_GRACE_MS);
    const strikeAngle = Number(strike.angleRad || missile.targetAngleRad || 0);
    const targetWorld = getOnlineMissileTargetWorld(scene, missile);
    missile.endServerX = targetWorld.x;
    missile.endServerY = targetWorld.y;
    const renderServerNow = getEstimatedOnlineServerNow(state, now);
    const progress = clamp01((renderServerNow - missile.startedAt) / missile.durationMs);
    missile.x = scene.boardOriginX + (missile.startServerX + ((missile.endServerX - missile.startServerX) * progress));
    missile.y = scene.boardOriginY + (missile.startServerY + ((missile.endServerY - missile.startServerY) * progress));
    missile.targetAngleRad = Math.atan2(missile.endServerY - missile.startServerY, missile.endServerX - missile.startServerX) || strikeAngle;
    missile.targetX = missile.x;
    missile.targetY = missile.y;
    missile.angleRad = missile.targetAngleRad;
    missile.glow?.setVisible?.(true);
    missile.body?.setVisible?.(true);
    missile.core?.setVisible?.(true);
  });

  Object.entries(state.onlineMissileStrikesById).forEach(([id, missile]) => {
    if (seenIds.has(id)) return;
    if (missile?.optimistic && now <= Number(missile.expiresAt || 0)) return;
    if (!missile?.optimistic && now <= Math.max(Number(missile.hitAt || 0) + ONLINE_MISSILE_DESPAWN_GRACE_MS, Number(missile.lastSeenAt || 0) + ONLINE_MISSILE_DESPAWN_GRACE_MS)) {
      return;
    }
    forgetOptimisticOnlineMissile(state, missile);
    destroyOnlineMissileVisual(missile);
    delete state.onlineMissileStrikesById[id];
  });
}

function destroyOnlineBaseVisual(base) {
  base?.sprite?.destroy?.();
  base?.barBg?.destroy?.();
  base?.barFill?.destroy?.();
}

function destroyOnlineEffect(effect) {
  if (effect?.rafId && typeof window !== "undefined") {
    window.cancelAnimationFrame(effect.rafId);
  }
  effect?.sprite?.destroy?.();
  effect?.glow?.destroy?.();
  effect?.core?.destroy?.();
}

function ensureOnlineBases(scene) {
  // Preservar estado actual antes de recrear los visuales de la HP bar
  const prevVisualsById = scene.onlineState.baseVisualsById || {};
  const snapshotBases = Array.isArray(scene.onlineState?.snapshot?.bases) ? scene.onlineState.snapshot.bases : [];
  Object.values(prevVisualsById).forEach(destroyOnlineBaseVisual);
  scene.onlineState.baseVisualsById = {};
  Object.values(ONLINE_BASE_DEFS).forEach((def) => {
    const prev = prevVisualsById[def.id];
    const currentBase = snapshotBases.find((base) => base?.id === def.id) || scene.matchState?.basesById?.[def.id] || null;
    const maxHp = Math.max(1, Number(currentBase?.maxHp || currentBase?.hp || prev?.maxHp || 1));
    const hp = Math.max(0, Math.min(maxHp, Number(prev?.hp ?? currentBase?.hp ?? maxHp)));
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const world = getOnlineBaseWorld(def.id);
    const barBg = scene.add.rectangle(
      scene.boardOriginX + world.x,
      scene.boardOriginY + world.y,
      12,
      (TILE_SIZE * 2) + 4,
      0x1a2026,
      0.95
    ).setOrigin(0.5).setDepth(200);
    const barFill = scene.add.graphics()
      .setPosition(scene.boardOriginX + world.x - 4, scene.boardOriginY + world.y - 60)
      .setDepth(201);
    redrawOnlineBaseBar(barFill, ratio);
    const showBar = maxHp > 1;
    barBg.setVisible(showBar);
    barFill.setVisible(showBar);
    scene.overlayLayer.add(barBg);
    scene.overlayLayer.add(barFill);
    scene.onlineState.baseVisualsById[def.id] = {
      id: def.id,
      side: def.side,
      barBg,
      barFill,
      // Preservar hp y exploded para no relanzar la explosión cada snapshot
      hp,
      maxHp,
      exploded: prev?.exploded ?? hp <= 0,
    };
  });
  syncOnlineBaseSprites(scene);
}

function syncOnlineBaseSprites(scene) {
  const eagleSprites = Array.isArray(scene.obstacleLayer?.list)
    ? scene.obstacleLayer.list.filter((node) => node?.texture?.key === "eagle")
    : [];
  const claimedSprites = new Set();

  Object.values(scene.onlineState.baseVisualsById || {}).forEach((visual) => {
    const world = getOnlineBaseWorld(visual.id);
    if (!world) return;
    const targetX = scene.boardOriginX + world.x;
    const targetY = scene.boardOriginY + world.y;
    const sprite = eagleSprites.find((node) => {
      if (claimedSprites.has(node)) return false;
      return Math.abs(node.x - targetX) < 2 && Math.abs(node.y - targetY) < 2;
    }) || null;

    if (sprite) {
      claimedSprites.add(sprite);
      visual.sprite = sprite;
      visual.sprite.setVisible((visual.hp ?? visual.maxHp ?? 1) > 0);
      positionOnlineBaseBar(scene, visual, targetX, targetY);
    }
  });
}

function syncOnlineBaseVisuals(scene, bases = []) {
  syncOnlineBaseSprites(scene);
  bases.forEach((base) => {
    const visual = scene.onlineState.baseVisualsById?.[base.id];
    if (!visual) return;
    const previousHp = visual.hp ?? visual.maxHp ?? 1;
    visual.hp = base.hp;
    if (base.hp > 0 && previousHp <= 0) {
      visual.exploded = false;
    }
    if (visual.sprite?.active) {
      visual.sprite.setVisible(base.hp > 0);
    }
    const showBar = (visual.maxHp ?? 1) > 1;
    visual.barBg?.setVisible?.(showBar);
    visual.barFill?.setVisible?.(showBar);
    positionOnlineBaseBar(scene, visual, scene.boardOriginX + base.x, scene.boardOriginY + base.y);
    if (visual.barFill) {
      visual.maxHp = Math.max(1, Number(base.maxHp || visual.maxHp || base.hp || 1));
      const maxHp = visual.maxHp;
      const ratio = Math.max(0, Math.min(1, Number(base.hp || 0) / maxHp));
      redrawOnlineBaseBar(visual.barFill, ratio);
      if (maxHp <= 1) {
        visual.barBg?.setVisible?.(false);
        visual.barFill?.setVisible?.(false);
      }
    }
    if (previousHp > 0 && base.hp <= 0 && !visual.exploded) {
      const centerX = visual.sprite?.x ?? (scene.boardOriginX + base.x);
      const centerY = visual.sprite?.y ?? (scene.boardOriginY + base.y);
      spawnOnlineTankExplosion(scene, centerX, centerY);
      spawnOnlineTankExplosion(scene, centerX - 18, centerY + 12);
      spawnOnlineTankExplosion(scene, centerX + 18, centerY - 10);
      visual.exploded = true;
    }
    scene.matchState.basesById[base.id] = { ...base };
  });
}

function createRemoteTankVisual(scene, remoteTank) {
  const colorConfig = getOnlinePlayerSpriteConfig(remoteTank.starCount);
  const tankTint = parseTintColor(remoteTank.visualColor, 0xd8b13a);
  const spriteParts = createTankSprite(
    scene,
    scene.boardOriginX + remoteTank.x,
    scene.boardOriginY + remoteTank.y,
    colorConfig.bodyKey,
    colorConfig.turretKey,
    TANK_RENDER_SIZE,
    PLAYER_BODY_BASE_FACING_DEG,
    remoteTank.moveAngleDeg ?? -90,
    PLAYER_TURRET_BASE_FACING_RAD,
    ONLINE_PLAYER_SPRITE_OPTIONS
  );

  spriteParts.body.setTint(tankTint);
  spriteParts.turret.setTint(tankTint);

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
    shieldActive: !!remoteTank.shieldActive,
    shieldUntil: Number(remoteTank.shieldUntil || 0),
    shieldFlickerOnExpire: !!remoteTank.shieldFlickerOnExpire,
    starCount: Math.max(0, Math.floor(Number(remoteTank.starCount || 0))),
  };

  const label = scene.add
    .text(tank.x, tank.y - 44, remoteTank.label || remoteTank.id, {
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
  let sprite = null;
  try {
    sprite = scene.add
      .image(worldX, worldY, "tank-explosion")
      .setDepth(260)
      .setAlpha(1)
      .setDisplaySize(80, 80);
    (scene.pickupLayer || scene.entityLayer).add(sprite);
  } catch (_) {
    const gfx = scene.add.graphics().setDepth(260);
    gfx.fillStyle(0xff6600, 0.9);
    gfx.fillCircle(0, 0, 20);
    gfx.x = worldX;
    gfx.y = worldY;
    scene.entityLayer.add(gfx);
    sprite = gfx;
  }

  const effect = {
    sprite,
    rafId: null,
    duration: 420,
  };
  scene.onlineState.effects.push(effect);

  const startAt = performance.now();
  const animate = (now) => {
    if (!effect.sprite?.active) {
      scene.onlineState.effects = scene.onlineState.effects.filter((entry) => entry !== effect);
      return;
    }
    const progress = Math.max(0, Math.min(1, (now - startAt) / effect.duration));
    const eased = 1 - Math.pow(1 - progress, 3);

    if (effect.sprite?.setAlpha) {
      effect.sprite.setAlpha(1 - (eased * 0.85));
    }
    if (effect.sprite?.setDisplaySize) {
      effect.sprite.setDisplaySize(80 + (30 * eased), 80 + (140 * eased));
    } else {
      effect.sprite.scaleX = 1 + (1.1 * eased);
      effect.sprite.scaleY = 1 + (1.8 * eased);
      effect.sprite.alpha = 1 - (eased * 0.9);
    }

    if (progress >= 1) {
      scene.onlineState.effects = scene.onlineState.effects.filter((entry) => entry !== effect);
      destroyOnlineEffect(effect);
      return;
    }
    effect.rafId = window.requestAnimationFrame(animate);
  };

  if (typeof window !== "undefined") {
    effect.rafId = window.requestAnimationFrame(animate);
  }
}

function spawnOnlineMissileImpactEffect(scene, worldX, worldY) {
  const glow = scene.add.circle(worldX, worldY, 10, 0xff9f5a, 0.4).setDepth(258).setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add.circle(worldX, worldY, 5, 0xfff1c1, 0.82).setDepth(259).setBlendMode(Phaser.BlendModes.ADD);
  scene.entityLayer.add(glow);
  scene.entityLayer.add(core);

  const effect = {
    glow,
    core,
    rafId: null,
    duration: 160,
  };
  scene.onlineState.effects.push(effect);

  const startAt = performance.now();
  const animate = (now) => {
    if (!effect.glow?.active || !effect.core?.active) {
      scene.onlineState.effects = scene.onlineState.effects.filter((entry) => entry !== effect);
      return;
    }
    const progress = Math.max(0, Math.min(1, (now - startAt) / effect.duration));
    const eased = 1 - Math.pow(1 - progress, 2);
    effect.glow.setRadius(10 + (16 * eased));
    effect.core.setRadius(5 + (6 * eased));
    effect.glow.setAlpha(0.4 * (1 - eased));
    effect.core.setAlpha(0.82 * (1 - eased));
    if (progress >= 1) {
      scene.onlineState.effects = scene.onlineState.effects.filter((entry) => entry !== effect);
      destroyOnlineEffect(effect);
      return;
    }
    effect.rafId = window.requestAnimationFrame(animate);
  };

  if (typeof window !== "undefined") {
    effect.rafId = window.requestAnimationFrame(animate);
  }
}

function syncOnlineMissileImpactEffects(scene, missileImpactEffects = []) {
  const state = scene.onlineState;
  if (!state.handledMissileImpactIds) state.handledMissileImpactIds = {};
  const now = Date.now();
  Object.entries(state.handledMissileImpactIds).forEach(([id, expiresAt]) => {
    if (Number(expiresAt || 0) > now) return;
    delete state.handledMissileImpactIds[id];
  });

  missileImpactEffects.forEach((impact) => {
    if (!impact?.id || state.handledMissileImpactIds[impact.id]) return;
    const worldX = scene.boardOriginX + Number(impact.x || 0);
    const worldY = scene.boardOriginY + Number(impact.y || 0);
    const missile = impact.strikeId ? state.onlineMissileStrikesById?.[impact.strikeId] : null;
    if (missile) {
      missile.x = worldX;
      missile.y = worldY;
      if (missile.glow?.active) {
        missile.glow.x = worldX;
        missile.glow.y = worldY;
      }
      if (missile.body?.active) {
        missile.body.x = worldX;
        missile.body.y = worldY;
      }
      if (missile.core?.active) {
        missile.core.x = worldX;
        missile.core.y = worldY;
      }
      forgetOptimisticOnlineMissile(state, missile);
      destroyOnlineMissileVisual(missile);
      delete state.onlineMissileStrikesById[impact.strikeId];
    }
    spawnOnlineMissileImpactEffect(scene, worldX, worldY);
    state.handledMissileImpactIds[impact.id] = Number(impact.expiresAt || (now + 500));
  });
}

// ── Power-ups online ──────────────────────────────────────────────────────
function syncOnlinePowerUps(scene, serverPowerUps) {
  const state = scene.onlineState;
  if (!state.onlinePowerUpsById) state.onlinePowerUpsById = {};

  const seenIds = new Set(serverPowerUps.map((p) => p.id));

  // Eliminar los que ya no existen en el servidor
  Object.entries(state.onlinePowerUpsById).forEach(([id, pu]) => {
    if (!seenIds.has(id)) {
      pu.sprite?.destroy();
      delete state.onlinePowerUpsById[id];
    }
  });

  // Crear los nuevos
  serverPowerUps.forEach((serverPu) => {
    if (state.onlinePowerUpsById[serverPu.id]) return;
    const worldX = scene.boardOriginX + serverPu.x;
    const worldY = scene.boardOriginY + serverPu.y;

    const sprite = scene.add
      .image(worldX, worldY, `power-${serverPu.type}`)
      .setDisplaySize(MACRO_TILE_SIZE * 0.85, MACRO_TILE_SIZE * 0.85)
      .setDepth(230);
    (scene.pickupLayer || scene.entityLayer).add(sprite);

    scene.tweens.add({
      targets: sprite,
      y: worldY - 7,
      duration: 700,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });

    state.onlinePowerUpsById[serverPu.id] = {
      id: serverPu.id,
      type: serverPu.type,
      serverX: serverPu.x,
      serverY: serverPu.y,
      worldX,
      worldY,
      sprite,
      timeRemaining:  12000,
      flickerTimer:   0,
      flickerVisible: true,
    };
  });
}

function checkOnlinePowerUpPickups(scene, delta) {
  const state = scene.onlineState;
  if (!state.onlinePowerUpsById) return;

  const localId  = state.localPlayerId;
  const localTank = localId ? state.remoteTanksById?.[localId] : null;

  const toDelete = [];

  Object.values(state.onlinePowerUpsById).forEach((pu) => {
    // ── Tiempo de vida del ítem ──────────────────────────────────────────
    pu.timeRemaining -= delta;

    if (pu.timeRemaining <= 0) {
      pu.sprite?.destroy();
      toDelete.push(pu.id);
      return;
    }

    // Titilar últimos 2 s
    if (pu.timeRemaining <= 2000) {
      pu.flickerTimer += delta;
      if (pu.flickerTimer >= 200) {
        pu.flickerTimer  = 0;
        pu.flickerVisible = !pu.flickerVisible;
        pu.sprite?.setVisible(pu.flickerVisible);
      }
    }

    // ── Colisión con jugador local ───────────────────────────────────────
    if (localTank && !localTank.isDestroyed &&
        vectorLength(localTank.x - pu.worldX, localTank.y - pu.worldY) < 38) {
      scene.onlineClient?.sendRaw?.({ type: "pickup_power_up", payload: { id: pu.id } });
      applyOnlinePowerUpLocal(scene, localTank, pu.type);
      pu.sprite?.destroy();
      toDelete.push(pu.id);
      scene.showMessage(`¡Poder: ${pu.type.charAt(0).toUpperCase() + pu.type.slice(1)}!`);
    }
  });

  toDelete.forEach((id) => delete state.onlinePowerUpsById[id]);
}

function applyOnlinePowerUpLocal(scene, localTank, type) {
  if (type !== POWER_TYPE.MISSILES || !scene?.onlineState || !localTank) return;
  const state = scene.onlineState;
  if (!state.onlineMissileStrikesById) state.onlineMissileStrikesById = {};
  if (!state.onlineOptimisticMissileIdsByKey) state.onlineOptimisticMissileIdsByKey = {};

  const localSnapshotTank = scene.matchState?.tanksById?.[localTank.id] || null;
  const ownerX = Number(localSnapshotTank?.x ?? (localTank.x - scene.boardOriginX));
  const ownerY = Number(localSnapshotTank?.y ?? (localTank.y - scene.boardOriginY));
  const ownerTeam = localSnapshotTank?.team || null;
  const targets = Object.values(scene.matchState?.tanksById || {}).filter((tank) => (
    tank
    && tank.id !== localTank.id
    && !tank.isDestroyed
    && (!ownerTeam || tank.team !== ownerTeam)
  ));
  const startedAt = Date.now() - ONLINE_MISSILE_OPTIMISTIC_LEAD_MS;

  targets.forEach((targetTank) => {
    const pairKey = getOnlineMissilePairKey(localTank.id, targetTank.id);
    if (state.onlineOptimisticMissileIdsByKey[pairKey]) return;
    const durationMs = estimateOnlineMissileDurationMs(ownerX, ownerY, targetTank.x, targetTank.y);
    const angleRad = Math.atan2(Number(targetTank.y || 0) - ownerY, Number(targetTank.x || 0) - ownerX);
    const strike = {
      id: `optimistic-${localTank.id}-${targetTank.id}-${startedAt}`,
      ownerId: localTank.id,
      targetId: targetTank.id,
      x: ownerX,
      y: ownerY,
      angleRad,
      startedAt,
      hitAt: startedAt + durationMs,
      durationMs,
      optimistic: true,
      expiresAt: startedAt + durationMs + 220,
    };
    const missile = createOnlineMissileVisual(scene, strike);
    missile.startServerX = ownerX;
    missile.startServerY = ownerY;
    missile.endServerX = Number(targetTank.x || ownerX);
    missile.endServerY = Number(targetTank.y || ownerY);
    state.onlineMissileStrikesById[strike.id] = missile;
    state.onlineOptimisticMissileIdsByKey[pairKey] = strike.id;
  });
}

function drawOnlineShieldSmokeRibbon(graphics, x, y, radiusX, radiusY, startAngle, endAngle, color, alpha, thickness, drift = 0) {
  const steps = Math.max(10, Math.round(16 + thickness * 2));
  const puffRadius = Math.max(2.6, thickness * 0.95);
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const angle = startAngle + ((endAngle - startAngle) * progress);
    const wave = Math.sin((progress * Math.PI * 2) + drift);
    const radialOffset = wave * thickness * 0.75;
    const px = x + Math.cos(angle) * (radiusX + radialOffset);
    const py = y + Math.sin(angle) * (radiusY + radialOffset * 0.85);
    const localAlpha = alpha * (0.45 + (Math.sin(progress * Math.PI) * 0.55));
    graphics.fillStyle(color, localAlpha * 0.52);
    graphics.fillCircle(px, py, puffRadius * 1.35);
    graphics.fillStyle(0xf2fbff, localAlpha * 0.18);
    graphics.fillCircle(px + Math.cos(angle + drift) * 0.9, py + Math.sin(angle + drift) * 0.9, puffRadius * 0.78);
  }
}

function drawOnlineShield(graphics, x, y, phase = 0) {
  graphics.clear();
  const pulse = 1 + Math.sin(phase * 1.7) * 0.09;
  const innerPulse = 1 + Math.sin((phase * 2.1) + 0.7) * 0.12;
  const hazePulse = 1 + Math.sin((phase * 1.35) - 0.45) * 0.07;
  const outerRadiusX = 43 * pulse;
  const outerRadiusY = 38 * pulse;
  const innerRadiusX = 31 * innerPulse;
  const innerRadiusY = 27 * innerPulse;
  graphics.fillStyle(0x67c8ff, 0.08);
  graphics.fillCircle(x, y, 43 * hazePulse);

  graphics.fillStyle(0xbfeaff, 0.16);
  graphics.fillCircle(x, y, 32 * innerPulse);

  const outerRotation = phase;
  const innerRotation = -phase * 1.35;
  drawOnlineShieldSmokeRibbon(graphics, x, y, outerRadiusX, outerRadiusY, outerRotation + 0.2, outerRotation + 1.4, 0x7bd8ff, 0.9, 3.2, phase * 0.6);
  drawOnlineShieldSmokeRibbon(graphics, x, y, outerRadiusX * 1.02, outerRadiusY * 0.98, outerRotation + 2.2, outerRotation + 3.15, 0x7bd8ff, 0.78, 3.8, phase * 0.85);
  drawOnlineShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.98, outerRadiusY * 1.03, outerRotation + 4.05, outerRotation + 5.25, 0x7bd8ff, 0.9, 3.4, phase * 0.5);
  drawOnlineShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.92, outerRadiusY * 0.9, outerRotation + 0.55, outerRotation + 1.05, 0xc7f1ff, 0.34, 7.2, phase * 0.95);
  drawOnlineShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.9, outerRadiusY * 0.88, outerRotation + 3.8, outerRotation + 4.4, 0xc7f1ff, 0.3, 7.6, phase * 1.1);

  drawOnlineShieldSmokeRibbon(graphics, x, y, innerRadiusX, innerRadiusY, innerRotation + 0.55, innerRotation + 1.7, 0xdaf6ff, 0.64, 2.8, phase * 0.7);
  drawOnlineShieldSmokeRibbon(graphics, x, y, innerRadiusX * 1.05, innerRadiusY * 0.94, innerRotation + 3.0, innerRotation + 4.1, 0xdaf6ff, 0.54, 2.9, phase * 0.9);
  drawOnlineShieldSmokeRibbon(graphics, x, y, innerRadiusX * 0.95, innerRadiusY * 1.02, innerRotation + 5.0, innerRotation + 5.75, 0xdaf6ff, 0.52, 2.8, phase * 0.6);
  drawOnlineShieldSmokeRibbon(graphics, x, y, innerRadiusX * 0.84, innerRadiusY * 0.84, innerRotation + 1.95, innerRotation + 2.55, 0xffffff, 0.18, 5.2, phase * 1.2);

  for (let index = 0; index < 3; index += 1) {
    const angle = phase * (1.25 + index * 0.08) + index * ((Math.PI * 2) / 3);
    const orbitX = x + Math.cos(angle) * (39 * pulse);
    const orbitY = y + Math.sin(angle) * (31 * pulse);
    graphics.fillStyle(0xe9fbff, 0.9 - index * 0.18);
    graphics.fillCircle(orbitX, orbitY, index === 0 ? 3.2 : 2.4);
  }

  graphics.lineStyle(1.2, 0xeffbff, 0.25);
  graphics.strokeCircle(x, y, 25 * innerPulse);
}

function updateOnlineShieldVisuals(scene, delta) {
  const shieldVisualsByTankId = scene.onlineState?.shieldVisualsByTankId || {};
  const remoteTanksById = scene.onlineState?.remoteTanksById || {};
  const activeShieldIds = new Set();

  Object.values(remoteTanksById).forEach((tank) => {
    if (!tank?.shieldActive || tank.isDestroyed) return;
    activeShieldIds.add(tank.id);
    let visual = shieldVisualsByTankId[tank.id];
    if (!visual) {
      const gfx = scene.add.graphics().setDepth(200);
      scene.entityLayer.add(gfx);
      visual = { graphics: gfx, phase: 0, flickerTimer: 0, flickerVisible: true };
      shieldVisualsByTankId[tank.id] = visual;
    }
    visual.phase = (visual.phase || 0) + (delta / 1000) * 2.4;
    const remainingShieldMs = Math.max(0, Number(tank.shieldUntil || 0) - Date.now());
    if (tank.shieldFlickerOnExpire && remainingShieldMs <= 2000) {
      visual.flickerTimer = (visual.flickerTimer || 0) + delta;
      if (visual.flickerTimer >= 500) {
        visual.flickerTimer = 0;
        visual.flickerVisible = !visual.flickerVisible;
      }
    } else {
      visual.flickerTimer = 0;
      visual.flickerVisible = true;
    }
    if (visual.flickerVisible) {
      drawOnlineShield(visual.graphics, tank.x, tank.y, visual.phase);
    } else {
      visual.graphics.clear();
    }
  });

  Object.entries(shieldVisualsByTankId).forEach(([tankId, visual]) => {
    if (activeShieldIds.has(tankId)) return;
    visual?.graphics?.destroy?.();
    delete shieldVisualsByTankId[tankId];
  });
}

function syncSnapshot(scene, snapshot) {
  scene.onlineState.snapshot = snapshot;
  const seenTankIds = new Set();
  const seenBulletIds = new Set();
  const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
  const bullets = Array.isArray(snapshot?.bullets) ? snapshot.bullets : [];
  const activeMissileStrikes = Array.isArray(snapshot?.activeMissileStrikes) ? snapshot.activeMissileStrikes : [];
  const missileImpactEffects = Array.isArray(snapshot?.missileImpactEffects) ? snapshot.missileImpactEffects : [];
  const bases = Array.isArray(snapshot?.bases) ? snapshot.bases : [];
  const floor = snapshot?.floor || null;
  const overlay = snapshot?.overlay || null;
  const obstacles = snapshot?.obstacles || null;
  const roundState = snapshot?.roundState || null;
  const winnerTeam = snapshot?.status?.winnerTeam || null;
  const matchSummary = snapshot?.matchSummary || null;

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
    const targetX = scene.boardOriginX + remoteTank.x;
    const targetY = scene.boardOriginY + remoteTank.y;
    if (prevDestroyed && !remoteTank.isDestroyed) {
      tank.x = targetX;
      tank.y = targetY;
      tank.targetX = targetX;
      tank.targetY = targetY;
      if (tank.label) {
        tank.label.x = targetX;
        tank.label.y = targetY - 44;
      }
      if (typeof remoteTank.moveAngleDeg === "number") {
        tank.moveAngleDeg = remoteTank.moveAngleDeg;
        tank.targetMoveAngleDeg = remoteTank.moveAngleDeg;
      }
      if (typeof remoteTank.turretAngleRad === "number") {
        tank.turretAngleRad = remoteTank.turretAngleRad;
        tank.targetTurretAngleRad = remoteTank.turretAngleRad;
      }
    }
    scene.onlineState.prevDestroyedById[remoteTank.id] = remoteTank.isDestroyed;

    tank.isDestroyed = remoteTank.isDestroyed;
    tank.shieldActive = !!remoteTank.shieldActive;
    tank.shieldUntil = Number(remoteTank.shieldUntil || 0);
    tank.shieldFlickerOnExpire = !!remoteTank.shieldFlickerOnExpire;
    const nextStarCount = Math.max(0, Math.floor(Number(remoteTank.starCount || 0)));
    if (tank.starCount !== nextStarCount) {
      const nextConfig = getOnlinePlayerSpriteConfig(nextStarCount);
      swapTankSprites(scene, tank, nextConfig.bodyKey, nextConfig.turretKey, TANK_RENDER_SIZE, ONLINE_PLAYER_SPRITE_OPTIONS);
      tank.body?.setTint?.(parseTintColor(remoteTank.visualColor, 0xd8b13a));
      tank.turret?.setTint?.(parseTintColor(remoteTank.visualColor, 0xd8b13a));
      tank.starCount = nextStarCount;
    }
    const visible = !remoteTank.isDestroyed;
    tank.container?.setVisible?.(visible);
    tank.label?.setVisible?.(visible);

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
    if (!bullet.body?.active) return;
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
  syncOnlineMissileImpactEffects(scene, missileImpactEffects);
  syncOnlineMissileStrikes(scene, activeMissileStrikes, snapshot?.serverTime);

  // ── Power-ups del servidor ──────────────────────────────────────────────
  syncOnlinePowerUps(scene, Array.isArray(snapshot?.powerUps) ? snapshot.powerUps : []);

  // ── Round state HUD + notifications ────────────────────────────────────
  if (roundState) {
    updateRoundHUD(scene, roundState, winnerTeam);

    // Detect round change → show message
    const prevRound = scene.onlineState.lastKnownRound ?? null;
    if (!roundState.transitioning && !roundState.matchOver && roundState.currentRound !== prevRound) {
      showOnlineRoundBanner(scene, roundState.currentRound, roundState.scores, 2000);
    }
    if (prevRound != null && roundState.currentRound !== prevRound && roundState.currentRound > 1) {
      const sideMsg = roundState.sideSwitched && roundState.currentRound === (roundState.sideSwitchAfterRound ?? 3) + 1
        ? " | ¡Cambio de lado!"
        : "";
      scene.showMessage(`Ronda ${roundState.currentRound}/${roundState.totalRounds}${sideMsg}`);
    }
    scene.onlineState.lastKnownRound = roundState.currentRound;
    if (roundState.transitioning && roundState.roundWinnerColorTeam) {
      const winnerKey = `${roundState.currentRound}:${roundState.roundWinnerColorTeam}`;
      if (scene.onlineState.prevRoundWinnerKey !== winnerKey) {
        const roundWinLabel = TEAM_LABELS[roundState.roundWinnerColorTeam] || roundState.roundWinnerColorTeam;
        showOnlineRoundWinnerBanner(scene, roundWinLabel, 2000);
        scene.onlineState.prevRoundWinnerKey = winnerKey;
      }
    }

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
  hideOnlineOverlay(scene);
  Object.values(scene.onlineState?.remoteTanksById || {}).forEach(destroyRemoteTankVisual);
  Object.values(scene.onlineState?.remoteBulletsById || {}).forEach(destroyRemoteBulletVisual);
  Object.values(scene.onlineState?.onlineMissileStrikesById || {}).forEach(destroyOnlineMissileVisual);
  Object.values(scene.onlineState?.effects || {}).forEach(destroyOnlineEffect);
  // Destruir power-up sprites online
  Object.values(scene.onlineState?.onlinePowerUpsById || {}).forEach((pu) => pu.sprite?.destroy());
  Object.values(scene.onlineState?.shieldVisualsByTankId || {}).forEach((visual) => visual?.graphics?.destroy?.());
  scene.onlineState = {
    connectionState: "idle",
    latestSnapshot: null,
    localPlayerId: null,
    localRoleLabel: null,
    remoteTanksById: {},
    remoteBulletsById: {},
    onlineMissileStrikesById: {},
    onlineOptimisticMissileIdsByKey: {},
    handledMissileImpactIds: {},
    serverClockOffsetMs: 0,
    snapshotLatencyMs: 0,
    snapshot: null,
    fireHeld: false,
    localFireLatch: false,
    lastFireSentAt: 0,
    baseVisualsById: {},
    prevDestroyedById: {},
    prevRoundWinnerKey: null,
    lastKnownRound: 1,
    matchOverShown: false,
    menuExitArmed: false,
    overlaySignature: "",
    effects: [],
    onlinePowerUpsById: {},
    shieldVisualsByTankId: {},
  };
  Object.values(scene.onlineState?.baseVisualsById || {}).forEach(destroyOnlineBaseVisual);
  clearEntityCollections(scene);
}

export function loadOnlineMode(scene) {
  scene.clearLevelVisuals();
  teardownOnlineMode(scene);

  const preloadedMatchConfig = readOnlineSession()?.matchConfig || null;
  scene.level = createOnline2v2Level(preloadedMatchConfig || { mapAlgorithm: 0 });
  scene.totalEnemiesForLevel = 0;
  scene.maxConcurrentEnemies = 0;
  scene.spawnedEnemiesCount = 0;
  scene.destroyedEnemiesCount = 0;
  scene.playerLivesRemaining = 0;
  scene.playerTwoLivesRemaining = 0;
  safeSetSceneText(scene.levelText, `Online 2v2 | Ronda 1/${Math.max(1, Number(preloadedMatchConfig?.totalRounds || 6))}`);
  safeSetSceneText(scene.coopText, "Conectando...");
  scene.drawBoard();
  ensureOnlineBases(scene);
  scene.updateWaveText();
  scene.updateLivesText();

  scene.onlineState.connectionState = "conectando";
  scene.onlineState.matchConfig = preloadedMatchConfig;
  scene.onlineClient = createOnlineSocketClient({
    onConnectionStateChange: (state) => {
      scene.onlineState.connectionState = state;
      scene.updateWaveText();
      if (state === "desconectado") {
        safeSetSceneText(scene.coopText, "Online: conexión cerrada");
      }
    },
    onWelcome: (payload) => {
      scene.onlineState.localPlayerId = payload.playerId || null;
      scene.onlineState.localRoleLabel = payload.roleLabel || null;
      scene.onlineState.matchConfig = payload.matchConfig || null;
      updateOnlineSession({ inMatch: true, matchConfig: payload.matchConfig || scene.onlineState.matchConfig || null });
      const rs = payload.roundState;
      if (rs) {
        safeSetSceneText(scene.levelText, `Online 2v2 | Ronda ${rs.currentRound}/${rs.totalRounds}`);
        safeSetSceneText(scene.coopText, `${TEAM_SHORT.team1}: ${rs.scores?.team1 ?? 0}  -  ${TEAM_SHORT.team2}: ${rs.scores?.team2 ?? 0}`);
      } else {
        safeSetSceneText(scene.coopText, `Online: ${payload.roleLabel || "conectado"}`);
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
    const rotation = bullet.angleRad + Math.PI / 2;
    if (bullet.glow?.active) {
      bullet.glow.x = bullet.x;
      bullet.glow.y = bullet.y;
      bullet.glow.rotation = rotation;
    }
    if (bullet.body?.active) {
      bullet.body.x = bullet.x;
      bullet.body.y = bullet.y;
      bullet.body.rotation = rotation;
    }
    if (bullet.core?.active) {
      bullet.core.x = bullet.x;
      bullet.core.y = bullet.y;
      bullet.core.rotation = rotation;
    }
  });

  Object.values(scene.onlineState.onlineMissileStrikesById || {}).forEach((missile) => {
    if (!missile.body?.active) return;
    const renderServerNow = getEstimatedOnlineServerNow(scene.onlineState, Date.now());
    const durationMs = Math.max(1, Number(missile.durationMs || 1));
    const progress = clamp01((renderServerNow - Number(missile.startedAt || 0)) / durationMs);
    const targetWorld = getOnlineMissileTargetWorld(scene, missile);
    missile.endServerX = targetWorld.x;
    missile.endServerY = targetWorld.y;
    const worldX = Number(missile.startServerX || 0) + ((missile.endServerX - Number(missile.startServerX || 0)) * progress);
    const worldY = Number(missile.startServerY || 0) + ((missile.endServerY - Number(missile.startServerY || 0)) * progress);
    missile.x = scene.boardOriginX + worldX;
    missile.y = scene.boardOriginY + worldY;
    missile.angleRad = Math.atan2(missile.endServerY - worldY, missile.endServerX - worldX) || Number(missile.targetAngleRad || missile.angleRad || 0);
    const rotation = missile.angleRad + Math.PI / 2;
    if (missile.glow?.active) {
      missile.glow.x = missile.x;
      missile.glow.y = missile.y;
      missile.glow.rotation = rotation;
    }
    missile.body.x = missile.x;
    missile.body.y = missile.y;
    missile.body.rotation = rotation;
    if (missile.core?.active) {
      missile.core.x = missile.x;
      missile.core.y = missile.y;
      missile.core.rotation = rotation;
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
  checkOnlinePowerUpPickups(scene, delta);
  updateOnlineShieldVisuals(scene, delta);

  const rs = scene.onlineState.snapshot?.roundState;
  const isTransitioning = rs?.transitioning || rs?.matchOver;
  emitOnlineOverlay(scene, buildOnlineOverlay(scene));

  if (rs?.matchOver) {
    const wantsExit = scene.keys.enter?.isDown || scene.keys.space?.isDown || scene.keys.esc?.isDown
      || scene.readPadButtonPressed(0, 0.35, 0)
      || scene.readPadButtonPressed(1, 0.35, 0)
      || scene.readPadButtonPressed(9, 0.35, 0);

    if (wantsExit && !scene.onlineState.menuExitArmed) {
      scene.onlineState.menuExitArmed = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tank-game:return-to-menu"));
      }
    } else if (!wantsExit) {
      scene.onlineState.menuExitArmed = false;
    }
  }

  if (scene.onlineClient?.isConnected?.() && !rs?.matchOver) {
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
