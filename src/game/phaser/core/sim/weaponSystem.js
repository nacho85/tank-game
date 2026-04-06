import { BULLET_SPEED, FIRE_COOLDOWN_ENEMY, FIRE_COOLDOWN_PLAYER } from "../../shared/constants.js";

export const DEFAULT_BULLET_MARGIN = 34;

const TINT_BY_OWNER = {
  player:  0xfff3a8,
  player2: 0xfff3a8,
  enemy:   0xfff3a8,
  yellow:  0xfff3a8,
  green:   0xb7ff9f,
  red:     0xffb0b0,
  blue:    0x9fd1ff,
};

export function getWeaponConfigForTankType(ownerType) {
  const isPlayer =
    ownerType === "player"  ||
    ownerType === "player2" ||
    ownerType === "yellow"  ||
    ownerType === "green"   ||
    ownerType === "red"     ||
    ownerType === "blue";

  return {
    cooldownMs:   isPlayer ? FIRE_COOLDOWN_PLAYER : FIRE_COOLDOWN_ENEMY,
    bulletSpeed:  BULLET_SPEED,
    bulletWidth:  14,
    bulletLength: 36,
    hitRadius:    10,
    bulletMargin: DEFAULT_BULLET_MARGIN,
    tint:         TINT_BY_OWNER[ownerType] || 0xfff3a8,
  };
}

/**
 * Crea el estado puro de una bala.
 *
 * @param {object} params
 * @param {string}  params.ownerType
 * @param {string}  [params.ownerId]
 * @param {object}  [params.ownerTank]
 * @param {number}  params.x
 * @param {number}  params.y
 * @param {number}  params.angleRad
 * @param {string}  [params.id]
 * @param {number}  [params.bulletSpeedOverride]  - Si se pasa, sobreescribe la velocidad
 *                                                  default del tipo de tanque. Usado por
 *                                                  los upgrades del player.
 * @param {boolean} [params.canDestroyStone]       - Si true, la bala puede destruir TILE.STEEL.
 *                                                  Propagado desde tank.canDestroyStone.
 */
export function createBulletState({
  ownerType,
  ownerId          = null,
  ownerTank        = null,
  x,
  y,
  angleRad,
  id               = null,
  bulletSpeedOverride = null,
  canDestroyStone  = false,
}) {
  const cfg   = getWeaponConfigForTankType(ownerType);
  const speed = bulletSpeedOverride != null ? bulletSpeedOverride : cfg.bulletSpeed;
  const dirX  = Math.cos(angleRad);
  const dirY  = Math.sin(angleRad);

  return {
    id: id || `bullet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerType,
    ownerId,
    ownerTank,
    x: x + dirX * cfg.bulletMargin,
    y: y + dirY * cfg.bulletMargin,
    xSpeed: dirX * speed,
    ySpeed: dirY * speed,
    width:      cfg.bulletWidth,
    length:     cfg.bulletLength,
    hitRadius:  cfg.hitRadius,
    angleRad,
    tint:       cfg.tint,
    isAlive:    true,
    // ── Capacidades especiales ─────────────────────────────────────────────
    canDestroyStone,
  };
}

export function stepBulletState(bullet, deltaMs) {
  bullet.x += (bullet.xSpeed * deltaMs) / 1000;
  bullet.y += (bullet.ySpeed * deltaMs) / 1000;
  return bullet;
}

export function isBulletOutsideBoard(bullet, bounds, margin = 0) {
  return (
    bullet.x < bounds.minX + margin ||
    bullet.x > bounds.maxX - margin ||
    bullet.y < bounds.minY + margin ||
    bullet.y > bounds.maxY - margin
  );
}
