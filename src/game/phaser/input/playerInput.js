import * as Phaser from "phaser";
import {
  AIM_DEADZONE,
  MENU_AXIS_THRESHOLD,
  MOVE_DEADZONE,
  PLAYER_TURRET_MANUAL_TURN_SPEED,
} from "../shared/constants";
import { bigCellCenterX, bigCellCenterY } from "../shared/levelGeneration";
import { vectorLength } from "../shared/math";
import { computeTankControlStep } from "../core/sim/tankController";

const DEFAULT_BINDINGS = {
  p1MoveUpKeyCode: Phaser.Input.Keyboard.KeyCodes.W,
  p1MoveDownKeyCode: Phaser.Input.Keyboard.KeyCodes.S,
  p1MoveLeftKeyCode: Phaser.Input.Keyboard.KeyCodes.A,
  p1MoveRightKeyCode: Phaser.Input.Keyboard.KeyCodes.D,
  p1AimUpKeyCode: Phaser.Input.Keyboard.KeyCodes.I,
  p1AimDownKeyCode: Phaser.Input.Keyboard.KeyCodes.K,
  p1AimLeftKeyCode: Phaser.Input.Keyboard.KeyCodes.J,
  p1AimRightKeyCode: Phaser.Input.Keyboard.KeyCodes.L,
  p1FireKeyCode: Phaser.Input.Keyboard.KeyCodes.SPACE,
  p2MoveUpKeyCode: Phaser.Input.Keyboard.KeyCodes.UP,
  p2MoveDownKeyCode: Phaser.Input.Keyboard.KeyCodes.DOWN,
  p2MoveLeftKeyCode: Phaser.Input.Keyboard.KeyCodes.LEFT,
  p2MoveRightKeyCode: Phaser.Input.Keyboard.KeyCodes.RIGHT,
  p2AimUpKeyCode: Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
  p2AimDownKeyCode: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
  p2AimLeftKeyCode: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
  p2AimRightKeyCode: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
  p2FireKeyCode: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
  p2JoinKeyCode: Phaser.Input.Keyboard.KeyCodes.P,
};

function getBindingKeyName(slot = 1, action = "MoveUp") {
  return `p${slot}${action}KeyCode`;
}

function getBindingCode(scene, bindingKey) {
  const configured = Number(scene.settings?.[bindingKey]);
  if (!Number.isNaN(configured) && configured > 0) return configured;
  return DEFAULT_BINDINGS[bindingKey] || 0;
}

function isBindingDown(scene, bindingKey) {
  const code = getBindingCode(scene, bindingKey);
  if (!code) return false;
  return !!scene.bindingKeys?.[bindingKey]?.isDown;
}

export function getControlDeviceForSlot(scene, slot = 1) {
  if (slot === 2) {
    return Math.round(scene.settings?.playerTwoControlDevice || 0);
  }
  return Math.round(scene.settings?.playerOneControlDevice || 0);
}

export function isKeyboardControlledSlot(scene, slot = 1) {
  return getControlDeviceForSlot(scene, slot) === 0;
}

export function getGamepadSlotForPlayerSlot(slot = 1) {
  return slot === 2 ? 1 : 0;
}

export function getPlayerKeyboardMoveInput(scene, slot = 1) {
  let x = 0;
  let y = 0;
  if (isBindingDown(scene, getBindingKeyName(slot, "MoveLeft"))) x -= 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "MoveRight"))) x += 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "MoveUp"))) y -= 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "MoveDown"))) y += 1;
  return { x, y };
}

export function getPlayerKeyboardAimInput(scene, slot = 1) {
  let x = 0;
  let y = 0;
  if (isBindingDown(scene, getBindingKeyName(slot, "AimLeft"))) x -= 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "AimRight"))) x += 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "AimUp"))) y -= 1;
  if (isBindingDown(scene, getBindingKeyName(slot, "AimDown"))) y += 1;
  return { x, y };
}

export function getBrowserPads() {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  return Array.from(navigator.getGamepads() || []).filter(
    (pad) => pad && pad.connected
  );
}

