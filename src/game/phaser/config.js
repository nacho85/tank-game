import * as Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./shared/layout";

export function createGameConfig(container) {
  return {
    type: Phaser.AUTO,
    parent: container,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#000000",
    pixelArt: false,
    antialias: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false, gravity: { y: 0 } },
    },
    scene: [GameScene],
  };
}
