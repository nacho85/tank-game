import { TILE } from "../shared/constants";
import {
  BASE_MACRO_LEVEL,
  expandLevelFromMacro,
  makeMatrix,
  makeMacroMatrix,
  withPattern,
} from "../shared/levelGeneration";

export const BOSS_CLASSIC_LEVELS = [
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

// Creates a level using the 26×26 fine grid directly (1 char = 1 tile = 41px).
// Characters: '=' road, 'b' brick, 's' steel, 'w' water, '*' bush, '.' plain ground.
function createFineLevel(layoutRows) {
  const floor = makeMatrix(TILE.GROUND);
  const overlay = makeMatrix(null);
  const obstacles = makeMatrix(null);

  layoutRows.forEach((rowPattern, row) => {
    rowPattern.split("").forEach((cell, col) => {
      if (cell === "=") { floor[row][col] = TILE.ROAD; return; }
      if (cell === "b") { obstacles[row][col] = TILE.BRICK; return; }
      if (cell === "s") { obstacles[row][col] = TILE.STEEL; return; }
      if (cell === "w") { obstacles[row][col] = TILE.WATER; return; }
      if (cell === "*") { overlay[row][col] = TILE.BUSH; }
    });
  });

  // Enemy spawn cols (fine): match macro cols 1, 6, 11 × 2
  [2, 12, 22].forEach((col) => {
    floor[0][col] = TILE.ROAD;
    floor[0][col + 1] = TILE.ROAD;
    overlay[0][col] = null;
    overlay[0][col + 1] = null;
  });

  // Player spawn road lanes at rows 24-25
  [8, 9, 16, 17].forEach((col) => {
    floor[24][col] = TILE.ROAD;
    floor[25][col] = TILE.ROAD;
    overlay[24][col] = null;
    overlay[25][col] = null;
  });

  // Base protection bricks (fine coords — mirrors macro createClassic80sLevel × 2)
  [
    [22, 10], [22, 11], [22, 12], [22, 13], [22, 14], [22, 15],
    [23, 10], [23, 11], [23, 12], [23, 13], [23, 14], [23, 15],
    [24, 10], [24, 11],                     [24, 14], [24, 15],
    [25, 10], [25, 11],                     [25, 14], [25, 15],
  ].forEach(([r, c]) => {
    obstacles[r][c] = TILE.BRICK;
    overlay[r][c] = null;
  });

  // Clear player spawn obstacles
  [8, 9, 16, 17].forEach((col) => {
    obstacles[24][col] = null;
    obstacles[25][col] = null;
  });

  // Eagle BASE (2×2 fine tiles)
  obstacles[24][12] = TILE.BASE;
  obstacles[24][13] = TILE.BASE;
  obstacles[25][12] = TILE.BASE;
  obstacles[25][13] = TILE.BASE;

  return { floor, overlay, obstacles };
}

function createClassic80sLevel(layoutRows) {
  const floor = makeMacroMatrix(TILE.GROUND);
  const overlay = makeMacroMatrix(null);
  const obstacles = makeMacroMatrix(null);
  const baseCol = 6;
  const baseRow = 12;
  const spawnCols = [1, 6, 11];

  layoutRows.forEach((rowPattern, row) => {
    rowPattern.split("").forEach((cell, col) => {
      if (cell === "=") {
        floor[row][col] = TILE.ROAD;
        return;
      }

      if (cell === "b") {
        obstacles[row][col] = TILE.BRICK;
        return;
      }

      if (cell === "s") {
        obstacles[row][col] = TILE.STEEL;
        return;
      }

      if (cell === "w") {
        obstacles[row][col] = TILE.WATER;
        return;
      }

      overlay[row][col] = TILE.BUSH;
    });
  });

  spawnCols.forEach((col) => {
    floor[0][col] = TILE.ROAD;
    overlay[0][col] = null;
  });

  for (let row = 0; row < baseRow; row += 1) {
    floor[row][baseCol] = TILE.ROAD;
    overlay[row][baseCol] = null;
  }

  floor[baseRow][4] = TILE.ROAD;
  floor[baseRow][8] = TILE.ROAD;
  overlay[baseRow][4] = null;
  overlay[baseRow][8] = null;

  [
    { col: baseCol - 1, row: baseRow - 1 },
    { col: baseCol, row: baseRow - 1 },
    { col: baseCol + 1, row: baseRow - 1 },
    { col: baseCol - 1, row: baseRow },
    { col: baseCol + 1, row: baseRow },
  ].forEach(({ col, row }) => {
    obstacles[row][col] = TILE.BRICK;
    overlay[row][col] = null;
  });

  obstacles[baseRow][baseCol] = TILE.BASE;
  obstacles[baseRow][4] = null;
  obstacles[baseRow][8] = null;

  return expandLevelFromMacro({ floor, overlay, obstacles });
}

export const CLASSIC_80S_LEVELS = [
  createFineLevel([
    // 26 chars per row — each char is one 41px fine tile
    // Battle City Level 1 layout at native 26×26 resolution
    "==========================", // rows 0-1: 4 brick clusters (top)
    "==========================",
    "==bb..bb==bb..bb==bb..bb==", // rows 2-3: 4 brick clusters (2nd block row)
    "==bb..bb==bb..bb==bb..bb==",
    "==bb..bb==bb..bb==bb..bb==", // rows 4-5: open horizontal corridor
    "==bb..bb==bbssbb==bb..bb==",
    "==bb..bb==bbssbb==bb..bb==", // rows 6-7: side bricks only
    "==bb..bb==bb..bb==bb..bb==",
    "==bb..bb==......==bb..bb==", // rows 8-9: 4 brick clusters
    "==bb..bb==......==bb..bb==",
    "==========bb==bb==========", // rows 10-11: center bricks only
    "==========bb==bb==========",
    "bb..bbbb==......==bbbb..bb", // rows 12-13: side bricks only
    "ss..bbbb==......==bbbb..ss",
    "........==bb..bb==........", // rows 14-15: 4 brick clusters
    "........==bbbbbb==........",
    "..bb..bb==bbbbbb==bb..bb..", // rows 16-17: center bricks only
    "..bb..bb==bb..bb==bb..bb..",
    "..bb..bb==bb..bb==bb..bb..", // rows 18-19: 4 brick clusters
    "..bb..bb==bb..bb==bb..bb..",
    "..bb..bb==========bb..bb..", // rows 20-21: side bricks + steel at center
    "..bb..bb==========bb..bb..",
    "..bb..bb==......==bb..bb..", // rows 22-23: base approach
    "..bb..bb==......==bb..bb..",
    "........==......==........", // rows 24-25: base area (auto-placed by code)
    "........==......==........",
  ]),
  createFineLevel([
    // Battle City Level 2 approximation at native 26×26 resolution
    "======ss======ss==========",
    "======ss======ss==========",
    "..bb==ss==....bb==bb..bb==",
    "..bb==ss==....bb==bb..bb==",
    "..bb======..bbbb==bbssbb==",
    "..bb======..bbbb==bbssbb==",
    "......bb==========ss======",
    "......bb==========ss======",
    "**....bb==..ss....bb**bbss",
    "**....bb==..ss....bb**bbss",
    "****....==bb....ss==**....",
    "****....==bb....ss==**....",
    "..bbbbbb******ss====**bb..",
    "..bbbbbb******ss====**bb..",
    "......ss**bb..bb==bb..bb..",
    "......ss**bb..bb==bb..bb..",
    "ssbb..ss==bb..bb==....bb..",
    "ssbb..ss==bb..bb==....bb..",
    "..bb..bb==bbbbbb==bbssbb..",
    "..bb..bb==bbbbbb==bbssbb..",
    "..bb..bb==bbbbbb==........",
    "..bb..bb==......==........",
    "..bb....==......==bb..bb..",
    "..bb....==......==bb..bb..",
    "..bb..bb==......==bbbbbb..",
    "..bb..bb==......==bbbbbb..",
  ]),
  createFineLevel([
    // Battle City Level 3 approximation at native 26×26 resolution
    "========bb======bb========",
    "========bb======bb========",
    "..******bb==......==......",
    "..******bb==......==ssssss",
    "bb******..==....====......",
    "bb******..==....====......",
    "********====..bb==bbbbbbb.",
    "********====..bb==bbbbbbb.",
    "********bbbbbbbb==bb...b..",
    "********bbbbbb..==bb...b..",
    "********....bb..====...b..",
    "********....bb..====...b..",
    "..**==......ssssss==..**..",
    "..**======..ssssss==..**..",
    "....==============********",
    "..bb==bb.=========********",
    "bbb==bbbb..bbbbbbb********",
    "bbb==bbbb..b......********",
    "...=======bb......********",
    "...=======bb..bbbb********",
    "bb....s.==....bbbb******..",
    "bb....s.==========******..",
    "bbbb..s.==========******..",
    "bbbb..s.==......==******..",
    "ssbbbb..==......==bb......",
    "ssbbbb..==......==bb......",
  ]),
  createFineLevel([
    // Battle City Level 4 approximation at native 26×26 resolution
    "..****................**..",
    "..****................**..",
    "****......bbbb..........**",
    "****....bbbbbbbbbb......**",
    "**.....bbbbbbbbbbbbb....ss",
    "**.....bbbbbbbbbbbbbbb....",
    "ss....bbbbbbbbbbbbbbbbb..",
    "......bbbbbbbbbbbbbbbbb...",
    ".....bbb......bbbbbb..b...",
    ".....b..........bbbb..b..",
    "ww...b..s...s...bbb.......",
    "ww...b..s...s...bbb.......",
    "....bb..........bbb...wwww",
    "....bb..bbbb....bbb...wwww",
    "....bbbbbbbbbbbbbbbb......",
    "....bbbbbbbbbbbbbbbb......",
    "...bbbbbbbbbbbbbbbbbb.....",
    "...bbbbbbbbbbbbbbbbbb.....",
    "..bbbbbbbbbbbbbbbbbbbb....",
    "......bbbbbbbbbbbb........",
    "..bbbb..bbbbbbbb..bbbb..**",
    "..bbbbbb.........bbbbb..**",
    "**..bbbb.........bbb..****",
    "**....................****",
    "ss**................****ss",
    "ss**................****ss",
  ]),
  createFineLevel([
    // Battle City Level 5 approximation at native 26×26 resolution
    "........bbbb..............",
    "........bbbb..............",
    "........bb......ssssss....",
    "ss..bb..bb..........ss....",
    "ss..bb......bb............",
    "ss..bb......bb............",
    "bb..bbbbbb..bbbb..wwww..ww",
    "bb..bbbbbb..bbbb..wwww..ww",
    "bb......bb........ww......",
    "..................ww......",
    "........wwww..wwwwww..bbbb",
    "....bb..wwww..wwwwww..bbbb",
    "bbbb....wwbb..bbb.........",
    "bbbb....wwbb..bbb.........",
    "........ww...........ss...",
    "........ww...........ss...",
    "wwwwww..ww..ss..bb...s....",
    "wwwwww..ww..ss..bb...s....",
    ".....................sbbbb",
    "......bbbb...........sbbbb",
    "........bbbbbbbbbb........",
    "........bb......bbbb......",
    "bbbbbb............bbbb....",
    "bbbb................bb....",
    "bb........................",
    "..........................",
  ]),
  createFineLevel([
    // Battle City Level 6 approximation at native 26×26 resolution
    "..............b.****......",
    "..............b.****......",
    "..b..s..b........b**b..b**",
    "..b..s..b........b**b..b**",
    "..b..s..b...bb...b**b..b**",
    "..b..s..b...bb...b**b..b**",
    "..bb....bb..ss..bb**..bb**",
    "..bb....bb..ss..bb**..bb**",
    ".......bss..bb..bbs...****",
    "bbbbb..b....bb....s...****",
    "bbbbb.....**bb**.....bbbbb",
    "..........**bb**.....bbbbb",
    ".........b******b.........",
    ".........b******b.........",
    "ssbbbb..bb******bb.bbbbbss",
    "ssbbbb....******...bbbbbss",
    "ssssss......**......ssssss",
    "........bb..**..bb........",
    "..bb....bb......bb........",
    "..bb....bb......bb........",
    "..bbb.........bb.....bbb**",
    "..bbb................bbb**",
    "....bb..............******",
    "....................******",
    "......................****",
    "....bb..............bb****",
  ]),
  createFineLevel([
    // Battle City Level 7 approximation at native 26x26 resolution
    "..............ssss........",
    "..........................",
    "....ssssssss........ss....",
    "....ss..............ss....",
    "....ss......**..ssssss....",
    "....ss......**....ssss....",
    "..ss......**ss......ss....",
    "..ss......**ss......ss....",
    "........**ssss......ssss..",
    "........**ssss........ss..",
    "..ss..**ssssss..ss........",
    "..ss..**ssssss..ss........",
    "...s..ssss......ssss......",
    "...s..ssss......ssss......",
    "........s...ssssss.....s..",
    "............ssssss.....s..",
    "...sss......ssss**....ss..",
    "...sss......ssss**....ss..",
    "..ss........ss**......ss..",
    "..ss........ss**....ssss..",
    "..ssssss....**....ss......",
    "......ss....**....ss......",
    "..................ss....ss",
    "......................ssss",
    "..........................",
    "ssss......................",
  ]),
  createFineLevel([
    // Battle City Level 8 approximation at native 26x26 resolution
    "....bb....bb......bb......",
    "....bb....bb..bb..bb......",
    "**bbbbbb..bb......bbb.....",
    "**bbbbbb..bb..ss..bbb.....",
    "******....bb..bb..bb...bb.",
    "******........bb...... bb.",
    "**wwwwwwwwwwwwwwwwwwww..ww",
    "**wwwwwwwwwwwwwwwwwwww..ww",
    "..bb......................",
    "..bb........bbbb..........",
    "....bb.....bbbbbbbbbbbssss",
    "....bb.....bbbbb..bb......",
    "bbbb..bb...bbbbb**bb....bb",
    "bbbb..bb...bbbbb**bbssssbb",
    "......ss......********....",
    "......ss..ss..********....",
    "wwww..wwwwwwwwww..wwwwwwww",
    "wwww..wwwwwwwwww..wwwwwwww",
    "****...b..................",
    "****...b....bbbb..........",
    "****bb..b......b......bb..",
    "****bb..b......b..ssbbbb..",
    "**..bb..b.........bb..bb..",
    "**ssbb..b.............bb..",
    "......................bb..",
    "..................bb......",
  ]),
  createFineLevel([
    // Battle City Level 9 approximation at native 26x26 resolution
    "......bb............**....",
    "......bb..........ss**....",
    "bb............**.ssss...bb",
    "bb..........ss**.ssss...bb",
    "........**.ssss...ss**....",
    "......ss**.ssss.....**....",
    ".....ssss...ss**..........",
    ".....ssss.....**..........",
    "......ss**................",
    "........**................",
    "......**..**..**..**......",
    "......**ss**..**ss**......",
    "ssbb...ssss....ssss...bbss",
    "ssbb...ssss....ssss...bbss",
    "......**ss**..**ss**......",
    "......**..**..**..**......",
    "..........................",
    "........ss......ss........",
    "bb.....ssss....ssss.....bb",
    "bb.....ssss....ssss.....bb",
    "bb....**ss**..**ss**....bb",
    "bb....**..**..**..**....bb",
    "..........................",
    "....bb..............bb....",
    "....bbbb..........bbbb....",
    "....bbbb..........bbbb....",
  ]),
  createFineLevel([
    // Battle City Level 10 approximation at native 26x26 resolution
    "..........................",
    "..........................",
    "...bbbbb............bbbbb.",
    "...b..bb............bb..b.",
    ".bbb....bb..****..bb.....b",
    ".b......bb..****..bb.....b",
    "bb......bb********bb.....b",
    "bb......bb********bb.....b",
    "bb.....bbb**ssss**bbb...bb",
    "bb.....bbb**ssss**bbb...bb",
    ".b....bbwwwwwwwwwwwwbbbbbb",
    ".bbbbbbbwwwwwwwwwwwwbbbbbb",
    "..bbbbbbssssbbssssbbbbbbb.",
    "..bbbbbbssssbbssssbbbbbbb.",
    "....bbbbss==bb==ssbbbbb...",
    "....bbbbss==bb==ssbbbbb...",
    "....bbbbbbbbbbbbbbbbbbb...",
    "....bbbbbbbbbbbbbbbbbbb...",
    "bb**bbbbbbssssbbbbbbbb**bb",
    "bb**......ssss........**bb",
    "bb**********************bb",
    "bb**********************bb",
    "..******........********..",
    "..******........********..",
    "....b...............b.....",
    "....b...............b.....",
  ]),
  createFineLevel([
    // Battle City Level 11 approximation at native 26x26 resolution
    "..........ss..bb..bbbb....",
    "..........ss..bb..bbbb....",
    "...bbbbbbbbb..bb..........",
    "...bbbbbbbbb..bb..........",
    "......b...bb..bbbb..******",
    "......b...bb..bbbb..******",
    "...b..........ss..********",
    "...b..........ss..********",
    "...b..bbbbbbssbbbb****bbss",
    "...b..bbbbbbssbbbb****..ss",
    "..bbbbbbss....bb..****...b",
    "........ss....bb..****...b",
    ".bbbbbbb..ss**********....",
    ".bbbbbbb..ss**********....",
    "......ss....**********bb..",
    "......ss....**********bb..",
    "ssbb..********ss******bb..",
    "ssbb..********ss******bb..",
    ".bbb**********.......bbbb.",
    ".bbb**********.......bbbb.",
    "..bb****........ssbbbbbb..",
    "..bb****..........bbbbbb..",
    "....****..........bb...b..",
    "....****..........bb...b..",
    "....****..................",
    "..bb****..................",
  ]),
  createFineLevel([
    // Battle City Level 12 approximation at native 26x26 resolution
    "..............bbbbbb......",
    "..............bbbbbb......",
    "..bbbbbb..........bb......",
    "..bbbbbbbb........bb......",
    "........bb..bb........bbbb",
    "........bb............bbbb",
    "..wwwwwwwwww..bbb.....bbss",
    "..wwwwwwwwww..bbb.....bb..",
    "..........ww..bb..sss.bb..",
    "....ssssssww..bb..sss.bb..",
    "bb..bbbbbbwwwwww..wwbbbb..",
    "bb..bbbbbbwwwwww..wwbbbb..",
    "........ssww......wwss....",
    "........ssww......ww......",
    "wwwwww..wwwwbbbb..ww......",
    "wwwwww..wwwwbbbb..ww......",
    "..........bbssss..wwwwww..",
    "..........bb......wwwwww..",
    "bbbbbb....................",
    "bbbbbb....................",
    "....bb..ssss......bbbb...b",
    "....bb............bbbb...b",
    "bb................bb....bb",
    "bb................bb....bb",
    "..........................",
    "..........................",
  ]),
  createFineLevel([
    // Battle City Level 13 approximation at native 26x26 resolution
    "..........................",
    "........bb......bb........",
    "..bbbbbbbb......bbbbbbbb..",
    "..bbbbbbbb......bbbbbbbb..",
    "..bb........bb........ss..",
    "..bb........bb........ss..",
    "..ss..bbbb......bbbb..bbbb",
    "..ss..bb..........bb..bbbb",
    "..bb..b.**..ss..**.b..ssbb",
    "..bb..b.**ssssss**.b..ssbb",
    "........**********....ssbb",
    "bb......**********......bb",
    "bbss....**********......bb",
    "bbss....**********....bbbb",
    "bbss..b.**ssssss**.b..bb..",
    "bbss..b.**..ss..**.b..bb..",
    "bbbb..bb..........bb..ss..",
    "bbbb..bbbb......bbbb..ss..",
    "bbss........bb........bb..",
    "bbss........bb........bb..",
    "bbbbbbbbb........bbbbbssss",
    "bbbbbbbbb........bbbbbssss",
    "bbbb...bb........bb...bb..",
    "bbbb..................bb..",
    "bbbb......................",
    "bbbb......................",
  ]),
  createFineLevel([
    // Battle City Level 14 approximation at native 26x26 resolution
    "..........................",
    "..........................",
    "****......bbbbbb......****",
    "****....bbbbbbbbbb....****",
    "**.....bbbbbbbbbbbb.....**",
    "**.....bbbbbbbbbbbb.....**",
    "......bbbb**bb**bbbb......",
    "......bbbb**bb**bbbb......",
    "......bb****bb****bb......",
    "......bb****bb****bb......",
    "**....bbbbbbbbbbbbbb....**",
    "**....bbbbbbbbbbbbbb....**",
    "****....bb**bb**bb....****",
    "****....bb**bb**bb....****",
    "wwwwww..bbbbbbbbbb..wwwwww",
    "wwwwww..bbbbbbbbbb..wwwwww",
    ".........b.b.b.b.b........",
    ".........b.b.b.b.b........",
    "........b.b.b.b.b.........",
    "........b.b.b.b.b.........",
    ".s.s.s..............s.s.s.",
    ".s.s.s..............s.s.s.",
    "b.b.b................b.b.b",
    "b.b.b................b.b.b",
    "s.s.s..s..........s..s.s.s",
    "s.s.s..s..........s..s.s.s",
  ]),
  createFineLevel([
    // Battle City Level 15 approximation at native 26x26 resolution
    "........bbbb....bb........",
    "........bbbb....bb........",
    "..****bbbb......bb........",
    "..****bbbb......bb........",
    "****************bbbb......",
    "****************bbbb......",
    "**ssbb**bbbbbb********bbss",
    "**..bb**bbbbbb********bbss",
    "****bb******ss****bbs.bb..",
    "****bb******..****bbs.bb..",
    "..****bb..********bb..bb..",
    "..****bbss********bb..bb..",
    "..bbbbbbbbbb****bbbbb.****",
    "..bbbbbbbbbb****bbbbb.****",
    ".sssbbbb......bbbb......**",
    ".s..bbbb......bb........**",
    "..bb..bb......bb****bbb.**",
    "..bb..bb..ssbb..****bbb.**",
    "..bb.....bbbbb****bb....**",
    "..bb.....bbb..****bb....**",
    "..bbbbb..bbb****..**bb****",
    "..bbbbb..b..****bb**bb****",
    "....bb..**......bb**bb**..",
    "....bb..**......bb**..**..",
    "....bb............******..",
    "..................******..",
  ]),
  createFineLevel([
    // Battle City Level 16 approximation at native 26x26 resolution
    "..........................",
    "..........................",
    "....ss**ss................",
    "....ss**ss................",
    "......**..**..............",
    "......**..**ss............",
    "..**........**............",
    "..**........**bb..........",
    "..****....**..**..........",
    "..****....**..**ss........",
    "..**..**..**....**........",
    "..**..**..**....**bb......",
    "..**....**......****......",
    "..**....**......****ss....",
    "....**........********....",
    "....**........********bb..",
    "......**....**..********..",
    "......**....**..********..",
    "bb..........**....******ss",
    "bb..........**....******ss",
    "bbbb..........**..********",
    "bbbb..........**..********",
    "ssbbbb..........**..******",
    "ssbbbb..........**..******",
    "ssssbbbb........**....****",
    "ssssbbbb........**....****",
  ]),
  createFineLevel([
    // Level 17 bonus: FINAL written in bricks
    "**************************",
    "**************************",
    "**************************",
    "**************************",
    "******bbbbbb**bb**********",
    "******bb******bb**********",
    "******bb******bb**********",
    "******bbbbb***bb**********",
    "******bb******bb**********",
    "******bb******bb**********",
    "******bb******bb**********",
    "**************************",
    "**bb**bb**bbbbbb**bbwwwwww",
    "**bb**bb**bbbbbb**bbwwwwww",
    "**bbb*bb**bbwwbb**bbwwwwww",
    "**bbbbbb**bbbbbb**bbwwwwww",
    "**bbbbbb**bb**bb**bbwwwwww",
    "**bb*bbb**bb**bb**bbwwwwww",
    "**bb**bb**bb**bb**bbbbbb**",
    "**************************",
    "**************************",
    "**************************",
    "**************************",
    "**************************",
    "**************************",
    "**************************",
  ]),
];

export const CLASSIC_80S_WAVE_CONFIGS = [
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
  { totalEnemies: 20, maxConcurrent: 4 },
];

export const LEVELS = BOSS_CLASSIC_LEVELS;

export function getClassicModeConfig(variant = "boss") {
  if (variant === "80s") {
    return {
      variant: "80s",
      label: "Modo 80s",
      levels: CLASSIC_80S_LEVELS,
      waveConfigs: CLASSIC_80S_WAVE_CONFIGS,
      hasBossAfterLast: false,
    };
  }

  return {
    variant: "boss",
    label: "Modo Clásico",
    levels: BOSS_CLASSIC_LEVELS,
    waveConfigs: null,
    hasBossAfterLast: true,
  };
}
