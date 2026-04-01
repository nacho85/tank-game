import * as Phaser from "phaser";

export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const minDistance = r1 + r2;
  return (dx * dx) + (dy * dy) <= (minDistance * minDistance);
}

export function sanitizePresetName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 28);
}

export function createEmptyCombatStats() {
  return {
    player1: { shots: 0, hits: 0, kills: 0, deaths: 0, brickShots: 0 },
    player2: { shots: 0, hits: 0, kills: 0, deaths: 0, brickShots: 0 },
    enemies: { shots: 0, hits: 0, kills: 0, deaths: 0, brickShots: 0 },
    totals: { shots: 0, hits: 0, kills: 0, deaths: 0, brickShots: 0 },
  };
}

export function cloneCombatStats(stats) {
  const source = stats || createEmptyCombatStats();
  return JSON.parse(JSON.stringify(source));
}

export function vectorLength(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function normalizeVector(x, y) {
  const len = vectorLength(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function angleDegFromVector(x, y) {
  return Phaser.Math.RadToDeg(Math.atan2(y, x));
}

export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function wrapRadDiff(target, current) {
  return Phaser.Math.Angle.Wrap(target - current);
}
