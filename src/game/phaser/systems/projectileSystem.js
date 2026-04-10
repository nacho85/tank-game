import * as Phaser from "phaser";
import {
  FIRE_COOLDOWN_ENEMY,
  FIRE_COOLDOWN_PLAYER,
  MACRO_TILE_SIZE,
  TANK_HIT_RADIUS,
  TILE,
} from "../shared/constants.js";
import {
  bigCellCenterX,
  bigCellCenterY,
  cellCenterX,
  cellCenterY,
  getLevelHeight,
  getLevelWidth,
  inBounds,
  isBaseAnchorCell,
  isBaseFortressCell,
  isDestructibleTile,
  worldToGridCol,
  worldToGridRow,
} from "../shared/levelGeneration.js";
import { vectorLength } from "../shared/math.js";
import { getOnlineBaseDefByAnchor } from "../modes/onlineLevel.js";
import { registerBullet, unregisterBullet } from "../core/state/matchState.js";
import { createBulletState, getWeaponConfigForTankType, stepBulletState } from "../core/sim/weaponSystem.js";
import { showGameOverBanner } from "../ui/hudRenderer.js";

// Desplazamiento perpendicular (px) entre las dos balas del disparo doble.
// Tiene que coincidir con el valor de playerUpgrades si se importa desde allá,
// pero lo dejamos local para no crear dependencia cruzada en este módulo.
const DOUBLE_SHOT_SPREAD_PX = 8;

