import * as Phaser from "phaser";
import { MACRO_TILE_SIZE, TILE } from "../shared/constants";
import {
  cellCenterX,
  cellCenterY,
  getLevelHeight,
  getLevelWidth,
  applyBaseFortressToFineLevel,
} from "../shared/levelGeneration";
import { vectorLength } from "../shared/math";
import { applyPlayerUpgrade } from "../factories/playerFactory";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
export const POWER_TYPE = {
  SHOVEL:   "shovel",
  SHIELD:   "shield",
  TANK:     "tank",
  STAR:     "star",
  CLOCK:    "clock",
  MISSILES: "missiles",
};

const ALL_POWER_TYPES = Object.values(POWER_TYPE);
const POWER_PICKUP_RADIUS   = 38;   // px
const POWER_DURATION_MS     = 12000;
const POWER_FLICKER_AT_MS   = 2000; // tiempo restante al que empieza a titilar
const POWER_FLICKER_STEP_MS = 500;
export const SPAWN_SHIELD_DURATION_MS = 3000;

// Colores arco iris para el tanque blindado
const ARMOR_COLORS = [
  0xff0000, 0xff6600, 0xffff00, 0x00ff00,
  0x00ffff, 0x0066ff, 0x9900ff, 0xff00ff,
];

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización
// ─────────────────────────────────────────────────────────────────────────────
export function initPowerUpState(scene) {
  scene.powerUps         = [];
  scene.activePowerEffects = {};   // keyed by effectId
}

// ─────────────────────────────────────────────────────────────────────────────
// Armadura de tanques (survival: tanques 4, 11, 18, 25… cada 7)
// ─────────────────────────────────────────────────────────────────────────────
export function makeEnemyArmored(scene, enemy) {
  if (!enemy || enemy.isArmored) return;
  enemy.isArmored = true;
  enemy._armorColorIndex = 0;

  enemy._armorTimer = scene.time.addEvent({
    delay: 130,
    repeat: -1,
    callback: () => {
      if (!enemy.isArmored || !enemy.body?.active) return;
      const color = ARMOR_COLORS[enemy._armorColorIndex % ARMOR_COLORS.length];
      enemy.body?.setTint(color);
      enemy.turret?.setTint(color);
      enemy._armorColorIndex += 1;
    },
  });
}

