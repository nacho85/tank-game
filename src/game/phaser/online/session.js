"use client";

const ONLINE_SESSION_STORAGE_KEY = "tank-game-online-session-v1";
const ONLINE_BROWSER_TOKEN_KEY = "tank-game-online-browser-token-v1";
const ONLINE_HOSTED_ROOM_KEY = "tank-game-online-hosted-room-v1";
const ONLINE_TAB_TOKEN_KEY = "tank-game-online-tab-token-v1";
const ONLINE_PLAYER_NAME_KEY = "tank-game-online-player-name-v1";
const ONLINE_PLAYER_REGISTRY_KEY = "tank-game-online-player-registry-v1";
const PLAYER_REGISTRY_TTL_MS = 1000 * 60 * 60 * 12;

function readSessionStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function readLocalStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function generateReconnectToken() {
  return `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePlayerName(value) {
  return String(value || "").trim() || "Player1";
}

function readPlayerRegistry() {
  const storage = readLocalStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(ONLINE_PLAYER_REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writePlayerRegistry(registry) {
  const storage = readLocalStorage();
  if (!storage) return {};

  const now = Date.now();
  const nextRegistry = Object.fromEntries(
    Object.entries(registry || {}).filter(([, entry]) => (
      entry
      && typeof entry === "object"
      && typeof entry.updatedAt === "number"
      && now - entry.updatedAt <= PLAYER_REGISTRY_TTL_MS
      && sanitizePlayerName(entry.name)
    )),
  );

  try {
    storage.setItem(ONLINE_PLAYER_REGISTRY_KEY, JSON.stringify(nextRegistry));
  } catch {
    return nextRegistry;
  }

  return nextRegistry;
}

export function readOnlineSession() {
  const storage = readSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ONLINE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOnlineSession(session) {
  const storage = readSessionStorage();
  if (!storage) return null;

  const nextSession = {
    reconnectToken: session?.reconnectToken || generateReconnectToken(),
    roomId: session?.roomId || null,
    isHost: !!session?.isHost,
    inMatch: !!session?.inMatch,
    matchConfig: session?.matchConfig && typeof session.matchConfig === "object" ? { ...session.matchConfig } : null,
    updatedAt: Date.now(),
  };

  try {
    storage.setItem(ONLINE_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
  } catch {
    return null;
  }

  return nextSession;
}

export function updateOnlineSession(patch = {}) {
  const current = readOnlineSession();
  return writeOnlineSession({ ...(current || {}), ...patch });
}

export function clearOnlineSession() {
  const storage = readSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(ONLINE_SESSION_STORAGE_KEY);
  } catch {
    // noop
  }
}

export function getOrCreateOnlineReconnectToken() {
  const current = readOnlineSession();
  if (current?.reconnectToken) return current.reconnectToken;
  return writeOnlineSession({})?.reconnectToken || generateReconnectToken();
}

export function getOrCreateOnlineTabToken() {
  const storage = readSessionStorage();
  if (!storage) return generateReconnectToken();

  try {
    const current = storage.getItem(ONLINE_TAB_TOKEN_KEY);
    if (current) return current;
    const next = generateReconnectToken();
    storage.setItem(ONLINE_TAB_TOKEN_KEY, next);
    return next;
  } catch {
    return generateReconnectToken();
  }
}

export function readStoredOnlinePlayerName() {
  const storage = readSessionStorage();
  if (!storage) return null;

  try {
    const current = storage.getItem(ONLINE_PLAYER_NAME_KEY);
    return current?.trim() || null;
  } catch {
    return null;
  }
}

export function writeStoredOnlinePlayerName(name) {
  const storage = readSessionStorage();
  if (!storage) return null;
  const nextName = sanitizePlayerName(name);

  try {
    storage.setItem(ONLINE_PLAYER_NAME_KEY, nextName);
  } catch {
    return null;
  }

  return nextName;
}

export function claimOnlinePlayerName(name) {
  const tabToken = getOrCreateOnlineTabToken();
  const nextRegistry = writePlayerRegistry({
    ...readPlayerRegistry(),
    [tabToken]: {
      name: sanitizePlayerName(name),
      updatedAt: Date.now(),
    },
  });
  return nextRegistry[tabToken]?.name || sanitizePlayerName(name);
}

export function releaseOnlinePlayerName() {
  const tabToken = getOrCreateOnlineTabToken();
  const registry = { ...readPlayerRegistry() };
  delete registry[tabToken];
  writePlayerRegistry(registry);
}

export function getSuggestedOnlinePlayerName() {
  const currentName = readStoredOnlinePlayerName();
  if (currentName) return sanitizePlayerName(currentName);

  const registry = writePlayerRegistry(readPlayerRegistry());
  const currentTabToken = getOrCreateOnlineTabToken();
  const usedNames = new Set(
    Object.entries(registry)
      .filter(([tabToken]) => tabToken !== currentTabToken)
      .map(([, entry]) => sanitizePlayerName(entry?.name))
      .filter(Boolean),
  );

  let index = 1;
  while (usedNames.has(`Player${index}`)) index += 1;
  return `Player${index}`;
}

export function getOrCreateOnlineBrowserToken() {
  const storage = readLocalStorage();
  if (!storage) return generateReconnectToken();

  try {
    const current = storage.getItem(ONLINE_BROWSER_TOKEN_KEY);
    if (current) return current;
    const next = generateReconnectToken();
    storage.setItem(ONLINE_BROWSER_TOKEN_KEY, next);
    return next;
  } catch {
    return generateReconnectToken();
  }
}

export function clearOnlineBrowserToken() {
  const storage = readLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(ONLINE_BROWSER_TOKEN_KEY);
  } catch {
    // noop
  }
}

export function readHostedOnlineRoom() {
  const storage = readLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ONLINE_HOSTED_ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHostedOnlineRoom(room) {
  const storage = readLocalStorage();
  if (!storage) return null;

  const nextRoom = room?.roomId
    ? {
        roomId: room.roomId,
        browserToken: room.browserToken || getOrCreateOnlineBrowserToken(),
        updatedAt: Date.now(),
      }
    : null;

  try {
    if (!nextRoom) {
      storage.removeItem(ONLINE_HOSTED_ROOM_KEY);
      return null;
    }
    storage.setItem(ONLINE_HOSTED_ROOM_KEY, JSON.stringify(nextRoom));
    return nextRoom;
  } catch {
    return null;
  }
}

export function clearHostedOnlineRoom(roomId = null) {
  const current = readHostedOnlineRoom();
  if (!current) return;
  if (roomId && current.roomId !== roomId) return;
  writeHostedOnlineRoom(null);
}