export function canTankFire(scene, tank) {
  if (tank.shotCooldown > 0) return false;
  tank.activeBullets = (tank.activeBullets || []).filter(
    (bullet) => bullet && bullet.isAlive
  );
  return tank.activeBullets.length < scene.getBulletLimitForTank(tank);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno: instancia UNA bala y la registra en la escena.
//
// perpOffsetPx: desplazamiento perpendicular al ángulo de disparo (px).
//   0  → bala centrada (disparo simple)
//   ±N → balas desplazadas para el disparo doble
// ─────────────────────────────────────────────────────────────────────────────
function spawnOneBullet(scene, tank, angleRad, perpOffsetPx) {
  // Calcular el offset perpendicular al vector de disparo
  const perpAngle = angleRad + Math.PI / 2;
  const ox = Math.cos(perpAngle) * perpOffsetPx;
  const oy = Math.sin(perpAngle) * perpOffsetPx;

  const isPlayer = tank.type === "player" || tank.type === "player2";

  const bulletState = createBulletState({
    ownerType: tank.type,
    ownerTank: tank,
    x: tank.x + ox,
    y: tank.y + oy,
    angleRad,
    // Velocidad override sólo para players con upgrade; enemigos usan su default
    bulletSpeedOverride: isPlayer && tank.bulletSpeed != null ? tank.bulletSpeed : null,
    // canDestroyStone viene del upgrade del player (star 3)
    canDestroyStone: isPlayer ? (tank.canDestroyStone ?? false) : false,
  });

  const bulletSprite = scene.add
    .image(bulletState.x, bulletState.y, "tank-projectile")
    .setDepth(180)
    .setDisplaySize(bulletState.width, bulletState.length)
    .setRotation(bulletState.angleRad + Math.PI / 2)
    .setAlpha(0.98)
    .setTint(bulletState.tint)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.entityLayer.add(bulletSprite);

  const bullet = { ...bulletState, sprite: bulletSprite };
  scene.bullets.push(bullet);
  registerBullet(scene, bullet);
  tank.activeBullets.push(bullet);
}

// ─────────────────────────────────────────────────────────────────────────────
// fireBullet
//
// Para players, respeta tank.fireCooldown, tank.bulletCount y tank.bulletSpeed
// que son seteados por applyPlayerUpgrade() al juntar estrellas.
//
// Para enemigos, la lógica de cooldown es idéntica a antes.
// ─────────────────────────────────────────────────────────────────────────────
export function fireBullet(scene, tank, angleRad = tank?.turretAngleRad) {
  if (!scene.canTankFire(tank)) return;

  const isPlayer = tank.type === "player" || tank.type === "player2";
  const weaponConfig = getWeaponConfigForTankType(tank.type);

  if (isPlayer) {
    // tank.fireCooldown es seteado por el tier de upgrade (playerUpgrades.js)
    tank.shotCooldown = tank.fireCooldown ?? FIRE_COOLDOWN_PLAYER;
  } else {
    tank.shotCooldown = Math.max(
      90,
      Math.round(
        scene.getEnemyBehaviorTuning().enemyShotCooldownMs ||
        FIRE_COOLDOWN_ENEMY ||
        weaponConfig.cooldownMs
      )
    );
  }

  scene.noteCombatShot(tank.type);

  const count = isPlayer ? (tank.bulletCount ?? 1) : 1;
  const bulletAngle = angleRad ?? tank.turretAngleRad;

  if (count >= 2) {
    // Disparo doble: dos balas simétricas perpendiculares al cañón
    spawnOneBullet(scene, tank, bulletAngle, -DOUBLE_SHOT_SPREAD_PX);
    spawnOneBullet(scene, tank, bulletAngle, +DOUBLE_SHOT_SPREAD_PX);
  } else {
    spawnOneBullet(scene, tank, bulletAngle, 0);
  }
}

export function spawnTankHitExplosion(scene, x, y) {
  const explosion = scene.add
    .image(x, y, "tank-explosion")
    .setDepth(260)
    .setAlpha(1)
    .setDisplaySize(80, 80);

  scene.entityLayer.add(explosion);

  scene.tweens.add({
    targets: explosion,
    displayWidth: 110,
    displayHeight: 220,
    alpha: 0.75,
    duration: 400,
    ease: "Cubic.Out",
    onComplete: () => explosion.destroy(),
  });
}

export function removeBulletByIndex(scene, index) {
  const bullet = scene.bullets[index];
  if (!bullet) return;
  bullet.isAlive = false;
  if (bullet.ownerTank?.activeBullets) {
    bullet.ownerTank.activeBullets = bullet.ownerTank.activeBullets.filter(
      (item) => item !== bullet
    );
  }
  if (bullet.id) {
    unregisterBullet(scene, bullet.id);
  }
  bullet.sprite?.destroy();
  scene.bullets.splice(index, 1);
}

export function updateBullets(scene, delta) {
  const bulletsToRemove = new Set();

  scene.bullets.forEach((bullet) => {
    stepBulletState(bullet, delta);
    bullet.sprite.x = bullet.x;
    bullet.sprite.y = bullet.y;
  });

  for (let i = 0; i < scene.bullets.length; i += 1) {
    const bullet = scene.bullets[i];
    if (!bullet || bulletsToRemove.has(i)) continue;

    const col = worldToGridCol(bullet.sprite.x, scene.boardOriginX);
    const row = worldToGridRow(bullet.sprite.y, scene.boardOriginY);

    if (!inBounds(col, row, scene.level)) {
      bulletsToRemove.add(i);
      continue;
    }

    const obstacle = scene.level.obstacles[row][col];
    if (obstacle && obstacle !== TILE.WATER) {
      const fortressProtected = !!scene.activePowerEffects?.shovel && isBaseFortressCell(scene.level, col, row);
      if (isDestructibleTile(obstacle) && !fortressProtected) {
        // Ladrillo: cualquier bala lo destruye
        scene.noteCombatBrickShot(bullet.ownerType);
        scene.level.obstacles[row][col] = null;
        scene.redrawObstacles();
        scene.enemies.forEach((enemy) => scene.clearEnemyNavigationStuckState(enemy));
      } else if (bullet.canDestroyStone && obstacle === TILE.STEEL && !fortressProtected) {
        // Acero/piedra: sólo balas de star-3 lo destruyen
        scene.noteCombatBrickShot(bullet.ownerType);
        scene.level.obstacles[row][col] = null;
        scene.redrawObstacles();
        scene.enemies.forEach((enemy) => scene.clearEnemyNavigationStuckState(enemy));
      } else if (obstacle === TILE.BASE) {
        const baseCenterX = scene.baseSprite?.x ?? bigCellCenterX(col, scene.boardOriginX);
        const baseCenterY = scene.baseSprite?.y ?? bigCellCenterY(row, scene.boardOriginY);
        for (let baseRow = 0; baseRow < getLevelHeight(scene.level); baseRow += 1) {
          for (let baseCol = 0; baseCol < getLevelWidth(scene.level); baseCol += 1) {
            if (scene.level.obstacles[baseRow][baseCol] === TILE.BASE) {
              scene.level.obstacles[baseRow][baseCol] = null;
            }
          }
        }
        scene.redrawObstacles();
        scene.spawnTankHitExplosion(baseCenterX, baseCenterY);
        scene.spawnTankHitExplosion(baseCenterX - 18, baseCenterY + 12);
        scene.spawnTankHitExplosion(baseCenterX + 18, baseCenterY - 10);
        scene.isGameOver = true;
        scene.showMessage("La base fue destruida");
        showGameOverBanner(scene, scene.destroyedEnemiesCount || 0, 1100);
        scene.saveSettings();
        scene.saveCombatStats();
        scene.time.delayedCall(1100, () => scene.scene.restart());
      }

      bulletsToRemove.add(i);
      continue;
    }

    for (let j = i + 1; j < scene.bullets.length; j += 1) {
      const other = scene.bullets[j];
      if (
        !other ||
        bulletsToRemove.has(j) ||
        (bullet.ownerType === "enemy") === (other.ownerType === "enemy")
      ) {
        continue;
      }
      const combinedRadius =
        (bullet.hitRadius || bullet.radius || 0) +
        (other.hitRadius || other.radius || 0);
      if (
        vectorLength(
          bullet.sprite.x - other.sprite.x,
          bullet.sprite.y - other.sprite.y
        ) <= combinedRadius
      ) {
        bulletsToRemove.add(i);
        bulletsToRemove.add(j);
        break;
      }
    }

    if (bulletsToRemove.has(i)) continue;

    if (bullet.ownerType !== "player" && bullet.ownerType !== "player2") {
      const hitPlayerTank = scene.getFriendlyTanks().find((tank) =>
        scene.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, tank, bullet.hitRadius)
      );
      if (hitPlayerTank) {
        bulletsToRemove.add(i);
        scene.noteCombatHit(bullet.ownerType);
        // Escudo activo: la bala se absorbe pero el jugador no recibe daño
        if (!hitPlayerTank.shield) {
          scene.handlePlayerHit(hitPlayerTank);
        }
        continue;
      }
    } else {
      const hitEnemy = scene.enemies.find((enemy) =>
        scene.isBulletNearTank(bullet.sprite.x, bullet.sprite.y, enemy, bullet.hitRadius)
      );

      if (hitEnemy) {
        bulletsToRemove.add(i);
        scene.noteCombatHit(bullet.ownerType);
        if (hitEnemy.isBoss) {
          scene.damageBoss(hitEnemy, 1, bullet.ownerType);
        } else if (hitEnemy.isArmored) {
          // Primer impacto: quitar armadura y soltar poder (no muere)
          scene.removeEnemyArmor(hitEnemy);
        } else {
          scene.handleEnemyDestroyed(hitEnemy, bullet.ownerType);
        }
      }
    }
  }

  [...bulletsToRemove]
    .sort((a, b) => b - a)
    .forEach((index) => {
      scene.removeBulletByIndex(index);
    });
}