export function removeEnemyArmor(scene, enemy) {
  if (!enemy) return;
  enemy.isArmored = false;
  enemy._armorTimer?.remove(false);
  enemy._armorTimer = null;
  enemy.body?.clearTint();
  enemy.turret?.clearTint();

  // Spawn power-up en posición válida del mapa
  spawnRandomPowerUp(scene);
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de posición válida (no agua, no bloqueo)
// ─────────────────────────────────────────────────────────────────────────────
function getRandomValidPosition(scene) {
  const level = scene.level;
  if (!level) return null;
  const height = getLevelHeight(level);
  const width  = getLevelWidth(level);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const col = Math.floor(Math.random() * width);
    const row = Math.floor(Math.random() * height);
    const obstacle = level.obstacles[row]?.[col];
    if (obstacle !== null && obstacle !== undefined) continue; // tile bloqueante
    // Evitar zona cercana a la base (últimas 3 filas)
    if (row >= height - 3) continue;
    return {
      col,
      row,
      x: cellCenterX(col, scene.boardOriginX),
      y: cellCenterY(row, scene.boardOriginY),
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawning de power-ups
// ─────────────────────────────────────────────────────────────────────────────
export function spawnRandomPowerUp(scene, forcedType = null) {
  const type = forcedType || ALL_POWER_TYPES[Math.floor(Math.random() * ALL_POWER_TYPES.length)];
  return spawnPowerUpAt(scene, type);
}

const ITEM_DURATION_MS     = 12000;
const ITEM_FLICKER_AT_MS   = 2000;  // titila cuando quedan 2 s (segundo 10 de 12)
const ITEM_FLICKER_STEP_MS = 200;

export function spawnPowerUpAt(scene, type) {
  const pos = getRandomValidPosition(scene);
  if (!pos) return null;
  return spawnPowerUpAtPosition(scene, type, pos.x, pos.y);
}

export function spawnPowerUpAtPosition(scene, type, x, y) {
  if (x == null || y == null) return null;

  const sprite = scene.add
    .image(x, y, `power-${type}`)
    .setDisplaySize(MACRO_TILE_SIZE * 0.85, MACRO_TILE_SIZE * 0.85)
    .setDepth(230)
    .setAlpha(1);

  (scene.pickupLayer || scene.entityLayer).add(sprite);

  // Animación flotante
  scene.tweens.add({
    targets: sprite,
    y: y - 7,
    duration: 700,
    ease: "Sine.InOut",
    yoyo: true,
    repeat: -1,
  });

  const powerUp = {
    id:            `pu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    x,
    y,
    sprite,
    timeRemaining: ITEM_DURATION_MS,
    flickerTimer:  0,
    flickerVisible: true,
  };

  scene.powerUps.push(powerUp);
  return powerUp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop principal: detección de pickup + actualización de efectos
// ─────────────────────────────────────────────────────────────────────────────
export function updatePowerUps(scene, delta) {
  if (!scene.powerUps?.length && !Object.keys(scene.activePowerEffects || {}).length) return;

  const players     = scene.getFriendlyTanks();
  const toRemoveIdx = [];

  scene.powerUps?.forEach((pu, idx) => {
    // ── Tiempo de vida del ítem ────────────────────────────────────────────
    pu.timeRemaining -= delta;

    if (pu.timeRemaining <= 0) {
      // Expiró sin que nadie lo recoja
      pu.sprite?.destroy();
      toRemoveIdx.push(idx);
      return;
    }

    // Titilar en los últimos 2 s (a partir del segundo 10)
    if (pu.timeRemaining <= ITEM_FLICKER_AT_MS) {
      pu.flickerTimer += delta;
      if (pu.flickerTimer >= ITEM_FLICKER_STEP_MS) {
        pu.flickerTimer  = 0;
        pu.flickerVisible = !pu.flickerVisible;
        pu.sprite?.setVisible(pu.flickerVisible);
      }
    }

    // ── Colisión con jugador ───────────────────────────────────────────────
    for (const player of players) {
      if (vectorLength(player.x - pu.x, player.y - pu.y) < POWER_PICKUP_RADIUS) {
        applyPowerUp(scene, player, pu.type);
        pu.sprite?.destroy();
        toRemoveIdx.push(idx);
        break;
      }
    }
  });

  // Eliminar en orden inverso para no desplazar índices
  toRemoveIdx.reverse().forEach((i) => scene.powerUps.splice(i, 1));

  // Actualizar efectos activos
  updateActiveEffects(scene, delta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar poder al tanque que lo recogió
// ─────────────────────────────────────────────────────────────────────────────
function applyPowerUp(scene, player, type) {
  scene.showMessage(`¡Poder: ${type.charAt(0).toUpperCase() + type.slice(1)}!`);

  switch (type) {
    case POWER_TYPE.SHOVEL:   applyShovel(scene);          break;
    case POWER_TYPE.SHIELD:   applyShield(scene, player);  break;
    case POWER_TYPE.TANK:     applyTankLife(scene, player);break;
    case POWER_TYPE.STAR:     applyStarUpgrade(scene, player); break;
    case POWER_TYPE.CLOCK:    applyClock(scene);            break;
    case POWER_TYPE.MISSILES: applyMissiles(scene, player); break;
    default: break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOVEL – base con acero durante 12 s
// ─────────────────────────────────────────────────────────────────────────────
function applyShovel(scene) {
  // Cancelar efecto previo si existía
  const prev = scene.activePowerEffects.shovel;
  if (prev) {
    prev.flickerEvent?.remove(false);
  }

  applyBaseFortressToFineLevel(scene.level, TILE.STEEL);
  scene.redrawObstacles();

  const effect = {
    timeRemaining: POWER_DURATION_MS,
    flickerState:  true,   // true = acero visible
    flickerEvent:  null,
  };
  scene.activePowerEffects.shovel = effect;
}

function updateShovelEffect(scene, delta) {
  const effect = scene.activePowerEffects.shovel;
  if (!effect) return;

  effect.timeRemaining -= delta;

  if (effect.timeRemaining <= 0) {
    effect.flickerEvent?.remove(false);
    applyBaseFortressToFineLevel(scene.level, TILE.BRICK);
    scene.redrawObstacles();
    delete scene.activePowerEffects.shovel;
    return;
  }

  // Titilar en los últimos 2 segundos
  if (effect.timeRemaining <= POWER_FLICKER_AT_MS) {
    if (!effect.flickerEvent) {
      effect.flickerEvent = scene.time.addEvent({
        delay: POWER_FLICKER_STEP_MS,
        repeat: -1,
        callback: () => {
          if (!scene.activePowerEffects.shovel) return;
          effect.flickerState = !effect.flickerState;
          applyBaseFortressToFineLevel(scene.level, effect.flickerState ? TILE.STEEL : TILE.BRICK);
          scene.redrawObstacles();
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIELD – escudo protector 12 s
// ─────────────────────────────────────────────────────────────────────────────
export function applyShield(scene, player, durationMs = POWER_DURATION_MS, options = {}) {
  const { flickerOnExpire = true } = options;
  const effectKey = `shield_${player.id}`;
  const prev = scene.activePowerEffects[effectKey];
  if (prev) {
    prev.graphics?.destroy();
  }

  player.shield = true;

  const graphics = scene.add.graphics().setDepth(200);
  scene.entityLayer.add(graphics);

  const effect = {
    player,
    timeRemaining: durationMs,
    flickerTimer:  0,
    flickerVisible: true,
    flickerOnExpire,
    phase: 0,
    graphics,
  };
  scene.activePowerEffects[effectKey] = effect;

  drawShield(graphics, player.x, player.y, effect.phase);
}

function drawShieldSmokeRibbon(graphics, x, y, radiusX, radiusY, startAngle, endAngle, color, alpha, thickness, drift = 0) {
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

function drawShield(graphics, x, y, phase = 0) {
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
  drawShieldSmokeRibbon(graphics, x, y, outerRadiusX, outerRadiusY, outerRotation + 0.2, outerRotation + 1.4, 0x7bd8ff, 0.9, 3.2, phase * 0.6);
  drawShieldSmokeRibbon(graphics, x, y, outerRadiusX * 1.02, outerRadiusY * 0.98, outerRotation + 2.2, outerRotation + 3.15, 0x7bd8ff, 0.78, 3.8, phase * 0.85);
  drawShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.98, outerRadiusY * 1.03, outerRotation + 4.05, outerRotation + 5.25, 0x7bd8ff, 0.9, 3.4, phase * 0.5);
  drawShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.92, outerRadiusY * 0.9, outerRotation + 0.55, outerRotation + 1.05, 0xc7f1ff, 0.34, 7.2, phase * 0.95);
  drawShieldSmokeRibbon(graphics, x, y, outerRadiusX * 0.9, outerRadiusY * 0.88, outerRotation + 3.8, outerRotation + 4.4, 0xc7f1ff, 0.3, 7.6, phase * 1.1);

  drawShieldSmokeRibbon(graphics, x, y, innerRadiusX, innerRadiusY, innerRotation + 0.55, innerRotation + 1.7, 0xdaf6ff, 0.64, 2.8, phase * 0.7);
  drawShieldSmokeRibbon(graphics, x, y, innerRadiusX * 1.05, innerRadiusY * 0.94, innerRotation + 3.0, innerRotation + 4.1, 0xdaf6ff, 0.54, 2.9, phase * 0.9);
  drawShieldSmokeRibbon(graphics, x, y, innerRadiusX * 0.95, innerRadiusY * 1.02, innerRotation + 5.0, innerRotation + 5.75, 0xdaf6ff, 0.52, 2.8, phase * 0.6);
  drawShieldSmokeRibbon(graphics, x, y, innerRadiusX * 0.84, innerRadiusY * 0.84, innerRotation + 1.95, innerRotation + 2.55, 0xffffff, 0.18, 5.2, phase * 1.2);

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

function updateShieldEffect(scene, effectKey, delta) {
  const effect = scene.activePowerEffects[effectKey];
  if (!effect) return;

  effect.timeRemaining -= delta;

  if (effect.timeRemaining <= 0) {
    effect.player.shield = false;
    effect.graphics?.destroy();
    delete scene.activePowerEffects[effectKey];
    return;
  }

  // Titilar últimos 2 s
  if (effect.flickerOnExpire && effect.timeRemaining <= POWER_FLICKER_AT_MS) {
    effect.flickerTimer += delta;
    if (effect.flickerTimer >= POWER_FLICKER_STEP_MS) {
      effect.flickerTimer = 0;
      effect.flickerVisible = !effect.flickerVisible;
    }
  }

  if (effect.player?.x != null) {
    if (effect.flickerVisible) {
      effect.phase = (effect.phase || 0) + (delta / 1000) * 2.4;
      drawShield(effect.graphics, effect.player.x, effect.player.y, effect.phase);
    } else {
      effect.graphics.clear();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TANK – vida extra
// ─────────────────────────────────────────────────────────────────────────────
function applyTankLife(scene, player) {
  const slot = player.controlSlot || 1;
  if (slot === 2) {
    scene.playerTwoLivesRemaining = Math.max(0, scene.playerTwoLivesRemaining || 0) + 1;
  } else {
    scene.playerLivesRemaining = Math.max(0, scene.playerLivesRemaining || 0) + 1;
  }
  scene.updateLivesText();
  scene.updateCoopText?.();
}

// ─────────────────────────────────────────────────────────────────────────────
// STAR – upgrade de estrella
// ─────────────────────────────────────────────────────────────────────────────
function applyStarUpgrade(scene, player) {
  const current = player.starCount ?? 0;
  if (current >= 3) return; // ya en máximo
  applyPlayerUpgrade(scene, player, current + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOCK – congela enemigos 12 s
// ─────────────────────────────────────────────────────────────────────────────
function applyClock(scene) {
  const prev = scene.activePowerEffects.clock;
  if (prev) {
    // Ya congelado, solo reiniciar timer
    prev.timeRemaining = POWER_DURATION_MS;
    prev.flickerTimer  = 0;
    prev.flickerVisible = true;
    return;
  }

  // Congelar todos los enemigos actuales (no boss)
  scene.enemies?.forEach((e) => {
    if (!e.isBoss) e.frozen = true;
  });

  const effect = {
    timeRemaining:  POWER_DURATION_MS,
    flickerTimer:   0,
    flickerVisible: true,
  };
  scene.activePowerEffects.clock = effect;
}

function updateClockEffect(scene, delta) {
  const effect = scene.activePowerEffects.clock;
  if (!effect) return;

  effect.timeRemaining -= delta;

  if (effect.timeRemaining <= 0) {
    // Descongelar
    scene.enemies?.forEach((e) => {
      e.frozen = false;
      e.container?.setVisible(true);
    });
    delete scene.activePowerEffects.clock;
    return;
  }

  // Titilar últimos 2 s
  if (effect.timeRemaining <= POWER_FLICKER_AT_MS) {
    effect.flickerTimer += delta;
    if (effect.flickerTimer >= POWER_FLICKER_STEP_MS) {
      effect.flickerTimer  = 0;
      effect.flickerVisible = !effect.flickerVisible;
      scene.enemies?.forEach((e) => {
        if (e.frozen && !e.isBoss) {
          e.container?.setVisible(effect.flickerVisible);
        }
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MISSILES – misiles hacia todos los enemigos visibles
// ─────────────────────────────────────────────────────────────────────────────
function applyMissiles(scene, player) {
  const targets = (scene.enemies || []).filter((e) => !e.isBoss);
  if (!targets.length) return;

  targets.forEach((enemy, index) => {
    scene.time.delayedCall(index * 80, () => {
      if (!enemy || !scene.enemies?.includes(enemy)) return;
      fireMissile(scene, player, enemy);
    });
  });
}

function fireMissile(scene, fromTank, enemy) {
  if (!enemy || !scene.enemies?.includes(enemy)) return;

  const startX = fromTank.x;
  const startY = fromTank.y;
  const dx = enemy.x - startX;
  const dy = enemy.y - startY;
  const angle = Math.atan2(dy, dx);
  const speed = 760; // px/s

  // Visual del misil
  const missile = scene.add
    .image(startX, startY, "tank-projectile")
    .setDisplaySize(10, 28)
    .setRotation(angle + Math.PI / 2)
    .setTint(0xff6600)
    .setDepth(190);
  scene.entityLayer.add(missile);

  // Partículas de humo (círculos pequeños que aparecen cada cierto tiempo)
  const smokeTimer = scene.time.addEvent({
    delay: 60,
    repeat: -1,
    callback: () => {
      if (!missile.active) return;
      const smoke = scene.add
        .circle(missile.x + (Math.random() - 0.5) * 6, missile.y + (Math.random() - 0.5) * 6, 5, 0x888888, 0.5)
        .setDepth(185);
      scene.entityLayer.add(smoke);
      scene.tweens.add({
        targets: smoke,
        alpha: 0,
        scaleX: 2.5,
        scaleY: 2.5,
        duration: 350,
        onComplete: () => smoke.destroy(),
      });
    },
  });

  const flightTimer = scene.time.addEvent({
    delay: 16,
    repeat: -1,
    callback: () => {
      if (!missile.active) return;
      if (!enemy || !scene.enemies?.includes(enemy)) {
        smokeTimer.remove(false);
        flightTimer.remove(false);
        missile.destroy();
        return;
      }

      const targetDx = enemy.x - missile.x;
      const targetDy = enemy.y - missile.y;
      const dist = Math.sqrt((targetDx * targetDx) + (targetDy * targetDy)) || 1;
      const step = speed * (16 / 1000);
      const move = Math.min(step, dist);
      missile.x += (targetDx / dist) * move;
      missile.y += (targetDy / dist) * move;
      missile.rotation = Math.atan2(targetDy, targetDx) + Math.PI / 2;

      if (dist <= 14) {
        smokeTimer.remove(false);
        flightTimer.remove(false);
        missile.destroy();
        if (scene.enemies?.includes(enemy)) {
          scene.spawnTankHitExplosion(enemy.x, enemy.y);
          scene.handleEnemyDestroyed(enemy, "player");
        }
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Actualización centralizada de todos los efectos activos
// ─────────────────────────────────────────────────────────────────────────────
function updateActiveEffects(scene, delta) {
  updateShovelEffect(scene, delta);
  updateClockEffect(scene, delta);

  // Escudos (pueden ser varios: P1 y P2)
  Object.keys(scene.activePowerEffects || {}).forEach((key) => {
    if (key.startsWith("shield_")) {
      updateShieldEffect(scene, key, delta);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Limpiar power-ups al reiniciar el nivel / modo
// ─────────────────────────────────────────────────────────────────────────────
export function cleanupPowerUps(scene) {
  scene.powerUps?.forEach((pu) => pu.sprite?.destroy());
  scene.powerUps = [];

  // Cancelar efectos activos
  const effects = scene.activePowerEffects || {};

  if (effects.shovel) {
    effects.shovel.flickerEvent?.remove(false);
    // Restaurar ladrillos al limpiar
    if (scene.level) {
      applyBaseFortressToFineLevel(scene.level, TILE.BRICK);
    }
  }

  if (effects.clock) {
    scene.enemies?.forEach((e) => {
      e.frozen = false;
      e.container?.setVisible(true);
    });
  }

  Object.keys(effects).forEach((key) => {
    if (key.startsWith("shield_")) {
      effects[key].player && (effects[key].player.shield = false);
      effects[key].graphics?.destroy();
    }
  });

  scene.activePowerEffects = {};
}
