import { WebSocketServer } from "ws";
import { MESSAGE } from "./protocol.js";
import { computeTankControlStep } from "../../src/game/phaser/core/sim/tankController.js";
import { OUTER_BORDER_SIZE, PLAYER_SPEED, SURVIVAL_GRID_HEIGHT, SURVIVAL_GRID_WIDTH, TANK_COLLISION_SIZE, TANK_HIT_RADIUS, TILE, TILE_SIZE } from "../../src/game/phaser/shared/constants.js";
import { createBulletState, getWeaponConfigForTankType, isBulletOutsideBoard, stepBulletState } from "../../src/game/phaser/core/sim/weaponSystem.js";
import { worldToGridCol, worldToGridRow, inBounds, isDestructibleTile, isBlockingTile } from "./onlineMap.js";
import { createOnline2v2Level, getOnlineBaseWorld, getOnlineSpawnWorld, ONLINE_BASE_DEFS, ONLINE_ROLE_SPAWNS } from "./onlineMap.js";

const PORT = Number(process.env.PORT || 3001);
const TICK_RATE = 30;
const TICK_MS = Math.round(1000 / TICK_RATE);
const BOARD_WIDTH = (SURVIVAL_GRID_WIDTH + 2) * TILE_SIZE;
const BOARD_HEIGHT = (SURVIVAL_GRID_HEIGHT + 2) * TILE_SIZE;
const MARGIN = OUTER_BORDER_SIZE;
const MAX_BULLETS_PER_PLAYER = 1;

const TOTAL_ROUNDS = 6;
const SIDE_SWITCH_AFTER_ROUND = 3;
const ROUND_TRANSITION_MS = 3500;
const BASE_HP_PER_ROUND = 1;

const ROLE_ORDER = [
  ONLINE_ROLE_SPAWNS.yellow,
  ONLINE_ROLE_SPAWNS.green,
  ONLINE_ROLE_SPAWNS.red,
  ONLINE_ROLE_SPAWNS.blue,
].map((spawn) => ({ ...spawn, x: getOnlineSpawnWorld(spawn.id).x, y: getOnlineSpawnWorld(spawn.id).y }));

const SIDE_SWITCH_ROLE_MAP = { yellow: "red", green: "blue", red: "yellow", blue: "green" };
const LOBBY_PING_TIMEOUT_MS = 20000;
const LOBBY_SWEEP_MS = 5000;

function getEffectiveTeam(roleId, sideSwitched) {
  const isSouthRole = roleId === "yellow" || roleId === "green";
  if (!sideSwitched) return isSouthRole ? "south" : "north";
  return isSouthRole ? "north" : "south";
}

function getEffectiveSpawnWorld(roleId, sideSwitched) {
  const spawnRoleId = sideSwitched ? SIDE_SWITCH_ROLE_MAP[roleId] : roleId;
  return getOnlineSpawnWorld(spawnRoleId);
}

function createFreshBases() {
  return new Map([
    ["south", { ...getOnlineBaseWorld("south"), hp: BASE_HP_PER_ROUND }],
    ["north", { ...getOnlineBaseWorld("north"), hp: BASE_HP_PER_ROUND }],
  ]);
}

function getColorTeam(roleId) {
  return roleId === "yellow" || roleId === "green" ? "team1" : "team2";
}

function colorTeamForGeographicWinner(geographicTeam, sideSwitched) {
  if (!sideSwitched) return geographicTeam === "south" ? "team1" : "team2";
  return geographicTeam === "south" ? "team2" : "team1";
}

function createRoundState() {
  return {
    currentRound: 1,
    totalRounds: TOTAL_ROUNDS,
    scores: { team1: 0, team2: 0 },
    sideSwitched: false,
    transitioning: false,
    transitionAt: null,
    matchOver: false,
    matchWinner: null,
  };
}

const wss = new WebSocketServer({ port: PORT });
const clients = new Map();
const gameplayRoom = {
  players: new Map(),
  bullets: new Map(),
  status: { winnerTeam: null },
  level: createOnline2v2Level({ mapAlgorithm: 0 }),
  bases: createFreshBases(),
  roundState: createRoundState(),
};
const lobbyRooms = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function vectorLength(x, y) {
  return Math.sqrt(x * x + y * y);
}

