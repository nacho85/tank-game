import { TANK_COLLISION_SIZE } from "../shared/constants";
import { getLevelHeight, getLevelWidth, inBounds, isBlockingTile, worldToGridCol, worldToGridRow } from "../shared/levelGeneration";
import { vectorLength } from "../shared/math";

export function tryMoveTank(scene, tank, moveX, moveY) {
  let moved = false;

  if (moveX !== 0) {
    const nextX = tank.x + moveX;
    if (scene.canOccupyWorldPosition(nextX, tank.y, tank)) {
      tank.x = nextX;
      moved = true;
    }
  }

  if (moveY !== 0) {
    const nextY = tank.y + moveY;
    if (scene.canOccupyWorldPosition(tank.x, nextY, tank)) {
      tank.y = nextY;
      moved = true;
    }
  }

  const cell = scene.worldToCell(tank.x, tank.y);
  tank.col = cell.col;
  tank.row = cell.row;

  return moved;
}

export function canOccupyWorldPosition(scene, x, y, movingTank) {
  const half = TANK_COLLISION_SIZE / 2;
  const left = x - half;
  const right = x + half;
  const top = y - half;
  const bottom = y + half;

  const startCol = worldToGridCol(left, scene.boardOriginX);
  const endCol = worldToGridCol(right, scene.boardOriginX);
  const startRow = worldToGridRow(top, scene.boardOriginY);
  const endRow = worldToGridRow(bottom, scene.boardOriginY);

  if (!inBounds(startCol, startRow, scene.level) || !inBounds(endCol, endRow, scene.level)) {
    return false;
  }

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const obstacle = scene.level.obstacles[row][col];
      if (isBlockingTile(obstacle)) {
        return false;
      }
    }
  }

  const others = [...scene.getFriendlyTanks(), ...scene.enemies].filter(
    (tank) => tank && tank !== movingTank
  );

  return !others.some((tank) => {
    const mustRespectOccupancy = !movingTank;
    if (!mustRespectOccupancy && !scene.shouldTanksCollide(movingTank, tank)) {
      return false;
    }
    return vectorLength(x - tank.x, y - tank.y) < TANK_COLLISION_SIZE * 0.82;
  });
}

export function shouldTanksCollide(scene, tankA, tankB) {
  if (!tankB) return false;

  if (!tankA) {
    return true;
  }

  if (tankA?.isBoss || tankB?.isBoss) return false;

  if (tankA.type === "enemy" && tankB.type === "enemy") {
    return Math.round(scene.settings.enemyTankCollision || 0) === 1;
  }
  return true;
}

export function resolveTankOverlaps(scene) {
  if (Math.round(scene.settings.enemyTankCollision || 0) !== 1) return;

  const tanks = [...scene.getFriendlyTanks(), ...scene.enemies].filter(Boolean);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < tanks.length; i += 1) {
      for (let j = i + 1; j < tanks.length; j += 1) {
        const a = tanks[i];
        const b = tanks[j];
        if (!scene.shouldTanksCollide(a, b)) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = vectorLength(dx, dy);
        const minDist = TANK_COLLISION_SIZE * 0.84;
        if (dist >= minDist) continue;

        const dir = dist > 0.001 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
        const push = (minDist - dist) * 0.5;

        const ax = a.x - dir.x * push;
        const ay = a.y - dir.y * push;
        const bx = b.x + dir.x * push;
        const by = b.y + dir.y * push;

        if (scene.canOccupyWorldPosition(ax, ay, a)) {
          a.x = ax;
          a.y = ay;
          const cellA = scene.worldToCell(a.x, a.y);
          a.col = cellA.col;
          a.row = cellA.row;
        }

        if (scene.canOccupyWorldPosition(bx, by, b)) {
          b.x = bx;
          b.y = by;
          const cellB = scene.worldToCell(b.x, b.y);
          b.col = cellB.col;
          b.row = cellB.row;
        }
      }
    }
  }
}

export function worldToCell(scene, x, y) {
  return {
    col: Math.max(0, Math.min(getLevelWidth(scene.level) - 1, worldToGridCol(x, scene.boardOriginX))),
    row: Math.max(0, Math.min(getLevelHeight(scene.level) - 1, worldToGridRow(y, scene.boardOriginY))),
  };
}
