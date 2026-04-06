"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./tank-game-landing.module.css";

const PLAYER_NAME_STORAGE_KEY = "bct-player-name";
const SETTINGS_STORAGE_KEY = "tank-game-settings-v1";
const AXIS_DEADZONE = 0.45;
const NAV_REPEAT_MS = 190;
const HEARTBEAT_MS = 5000;
const CREATE_ROOM_BG = "/create-room-bg.png";
const JOINED_ROOM_BG = "/create-room-bg-2.png";

const MENU_SCREENS = {
  root: {
    breadcrumb: "CENTRO DE OPERACIONES",
    items: [
      { label: "Un jugador", next: "single" },
      { label: "Multiplayer", next: "multi" },
      { label: "Configuración", next: "config" },
    ],
    status: "Listo para desplegar.",
  },
  single: {
    breadcrumb: "CENTRO DE OPERACIONES / UN JUGADOR",
    items: [
      { label: "Clásico", action: "play" },
      { label: "Survival", action: "play" },
      { label: "Volver", back: true },
    ],
    status: "Seleccioná un modo individual.",
  },
  multi: {
    breadcrumb: "CENTRO DE OPERACIONES / MULTIPLAYER",
    items: [
      { label: "Buscar / ver salas", action: "browseRooms" },
      { label: "Crear sala", action: "createRoom" },
      { label: "Volver", back: true },
    ],
    status: "Elegí cómo querés entrar al lobby.",
  },
  config: {
    breadcrumb: "CENTRO DE OPERACIONES / CONFIGURACIÓN",
    items: [
      { label: "Controles", action: "noop" },
      { label: "Audio", action: "noop" },
      { label: "Volver", back: true },
    ],
    status: "Ajustes en preparación.",
  },
};

const MODE_OPTIONS = ["Normal", "Río", "Islas", "Archipiélagos"];
const DENSITY_OPTIONS = ["Baja (0.75x)", "Normal (1x)", "Alta (1.25x)", "Muy alta (1.5x)"];
const ROUND_OPTIONS = ["6", "10"];
const LIVES_OPTIONS = ["1", "3", "5"];
const BASE_HITS_OPTIONS = ["1", "3", "5"];
const SLOT_KIND_OPTIONS = ["Abierto", "IA", "Cerrado"];
const SLOT_TEAM_OPTIONS = ["Azar", "Equipo 1", "Equipo 2"];
const SLOT_COLORS = [
  { name: "Azar", swatch: "linear-gradient(135deg, #e8d993 0%, #8fb2d9 50%, #c36a5b 100%)" },
  { name: "Amarillo", swatch: "#d8b13a" },
  { name: "Verde", swatch: "#4f8f49" },
  { name: "Rojo", swatch: "#b64a44" },
  { name: "Azul", swatch: "#436dad" },
];

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function getColorSwatch(colorName) {
  return SLOT_COLORS.find((item) => item.name === colorName)?.swatch ?? SLOT_COLORS[0].swatch;
}

function getSocketUrl() {
  if (typeof window === "undefined") return "ws://localhost:3001";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

function buildInitialSlots(playerName) {
  return [
    {
      id: "host",
      label: playerName || "Player1",
      role: "Anfitrión",
      kind: "Jugador",
      color: "Azar",
      team: "Equipo 1",
      locked: true,
      isHost: true,
      isReady: false,
      clientId: "local-host",
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `slot-${index + 2}`,
      label: `Slot ${index + 2}`,
      role: `Slot ${index + 2}`,
      kind: "Abierto",
      color: "Azar",
      team: "Azar",
      locked: false,
      isHost: false,
      isReady: false,
      clientId: null,
    })),
  ];
}

function getOccupiedCount(slots) {
  return slots.filter((slot) => slot.clientId || slot.kind === "IA").length;
}

function InlineSetting({ label, children }) {
  return (
    <label className={styles.inlineField}>
      <span className={styles.inlineLabel}>{label}:</span>
      <span className={styles.inlineControl}>{children}</span>
    </label>
  );
}

function ReadonlySetting({ label, value }) {
  return (
    <div className={styles.inlineField}>
      <span className={styles.inlineLabel}>{label}:</span>
      <span className={styles.readonlyValue}>{value}</span>
    </div>
  );
}