export function getPhaserPads(scene) {
  return (scene.input?.gamepad?.gamepads || []).filter(
    (pad) => pad && pad.connected
  );
}

export function getConnectedPads(scene) {
  const phaserPads = getPhaserPads(scene);
  if (phaserPads.length > 0) return phaserPads;
  return getBrowserPads();
}

export function getPadBySlot(scene, slot = 0) {
  return getConnectedPads(scene)[slot] || null;
}

export function readPadAxis(scene, index, slot = 0) {
  const pad = getPadBySlot(scene, slot);
  if (!pad) return 0;

  if (pad.axes && pad.axes[index] !== undefined) {
    const axis = pad.axes[index];
    if (typeof axis === "number") return axis;
    if (axis && typeof axis.getValue === "function") return axis.getValue();
    if (axis && typeof axis.value === "number") return axis.value;
  }

  return 0;
}

export function readPadButtonPressed(scene, index, threshold = 0.35, slot = 0) {
  const pad = getPadBySlot(scene, slot);
  if (!pad || !pad.buttons || !pad.buttons[index]) return false;

  const button = pad.buttons[index];
  if (typeof button === "number") return button > threshold;
  return !!button.pressed || (typeof button.value === "number" && button.value > threshold);
}

export function updatePadStatus(scene) {
  const pads = getConnectedPads(scene);
  if (pads.length === 0) {
    scene.padStatusText.setText("Gamepads: esperando...");
    return;
  }
  const labels = pads.map((pad, index) => `Pad ${index + 1}: ${pad.id || "conectado"}`);
  const deviceInfo = ` · P1=${scene.isKeyboardControlledSlot(1) ? "teclado" : "joystick"} · P2=${scene.isKeyboardControlledSlot(2) ? "teclado" : "joystick"}`;
  scene.padStatusText.setText(labels.join(" | ") + deviceInfo);
}

export function updateCoopText(scene) {
  if (!scene.coopText) return;
  const deviceLabel = scene.isKeyboardControlledSlot(2) ? "teclado" : "START gamepad 2";
  if (scene.playerTwo) {
    scene.coopText.setText(`P2 unido · vidas: ${Math.max(0, scene.playerTwoLivesRemaining || 0)} · control: ${scene.isKeyboardControlledSlot(2) ? "teclado" : "joystick"}`);
    return;
  }
  scene.coopText.setText(`P2: ${scene.isKeyboardControlledSlot(2) ? "pulsa P para unirte" : "pulsa START en gamepad 2 para unirte"} · control: ${deviceLabel}`);
}

export function tryJoinSecondPlayer(scene) {
  const usingKeyboard = scene.isKeyboardControlledSlot(2);
  const joinPressed = usingKeyboard
    ? isBindingDown(scene, "p2JoinKeyCode")
    : scene.readPadButtonPressed(9, 0.35, 1);
  const latchKey = usingKeyboard ? "keyboard-p2" : 1;
  const wasPressed = !!scene.wasPadStartPressed[latchKey];
  scene.wasPadStartPressed[latchKey] = joinPressed;

  if (
    !joinPressed ||
    wasPressed ||
    scene.playerTwo ||
    scene.isGameOver ||
    scene.isTransitioning
  ) {
    return;
  }

  if (scene.playerTwoLivesRemaining <= 0) {
    scene.playerTwoLivesRemaining = scene.getConfiguredStartingLives();
  }

  const spawn = scene.getPlayerSpawnForSlot(2);
  const spawnX = bigCellCenterX(spawn.col, scene.boardOriginX);
  const spawnY = bigCellCenterY(spawn.row, scene.boardOriginY);
  if (!scene.canOccupyWorldPosition(spawnX, spawnY, null)) return;

  scene.createPlayerTwo();
  scene.showMessage("Jugador 2 unido");
}

