import {
  PLAYER_BODY_BASE_FACING_DEG,
  PLAYER_SPEED,
  PLAYER_TURRET_BASE_FACING_RAD,
  TANK_RENDER_SIZE,
} from "../shared/constants";
import { bigCellCenterX, bigCellCenterY, getLevelBaseAnchorRow, getLevelPlayerSpawnCol } from "../shared/levelGeneration";
import { createTankSprite, swapTankSprites, updateTankVisuals } from "../render/tankRendering";
import { registerTank } from "../core/state/matchState";
import { getUpgradeTier } from "../data/playerUpgrades";

export function getPlayerSpawnForSlot(slot = 1, level = null) {
  return { col: getLevelPlayerSpawnCol(level, slot), row: getLevelBaseAnchorRow(level) };
}

export function getFriendlyTanks(scene) {
  return [scene.player, scene.playerTwo].filter(Boolean);
}

export function createPlayerTankForSlot(scene, slot = 1) {
  const spawn = getPlayerSpawnForSlot(slot, scene.level);
  const x = bigCellCenterX(spawn.col, scene.boardOriginX);
  const y = bigCellCenterY(spawn.row, scene.boardOriginY);

  // El tier inicial siempre es estrella 0
  const tier = getUpgradeTier(0);
  const bodyKey   = tier.bodyKey(slot);
  const turretKey = tier.turretKey(slot);

  const spriteParts = createTankSprite(
    scene,
    x,
    y,
    bodyKey,
    turretKey,
    TANK_RENDER_SIZE,
    PLAYER_BODY_BASE_FACING_DEG,
    -90,
    PLAYER_TURRET_BASE_FACING_RAD,
    tier.spriteOptions
  );

  const tank = {
    id: slot === 2 ? "player-2" : "player-1",
    type: slot === 2 ? "player2" : "player",
    controlSlot: slot,
    ...spriteParts,
    x,
    y,
    col: spawn.col,
    row: spawn.row,
    moveAngleDeg: -90,
    turretAngleRad: -Math.PI / 2,
    moveSpeed: PLAYER_SPEED,
    shotCooldown: 0,
    activeBullets: [],
    fireLatch: false,

    // ── Upgrade state ───────────────────────────────────────────────────────
    // La lógica de disparo lee siempre de estas propiedades.
    // Un upgrade sólo necesita modificarlas + llamar a swapTankSprites.
    starCount:       0,
    bulletCount:     tier.bulletCount,
    bulletSpeed:     tier.bulletSpeed,
    fireCooldown:    tier.fireCooldown,
    canDestroyStone: tier.canDestroyStone,
  };

  updateTankVisuals(scene, tank);

  if (slot === 2) {
    scene.playerTwo = tank;
    scene.playerTwoJoined = true;
  } else {
    scene.player = tank;
  }

  registerTank(scene, tank, {
    id: tank.id,
    type: tank.type,
    controlSlot: tank.controlSlot,
  });

  scene.updateLivesText();
  scene.updateCoopText();
  return tank;
}

export function createPlayer(scene) {
  return createPlayerTankForSlot(scene, 1);
}

export function createPlayerTwo(scene) {
  return createPlayerTankForSlot(scene, 2);
}

/**
 * Aplica el upgrade correspondiente a `starCount` sobre un tank player ya existente.
 *
 * Actualiza:
 *  - Sprites de cuerpo y torreta (en caliente, sin destruir el container de Phaser)
 *  - Stats de disparo: bulletCount, bulletSpeed, fireCooldown, canDestroyStone
 *  - tank.starCount para poder consultar el nivel actual desde cualquier lugar
 *
 * Uso típico (desde GameScene o quien maneje el pickup de estrella):
 *
 *   import { applyPlayerUpgrade } from '../factories/playerFactory';
 *   applyPlayerUpgrade(scene, scene.player, scene.player.starCount + 1);
 *
 * @param {Phaser.Scene} scene
 * @param {object}       tank       - Tank state del player
 * @param {number}       starCount  - Nuevo nivel de estrellas (0-3)
 */
export function applyPlayerUpgrade(scene, tank, starCount) {
  if (!tank) return;

  const tier = getUpgradeTier(starCount);

  // 1. Stats de disparo
  tank.starCount       = tier.starLevel;
  tank.bulletCount     = tier.bulletCount;
  tank.bulletSpeed     = tier.bulletSpeed;
  tank.fireCooldown    = tier.fireCooldown;
  tank.canDestroyStone = tier.canDestroyStone;

  // 2. Intercambiar sprites (puede ser solo la torreta, solo el cuerpo, o ambos)
  const bodyKey   = tier.bodyKey(tank.controlSlot);
  const turretKey = tier.turretKey(tank.controlSlot);
  swapTankSprites(scene, tank, bodyKey, turretKey, TANK_RENDER_SIZE, tier.spriteOptions);
}
