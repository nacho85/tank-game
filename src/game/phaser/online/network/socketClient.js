import { ONLINE_MESSAGE, normalizeWsUrl } from "../protocol";

export function createOnlineSocketClient({
  url,
  mapAlgorithm = 0,
  onConnectionStateChange = () => {},
  onWelcome = () => {},
  onSnapshot = () => {},
  onError = () => {},
} = {}) {
  let socket = null;
  let latestSnapshot = null;

  const setState = (state) => onConnectionStateChange(state);

  const send = (type, payload = {}) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type, payload }));
    return true;
  };

  return {
    connect() {
      const wsUrl = normalizeWsUrl(url || process.env.NEXT_PUBLIC_TANK_WS_URL);
      setState("conectando");
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        setState("conectado");
        send(ONLINE_MESSAGE.JOIN, { requestedMode: "online_2v2", requestedMapAlgorithm: mapAlgorithm });
      });

      socket.addEventListener("close", () => {
        setState("desconectado");
      });

      socket.addEventListener("error", (event) => {
        setState("error");
        onError(event);
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data);
          if (!message || typeof message !== "object") return;
          if (message.type === ONLINE_MESSAGE.WELCOME) {
            onWelcome(message.payload || {});
            return;
          }
          if (message.type === ONLINE_MESSAGE.SNAPSHOT) {
            latestSnapshot = message.payload || null;
            onSnapshot(latestSnapshot);
            return;
          }
          if (message.type === ONLINE_MESSAGE.ERROR) {
            onError(message.payload || {});
          }
        } catch (error) {
          onError(error);
        }
      });
    },

    disconnect() {
      if (socket) {
        socket.close();
        socket = null;
      }
      latestSnapshot = null;
      setState("idle");
    },

    sendInput(input) {
      return send(ONLINE_MESSAGE.INPUT, input);
    },

    sendFire(payload = {}) {
      return send(ONLINE_MESSAGE.PLAYER_FIRED, payload);
    },

    consumeLatestSnapshot() {
      const snapshot = latestSnapshot;
      latestSnapshot = null;
      return snapshot;
    },

    isConnected() {
      return !!socket && socket.readyState === WebSocket.OPEN;
    },
  };
}
