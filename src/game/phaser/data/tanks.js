/**
 * Tanques base. Por ahora sólo se usa `scout`, pero esto ya deja la puerta
 * abierta a una meta-progresión posterior.
 */
export const TANK_DEFS = {
  scout: {
    id: 'scout',
    label: 'Scout',
    moveSpeed: 180,
    acceleration: 1100,
    drag: 1000,
    maxHealth: 3,
    fireCooldown: 320,
    bulletSpeed: 380,
    color: 0x4dabf7,
    unlockCost: 0,
  },
  heavy: {
    id: 'heavy',
    label: 'Heavy',
    moveSpeed: 140,
    acceleration: 900,
    drag: 900,
    maxHealth: 5,
    fireCooldown: 500,
    bulletSpeed: 320,
    color: 0xf59f00,
    unlockCost: 25,
  },
};