function ColorPicker({ disabled = false, value, onChange, open, onToggle, onClose }) {
  return (
    <div className={styles.colorPickerWrap}>
      <button
        className={styles.colorSwatchButton}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onToggle();
        }}
        style={{ background: getColorSwatch(value) }}
        type="button"
      >
        <span className={styles.visuallyHidden}>{value}</span>
      </button>

      {open ? (
        <div className={styles.colorPalette}>
          {SLOT_COLORS.map((option) => (
            <button
              className={styles.colorPaletteItem}
              key={option.name}
              onClick={() => {
                onChange(option.name);
                onClose();
              }}
              style={{ background: option.swatch }}
              type="button"
            >
              <span className={styles.visuallyHidden}>{option.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function useLobbySocket(playerName, onStatusText) {
  const socketRef = useRef(null);
  const handlersRef = useRef({});
  const heartbeatRef = useRef(null);

  const connect = () => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing;
    }

    const ws = new WebSocket(getSocketUrl());
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "connect_lobby", payload: { playerName } }));
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "connect_lobby", payload: { playerName } }));
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const handler = handlersRef.current[message.type];
        if (handler) handler(message.payload);
      } catch {
        // noop
      }
    });

    ws.addEventListener("close", () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    });

    ws.addEventListener("error", () => {
      onStatusText?.("No se pudo conectar con el lobby multiplayer.");
    });

    return ws;
  };

  const send = (type, payload) => {
    const ws = connect();
    const emit = () => ws.send(JSON.stringify({ type, payload }));
    if (ws.readyState === WebSocket.OPEN) emit();
    else ws.addEventListener("open", emit, { once: true });
  };

  const registerHandlers = (handlers) => {
    handlersRef.current = handlers;
  };

  useEffect(() => () => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    try {
      socketRef.current?.close();
    } catch {
      // noop
    }
  }, []);

  return { connect, send, socketRef, registerHandlers };
}

