import * as Phaser from "phaser";

export function createTankSprite(
  scene,
  x,
  y,
  bodyKey,
  turretKey,
  displaySize,
  bodyBaseFacingDeg,
  initialBodyFacingDeg,
  turretBaseFacingRad,
  options = {}
) {
  const {
    bodyMaxFactor = 1.06,
    turretMaxFactor = 1.02,
    bodyAnchorPx = null,
    turretPivotPx = null,
    turretScaleX = 1,
    turretScaleY = 1,
    turretOffsetX = 0,
    turretOffsetY = 0,
  } = options;

  const container = scene.add.container(x, y).setDepth(140);

  const body = scene.add.image(0, 0, bodyKey);
  const bodyTexture = scene.textures.get(bodyKey).getSourceImage();
  const bodyMaxSize = displaySize * bodyMaxFactor;
  const bodyScale = Math.min(
    bodyMaxSize / bodyTexture.width,
    bodyMaxSize / bodyTexture.height
  );
  body.setScale(bodyScale);
  body.angle = initialBodyFacingDeg - bodyBaseFacingDeg;

  const turret = scene.add.image(0, 0, turretKey);
  const turretTexture = scene.textures.get(turretKey).getSourceImage();
  const turretMaxSize = displaySize * turretMaxFactor;
  const turretScale = Math.min(
    turretMaxSize / turretTexture.width,
    turretMaxSize / turretTexture.height
  );
  turret.setScale(turretScale * turretScaleX, turretScale * turretScaleY);

  if (turretPivotPx) {
    turret.setOrigin(
      turretPivotPx.x / turretPivotPx.w,
      turretPivotPx.y / turretPivotPx.h
    );
  } else {
    turret.setOrigin(0.5, 0.5);
  }

  let bodyAnchorLocalX = 0;
  let bodyAnchorLocalY = 0;

  if (bodyAnchorPx) {
    bodyAnchorLocalX = (bodyAnchorPx.x - bodyAnchorPx.w / 2) * bodyScale;
    bodyAnchorLocalY = (bodyAnchorPx.y - bodyAnchorPx.h / 2) * bodyScale;
  }

  turret.x = bodyAnchorLocalX + turretOffsetX;
  turret.y = bodyAnchorLocalY + turretOffsetY;

  container.add([body, turret]);
  scene.entityLayer.add(container);

  return {
    container,
    body,
    turret,
    bodyBaseFacingDeg,
    turretBaseFacingRad,
    bodyAnchorLocalX,
    bodyAnchorLocalY,
    turretOffsetX,
    turretOffsetY,
  };
}

export function updateTankVisuals(scene, tank) {
  tank.container.x = tank.x;
  tank.container.y = tank.y;

  const bodyRotationDeg = tank.moveAngleDeg - tank.bodyBaseFacingDeg;
  tank.body.angle = bodyRotationDeg;

  const bodyRotationRad = Phaser.Math.DegToRad(bodyRotationDeg);
  const cos = Math.cos(bodyRotationRad);
  const sin = Math.sin(bodyRotationRad);

  const localX = tank.bodyAnchorLocalX * cos - tank.bodyAnchorLocalY * sin;
  const localY = tank.bodyAnchorLocalX * sin + tank.bodyAnchorLocalY * cos;

  let extraTurretOffsetX = 0;
  let extraTurretOffsetY = 0;

  const bodyFacingUp =
    Math.abs(Phaser.Math.Angle.Wrap(bodyRotationRad + Math.PI / 2)) < 0.001;
  const turretFacingUp =
    Math.abs(Phaser.Math.Angle.Wrap(tank.turretAngleRad + Math.PI / 2)) < 0.001;

  if ((tank.type === "player" || tank.type === "player2") && bodyFacingUp && turretFacingUp) {
    extraTurretOffsetX = scene.settings.playerTurretUpExtraOffsetX;
    extraTurretOffsetY = scene.settings.playerTurretUpExtraOffsetY;
  }

  tank.turret.x = localX + (tank.turretOffsetX || 0) + extraTurretOffsetX;
  tank.turret.y = localY + (tank.turretOffsetY || 0) + extraTurretOffsetY;
  tank.turret.rotation = tank.turretAngleRad - tank.turretBaseFacingRad;
}

/**
 * Intercambia las texturas de cuerpo y torreta de un tank existente en caliente,
 * actualizando escala y pivot sin destruir ni recrear el container de Phaser.
 *
 * Se llama desde applyPlayerUpgrade() cuando el player sube de estrella.
 *
 * @param {Phaser.Scene} scene
 * @param {object}       tank        - Tank state object (debe tener .body, .turret, etc.)
 * @param {string}       bodyKey     - Nueva texture key para el cuerpo
 * @param {string}       turretKey   - Nueva texture key para la torreta
 * @param {number}       displaySize - Tamaño de render en px (normalmente TANK_RENDER_SIZE)
 * @param {object}       options     - Mismas opciones que createTankSprite
 */
export function swapTankSprites(scene, tank, bodyKey, turretKey, displaySize, options = {}) {
  const {
    bodyMaxFactor = 1.06,
    turretMaxFactor = 1.02,
    bodyAnchorPx = null,
    turretPivotPx = null,
    turretScaleX = 1,
    turretScaleY = 1,
    turretOffsetX = 0,
    turretOffsetY = 0,
  } = options;

  // ── Cuerpo ──────────────────────────────────────────────────────────────
  tank.body.setTexture(bodyKey);
  const bodyTexture = scene.textures.get(bodyKey).getSourceImage();
  const bodyMaxSize = displaySize * bodyMaxFactor;
  const bodyScale = Math.min(
    bodyMaxSize / bodyTexture.width,
    bodyMaxSize / bodyTexture.height
  );
  tank.body.setScale(bodyScale);

  // Recalcular anchor local para que la torreta siga centrada
  let bodyAnchorLocalX = 0;
  let bodyAnchorLocalY = 0;
  if (bodyAnchorPx) {
    bodyAnchorLocalX = (bodyAnchorPx.x - bodyAnchorPx.w / 2) * bodyScale;
    bodyAnchorLocalY = (bodyAnchorPx.y - bodyAnchorPx.h / 2) * bodyScale;
  }
  tank.bodyAnchorLocalX = bodyAnchorLocalX;
  tank.bodyAnchorLocalY = bodyAnchorLocalY;

  // ── Torreta ─────────────────────────────────────────────────────────────
  tank.turret.setTexture(turretKey);
  const turretTexture = scene.textures.get(turretKey).getSourceImage();
  const turretMaxSize = displaySize * turretMaxFactor;
  const turretScale = Math.min(
    turretMaxSize / turretTexture.width,
    turretMaxSize / turretTexture.height
  );
  tank.turret.setScale(turretScale * turretScaleX, turretScale * turretScaleY);

  if (turretPivotPx) {
    tank.turret.setOrigin(
      turretPivotPx.x / turretPivotPx.w,
      turretPivotPx.y / turretPivotPx.h
    );
  } else {
    tank.turret.setOrigin(0.5, 0.5);
  }

  // Persistir offsets en el tank para que updateTankVisuals los use
  tank.turretOffsetX = turretOffsetX;
  tank.turretOffsetY = turretOffsetY;

  // Forzar un redibujado inmediato para que no haya un frame con la vieja textura
  updateTankVisuals(scene, tank);
}
