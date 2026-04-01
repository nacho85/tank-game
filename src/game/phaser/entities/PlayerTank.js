import { Bullet } from './Bullet';

export class PlayerTank {
  constructor(scene, x, y) {
    this.scene = scene;
    this.speed = 165;
    this.drag = 900;
    this.maxVelocity = 165;
    this.fireCooldown = 350;
    this.lastFiredAt = 0;
    this.direction = 'up';
    this.hp = 3;

    this.sprite = scene.physics.add.image(x, y, 'playerTank');
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setDamping(false);
    this.sprite.body.setAllowGravity(false);
    this.sprite.setDrag(this.drag, this.drag);
    this.sprite.setMaxVelocity(this.maxVelocity, this.maxVelocity);
    this.sprite.setSize(26, 26);
  }

  update(cursors, keys, time) {
    const up = cursors.up.isDown || keys.w.isDown;
    const down = cursors.down.isDown || keys.s.isDown;
    const left = cursors.left.isDown || keys.a.isDown;
    const right = cursors.right.isDown || keys.d.isDown;

    let vx = 0;
    let vy = 0;

    if (up) {
      vy = -this.speed;
      this.direction = 'up';
      this.sprite.setAngle(0);
    } else if (down) {
      vy = this.speed;
      this.direction = 'down';
      this.sprite.setAngle(180);
    } else if (left) {
      vx = -this.speed;
      this.direction = 'left';
      this.sprite.setAngle(-90);
    } else if (right) {
      vx = this.speed;
      this.direction = 'right';
      this.sprite.setAngle(90);
    }

    this.sprite.setAcceleration(0, 0);

    if (vx !== 0) this.sprite.setVelocityX(vx);
    if (vy !== 0) this.sprite.setVelocityY(vy);

    if (vx === 0) this.sprite.setVelocityX(approachZero(this.sprite.body.velocity.x, 10));
    if (vy === 0) this.sprite.setVelocityY(approachZero(this.sprite.body.velocity.y, 10));

    const wantsToFire = this.scene.fireKey.isDown;
    if (wantsToFire && time - this.lastFiredAt >= this.fireCooldown) {
      this.fire(time);
    }
  }

  fire(time) {
    this.lastFiredAt = time;
    const muzzle = getMuzzlePosition(this.sprite.x, this.sprite.y, this.direction);
    const bullet = new Bullet(this.scene, muzzle.x, muzzle.y, this.direction, 'player', 0xfff3b0);
    this.scene.playerBullets.add(bullet.sprite);
  }

  damage() {
    this.hp -= 1;
    this.sprite.setTint(0xff9999);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite) this.sprite.clearTint();
    });

    if (this.hp <= 0) {
      this.sprite.destroy();
      this.scene.onPlayerDestroyed();
    }
  }
}

function getMuzzlePosition(x, y, direction) {
  switch (direction) {
    case 'up': return { x, y: y - 20 };
    case 'down': return { x, y: y + 20 };
    case 'left': return { x: x - 20, y };
    case 'right':
    default:
      return { x: x + 20, y };
  }
}

function approachZero(value, step) {
  if (Math.abs(value) <= step) return 0;
  return value > 0 ? value - step : value + step;
}
