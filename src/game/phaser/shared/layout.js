import { BOARD_HEIGHT, BOARD_WIDTH, SURVIVAL_BOARD_HEIGHT, SURVIVAL_BOARD_WIDTH } from "./constants.js";

export const GAME_WIDTH = Math.max(BOARD_WIDTH, SURVIVAL_BOARD_WIDTH);
export const GAME_HEIGHT = Math.max(BOARD_HEIGHT, SURVIVAL_BOARD_HEIGHT);
export const PAGE_PADDING = 20;
export const UI_RESERVED_HEIGHT = 40;
export const MIN_SCALE = 0.35;

export function computeGameViewport(win = typeof window !== "undefined" ? window : null) {
  if (!win) return { width: GAME_WIDTH, height: GAME_HEIGHT };

  const availableWidth = Math.max(320, win.innerWidth - PAGE_PADDING * 2);
  const availableHeight = Math.max(320, win.innerHeight - UI_RESERVED_HEIGHT);
  const scale = Math.max(MIN_SCALE, Math.min(availableWidth / GAME_WIDTH, availableHeight / GAME_HEIGHT));

  return {
    width: Math.floor(GAME_WIDTH * scale),
    height: Math.floor(GAME_HEIGHT * scale),
  };
}