function getClient(clientId) {
  return clients.get(clientId) || null;
}

function sendToClient(clientId, type, payload) {
  const client = getClient(clientId);
  if (!client || client.ws.readyState !== 1) return;
  client.ws.send(JSON.stringify({ type, payload }));
}

function lobbyRoomToSummary(room) {
  const humanCount = room.slots.filter((slot) => slot.clientId).length;
  const aiCount = room.slots.filter((slot) => slot.kind === "IA").length;
  const occupiedCount = humanCount + aiCount;
  const maxPlayers = room.slots.filter((slot) => slot.kind !== "Cerrado").length;
  const freeSlots = room.slots.filter((slot) => slot.kind === "Abierto" && !slot.clientId).length;
  return {
    id: room.id,
    roomName: room.roomName,
    hostName: room.hostName,
    mode: room.mode,
    playerCount: occupiedCount,
    maxPlayers,
    freeSlots,
    state: freeSlots > 0 ? "waiting" : "full",
    createdAt: room.createdAt,
  };
}

function buildLobbyRoomDetail(room) {
  return {
    id: room.id,
    roomName: room.roomName,
    hostClientId: room.hostClientId,
    hostName: room.hostName,
    mode: room.mode,
    density: room.density,
    rounds: room.rounds,
    lives: room.lives,
    baseHits: room.baseHits,
    createdAt: room.createdAt,
    slots: room.slots.map((slot) => ({ ...slot })),
    messages: room.messages.map((message) => ({ ...message })),
  };
}

