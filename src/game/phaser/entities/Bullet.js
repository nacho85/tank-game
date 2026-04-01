export class Bullet {
  constructor(scene, x, y, direction, owner, color = 0xffff99) {
    this.scene = scene;
    this.owner = owner;
    this.direction = direction;
    this.speed = 280;

    this.sprite = scene.physics.add.image(x, y, 'bullet');
    this.sprite.setTint(color);
    this.sprite.setData('bulletRef', this);
    this.sprite.body.setAllowGravity(false);
    this.sprite.setSize(8, 8);

    const velocity = getVelocityFromDirection(direction, this.speed);
    this.sprite.setVelocity(velocity.x, velocity.y);
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
    case 'up': return { x: 0, y: -speed };
    case 'down': return { x: 0, y: speed };
    case 'left': return { x: -speed, y: 0 };
    case 'right':
    default:
      return { x: speed, y: 0 };
  }
}
