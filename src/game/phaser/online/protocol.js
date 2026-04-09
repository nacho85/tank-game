export const ONLINE_MESSAGE = {
  JOIN: "join",
  LEAVE: "leave",
  WELCOME: "welcome",
  INPUT: "input",
  SNAPSHOT: "snapshot",
  ERROR: "error",
  PLAYER_FIRED: "player_fired",
  PICKUP_POWER_UP: "pickup_power_up",
  GAMEPLAY_CHAT: "gameplay_chat",
};

export function normalizeWsUrl(rawUrl) {
  const fallback = "ws://localhost:3001";
  const source = (rawUrl || fallback).trim() || fallback;
  if (source.startsWith("ws://") || source.startsWith("wss://")) return source;
  if (source.startsWith("https://")) return "wss://" + source.slice("https://".length);
  if (source.startsWith("http://")) return "ws://" + source.slice("http://".length);
  return source;
}