function pushRoomMessage(room, author, text, kind = "chat") {
  if (!room || !text) return;
  room.messages.push({
    id: `room-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author,
    text,
    kind,
    createdAt: Date.now(),
  });
  if (room.messages.length > 60) room.messages = room.messages.slice(-60);
}

function broadcastLobbyList() {
  const payload = {
    rooms: Array.from(lobbyRooms.values())
      .map(lobbyRoomToSummary)
      .filter((room) => room.freeSlots > 0)
      .sort((a, b) => a.createdAt - b.createdAt),
  };
  clients.forEach((client) => {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify({ type: MESSAGE.ROOM_LIST, payload }));
    }
  });
}

function broadcastRoomDetail(roomId) {
  const room = lobbyRooms.get(roomId);
  if (!room) return;
  const payload = buildLobbyRoomDetail(room);
  room.watchers.forEach((clientId) => sendToClient(clientId, MESSAGE.ROOM_DETAIL, payload));
}

function attachWatcher(room, clientId) {
  room.watchers.add(clientId);
  const client = getClient(clientId);
  if (client) client.currentLobbyRoomId = room.id;
}

function detachWatcher(room, clientId) {
  room.watchers.delete(clientId);
  const client = getClient(clientId);
  if (client && client.currentLobbyRoomId === room.id) {
    client.currentLobbyRoomId = null;
  }
}

function createLobbySlotFromSource(slot, fallbackId) {
  return {
    id: slot?.id || fallbackId,
    label: slot?.label || fallbackId,
    role: slot?.role || fallbackId,
    baseRole: slot?.baseRole || slot?.role || fallbackId,
    kind: slot?.kind || "Abierto",
    color: slot?.color || "Azar",
    team: slot?.team || "Azar",
    locked: !!slot?.locked,
    clientId: slot?.clientId || null,
    isHost: !!slot?.isHost,
    isReady: !!slot?.isReady,
  };
}

function createLobbyRoom(clientId, payload = {}) {
  const hostName = String(payload.playerName || "Player1").trim() || "Player1";
  const roomName = String(payload.roomName || "Sala sin nombre").trim() || "Sala sin nombre";
  const rawSlots = Array.isArray(payload.slots) ? payload.slots : [];
  const normalizedSlots = rawSlots.length
    ? rawSlots.map((slot, index) => createLobbySlotFromSource(slot, `slot-${index + 1}`))
    : [
        createLobbySlotFromSource({ id: "host", label: hostName, role: "Anfitrión", kind: "Jugador", team: "Equipo 1", color: "Azar" }, "host"),
        createLobbySlotFromSource({ id: "slot-2", label: "Slot 2", role: "Slot 2", kind: "Abierto" }, "slot-2"),
        createLobbySlotFromSource({ id: "slot-3", label: "Slot 3", role: "Slot 3", kind: "Abierto" }, "slot-3"),
        createLobbySlotFromSource({ id: "slot-4", label: "Slot 4", role: "Slot 4", kind: "Abierto" }, "slot-4"),
      ];

  normalizedSlots[0] = {
    ...normalizedSlots[0],
    label: hostName,
    role: "Anfitrión",
    kind: "Jugador",
    locked: true,
    clientId,
    isHost: true,
    isReady: false,
  };

  const room = {
    id: `room-${Math.random().toString(36).slice(2, 10)}`,
    roomName,
    hostClientId: clientId,
    hostName,
    mode: payload.mode || "Normal",
    density: payload.density || "Normal (1x)",
    rounds: payload.rounds || "6",
    lives: payload.lives || "3",
    baseHits: payload.baseHits || "3",
    slots: normalizedSlots,
    watchers: new Set([clientId]),
    messages: [],
    createdAt: Date.now(),
  };

  pushRoomMessage(room, "Sistema", `La sala ${roomName} quedó abierta.`, "system");

  lobbyRooms.set(room.id, room);
  const client = getClient(clientId);
  if (client) {
    client.currentLobbyRoomId = room.id;
    client.playerName = hostName;
  }
  sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: true });
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function updateLobbyRoom(clientId, payload = {}) {
  const roomId = payload.roomId || getClient(clientId)?.currentLobbyRoomId;
  const room = roomId ? lobbyRooms.get(roomId) : null;
  if (!room || room.hostClientId !== clientId) return;

  room.roomName = String(payload.roomName || room.roomName).trim() || room.roomName;
  room.hostName = String(payload.playerName || room.hostName).trim() || room.hostName;
  room.mode = payload.mode || room.mode;
  room.density = payload.density || room.density;
  room.rounds = payload.rounds || room.rounds;
  room.lives = payload.lives || room.lives;
  room.baseHits = payload.baseHits || room.baseHits;

  if (Array.isArray(payload.slots) && payload.slots.length === room.slots.length) {
    room.slots = payload.slots.map((incoming, index) => {
      const existing = room.slots[index];
      const isOccupiedHuman = !!existing.clientId;
      const nextKind = isOccupiedHuman ? existing.kind : incoming.kind || existing.kind;
      return {
        ...existing,
        color: incoming.color || existing.color,
        team: incoming.team || existing.team,
        kind: existing.isHost ? "Jugador" : nextKind,
        locked: existing.isHost ? true : !!incoming.locked,
      };
    });
  }

  const hostSlot = room.slots.find((slot) => slot.clientId === room.hostClientId);
  if (hostSlot) {
    hostSlot.label = room.hostName;
    hostSlot.role = "Anfitrión";
    hostSlot.isHost = true;
    hostSlot.locked = true;
    hostSlot.kind = "Jugador";
  }

  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function joinLobbyRoom(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId);
  if (!room) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "La sala ya no existe." });
    broadcastLobbyList();
    return;
  }

  attachWatcher(room, clientId);
  const existingSlot = room.slots.find((slot) => slot.clientId === clientId);
  if (existingSlot) {
    sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: room.hostClientId === clientId });
    broadcastRoomDetail(room.id);
    return;
  }

  const openSlot = room.slots.find((slot) => slot.kind === "Abierto" && !slot.clientId);
  if (!openSlot) {
    sendToClient(clientId, MESSAGE.ERROR, { message: "La sala está llena." });
    broadcastRoomDetail(room.id);
    broadcastLobbyList();
    return;
  }

  const client = getClient(clientId);
  const playerName = String(payload.playerName || client?.playerName || "Player").trim() || "Player";
  if (client) client.playerName = playerName;

  openSlot.clientId = clientId;
  openSlot.label = playerName;
  openSlot.kind = "Jugador";
  openSlot.isReady = false;
  openSlot.isHost = false;

  pushRoomMessage(room, "Sistema", `${playerName} se unió a la sala.`, "system");
  sendToClient(clientId, MESSAGE.JOINED_ROOM, { roomId: room.id, isHost: false });
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function requestRoomDetail(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId);
  if (!room) return;
  attachWatcher(room, clientId);
  sendToClient(clientId, MESSAGE.ROOM_DETAIL, buildLobbyRoomDetail(room));
}

function setLobbyReady(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId || getClient(clientId)?.currentLobbyRoomId);
  if (!room) return;
  const slot = room.slots.find((item) => item.clientId === clientId);
  if (!slot) return;
  slot.isReady = !!payload.isReady;
  broadcastRoomDetail(room.id);
  broadcastLobbyList();
}

function deleteLobbyRoom(roomId) {
  const room = lobbyRooms.get(roomId);
  if (!room) return;
  room.watchers.forEach((clientId) => {
    const client = getClient(clientId);
    if (client && client.currentLobbyRoomId === roomId) client.currentLobbyRoomId = null;
    sendToClient(clientId, MESSAGE.ROOM_CLOSED, { roomId });
  });
  lobbyRooms.delete(roomId);
  broadcastLobbyList();
}

function removeClientFromLobbyRoom(clientId) {
  for (const room of lobbyRooms.values()) {
    const occupiedSlot = room.slots.find((slot) => slot.clientId === clientId);
    const wasWatching = room.watchers.has(clientId);
    if (!occupiedSlot && !wasWatching) continue;

    detachWatcher(room, clientId);

    if (occupiedSlot) {
      occupiedSlot.clientId = null;
      occupiedSlot.isReady = false;
      occupiedSlot.isHost = false;
      occupiedSlot.locked = false;
      occupiedSlot.role = occupiedSlot.baseRole || occupiedSlot.role;
      occupiedSlot.label = occupiedSlot.baseRole || occupiedSlot.label;
      occupiedSlot.kind = occupiedSlot.kind === "Jugador" ? "Abierto" : occupiedSlot.kind;

      const leavingName = occupiedSlot.label;
      const hostWasLeaving = room.hostClientId === clientId;
      if (hostWasLeaving) {
        const nextHostSlot = room.slots.find((slot) => slot.clientId);
        if (!nextHostSlot) {
          deleteLobbyRoom(room.id);
          return;
        }

        room.hostClientId = nextHostSlot.clientId;
        room.hostName = nextHostSlot.label;
        nextHostSlot.isHost = true;
        nextHostSlot.locked = true;
        nextHostSlot.role = "Anfitrión";
        nextHostSlot.kind = "Jugador";
        pushRoomMessage(room, "Sistema", `${leavingName} salió de la sala. ${nextHostSlot.label} ahora es el anfitrión.`, "system");
      } else {
        pushRoomMessage(room, "Sistema", `${leavingName} salió de la sala.`, "system");
      }
    }

    broadcastRoomDetail(room.id);
    broadcastLobbyList();
    return;
  }
}

function sendRoomChat(clientId, payload = {}) {
  const room = lobbyRooms.get(payload.roomId || getClient(clientId)?.currentLobbyRoomId);
  if (!room) return;
  const slot = room.slots.find((item) => item.clientId === clientId);
  if (!slot) return;
  const text = String(payload.text || "").trim();
  if (!text) return;
  pushRoomMessage(room, slot.label || getClient(clientId)?.playerName || "Player", text, "chat");
  broadcastRoomDetail(room.id);
}

function getMatchWinner() {
  const { currentRound, totalRounds, scores } = gameplayRoom.roundState;
  const diff = scores.team1 - scores.team2;
  if (scores.team1 >= 4) return "team1";
  if (scores.team2 >= 4) return "team2";
  if (currentRound < totalRounds) return null;
  if (currentRound === totalRounds) {
    if (diff !== 0) return diff > 0 ? "team1" : "team2";
    return null;
  }
  if (Math.abs(diff) >= 2) return diff > 0 ? "team1" : "team2";
  return null;
}

function resetPlayerForRespawn(player) {
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.moveAngleDeg = player.team === "south" ? 0 : 180;
  player.turretAngleRad = player.team === "south" ? 0 : Math.PI;
  player.input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
  player.activeBulletIds = new Set();
  player.lastFireAt = 0;
  player.respawnAt = 0;
  player.isDestroyed = false;
  player.hp = 1;
}

function applyRoundSideToPlayer(player) {
  const sideSwitched = gameplayRoom.roundState.sideSwitched;
  const spawn = getEffectiveSpawnWorld(player.role.id, sideSwitched);
  player.team = getEffectiveTeam(player.role.id, sideSwitched);
  player.spawnX = spawn.x;
  player.spawnY = spawn.y;
}

function startNewRound() {
  gameplayRoom.roundState.currentRound += 1;
  gameplayRoom.roundState.sideSwitched = gameplayRoom.roundState.currentRound > SIDE_SWITCH_AFTER_ROUND;
  gameplayRoom.roundState.transitioning = false;
  gameplayRoom.roundState.transitionAt = null;
  gameplayRoom.status.winnerTeam = null;
  gameplayRoom.level = createOnline2v2Level({ mapAlgorithm: gameplayRoom.level.mapAlgorithm ?? 0 });
  gameplayRoom.bases = createFreshBases();
  gameplayRoom.bullets.clear();

  gameplayRoom.players.forEach((player) => {
    player.activeBulletIds = new Set();
    applyRoundSideToPlayer(player);
    resetPlayerForRespawn(player);
  });

  broadcast(MESSAGE.ROUND_START, {
    currentRound: gameplayRoom.roundState.currentRound,
    totalRounds: gameplayRoom.roundState.totalRounds,
    scores: { ...gameplayRoom.roundState.scores },
    sideSwitched: gameplayRoom.roundState.sideSwitched,
  });
}

function canOccupyPlayerPosition(player, x, y) {
  const half = TANK_COLLISION_SIZE / 2;
  const left = x - half;
  const right = x + half;
  const top = y - half;
  const bottom = y + half;
  const startCol = worldToGridCol(left, 0);
  const endCol = worldToGridCol(right, 0);
  const startRow = worldToGridRow(top, 0);
  const endRow = worldToGridRow(bottom, 0);
  if (!inBounds(startCol, startRow) || !inBounds(endCol, endRow)) return false;
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (isBlockingTile(gameplayRoom.level.obstacles?.[row]?.[col])) return false;
    }
  }
  for (const other of gameplayRoom.players.values()) {
    if (!other || other === player || other.isDestroyed) continue;
    if (vectorLength(x - other.x, y - other.y) < TANK_COLLISION_SIZE * 0.82) return false;
  }
  return true;
}

function getBaseIdAtCell(col, row) {
  for (const def of Object.values(ONLINE_BASE_DEFS)) {
    if (col >= def.anchorCol && col <= def.anchorCol + 1 && row >= def.anchorRow && row <= def.anchorRow + 1) {
      return def.id;
    }
  }
  return null;
}

function destroyBullet(bulletId) {
  const bullet = gameplayRoom.bullets.get(bulletId);
  if (!bullet) return;
  gameplayRoom.bullets.delete(bulletId);
  const owner = gameplayRoom.players.get(bullet.ownerId);
  owner?.activeBulletIds?.delete?.(bulletId);
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  clients.forEach((client) => {
    if (client.ws.readyState === 1) {
      client.ws.send(message);
    }
  });
}

function buildSnapshot() {
  return {
    serverTime: Date.now(),
    players: Array.from(gameplayRoom.players.values()).map((player) => ({
      id: player.id,
      color: player.role.id,
      label: player.role.label,
      x: player.x,
      y: player.y,
      moveAngleDeg: player.moveAngleDeg,
      turretAngleRad: player.turretAngleRad,
      isDestroyed: !!player.isDestroyed,
      team: player.team,
      colorTeam: player.colorTeam,
    })),
    bullets: Array.from(gameplayRoom.bullets.values()).map((bullet) => ({
      id: bullet.id,
      ownerId: bullet.ownerId,
      x: bullet.x,
      y: bullet.y,
      angleRad: bullet.angleRad,
      width: bullet.width,
      length: bullet.length,
      tint: bullet.tint,
    })),
    bases: Array.from(gameplayRoom.bases.values()).map((base) => ({ ...base })),
    floor: gameplayRoom.level.floor,
    overlay: gameplayRoom.level.overlay,
    obstacles: gameplayRoom.level.obstacles,
    mapAlgorithm: gameplayRoom.level.mapAlgorithm ?? 0,
    status: { ...gameplayRoom.status },
    roundState: {
      currentRound: gameplayRoom.roundState.currentRound,
      totalRounds: gameplayRoom.roundState.totalRounds,
      scores: { ...gameplayRoom.roundState.scores },
      sideSwitched: gameplayRoom.roundState.sideSwitched,
      transitioning: gameplayRoom.roundState.transitioning,
      matchOver: gameplayRoom.roundState.matchOver,
      matchWinner: gameplayRoom.roundState.matchWinner,
      roundWinnerColorTeam: gameplayRoom.status.winnerTeam
        ? colorTeamForGeographicWinner(gameplayRoom.status.winnerTeam, gameplayRoom.roundState.sideSwitched)
        : null,
    },
  };
}

function assignRole() {
  const taken = new Set(Array.from(gameplayRoom.players.values()).map((player) => player.role.id));
  return ROLE_ORDER.find((role) => !taken.has(role.id)) || null;
}

function handleJoin(clientId, ws, payload = {}) {
  if (gameplayRoom.players.size === 0) {
    const requestedMapAlgorithm = Number(payload?.requestedMapAlgorithm ?? 0);
    gameplayRoom.level = createOnline2v2Level({ mapAlgorithm: requestedMapAlgorithm });
    gameplayRoom.bases = createFreshBases();
    gameplayRoom.status = { winnerTeam: null };
    gameplayRoom.roundState = createRoundState();
    gameplayRoom.bullets.clear();
  }
  const role = assignRole();
  if (!role) {
    ws.send(JSON.stringify({ type: MESSAGE.ERROR, payload: { message: "Sala llena" } }));
    return;
  }

  const sideSwitched = gameplayRoom.roundState.sideSwitched;
  const effectiveTeam = getEffectiveTeam(role.id, sideSwitched);
  const spawn = getEffectiveSpawnWorld(role.id, sideSwitched);

  const player = {
    id: clientId,
    clientId,
    role,
    colorTeam: getColorTeam(role.id),
    team: effectiveTeam,
    spawnX: spawn.x,
    spawnY: spawn.y,
    x: spawn.x,
    y: spawn.y,
    moveAngleDeg: effectiveTeam === "south" ? 0 : 180,
    moveSpeed: PLAYER_SPEED,
    turretAngleRad: effectiveTeam === "south" ? 0 : Math.PI,
    input: { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false },
    activeBulletIds: new Set(),
    hp: 1,
    isDestroyed: false,
    respawnAt: 0,
    lastFireAt: 0,
    lastFirePressed: false,
  };

  gameplayRoom.players.set(clientId, player);
  ws.send(JSON.stringify({
    type: MESSAGE.WELCOME,
    payload: {
      playerId: clientId,
      roleLabel: role.label,
      roundState: {
        currentRound: gameplayRoom.roundState.currentRound,
        totalRounds: gameplayRoom.roundState.totalRounds,
        scores: { ...gameplayRoom.roundState.scores },
      },
    },
  }));
}

function createBulletForPlayer(player) {
  const bullet = createBulletState({
    id: `b-${Math.random().toString(36).slice(2, 10)}`,
    ownerType: player.role.id,
    ownerId: player.id,
    ownerTeam: player.team,
    x: player.x,
    y: player.y,
    angleRad: player.turretAngleRad,
  });
  gameplayRoom.bullets.set(bullet.id, bullet);
  player.activeBulletIds.add(bullet.id);
  player.lastFireAt = Date.now();
}

function prunePlayerBullets(player) {
  player.activeBulletIds.forEach((bulletId) => {
    if (!gameplayRoom.bullets.has(bulletId)) player.activeBulletIds.delete(bulletId);
  });
}

function handleInput(clientId, payload = {}) {
  const player = gameplayRoom.players.get(clientId);
  if (!player) return;
  player.input = {
    moveX: Number(payload.moveX || 0),
    moveY: Number(payload.moveY || 0),
    aimX: Number(payload.aimX || 0),
    aimY: Number(payload.aimY || 0),
    fire: !!payload.fire,
  };
}

function tryFirePlayer(player) {
  if (!player || player.isDestroyed) return false;
  if (gameplayRoom.roundState.transitioning || gameplayRoom.roundState.matchOver) return false;
  prunePlayerBullets(player);

  const weaponConfig = getWeaponConfigForTankType(player.role.id);
  const canFire = player.activeBulletIds.size < MAX_BULLETS_PER_PLAYER && Date.now() - player.lastFireAt >= weaponConfig.cooldownMs;
  if (!canFire) return false;
  createBulletForPlayer(player);
  return true;
}

function tick() {
  const now = Date.now();

  if (gameplayRoom.roundState.transitioning) {
    const elapsed = now - gameplayRoom.roundState.transitionAt;
    if (elapsed >= ROUND_TRANSITION_MS) {
      const winner = getMatchWinner();
      if (winner) {
        gameplayRoom.roundState.matchOver = true;
        gameplayRoom.roundState.matchWinner = winner;
        gameplayRoom.roundState.transitioning = false;
      } else {
        startNewRound();
      }
    }
    broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
    return;
  }

  if (gameplayRoom.status.winnerTeam && !gameplayRoom.roundState.matchOver) {
    const colorWinner = colorTeamForGeographicWinner(gameplayRoom.status.winnerTeam, gameplayRoom.roundState.sideSwitched);
    gameplayRoom.roundState.scores[colorWinner] = (gameplayRoom.roundState.scores[colorWinner] || 0) + 1;

    const matchWinner = getMatchWinner();
    if (matchWinner) {
      gameplayRoom.roundState.matchOver = true;
      gameplayRoom.roundState.matchWinner = matchWinner;
    } else {
      gameplayRoom.roundState.transitioning = true;
      gameplayRoom.roundState.transitionAt = now;
    }
    broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
    return;
  }

  if (gameplayRoom.roundState.matchOver) {
    broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
    return;
  }

  gameplayRoom.players.forEach((player) => {
    if (player.isDestroyed) return;
    const control = computeTankControlStep(
      player,
      {
        moveX: player.input.moveX,
        moveY: player.input.moveY,
        aimX: player.input.aimX,
        aimY: player.input.aimY,
      },
      TICK_MS,
      { preserveTurretWhenIdle: true, fallbackTurretToMove: false },
    );

    if (control.hasMove) {
      const nextX = clamp(player.x + control.moveDx, MARGIN, BOARD_WIDTH - MARGIN);
      const nextY = clamp(player.y + control.moveDy, MARGIN, BOARD_HEIGHT - MARGIN);
      if (canOccupyPlayerPosition(player, nextX, player.y)) player.x = nextX;
      if (canOccupyPlayerPosition(player, player.x, nextY)) player.y = nextY;
      player.moveAngleDeg = control.nextMoveAngleDeg;
    }

    player.turretAngleRad = control.nextTurretAngleRad;
    prunePlayerBullets(player);
  });

  gameplayRoom.bullets.forEach((bullet, bulletId) => {
    stepBulletState(bullet, TICK_MS);
    const col = worldToGridCol(bullet.x, 0);
    const row = worldToGridRow(bullet.y, 0);
    if (isBulletOutsideBoard(bullet, { minX: MARGIN, minY: MARGIN, maxX: BOARD_WIDTH - MARGIN, maxY: BOARD_HEIGHT - MARGIN }, 0)) {
      destroyBullet(bulletId);
      return;
    }
    if (inBounds(col, row)) {
      const obstacle = gameplayRoom.level.obstacles?.[row]?.[col];
      if (obstacle === TILE.BASE) {
        const baseId = getBaseIdAtCell(col, row);
        const base = baseId ? gameplayRoom.bases.get(baseId) : null;
        if (base && base.hp > 0 && base.team !== bullet.ownerTeam) {
          base.hp = Math.max(0, base.hp - 1);
          destroyBullet(bulletId);
          if (base.hp <= 0) {
            gameplayRoom.status.winnerTeam = base.team === "south" ? "north" : "south";
          }
          return;
        }
        destroyBullet(bulletId);
        return;
      }
      if (obstacle && obstacle !== TILE.WATER) {
        if (isDestructibleTile(obstacle)) {
          gameplayRoom.level.obstacles[row][col] = null;
        }
        destroyBullet(bulletId);
        return;
      }
    }

    for (const base of gameplayRoom.bases.values()) {
      if (base.hp <= 0 || base.team === bullet.ownerTeam) continue;
      if (vectorLength(bullet.x - base.x, bullet.y - base.y) <= (base.radius || 54) + (bullet.hitRadius || 0)) {
        base.hp = Math.max(0, base.hp - 1);
        destroyBullet(bulletId);
        if (base.hp <= 0) {
          gameplayRoom.status.winnerTeam = base.team === "south" ? "north" : "south";
        }
        return;
      }
    }

    for (const player of gameplayRoom.players.values()) {
      if (!player || player.isDestroyed || player.id === bullet.ownerId || player.team === bullet.ownerTeam) continue;
      if (vectorLength(bullet.x - player.x, bullet.y - player.y) <= TANK_HIT_RADIUS + (bullet.hitRadius || 0)) {
        player.isDestroyed = true;
        player.respawnAt = 0;
        destroyBullet(bulletId);
        return;
      }
    }
  });

  broadcast(MESSAGE.SNAPSHOT, buildSnapshot());
}

wss.on("connection", (ws) => {
  const clientId = `p-${Math.random().toString(36).slice(2, 10)}`;
  clients.set(clientId, {
    ws,
    playerName: "Player1",
    currentLobbyRoomId: null,
    lastSeenAt: Date.now(),
  });

  ws.send(JSON.stringify({ type: MESSAGE.CLIENT_IDENTIFIED, payload: { clientId } }));

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw));
      const client = getClient(clientId);
      if (client) client.lastSeenAt = Date.now();

      switch (message.type) {
        case MESSAGE.CONNECT_LOBBY:
          if (client && message.payload?.playerName) client.playerName = String(message.payload.playerName).trim() || client.playerName;
          broadcastLobbyList();
          break;
        case MESSAGE.CREATE_ROOM:
          createLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.UPDATE_ROOM:
          updateLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.LIST_ROOMS:
          if (message.payload?.roomId) requestRoomDetail(clientId, message.payload);
          else sendToClient(clientId, MESSAGE.ROOM_LIST, {
            rooms: Array.from(lobbyRooms.values()).map(lobbyRoomToSummary).filter((room) => room.freeSlots > 0),
          });
          break;
        case MESSAGE.JOIN_ROOM:
          joinLobbyRoom(clientId, message.payload || {});
          break;
        case MESSAGE.LEAVE_ROOM:
          removeClientFromLobbyRoom(clientId);
          break;
        case MESSAGE.SET_READY:
          setLobbyReady(clientId, message.payload || {});
          break;
        case MESSAGE.ROOM_CHAT:
          sendRoomChat(clientId, message.payload || {});
          break;
        case MESSAGE.JOIN:
          handleJoin(clientId, ws, message.payload || {});
          break;
        case MESSAGE.INPUT:
          handleInput(clientId, message.payload || {});
          break;
        case MESSAGE.PLAYER_FIRED: {
          const player = gameplayRoom.players.get(clientId);
          tryFirePlayer(player);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: MESSAGE.ERROR, payload: { message: error.message } }));
    }
  });

  ws.on("close", () => {
    removeClientFromLobbyRoom(clientId);
    const player = gameplayRoom.players.get(clientId);
    player?.activeBulletIds?.forEach((bulletId) => destroyBullet(bulletId));
    gameplayRoom.players.delete(clientId);
    clients.delete(clientId);
  });
});

setInterval(tick, TICK_MS);
setInterval(() => {
  const now = Date.now();
  clients.forEach((client, clientId) => {
    if (now - client.lastSeenAt <= LOBBY_PING_TIMEOUT_MS) return;
    try {
      client.ws.terminate?.();
    } catch {
      // noop
    }
    removeClientFromLobbyRoom(clientId);
    clients.delete(clientId);
  });
}, LOBBY_SWEEP_MS);

console.log(`Tank multiplayer server en ws://localhost:${PORT}`);
console.log(`Rondas: ${TOTAL_ROUNDS} | Cambio de lado: ronda ${SIDE_SWITCH_AFTER_ROUND + 1} | HP águila: ${BASE_HP_PER_ROUND}`);
