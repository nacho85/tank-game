import * as Phaser from 'phaser';
import { Bullet } from './Bullet';

const DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * Enemigo básico: se mueve en línea recta, cambia de dirección al azar
 * cada cierto tiempo o cuando choca, y dispara en intervalos simples.
 */
export class EnemyTank {
  constructor(scene, x, y) {
    this.scene = scene;
    this.speed = 100;
    this.direction = Phaser.Math.RND.pick(DIRECTIONS);
    this.lastTurnAt = 0;
    this.turnInterval = Phaser.Math.Between(700, 1500);
    this.lastFiredAt = 0;
    this.fireCooldown = Phaser.Math.Between(900, 1600);

    this.sprite = scene.physics.add.image(x, y, 'enemyTank');
    this.sprite.setCollideWorldBounds(true);
    this.sprite.body.setAllowGravity(false);
    this.sprite.setSize(26, 26);
    this.sprite.setData('enemyRef', this);

    this.applyDirection();
  }

  update(time) {
    if (!this.sprite || !this.sprite.body) return;

    if (time - this.lastTurnAt >= this.turnInterval) {
      this.chooseNewDirection();
      this.lastTurnAt = time;
      this.turnInterval = Phaser.Math.Between(700, 1500);
    }

    if (time - this.lastFiredAt >= this.fireCooldown) {
      this.fire(time);
    }
  }

  chooseNewDirection() {
    this.direction = Phaser.Math.RND.pick(DIRECTIONS);
    this.applyDirection();
  }

  applyDirection() {
    if (!this.sprite?.body) return;

    const velocity = getVelocityFromDirection(this.direction, this.speed);
    this.sprite.setVelocity(velocity.x, velocity.y);

    switch (this.direction) {
      case 'up':
        this.sprite.setAngle(0);
        break;
      case 'down':
        this.sprite.setAngle(180);
        break;
      case 'left':
        this.sprite.setAngle(-90);
        break;
      case 'right':
      default:
        this.sprite.setAngle(90);
        break;
    }
  }

  fire(time) {
    if (!this.sprite?.active) return;

    this.lastFiredAt = time;
    this.fireCooldown = Phaser.Math.Between(900, 1600);

    const muzzle = getMuzzlePosition(this.sprite.x, this.sprite.y, this.direction);
    const bullet = new Bullet(this.scene, muzzle.x, muzzle.y, this.direction, 'enemy', 0xffaaaa);
    this.scene.enemyBullets.add(bullet.sprite);
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}

function getVelocityFromDirection(direction, speed) {
  switch (direction) {
    case 'up':
      return { x: 0, y: -speed };
    case 'down':
      return { x: 0, y: speed };
    case 'left':
      return { x: -speed, y: 0 };
    case 'right':
    default:
      return { x: speed, y: 0 };
  }
}

function getMuzzlePosition(x, y, direction) {
  switch (direction) {
    case 'up':
      return { x, y: y - 20 };
    case 'down':
      return { x, y: y + 20 };
    case 'left':
      return { x: x - 20, y };
    case 'right':
    default:
      return { x: x + 20, y };
  }
}
