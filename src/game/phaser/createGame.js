import * as Phaser from "phaser";
import { createGameConfig } from "./config.js";

/**
 * Crea la instancia de Phaser ligada a un contenedor HTML.
 * Se llama desde un componente cliente de React.
 */
export function createTankGame(parentElement) {
  return new Phaser.Game(createGameConfig(parentElement));
}
