export class Base {
  constructor(scene, x, y) {
    this.scene = scene;
    this.hp = 3;

    this.sprite = scene.physics.add.staticImage(x, y, 'base');
    this.sprite.setData('baseRef', this);
  }

  damage() {
    this.hp -= 1;
    this.sprite.setTint(0xff8888);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite) this.sprite.clearTint();
    });

    if (this.hp <= 0) {
      this.scene.onBaseDestroyed();
    }
  }
}
