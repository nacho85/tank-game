import * as Phaser from "phaser";
import { createGameConfig } from "./config";

/**
 * Crea la instancia de Phaser montada en el contenedor que llega desde React.
 */
export function createGame(parent) {
  return new Phaser.Game(createGameConfig(parent));
}