function BrowseRoomsScreen({ playerName, onBack, onJoinRoom, setStatusText }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const lobby = useLobbySocket(playerName, setStatusText);

  useEffect(() => {
    lobby.registerHandlers({
      room_list: (payload) => setRooms(payload?.rooms || []),
      room_detail: (payload) => {
        setSelectedRoom(payload || null);
        if (payload?.id) setSelectedRoomId(payload.id);
      },
      room_closed: () => {
        setSelectedRoom(null);
        setSelectedRoomId(null);
        setStatusText("La sala que estabas viendo ya no está disponible.");
      },
      error: (payload) => setStatusText(payload?.message || "No se pudo completar la acción."),
    });
    lobby.connect();
    lobby.send("list_rooms", {});
  }, []);

  function refresh() {
    lobby.send("list_rooms", {});
    if (selectedRoomId) lobby.send("list_rooms", { roomId: selectedRoomId });
    setStatusText("Lista de salas actualizada.");
  }

  function showRoom(roomId) {
    setSelectedRoomId(roomId);
    lobby.send("list_rooms", { roomId });
  }

  function joinSelected(roomId) {
    setStatusText("Uniéndote a la sala...");
    onJoinRoom?.({ roomId, isHost: false });
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.stage}>
        <img alt="Buscar salas" className={styles.background} src="/view-rooms-bg.png" />
        <div className={styles.createRoomOverlay}>
          <button className={styles.backButton} onClick={onBack} type="button">← Volver</button>
          <div className={styles.boardTopArea}>
            <div className={styles.setupContent} style={{ gap: "0.6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className={styles.fieldLabel}>Salas abiertas</div>
                <button className={styles.primaryButton} onClick={refresh} style={{ marginTop: 0 }} type="button">Actualizar</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "0.5rem", fontWeight: 700 }}>
                <span className={styles.fieldLabel}>Sala</span>
                <span className={styles.fieldLabel}>Host</span>
                <span className={styles.fieldLabel}>Libres</span>
                <span className={styles.fieldLabel}> </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", overflow: "auto" }}>
                {rooms.length ? rooms.map((room) => {
                  const selected = room.id === selectedRoomId;
                  return (
                    <div
                      key={room.id}
                      onClick={() => showRoom(room.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") showRoom(room.id); }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr auto",
                        gap: "0.5rem",
                        alignItems: "center",
                        padding: "0.45rem 0.55rem",
                        border: selected ? "1px solid #8a6511" : "1px solid rgba(69,58,45,0.18)",
                        background: selected ? "rgba(216,177,58,0.12)" : "rgba(255,253,246,0.55)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span>{room.roomName}</span>
                      <span>{room.hostName}</span>
                      <span>{room.freeSlots}</span>
                      <span>
                        <button className={styles.sendButton} onClick={(event) => { event.stopPropagation(); joinSelected(room.id); }} style={{ marginTop: 0 }} type="button">Unirse</button>
                      </span>
                    </div>
                  );
                }) : <div className={styles.readonlyValue}>En este momento no hay salas abiertas disponibles...</div>}
              </div>
            </div>
          </div>
          <div className={styles.boardBottomAreaView}>
            <div className={styles.setupContent} style={{ padding: "0.5rem 0.8rem", overflow: "auto" }}>
              {selectedRoom ? (
                <>
                  <header className={styles.fieldHeader}>
                    <div className={styles.fieldLabel}>{selectedRoom.roomName}</div>
                    <div className={styles.readonlyValue}>Anfitrión: {selectedRoom.hostName}</div>
                    <div className={styles.readonlyValue}>Modo: {selectedRoom.mode}</div>
                    <button className={styles.primaryButton} onClick={() => joinSelected(selectedRoom.id)} type="button">Unirse</button>
                  </header>
                  <div className={styles.slotsSection}>
                    <div className={styles.slotHeaderRow}><span /> <span>Jugador</span><span>Equipo</span><span>Tipo</span></div>
                    <div className={styles.slotsTable}>
                      {selectedRoom.slots.map((slot) => (
                        <div className={styles.slotRow} key={slot.id}>
                          <div className={styles.colorSwatchButton} style={{ background: getColorSwatch(slot.color), pointerEvents: "none" }} />
                          <div className={styles.slotNameCell}><div className={styles.slotName}>{slot.label}</div><div className={styles.slotRole}>{slot.role}</div></div>
                          <div className={styles.readonlyValue}>{slot.team}</div>
                          <div className={styles.readonlyValue}>{slot.clientId ? "Jugador" : slot.kind}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : <div className={styles.readonlyValue}>Seleccioná una sala para ver el detalle.</div>}
            </div>
          </div>
          <div className={styles.roomFooterText}>Solo se muestran salas que todavía admiten entrada.</div>
        </div>
      </div>
    </div>
  );
}

function CreateRoomScreen({ playerName, onPlayerNameChange, onBack, onStartGame, statusText, setStatusText, backgroundSrc = CREATE_ROOM_BG, initialRoomId = null, initialIsHost = true }) {
  const [roomName, setRoomName] = useState("");
  const [isCreated, setIsCreated] = useState(!!initialRoomId);
  const [mode, setMode] = useState("Normal");
  const [density, setDensity] = useState("Normal (1x)");
  const [rounds, setRounds] = useState("6");
  const [lives, setLives] = useState("3");
  const [baseHits, setBaseHits] = useState("3");
  const [slots, setSlots] = useState(() => buildInitialSlots(playerName));
  const [chatInput, setChatInput] = useState("");
  const [openColorSlotId, setOpenColorSlotId] = useState(null);
  const [isHostReady, setIsHostReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isLocalHost, setIsLocalHost] = useState(initialIsHost);
  const [messages, setMessages] = useState([{ id: "sys-1", author: "Sistema", text: initialRoomId ? "Conectando con la sala..." : "Sala lista para configurarse." }]);
  const [localClientId, setLocalClientId] = useState(null);
  const countdownTimerRef = useRef(null);
  const lastSentConfigRef = useRef("");
  const lobby = useLobbySocket(playerName, setStatusText);

  useEffect(() => {
    lobby.registerHandlers({
      client_identified: (payload) => {
        setLocalClientId(payload?.clientId || null);
      },
      joined_room: (payload) => {
        setRoomId(payload?.roomId || null);
        setIsLocalHost(!!payload?.isHost);
        setIsCreated(true);
        setStatusText(payload?.isHost ? "Sala creada." : "Te uniste a la sala. Esperando sincronización...");
      },
      room_detail: (payload) => {
        if (!payload) return;
        setRoomId(payload.id);
        setRoomName(payload.roomName || "");
        setMode(payload.mode || "Normal");
        setDensity(payload.density || "Normal (1x)");
        setRounds(payload.rounds || "6");
        setLives(payload.lives || "3");
        setBaseHits(payload.baseHits || "3");
        setSlots(payload.slots || []);
        setMessages((payload.messages || []).length ? payload.messages : [{ id: "sys-empty", author: "Sistema", text: "Sala sincronizada." }]);
        setIsCreated(true);
        const myHostSlot = (payload.slots || []).find((slot) => slot.isHost && slot.clientId && slot.clientId === localClientId);
        const mySlot = (payload.slots || []).find((slot) => slot.clientId && slot.clientId === localClientId);
        setIsLocalHost(!!myHostSlot);
        setIsHostReady(!!mySlot?.isReady);
      },
      room_closed: () => {
        setStatusText("La sala se cerró porque no quedaron jugadores humanos conectados.");
        setIsCreated(false);
        setRoomId(null);
        setSlots(buildInitialSlots(playerName));
      },
      error: (payload) => setStatusText(payload?.message || "No se pudo completar la acción."),
    });
    lobby.connect();
  }, [playerName, localClientId]);

  useEffect(() => {
    if (!initialRoomId) return;
    if (initialIsHost) {
      lobby.send("list_rooms", { roomId: initialRoomId });
      return;
    }
    lobby.send("join_room", { roomId: initialRoomId, playerName });
  }, [initialRoomId, initialIsHost, playerName]);

  useEffect(() => {
    setSlots((current) => {
      const next = [...current];
      if (next[0] && !roomId) next[0] = { ...next[0], label: playerName || "Player1" };
      return next;
    });
  }, [playerName, roomId]);

  useEffect(() => () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function onPointerDown(event) {
      if (!event.target.closest(`.${styles.colorPickerWrap}`)) setOpenColorSlotId(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    function handleBeforeUnload() {
      if (roomId) {
        lobby.send("leave_room", { roomId });
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId]);

  useEffect(() => {
    if (!isCreated || !roomId || !isLocalHost) return;
    const payload = {
      roomId,
      roomName,
      playerName,
      mode,
      density,
      rounds,
      lives,
      baseHits,
      slots,
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSentConfigRef.current) return;
    lastSentConfigRef.current = serialized;
    lobby.send("update_room", payload);
  }, [isCreated, roomId, isLocalHost, roomName, playerName, mode, density, rounds, lives, baseHits, slots]);

  useEffect(() => {
    if (!roomId) return;
    lobby.send("set_ready", { roomId, isReady: isHostReady });
  }, [roomId, isHostReady]);

  const occupiedSlots = useMemo(() => getOccupiedCount(slots), [slots]);
  const allHumansReady = useMemo(() => {
    const humans = slots.filter((slot) => slot.clientId);
    return humans.length > 0 && humans.every((slot) => slot.isReady);
  }, [slots]);
  const canStartMatch = isCreated && occupiedSlots === 4 && allHumansReady && countdown == null;

  function launchOnlineMatch() {
    if (!canStartMatch) {
      if (occupiedSlots < 4) setStatusText("Necesitás 4 slots ocupados para comenzar la partida.");
      else if (!allHumansReady) setStatusText("Todos los humanos conectados tienen que marcar ESTOY LISTO.");
      return;
    }

    try {
      const currentSettings = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...currentSettings, gameMode: 2 }));
    } catch {
      // noop
    }

    setStatusText("Todos listos. Iniciando partida online en 10...");
    setCountdown(10);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current == null) return current;
        if (current <= 1) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          window.setTimeout(() => onStartGame?.(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  function handleCreate() {
    const trimmedRoomName = roomName.trim();
    if (!trimmedRoomName) {
      setStatusText("Poné un nombre de sala para continuar.");
      return;
    }

    const nextSlots = buildInitialSlots(playerName).map((slot, index) => {
      if (index === 0) return { ...slot, label: playerName || "Player1" };
      return slot;
    });

    setSlots(nextSlots);
    setRoomName(trimmedRoomName);
    setIsCreated(true);
    setStatusText(`Sala "${trimmedRoomName}" creada y visible.`);
    setMessages((current) => [...current, { id: `sys-${current.length + 1}`, author: "Sistema", text: `La sala ${trimmedRoomName} quedó visible para nuevos jugadores.` }]);
    lobby.send("create_room", {
      roomName: trimmedRoomName,
      playerName,
      mode,
      density,
      rounds,
      lives,
      baseHits,
      slots: nextSlots,
    });
  }

  function updateSlot(slotId, field, value) {
    if (!isLocalHost) return;
    setSlots((current) => current.map((slot) => {
      if (slot.id !== slotId || slot.clientId || slot.isHost) return slot;
      return { ...slot, [field]: value };
    }));
  }

  function sendMessage(event) {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !roomId) return;
    lobby.send("room_chat", { roomId, text: trimmed });
    setChatInput("");
    setStatusText("Mensaje enviado al lobby.");
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.stage}>
        <img alt="Crear sala" className={styles.background} src={backgroundSrc} />

        <div className={styles.createRoomOverlay}>
          <button className={styles.backButton} onClick={() => {
            if (roomId) lobby.send("leave_room", { roomId });
            onBack();
          }} type="button">
            ← Volver
          </button>

          <div className={styles.boardTopArea}>
            {!isCreated ? (
              <div className={styles.formCard}>
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Nombre usuario</span>
                  <input className={styles.textField} onChange={(event) => onPlayerNameChange(event.target.value)} placeholder="Player1" type="text" value={playerName} />
                </label>
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Nombre sala</span>
                  <input className={styles.textField} onChange={(event) => setRoomName(event.target.value)} placeholder="Poné un nombre de sala" type="text" value={roomName} />
                </label>
                <button className={styles.primaryButton} onClick={handleCreate} type="button">Crear</button>
              </div>
            ) : (
              <div className={styles.setupContent}>
                <div className={styles.topSettingsGrid}>
                  <ReadonlySetting label="Nombre usuario" value={playerName} />
                  <InlineSetting label="Modo"><select className={styles.selectField} disabled={!isLocalHost} onChange={(event) => setMode(event.target.value)} value={mode}>{MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <ReadonlySetting label="Nombre sala" value={roomName} />
                  <InlineSetting label="Densidad"><select className={styles.selectField} disabled={!isLocalHost} onChange={(event) => setDensity(event.target.value)} value={density}>{DENSITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                </div>

                <div className={styles.compactSettingsRow}>
                  <InlineSetting label="Rondas"><select className={styles.selectField} disabled={!isLocalHost} onChange={(event) => setRounds(event.target.value)} value={rounds}>{ROUND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <InlineSetting label="Vidas p/ronda"><select className={styles.selectField} disabled={!isLocalHost} onChange={(event) => setLives(event.target.value)} value={lives}>{LIVES_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <InlineSetting label="Balas vs base p/ronda"><select className={styles.selectField} disabled={!isLocalHost} onChange={(event) => setBaseHits(event.target.value)} value={baseHits}>{BASE_HITS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                </div>

                <div className={styles.slotsSection}>
                  <div className={styles.slotHeaderRow}><span /><span>Jugador</span><span>Equipo</span><span>Tipo</span></div>
                  <div className={styles.slotsTable}>
                    {slots.map((slot) => (
                      <div className={styles.slotRow} key={slot.id}>
                        <ColorPicker disabled={!isLocalHost || !!slot.clientId || slot.isHost} onChange={(nextColor) => updateSlot(slot.id, "color", nextColor)} onClose={() => setOpenColorSlotId(null)} onToggle={() => setOpenColorSlotId((current) => current === slot.id ? null : slot.id)} open={openColorSlotId === slot.id} value={slot.color} />
                        <div className={styles.slotNameCell}>
                          <div className={styles.slotName}>{slot.label}</div>
                          <div className={styles.slotRole}>{slot.isHost ? "Anfitrión" : slot.role}</div>
                        </div>
                        {slot.clientId || slot.isHost ? <div className={styles.readonlyValue}>{slot.team}</div> : (
                          <select className={styles.slotSelect} disabled={!isLocalHost} onChange={(event) => updateSlot(slot.id, "team", event.target.value)} value={slot.team}>{SLOT_TEAM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                        )}
                        {slot.isHost ? <div className={styles.hostBadge}>Anfitrión</div> : slot.clientId ? <div className={styles.readonlyValue}>Jugador</div> : (
                          <select className={styles.slotSelect} disabled={!isLocalHost} onChange={(event) => updateSlot(slot.id, "kind", event.target.value)} value={slot.kind}>{SLOT_KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {isCreated ? (
            <div className={styles.matchStartPanel}>
              <label className={styles.readyToggle}>
                <input checked={isHostReady} className={styles.readyCheckbox} onChange={(event) => setIsHostReady(event.target.checked)} type="checkbox" />
                <span className={styles.readyLabel}>ESTOY LISTO</span>
              </label>
              <button className={`${styles.startMatchButton} ${canStartMatch ? styles.startMatchButtonReady : ""}`} disabled={!isLocalHost} onClick={launchOnlineMatch} type="button">COMENZAR PARTIDA</button>
              {countdown != null ? <div className={styles.countdownText}>Inicia en {countdown}</div> : null}
            </div>
          ) : null}

          <div className={styles.boardBottomArea}>
            <div className={styles.chatMessages}>
              {messages.map((message) => <div className={styles.chatMessage} key={message.id}><span className={styles.chatAuthor}>{message.author}:</span> {message.text}</div>)}
            </div>
          </div>

          <form className={styles.chatComposer} onSubmit={sendMessage}>
            <input className={styles.chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Escribí un mensaje para la sala" type="text" value={chatInput} />
            <button className={styles.sendButton} type="submit">Enviar</button>
          </form>

          <div className={styles.roomFooterText}>{statusText}</div>
        </div>
      </div>
    </div>
  );
}

export default function TankGameLanding({ onStartGame }) {
  const [screen, setScreen] = useState("menu");
  const [menuKey, setMenuKey] = useState("root");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusText, setStatusText] = useState(MENU_SCREENS.root.status);
  const [playerName, setPlayerName] = useState("Player1");
  const [joinedRoomSession, setJoinedRoomSession] = useState(null);
  const lastNavAtRef = useRef(0);
  const lastAxisDirRef = useRef(0);

  const menu = useMemo(() => MENU_SCREENS[menuKey] ?? MENU_SCREENS.root, [menuKey]);

  useEffect(() => {
    try {
      const savedName = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
      if (savedName?.trim()) setPlayerName(savedName.trim());
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName || "Player1");
    } catch {
      // noop
    }
  }, [playerName]);

  useEffect(() => {
    setSelectedIndex(0);
    setStatusText(menu.status);
  }, [menuKey, menu.status]);

  function normalizedPlayerName(value) {
    return value.trimStart() || "Player1";
  }

  function moveSelection(direction) {
    setSelectedIndex((current) => (current + direction + menu.items.length) % menu.items.length);
  }

  function activateCurrent() {
    const item = menu.items[selectedIndex];
    if (!item) return;
    if (item.next) {
      setMenuKey(item.next);
      return;
    }
    if (item.back) {
      setMenuKey("root");
      setStatusText("Volviste al menú anterior.");
      return;
    }
    if (item.action === "play") {
      onStartGame?.();
      return;
    }
    if (item.action === "createRoom") {
      setScreen("createRoom");
      setStatusText("Definí los datos iniciales de la sala.");
      return;
    }
    if (item.action === "browseRooms") {
      setScreen("browseRooms");
      setStatusText("Buscando salas disponibles.");
      return;
    }
    setStatusText("Sección en preparación.");
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((screen === "createRoom" || screen === "browseRooms") && ["Escape", "Backspace"].includes(event.key) && !isTypingTarget(event.target)) {
        event.preventDefault();
        setScreen("menu");
        setMenuKey("multi");
        setStatusText("Volviste a Multiplayer.");
        return;
      }
      if (screen !== "menu") return;
      if (["ArrowDown", "s", "S"].includes(event.key)) {
        event.preventDefault();
        moveSelection(1);
      } else if (["ArrowUp", "w", "W"].includes(event.key)) {
        event.preventDefault();
        moveSelection(-1);
      } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        activateCurrent();
      } else if (["Escape", "Backspace"].includes(event.key) && menuKey !== "root") {
        event.preventDefault();
        setMenuKey("root");
        setStatusText("Volviste al menú anterior.");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, menuKey, selectedIndex, menu.items]);

  useEffect(() => {
    let frameId = 0;
    function loop() {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find(Boolean);
      if (pad) {
        const now = performance.now();
        if (screen !== "menu") {
          if ((pad.buttons?.[1]?.pressed || pad.buttons?.[9]?.pressed) && now - lastNavAtRef.current > 120) {
            setScreen("menu");
            setMenuKey("multi");
            setStatusText("Volviste a Multiplayer.");
            lastNavAtRef.current = now;
          }
          frameId = window.requestAnimationFrame(loop);
          return;
        }
        const axisY = pad.axes?.[1] ?? 0;
        const downPressed = Boolean(pad.buttons?.[13]?.pressed);
        const upPressed = Boolean(pad.buttons?.[12]?.pressed);
        let direction = 0;
        if (axisY > AXIS_DEADZONE || downPressed) direction = 1;
        if (axisY < -AXIS_DEADZONE || upPressed) direction = -1;
        if (direction !== 0 && (lastAxisDirRef.current !== direction || now - lastNavAtRef.current > NAV_REPEAT_MS)) {
          moveSelection(direction);
          lastNavAtRef.current = now;
        }
        lastAxisDirRef.current = direction;
        if (pad.buttons?.[0]?.pressed && now - lastNavAtRef.current > 120) {
          activateCurrent();
          lastNavAtRef.current = now;
        }
        if (menuKey !== "root" && (pad.buttons?.[1]?.pressed || pad.buttons?.[9]?.pressed) && now - lastNavAtRef.current > 120) {
          setMenuKey("root");
          setStatusText("Volviste al menú anterior.");
          lastNavAtRef.current = now;
        }
      }
      frameId = window.requestAnimationFrame(loop);
    }
    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, [screen, menuKey, selectedIndex, menu.items]);

  if (screen === "createRoom") {
    return <CreateRoomScreen onBack={() => { setScreen("menu"); setMenuKey("multi"); setStatusText("Volviste a Multiplayer."); }} onPlayerNameChange={(value) => setPlayerName(normalizedPlayerName(value))} playerName={playerName} setStatusText={setStatusText} statusText={statusText} onStartGame={onStartGame} />;
  }

  if (screen === "joinedRoom") {
    return <CreateRoomScreen backgroundSrc={JOINED_ROOM_BG} initialIsHost={!!joinedRoomSession?.isHost} initialRoomId={joinedRoomSession?.roomId || null} onBack={() => { setJoinedRoomSession(null); setScreen("browseRooms"); setStatusText("Volviste al listado de salas."); }} onPlayerNameChange={(value) => setPlayerName(normalizedPlayerName(value))} playerName={playerName} setStatusText={setStatusText} statusText={statusText} onStartGame={onStartGame} />;
  }

  if (screen === "browseRooms") {
    return <BrowseRoomsScreen onBack={() => { setScreen("menu"); setMenuKey("multi"); setStatusText("Volviste a Multiplayer."); }} onJoinRoom={(session) => { setJoinedRoomSession(session); setScreen("joinedRoom"); setStatusText("Uniéndote a la sala..."); }} playerName={playerName} setStatusText={setStatusText} />;
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.stage}>
        <img alt="Battle City Tribute landing" className={styles.background} src="/landing-menu-bg.png" />
        <div className={styles.overlay}>
          <div className={styles.menuBlock}>
            <div className={styles.breadcrumb}>{menu.breadcrumb}</div>
            <nav aria-label="Menú principal" className={styles.menu}>
              {menu.items.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button key={item.label} className={`${styles.menuItem} ${isSelected ? styles.menuItemSelected : ""}`} onClick={() => { setSelectedIndex(index); activateCurrent(); }} onMouseEnter={() => setSelectedIndex(index)} type="button">
                    <span>{item.label}</span>
                    <span className={styles.chevron}>{isSelected ? "▸" : ""}</span>
                  </button>
                );
              })}
            </nav>
            <div className={styles.footerRow}>
              <div className={styles.controlsText}>Stick / ↑↓ navegar &nbsp;&nbsp; A / Enter confirmar</div>
              <div className={styles.statusText}>{statusText}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