export function getPlayerMoveInput(scene, tank = scene.player) {
  const slot = tank?.controlSlot || 1;

  if (scene.isKeyboardControlledSlot(slot)) {
    return scene.getPlayerKeyboardMoveInput(slot);
  }

  let x = 0;
  let y = 0;
  const padSlot = scene.getGamepadSlotForPlayerSlot(slot);
  const lx = scene.readPadAxis(0, padSlot);
  const ly = scene.readPadAxis(1, padSlot);

  if (Math.abs(lx) > MOVE_DEADZONE) x = lx;
  if (Math.abs(ly) > MOVE_DEADZONE) y = ly;

  return { x, y };
}

export function getPlayerAimInput(scene, tank = scene.player) {
  const slot = tank?.controlSlot || 1;

  if (scene.isKeyboardControlledSlot(slot)) {
    return scene.getPlayerKeyboardAimInput(slot);
  }

  let x = 0;
  let y = 0;
  const padSlot = scene.getGamepadSlotForPlayerSlot(slot);
  const rx = scene.readPadAxis(2, padSlot);
  const ry = scene.readPadAxis(3, padSlot);

  if (Math.abs(rx) > AIM_DEADZONE) x = rx;
  if (Math.abs(ry) > AIM_DEADZONE) y = ry;

  return { x, y };
}

export function isControlledTankFirePressed(scene, tank) {
  const slot = tank?.controlSlot || 1;
  const padSlot = scene.getGamepadSlotForPlayerSlot(slot);
  const keyboardFire = scene.isKeyboardControlledSlot(slot)
    ? isBindingDown(scene, getBindingKeyName(slot, "Fire"))
    : false;
  const fireDown =
    keyboardFire ||
    scene.readPadButtonPressed(5, 0.35, padSlot) ||
    scene.readPadButtonPressed(7, 0.35, padSlot);
  const continuous = Math.round(scene.settings.playerContinuousFire || 0) === 1;

  if (continuous) {
    return fireDown;
  }

  const limit = scene.getBulletLimitForTank(tank);
  const hasNoBullets = (tank.activeBullets || []).filter((bullet) => bullet?.isAlive).length === 0;

  if (!fireDown) {
    tank.fireLatch = false;
    return false;
  }

  if (!tank.fireLatch) {
    tank.fireLatch = true;
    return true;
  }

  if (limit === 1 && hasNoBullets && tank.shotCooldown <= 0) {
    return true;
  }

  return false;
}

export function updatePlayer(scene, tank, delta) {
  if (!tank) return;

  const moveInput = scene.getPlayerMoveInput(tank);
  const aimInput = scene.getPlayerAimInput(tank);
  const control = computeTankControlStep(
    tank,
    {
      moveX: moveInput.x,
      moveY: moveInput.y,
      aimX: aimInput.x,
      aimY: aimInput.y,
    },
    delta,
    {
      preserveTurretWhenIdle: true,
      fallbackTurretToMove: false,
    }
  );

  if (control.hasMove) {
    const moved = scene.tryMoveTank(tank, control.moveDx, control.moveDy);
    if (moved) {
      tank.moveAngleDeg = control.nextMoveAngleDeg;
    }
  }

  tank.turretAngleRad = control.nextTurretAngleRad;

  scene.updateTankVisuals(tank);

  if (scene.isControlledTankFirePressed(tank)) {
    scene.fireBullet(tank);
  }
}

export function readMenuNavigationIntent(scene) {
  let vertical = 0;
  let horizontal = 0;
  const activated = !!scene.keys.enter?.isDown || !!scene.keys.space?.isDown;

  if (scene.keys.up?.isDown) vertical -= 1;
  if (scene.keys.down?.isDown) vertical += 1;
  if (scene.keys.left?.isDown) horizontal -= 1;
  if (scene.keys.right?.isDown) horizontal += 1;

  const pad = scene.getPadBySlot(0);
  if (pad) {
    const axisY = scene.readPadAxis(1, 0);
    const axisX = scene.readPadAxis(0, 0);
    if (Math.abs(axisY) >= MENU_AXIS_THRESHOLD) vertical = axisY > 0 ? 1 : -1;
    if (Math.abs(axisX) >= MENU_AXIS_THRESHOLD) horizontal = axisX > 0 ? 1 : -1;
  }

  return { vertical, horizontal, activated };
}
