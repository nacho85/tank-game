/**
 * playerUpgrades.js
 *
 * Fuente de verdad de los tiers de upgrade del player (por cantidad de estrellas).
 * Cada tier describe:
 *  - qué texturas usar para cuerpo y torreta (por slot 1 o 2)
 *  - comportamiento de disparo: cuántas balas, velocidad, cooldown
 *  - capacidades especiales: canDestroyStone
 *  - opciones de escala/pivot para tankRendering
 *
 * Cómo agregar un nuevo tier: agregar una entrada más al array y
 * las texturas correspondientes al preloader del juego.
 */

import {
  BULLET_SPEED,
  FIRE_COOLDOWN_PLAYER,
  PLAYER_BODY_RING_CENTER,
  PLAYER_TURRET_CAP_CENTER,
} from '../shared/constants';

// Desplazamiento perpendicular (px) entre las dos balas del disparo doble.
export const DOUBLE_SHOT_SPREAD_PX = 8;

/**
 * Devuelve las opciones de sprite base que comparten todos los tiers.
 * Cada tier puede sobreescribir cualquier propiedad.
 */
function baseSpriteOptions(overrides = {}) {
  return {
    bodyMaxFactor: 0.95,
    turretMaxFactor: 1.0,
    turretScaleX: 1,
    turretScaleY: 1,
    turretOffsetX: -3,
    turretOffsetY: 2,
    bodyAnchorPx: PLAYER_BODY_RING_CENTER,
    turretPivotPx: PLAYER_TURRET_CAP_CENTER,
    ...overrides,
  };
}

/**
 * PLAYER_UPGRADE_TIERS[N] = configuración cuando el player tiene N estrellas.
 *
 * bodyKey / turretKey son funciones (slot: 1|2) => string para soportar
 * los dos colores (amarillo / verde) sin duplicar la tabla.
 */
export const PLAYER_UPGRADE_TIERS = [
  // ── Estrella 0 ─ estado inicial ──────────────────────────────────────────
  // Usa las texturas actuales (v2) para no romper nada antes de tener los
  // nuevos assets. Cuando lleguen los de star-0 específicos, cambiar a s0.
  {
    starLevel: 0,
    label: 'Base',
    bodyKey:   (slot) => slot === 2 ? 'player-body-green-v2'   : 'player-body-yellow-v2',
    turretKey: (slot) => slot === 2 ? 'player-turret-green-v2' : 'player-turret-yellow-v2',
    bulletCount:      1,
    bulletSpeed:      BULLET_SPEED,
    // Disparo más lento en el estado base
    fireCooldown:     Math.round(FIRE_COOLDOWN_PLAYER * 1.8),
    canDestroyStone:  false,
    spriteOptions: baseSpriteOptions({
      turretMaxFactor: 0.88, // torreta pequeña
    }),
  },

  // ── Estrella 1 ─ torreta más grande, bala más rápida ────────────────────
  // Misma base que star-0, torreta nueva.
  {
    starLevel: 1,
    label: 'Star 1',
    bodyKey:   (slot) => slot === 2 ? 'player-body-green-v2'   : 'player-body-yellow-v2',
    turretKey: (slot) => slot === 2 ? 'player-turret-green-s1' : 'player-turret-yellow-s1',
    bulletCount:      1,
    bulletSpeed:      Math.round(BULLET_SPEED * 1.2),
    fireCooldown:     FIRE_COOLDOWN_PLAYER,
    canDestroyStone:  false,
    spriteOptions: baseSpriteOptions({
      turretMaxFactor: 1.05, // torreta más grande
    }),
  },

  // ── Estrella 2 ─ nueva base + torreta, disparo doble ────────────────────
  {
    starLevel: 2,
    label: 'Star 2',
    bodyKey:   (slot) => slot === 2 ? 'player-body-green-s2'   : 'player-body-yellow-s2',
    turretKey: (slot) => slot === 2 ? 'player-turret-green-s2' : 'player-turret-yellow-s2',
    bulletCount:      2,
    bulletSpeed:      Math.round(BULLET_SPEED * 1.2),
    fireCooldown:     FIRE_COOLDOWN_PLAYER,
    canDestroyStone:  false,
    spriteOptions: baseSpriteOptions({
      turretMaxFactor: 1.05,
    }),
  },

  // ── Estrella 3 ─ nueva base, bala rápida y simple, destruye piedra ───────
  {
    starLevel: 3,
    label: 'Star 3',
    bodyKey:   (slot) => slot === 2 ? 'player-body-green-s3'   : 'player-body-yellow-s3',
    turretKey: (slot) => slot === 2 ? 'player-turret-green-s3' : 'player-turret-yellow-s3',
    bulletCount:      1,
    bulletSpeed:      Math.round(BULLET_SPEED * 1.45),
    fireCooldown:     FIRE_COOLDOWN_PLAYER,
    canDestroyStone:  true,
    spriteOptions: baseSpriteOptions({
      turretMaxFactor: 1.05,
    }),
  },
];

/**
 * Devuelve el tier correspondiente a la cantidad de estrellas dada.
 * Clampea al rango válido para no romper si starCount es inválido.
 */
export function getUpgradeTier(starCount) {
  const idx = Math.min(
    Math.max(0, Math.floor(starCount)),
    PLAYER_UPGRADE_TIERS.length - 1
  );
  return PLAYER_UPGRADE_TIERS[idx];
}