export function isBulletNearTank(x, y, tank, bulletHitRadius = 0) {
  if (!tank) return false;
  const hitRadius = tank.isBoss ? TANK_HIT_RADIUS * 1.85 : TANK_HIT_RADIUS;
  return vectorLength(x - tank.x, y - tank.y) < hitRadius + bulletHitRadius;
}

export function redrawObstacles(scene) {
  scene.obstacleLayer.removeAll(true);
  scene.overlayLayer.removeAll(true);
  scene.floorLayer.removeAll(true);
  scene.baseSprite = null;

  const gridHeight = getLevelHeight(scene.level);
  const gridWidth = getLevelWidth(scene.level);

  for (let row = 0; row < gridHeight; row += 1) {
    for (let col = 0; col < gridWidth; col += 1) {
      const x = cellCenterX(col, scene.boardOriginX);
      const y = cellCenterY(row, scene.boardOriginY);
      const floorTile = scene.level.floor[row][col] || TILE.GROUND;
      scene.floorLayer.add(scene.makeTileSprite(floorTile, x, y));
    }
  }

  for (let row = 0; row < gridHeight; row += 1) {
    for (let col = 0; col < gridWidth; col += 1) {
      const obstacle = scene.level.obstacles[row][col];
      if (!obstacle) continue;

      const x = cellCenterX(col, scene.boardOriginX);
      const y = cellCenterY(row, scene.boardOriginY);

      if (obstacle === TILE.BASE) {
        if (isBaseAnchorCell(scene.level, col, row)) {
          scene.baseSprite = scene.add
            .image(
              bigCellCenterX(col, scene.boardOriginX),
              bigCellCenterY(row, scene.boardOriginY),
              "eagle"
            )
            .setDisplaySize(MACRO_TILE_SIZE, MACRO_TILE_SIZE)
            .setDepth(20);
          if (scene.currentGameMode === "online_2v2") {
            const onlineBaseDef = getOnlineBaseDefByAnchor(col, row);
            if (onlineBaseDef) scene.baseSprite.setRotation(onlineBaseDef.spriteRotation || 0);
          }
          scene.obstacleLayer.add(scene.baseSprite);
        }
      } else {
        scene.obstacleLayer.add(scene.makeTileSprite(obstacle, x, y));
      }
    }
  }

  for (let row = 0; row < gridHeight; row += 1) {
    for (let col = 0; col < gridWidth; col += 1) {
      const overlay = scene.level.overlay[row][col];
      if (!overlay) continue;
      const x = cellCenterX(col, scene.boardOriginX);
      const y = cellCenterY(row, scene.boardOriginY);
      const overlaySprite = scene.makeTileSprite(overlay, x, y);
      overlaySprite.setDepth(220);
      scene.overlayLayer.add(overlaySprite);
    }
  }

  scene.rebuildEnemyNavigationField();
}
