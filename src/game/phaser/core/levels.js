import {
  TILE,
} from "../shared/constants";
import {
  BASE_MACRO_LEVEL,
  expandLevelFromMacro,
  withPattern,
} from "../shared/levelGeneration";

export const LEVELS = [
  expandLevelFromMacro(BASE_MACRO_LEVEL),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles, overlay }) => {
    for (let row = 2; row <= 9; row += 1) {
      obstacles[row][3] = row % 2 === 0 ? TILE.BRICK : TILE.STEEL;
      obstacles[row][9] = row % 2 === 0 ? TILE.BRICK : TILE.STEEL;
    }
    overlay[5][6] = TILE.BUSH;
    overlay[6][6] = TILE.BUSH;
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles }) => {
    for (let col = 2; col <= 10; col += 1) {
      if (col !== 6) {
        obstacles[4][col] = TILE.WATER;
        obstacles[8][col] = TILE.BRICK;
      }
    }
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles, overlay }) => {
    for (let i = 1; i < 12; i += 1) {
      if (i !== 6) {
        obstacles[i][i] = i % 3 === 0 ? TILE.STEEL : TILE.BRICK;
      }
    }
    overlay[3][8] = TILE.BUSH;
    overlay[4][8] = TILE.BUSH;
    overlay[8][3] = TILE.BUSH;
  }),
  withPattern(BASE_MACRO_LEVEL, ({ obstacles }) => {
    for (let row = 2; row <= 10; row += 1) {
      obstacles[row][5] = row % 2 === 0 ? TILE.WATER : TILE.BRICK;
      obstacles[row][7] = row % 2 === 0 ? TILE.WATER : TILE.BRICK;
    }
  }),
];
