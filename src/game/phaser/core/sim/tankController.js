import { AIM_DEADZONE, MOVE_DEADZONE, PLAYER_TURRET_MANUAL_TURN_SPEED } from "../../shared/constants.js";

function vectorLength(x, y) {
  return Math.sqrt((x * x) + (y * y));
}

function normalizeVector(x, y) {
  const len = vectorLength(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function angleDegFromVector(x, y) {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function wrapAngleRad(angle) {
  let result = angle;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function wrapRadDiff(target, current) {
  return wrapAngleRad(target - current);
}

export function computeTankControlStep(tank, input = {}, deltaMs = 16, options = {}) {
  const {
    moveDeadzone = MOVE_DEADZONE,
    aimDeadzone = AIM_DEADZONE,
    turretTurnSpeed = PLAYER_TURRET_MANUAL_TURN_SPEED,
    fallbackTurretToMove = false,
    preserveTurretWhenIdle = true,
  } = options;

  const moveX = Number(input.moveX ?? input.x ?? 0);
  const moveY = Number(input.moveY ?? input.y ?? 0);
  const aimX = Number(input.aimX ?? 0);
  const aimY = Number(input.aimY ?? 0);

  const moveLen = vectorLength(moveX, moveY);
  const aimLen = vectorLength(aimX, aimY);

  const result = {
    moveLen,
    aimLen,
    moveNorm: { x: 0, y: 0 },
    moveAmount: 0,
    moveDx: 0,
    moveDy: 0,
    nextMoveAngleDeg: tank?.moveAngleDeg ?? -90,
    nextTurretAngleRad: tank?.turretAngleRad ?? -Math.PI / 2,
    hasMove: false,
    hasAim: false,
  };

  if (moveLen > moveDeadzone) {
    result.hasMove = true;
    result.moveNorm = normalizeVector(moveX, moveY);
    result.moveAmount = ((tank?.moveSpeed ?? 0) * deltaMs) / 1000;
    result.moveDx = result.moveNorm.x * result.moveAmount;
    result.moveDy = result.moveNorm.y * result.moveAmount;
    result.nextMoveAngleDeg = angleDegFromVector(result.moveNorm.x, result.moveNorm.y);
  }

  let targetTurretAngle = null;
  if (aimLen > aimDeadzone) {
    result.hasAim = true;
    targetTurretAngle = Math.atan2(aimY, aimX);
  } else if (fallbackTurretToMove && result.hasMove) {
    targetTurretAngle = Math.atan2(result.moveNorm.y, result.moveNorm.x);
  }

  if (targetTurretAngle != null) {
    const maxStep = turretTurnSpeed * (deltaMs / 1000);
    const diff = wrapRadDiff(targetTurretAngle, result.nextTurretAngleRad);
    if (Math.abs(diff) <= maxStep) {
      result.nextTurretAngleRad = targetTurretAngle;
    } else {
      result.nextTurretAngleRad = wrapAngleRad(
        result.nextTurretAngleRad + Math.sign(diff) * maxStep
      );
    }
  } else if (!preserveTurretWhenIdle && result.hasMove) {
    result.nextTurretAngleRad = Math.atan2(result.moveNorm.y, result.moveNorm.x);
  }

  return result;
}
