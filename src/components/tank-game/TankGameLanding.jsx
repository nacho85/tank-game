"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./tank-game-landing.module.css";
import {
  claimOnlinePlayerName,
  clearOnlineSession,
  getOrCreateOnlineBrowserToken,
  getOrCreateOnlineReconnectToken,
  getSuggestedOnlinePlayerName,
  readOnlineSession,
  readStoredOnlinePlayerName,
  releaseOnlinePlayerName,
  updateOnlineSession,
  writeStoredOnlinePlayerName,
} from "@/game/phaser/online/session";
import { normalizeWsUrl } from "@/game/phaser/online/protocol";

const SETTINGS_STORAGE_KEY = "tank-game-settings-v1";
const AXIS_DEADZONE = 0.45;
const NAV_REPEAT_MS = 190;
const HEARTBEAT_MS = 5000;
const CREATE_ROOM_BG = "/create-room-bg.png";
const JOINED_ROOM_BG = "/create-room-bg-2.png";
const GAMEPAD_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"][tabindex]:not([aria-disabled="true"])',
].join(", ");
let sharedLobbySocket = null;
let sharedLobbyHeartbeatId = null;
let sharedLobbyHandlers = {};
let pendingCreateRoomRequestId = null;

function armPendingCreateRoomRequest() {
  pendingCreateRoomRequestId = `create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return pendingCreateRoomRequestId;
}

function readPendingCreateRoomRequest() {
  return pendingCreateRoomRequestId;
}

function clearPendingCreateRoomRequest() {
  pendingCreateRoomRequestId = null;
}

const MENU_SCREENS = {
  root: {
    breadcrumb: "CENTRO DE OPERACIONES",
    items: [
      { label: "Local", next: "single" },
      { label: "Multiplayer", action: "browseRooms" },
      { label: "Configuración", next: "config" },
    ],
    status: "Listo para desplegar.",
  },
  single: {
    breadcrumb: "CENTRO DE OPERACIONES / LOCAL",
    items: [
      { label: "Clásico", next: "classicSeries" },
      { label: "Survival", next: "survivalDifficulty" },
      { label: "Volver", back: true },
    ],
    status: "Seleccioná un modo individual.",
  },
  classicSeries: {
    breadcrumb: "CENTRO DE OPERACIONES / LOCAL / CLÁSICO",
    items: [
      {
        label: "80s",
        action: "play",
        gameMode: "classic",
        localSettings: {
          classicVariant: "80s",
          enemyTanketteRatio: 35,
        },
        status: "Campaña 80s: primeros 5 niveles inspirados en Battle City.",
      },
      {
        label: "Boss",
        action: "play",
        gameMode: "classic",
        localSettings: { classicVariant: "boss" },
      },
      { label: "Volver", back: true, backTo: "single" },
    ],
    status: "Elegí qué rama del clásico querés jugar.",
  },
  survivalDifficulty: {
    breadcrumb: "CENTRO DE OPERACIONES / LOCAL / SURVIVAL / DIFICULTAD",
    items: [
      {
        label: "Fácil",
        next: "survivalMode",
        localSettings: {
          enemyBehaviorPreset: 3,
          enemyAggression: 70,
          enemyNavigationSkill: 80,
          enemyBreakBricks: 64,
          enemyRecoverySkill: 78,
          enemyFireDiscipline: 70,
          enemyShotFrequency: 62,
          enemyAimErrorDeg: 8,
          enemyRushMode: 1,
        },
      },
      {
        label: "Normal",
        next: "survivalMode",
        localSettings: {
          enemyBehaviorPreset: 3,
          enemyAggression: 74,
          enemyNavigationSkill: 84,
          enemyBreakBricks: 68,
          enemyRecoverySkill: 80,
          enemyFireDiscipline: 72,
          enemyShotFrequency: 64,
          enemyAimErrorDeg: 7,
          enemyRushMode: 1,
        },
      },
      {
        label: "Dificil",
        next: "survivalMode",
        localSettings: {
          enemyBehaviorPreset: 3,
          enemyAggression: 78,
          enemyNavigationSkill: 88,
          enemyBreakBricks: 72,
          enemyRecoverySkill: 82,
          enemyFireDiscipline: 76,
          enemyShotFrequency: 68,
          enemyAimErrorDeg: 6,
          enemyRushMode: 2,
        },
      },
      {
        label: "Massacre",
        next: "survivalMode",
        localSettings: {
          enemyBehaviorPreset: 3,
          enemyAggression: 82,
          enemyNavigationSkill: 91,
          enemyBreakBricks: 76,
          enemyRecoverySkill: 85,
          enemyFireDiscipline: 80,
          enemyShotFrequency: 72,
          enemyAimErrorDeg: 5,
          enemyRushMode: 2,
        },
      },
      { label: "Volver", back: true, backTo: "single" },
    ],
    status: "Elegi cuan despiertos queres a los enemigos.",
  },
  survivalMode: {
    breadcrumb: "CENTRO DE OPERACIONES / LOCAL / SURVIVAL / MODO",
    items: [
      { label: "Lago", action: "play", gameMode: "survival", localSettings: { survivalMapAlgorithm: 0 } },
      { label: "Río", action: "play", gameMode: "survival", localSettings: { survivalMapAlgorithm: 1 } },
      { label: "Isla abierta", action: "play", gameMode: "survival", localSettings: { survivalMapAlgorithm: 2 } },
      { label: "Archipiélago", action: "play", gameMode: "survival", localSettings: { survivalMapAlgorithm: 3 } },
      { label: "Volver", back: true, backTo: "survivalDifficulty" },
    ],
    status: "Elegí el tipo de mapa para Survival.",
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
const AI_DIFFICULTY_OPTIONS = ["Facil", "Normal", "Dificil", "Massacre"];
const DEFAULT_PLAYER_COLOR = "#d8b13a";
const RANDOM_PLAYER_COLOR = "Azar";
const COLOR_PALETTE = [
  "#f5f5f5", "#ffd166", "#c2b280", "#f4c430", "#ffb703", "#c0ca33",
  "#8ac926", "#39d353", "#2dc653", "#4cc9f0", "#00bcd4", "#14b8a6",
  "#06d6a0", "#ff9f1c", "#ff7f50", "#ef476f", "#ff66c4", "#e11d48",
  "#c1121f", "#00a6fb", "#3a86ff", "#4361ee", "#8b5cf6", "#7b2cbf",
  "#b5179e", "#a47148", "#6b7280", "#374151", "#111827",
];
const ALLOWED_PLAYER_COLORS = new Set(COLOR_PALETTE);
const UNASSIGNED_TEAM = "-";
const TEAM_ONE = "1";
const TEAM_TWO = "2";
const SLOT_TEAM_OPTIONS = [UNASSIGNED_TEAM, TEAM_ONE, TEAM_TWO];
const PLAYABLE_TEAM_OPTIONS = [TEAM_ONE, TEAM_TWO];
const TEAM_CAPACITY = 2;
const SLOT_COLORS = [
  { name: "Amarillo", swatch: "#d8b13a", previewSrc: "/tank-game/player-body-yellow-V2.png", previewFilter: "none" },
  { name: "Verde", swatch: "#5f9b5b", previewSrc: "/tank-game/player-body-yellow-V2.png", previewFilter: "hue-rotate(78deg) saturate(1.1) brightness(0.92)" },
  { name: "Rojo", swatch: "#d4675f", previewSrc: "/tank-game/player-body-yellow-V2.png", previewFilter: "sepia(1) saturate(3.8) hue-rotate(-28deg) brightness(1.02)" },
  { name: "Azul", swatch: "#6d9fe0", previewSrc: "/tank-game/player-body-yellow-V2.png", previewFilter: "sepia(0.9) saturate(3.2) hue-rotate(130deg) brightness(1.05)" },
];
const AI_CELEBRITY_NAMES = [
  "Messi",
  "Maradona",
  "Ronaldo",
  "Pele",
  "Neymar",
  "Zidane",
  "Ronaldinho",
  "Beckham",
  "Mbappe",
  "Cruyff",
  "Federer",
  "Nadal",
  "Djokovic",
  "Jordan",
  "Kobe",
  "Ali",
  "Tyson",
  "Bolt",
  "Senna",
  "Fangio",
  "Madonna",
  "Mozart",
  "Gandhi",
  "Mandela",
  "Frida",
  "Borges",
  "Picasso",
  "Dalai",
  "Platon",
  "Socrates",
  "Tesla",
  "Newton",
  "Darwin",
  "Galileo",
  "DaVinci",
  "Einstein",
  "Napoleon",
  "Cleopatra",
  "Tutankamon",
  "Asterix",
  "Obelix",
  "Shrek",
  "Homer",
  "Yoda",
  "Zelda",
  "Rocky",
  "Conan",
  "Neo",
  "Draco",
  "Euclides",
  "Rambo",
  "Mulan",
  "Simba",
  "Genie",
  "Sonic",
  "Mario",
  "Luigi",
  "Kirby",
  "Crash",
  "Spyro",
  "Kratos",
  "Subzero",
  "Raiden",
  "Goku",
  "Vegeta",
  "Naruto",
  "Sasuke",
  "Luffy",
  "Nami",
  "Totoro",
  "Akira",
  "Amelie",
  "Bambi",
  "Dumbo",
  "Stitch",
  "Tarzan",
  "Bowie",
  "Socrates",
  "Prince",
  "Adele",
  "Bono",
  "Cher",
  "Elvis",
  "Batman",
  "Superman",
  "Joker",
  "Thanos",
  "Loki",
  "Thor",
  "Hulk",
  "Tilín",
];

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function getGamepadFocusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(GAMEPAD_FOCUSABLE_SELECTOR)).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hidden) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  });
}

function focusGamepadElement(root, nextIndex) {
  const elements = getGamepadFocusableElements(root);
  if (!elements.length) return false;
  const clampedIndex = ((nextIndex % elements.length) + elements.length) % elements.length;
  elements[clampedIndex]?.focus?.();
  return true;
}

function triggerGamepadActivation(node) {
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName?.toLowerCase();
  if (tag === "input") {
    const inputType = String(node.getAttribute("type") || "").toLowerCase();
    if (inputType === "checkbox" || inputType === "radio" || inputType === "button") {
      node.click?.();
      return;
    }
  }
  if (tag === "button" || tag === "select" || node.getAttribute("role") === "button") {
    node.click?.();
    node.focus?.();
    return;
  }
  node.focus?.();
}

function stepFocusedSelect(node, direction) {
  if (!(node instanceof HTMLSelectElement)) return false;
  const nextIndex = node.selectedIndex + direction;
  if (nextIndex < 0 || nextIndex >= node.options.length) return false;
  node.selectedIndex = nextIndex;
  node.dispatchEvent(new Event("input", { bubbles: true }));
  node.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function useGamepadMenuNavigation({ enabled, rootRef, onBack }) {
  const lastNavAtRef = useRef(0);
  const lastVerticalRef = useRef(0);
  const lastHorizontalRef = useRef(0);
  const lastAcceptPressedRef = useRef(false);
  const lastBackPressedRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let frameId = 0;
    const step = () => {
      const root = rootRef.current;
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find(Boolean);
      const now = performance.now();

      if (!root || !pad) {
        initializedRef.current = false;
        lastVerticalRef.current = 0;
        lastHorizontalRef.current = 0;
        lastAcceptPressedRef.current = false;
        lastBackPressedRef.current = false;
        frameId = window.requestAnimationFrame(step);
        return;
      }

      const focusables = getGamepadFocusableElements(root);
      if (focusables.length) {
        const activeElement = document.activeElement;
        const currentIndex = focusables.indexOf(activeElement);
        if (currentIndex === -1) {
          focusGamepadElement(root, 0);
        }

        const axisX = pad.axes?.[0] ?? 0;
        const axisY = pad.axes?.[1] ?? 0;
        const rightPressed = Boolean(pad.buttons?.[15]?.pressed);
        const leftPressed = Boolean(pad.buttons?.[14]?.pressed);
        const downPressed = Boolean(pad.buttons?.[13]?.pressed);
        const upPressed = Boolean(pad.buttons?.[12]?.pressed);
        const acceptPressed = Boolean(pad.buttons?.[0]?.pressed);
        const backPressed = Boolean(pad.buttons?.[1]?.pressed || pad.buttons?.[9]?.pressed);

        if (!initializedRef.current) {
          initializedRef.current = true;
          lastNavAtRef.current = now;
          lastVerticalRef.current = 0;
          lastHorizontalRef.current = 0;
          lastAcceptPressedRef.current = acceptPressed;
          lastBackPressedRef.current = backPressed;
          frameId = window.requestAnimationFrame(step);
          return;
        }

        let verticalIntent = 0;
        if (axisY > AXIS_DEADZONE || downPressed) verticalIntent = 1;
        if (axisY < -AXIS_DEADZONE || upPressed) verticalIntent = -1;

        let horizontalIntent = 0;
        if (axisX > AXIS_DEADZONE || rightPressed) horizontalIntent = 1;
        if (axisX < -AXIS_DEADZONE || leftPressed) horizontalIntent = -1;

        const focusedNode = document.activeElement;
        const canRepeat = now - lastNavAtRef.current > NAV_REPEAT_MS;

        if (verticalIntent !== 0 && (lastVerticalRef.current !== verticalIntent || canRepeat)) {
          const baseIndex = Math.max(0, focusables.indexOf(focusedNode));
          focusGamepadElement(root, baseIndex + verticalIntent);
          lastNavAtRef.current = now;
        }

        if (horizontalIntent !== 0 && (lastHorizontalRef.current !== horizontalIntent || canRepeat)) {
          const handledSelect = stepFocusedSelect(focusedNode, horizontalIntent);
          if (!handledSelect) {
            const baseIndex = Math.max(0, focusables.indexOf(focusedNode));
            focusGamepadElement(root, baseIndex + horizontalIntent);
          }
          lastNavAtRef.current = now;
        }

        if (acceptPressed && !lastAcceptPressedRef.current && now - lastNavAtRef.current > 120) {
          triggerGamepadActivation(document.activeElement);
          lastNavAtRef.current = now;
        }

        if (backPressed && !lastBackPressedRef.current && now - lastNavAtRef.current > 120) {
          onBack?.();
          lastNavAtRef.current = now;
        }

        lastVerticalRef.current = verticalIntent;
        lastHorizontalRef.current = horizontalIntent;
        lastAcceptPressedRef.current = acceptPressed;
        lastBackPressedRef.current = backPressed;
      }

      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, onBack, rootRef]);
}

function getColorSwatch(colorName) {
  if (colorName === RANDOM_PLAYER_COLOR) return "linear-gradient(135deg, #e8d993 0%, #8fb2d9 50%, #c36a5b 100%)";
  if (typeof colorName === "string" && /^#[0-9a-f]{6}$/i.test(colorName.trim())) return colorName.trim();
  return SLOT_COLORS.find((item) => item.name === colorName)?.swatch ?? DEFAULT_PLAYER_COLOR;
}

function getColorOption(colorName) {
  return SLOT_COLORS.find((item) => item.name === colorName) ?? SLOT_COLORS[0];
}

function normalizeCustomColor(value) {
  const normalized = String(value || "").trim();
  if (normalized === RANDOM_PLAYER_COLOR) return RANDOM_PLAYER_COLOR;
  const hexValue = /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : DEFAULT_PLAYER_COLOR;
  return ALLOWED_PLAYER_COLORS.has(hexValue) ? hexValue : DEFAULT_PLAYER_COLOR;
}

function getSocketUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_TANK_WS_URL;
  if (configuredUrl?.trim()) return normalizeWsUrl(configuredUrl);
  if (typeof window === "undefined") return "ws://localhost:3001";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return normalizeWsUrl(`${protocol}//${window.location.hostname}:3001`);
}

function normalizeAiDifficulty(value) {
  return AI_DIFFICULTY_OPTIONS.includes(value) ? value : "Normal";
}

function isAiCelebrityName(value) {
  return AI_CELEBRITY_NAMES.includes(String(value || "").trim());
}

function pickRandomAiCelebrityName(slots, targetSlotId) {
  const usedNames = new Set(
    (slots || [])
      .filter((slot) => slot?.id !== targetSlotId && slot?.kind === "IA" && isAiCelebrityName(slot?.label))
      .map((slot) => String(slot.label).trim()),
  );
  const availableNames = AI_CELEBRITY_NAMES.filter((name) => !usedNames.has(name));
  const pool = availableNames.length ? availableNames : AI_CELEBRITY_NAMES;
  return pool[Math.floor(Math.random() * pool.length)] || "Ronaldo";
}

function normalizeSlotsWithAiIdentity(slots) {
  return slots.map((slot, index) => {
    if (slot.clientId || slot.isHost) return { ...slot, aiDifficulty: normalizeAiDifficulty(slot.aiDifficulty) };

    if (slot.kind === "IA") {
      const celebrityName = isAiCelebrityName(slot.label)
        ? String(slot.label).trim()
        : pickRandomAiCelebrityName(slots, slot.id);
      return {
        ...slot,
        label: celebrityName,
        role: `IA ${index + 1}`,
        aiDifficulty: normalizeAiDifficulty(slot.aiDifficulty),
      };
    }

    return {
      ...slot,
      label: slot.baseRole || slot.role || `Slot ${index + 1}`,
      role: slot.baseRole || slot.role || `Slot ${index + 1}`,
      aiDifficulty: normalizeAiDifficulty(slot.aiDifficulty),
    };
  });
}

function getStoredLobbySession() {
  const savedSession = readOnlineSession();
  if (!savedSession?.roomId || savedSession?.inMatch) return null;
  return {
    roomId: savedSession.roomId,
    isHost: !!savedSession.isHost,
  };
}

function getDefaultRoomName(playerName) {
  const safeName = String(playerName || "").trim() || "Player1";
  return `Sala de ${safeName}`;
}

function buildInitialSlots(playerName) {
  return normalizeSlotsWithAiIdentity([
    {
      id: "host",
      label: playerName || "Player1",
      baseRole: "Anfitrion",
      role: "Anfitrión",
      kind: "Jugador",
      color: RANDOM_PLAYER_COLOR,
      team: UNASSIGNED_TEAM,
      aiDifficulty: "Normal",
      locked: true,
      isHost: true,
      isReady: false,
      clientId: "local-host",
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `slot-${index + 2}`,
      label: `Slot ${index + 2}`,
      role: `Slot ${index + 2}`,
      baseRole: `Slot ${index + 2}`,
      kind: "Abierto",
      color: RANDOM_PLAYER_COLOR,
      team: UNASSIGNED_TEAM,
      aiDifficulty: "Normal",
      locked: false,
      isHost: false,
      isReady: false,
      clientId: null,
    })),
  ]);
}

function getOccupiedCount(slots) {
  return slots.filter((slot) => slot.clientId || slot.kind === "IA").length;
}

function isTeamCountingSlot(slot) {
  if (!slot) return false;
  if (slot.kind === "Cerrado") return false;
  return slot.team === TEAM_ONE || slot.team === TEAM_TWO;
}

function getTeamCounts(slots, excludeSlotId = null) {
  return slots.reduce((counts, slot) => {
    if (!isTeamCountingSlot(slot)) return counts;
    if (slot.id === excludeSlotId) return counts;
    if (slot.team === TEAM_ONE) counts.team1 += 1;
    if (slot.team === TEAM_TWO) counts.team2 += 1;
    return counts;
  }, { team1: 0, team2: 0 });
}

function getAvailableTeamsForSlot(slots, slotId = null) {
  const counts = getTeamCounts(slots, slotId);
  return PLAYABLE_TEAM_OPTIONS.filter((team) => (
    team === TEAM_ONE ? counts.team1 < TEAM_CAPACITY : counts.team2 < TEAM_CAPACITY
  ));
}

function getTeamOptionsForSlot(slots, slot) {
  if (!slot) return SLOT_TEAM_OPTIONS;

  const availableTeams = getAvailableTeamsForSlot(slots, slot.id);
  const options = [UNASSIGNED_TEAM];

  availableTeams.forEach((team) => {
    if (!options.includes(team)) options.push(team);
  });

  return options;
}

function getEffectiveSlotTeamValue(slots, slot) {
  const options = getTeamOptionsForSlot(slots, slot);
  return options.includes(slot?.team) ? slot.team : UNASSIGNED_TEAM;
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
  const normalizedValue = normalizeCustomColor(value);
  return (
    <div className={styles.colorPickerWrap}>
      <button
        className={styles.colorSwatchButton}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onToggle();
        }}
        style={{ background: getColorSwatch(normalizedValue) }}
        type="button"
      >
        <span className={styles.visuallyHidden}>{normalizedValue}</span>
      </button>

      {open ? (
        <div className={styles.colorPalette}>
          <button
            className={`${styles.colorPaletteItem} ${styles.colorPaletteRandom}`}
            onClick={() => {
              onChange(RANDOM_PLAYER_COLOR);
              onClose();
            }}
            style={{ background: getColorSwatch(RANDOM_PLAYER_COLOR) }}
            type="button"
          >
            <span className={styles.visuallyHidden}>{RANDOM_PLAYER_COLOR}</span>
          </button>
          {COLOR_PALETTE.map((option) => (
            <button
              className={styles.colorPaletteItem}
              key={option}
              onClick={() => {
                onChange(option);
                onClose();
              }}
              style={{ background: option }}
              type="button"
            >
              <span className={styles.visuallyHidden}>{option}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function useLobbySocket(playerName, onStatusText, autoDisconnect = true) {
  const socketRef = useRef(null);
  const playerNameRef = useRef(playerName);
  const statusTextHandlerRef = useRef(onStatusText);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  useEffect(() => {
    statusTextHandlerRef.current = onStatusText;
  }, [onStatusText]);

  const disconnect = useCallback(() => {
    if (sharedLobbyHeartbeatId) {
      window.clearInterval(sharedLobbyHeartbeatId);
      sharedLobbyHeartbeatId = null;
    }
    try {
      sharedLobbySocket?.close();
    } catch {
      // noop
    } finally {
      sharedLobbySocket = null;
      socketRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const existing = sharedLobbySocket;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      socketRef.current = existing;
      return existing;
    }

    const socketUrl = getSocketUrl();
    const ws = new WebSocket(socketUrl);
    const reconnectToken = getOrCreateOnlineReconnectToken();
    const browserToken = getOrCreateOnlineBrowserToken();
    sharedLobbySocket = ws;
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "connect_lobby", payload: { playerName: playerNameRef.current, reconnectToken, browserToken } }));
      if (sharedLobbyHeartbeatId) window.clearInterval(sharedLobbyHeartbeatId);
      sharedLobbyHeartbeatId = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "connect_lobby", payload: { playerName: playerNameRef.current, reconnectToken, browserToken } }));
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const handler = sharedLobbyHandlers[message.type];
        if (handler) handler(message.payload);
      } catch {
        // noop
      }
    });

    ws.addEventListener("close", () => {
      if (sharedLobbyHeartbeatId) {
        window.clearInterval(sharedLobbyHeartbeatId);
        sharedLobbyHeartbeatId = null;
      }
      if (sharedLobbySocket === ws) {
        sharedLobbySocket = null;
      }
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    });

    ws.addEventListener("error", () => {
      statusTextHandlerRef.current?.(`No se pudo conectar con el lobby multiplayer (${socketUrl}).`);
    });

    return ws;
  }, []);

  const send = useCallback((type, payload) => {
    const ws = connect();
    const emit = () => ws.send(JSON.stringify({ type, payload }));
    if (ws.readyState === WebSocket.OPEN) emit();
    else ws.addEventListener("open", emit, { once: true });
  }, [connect]);

  const registerHandlers = useCallback((handlers) => {
    sharedLobbyHandlers = handlers || {};
  }, []);

  useEffect(() => {
    if (!autoDisconnect) return undefined;
    return () => disconnect();
  }, [autoDisconnect, disconnect]);

  return useMemo(() => ({
    connect,
    disconnect,
    send,
    socketRef,
    registerHandlers,
  }), [connect, disconnect, send, registerHandlers]);
}

function BrowseRoomsScreen({ lobby: sharedLobby = null, playerName, onBack, onCreateRoom, onJoinRoom, onPlayerNameChange, setStatusText }) {
  const screenRef = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const fallbackLobby = useLobbySocket(playerName, setStatusText, !sharedLobby);
  const lobby = sharedLobby || fallbackLobby;
  const selectedRoomIdRef = useRef(null);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    const focusId = window.requestAnimationFrame(() => {
      const root = screenRef.current;
      if (!root) return;
      const focusables = getGamepadFocusableElements(root);
      const firstInteractive = focusables.find((node) => {
        const text = node?.textContent?.trim?.() || "";
        return text !== "← Volver";
      }) || focusables[0];
      firstInteractive?.focus?.();
    });
    return () => window.cancelAnimationFrame(focusId);
  }, []);

  useEffect(() => {
    const root = screenRef.current;
    if (!root || !rooms.length) return;
    const active = document.activeElement;
    if (active && root.contains(active)) return;
    const focusId = window.requestAnimationFrame(() => {
      const focusables = getGamepadFocusableElements(root);
      const firstRoom = focusables.find((node) => node.classList?.contains?.(styles.browseRoomRow));
      (firstRoom || focusables[0])?.focus?.();
    });
    return () => window.cancelAnimationFrame(focusId);
  }, [rooms]);

  useEffect(() => {
    lobby.registerHandlers({
      room_list: (payload) => {
        const nextRooms = payload?.rooms || [];
        setRooms(nextRooms);
        if (!nextRooms.length) {
          setSelectedRoom(null);
          setSelectedRoomId(null);
          return;
        }
        const nextRoomId = nextRooms.some((room) => room.id === selectedRoomIdRef.current)
          ? selectedRoomIdRef.current
          : nextRooms[0]?.id || null;
        if (nextRoomId && nextRoomId !== selectedRoomIdRef.current) {
          setSelectedRoomId(nextRoomId);
          lobby.send("list_rooms", { roomId: nextRoomId });
        }
      },
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

    function handleVisibilityRefresh() {
      if (document.visibilityState !== "visible") return;
      lobby.send("list_rooms", {});
      if (selectedRoomIdRef.current) lobby.send("list_rooms", { roomId: selectedRoomIdRef.current });
    }

    const pollId = window.setInterval(() => {
      lobby.send("list_rooms", {});
      if (selectedRoomIdRef.current) lobby.send("list_rooms", { roomId: selectedRoomIdRef.current });
    }, 2000);

    window.addEventListener("focus", handleVisibilityRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("focus", handleVisibilityRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, []);

  function refresh() {
    lobby.send("list_rooms", {});
    if (selectedRoomId) lobby.send("list_rooms", { roomId: selectedRoomId });
    setStatusText("Lista de salas actualizada.");
  }

  function showRoom(roomId) {
    if (!roomId) return;
    setSelectedRoomId(roomId);
    lobby.send("list_rooms", { roomId });
  }

  function joinSelected(roomId) {
    if (!roomId) return;
    setStatusText("Uniéndote a la sala...");
    onJoinRoom?.({ roomId, isHost: false });
  }

  useGamepadMenuNavigation({
    enabled: true,
    rootRef: screenRef,
    onBack,
  });

  return (
    <div className={styles.viewport} ref={screenRef}>
      <div className={styles.stage}>
        <img alt="Buscar salas" className={styles.background} src="/view-rooms-bg.png" />
        <div className={styles.createRoomOverlay}>
          <button className={styles.backButton} onClick={onBack} type="button">← Volver</button>
          <div className={styles.boardTopArea}>
            <div className={styles.setupContent} style={{ gap: "0.6rem" }}>
              <label className={styles.browseNameBar}>
                <span className={styles.browseNameLabel}>Nombre:</span>
                <input className={styles.browseNameInput} maxLength={30} onChange={(event) => onPlayerNameChange?.(event.target.value)} placeholder="Player1" type="text" value={playerName} />
              </label>
              <div className={styles.browseRoomsToolbar}>
                <div className={styles.fieldLabel}>Salas abiertas</div>
                <div className={styles.browseRoomsActions}>
                  <button className={styles.primaryButton} onClick={onCreateRoom} style={{ marginTop: 0 }} type="button">Crear sala</button>
                  <button className={styles.primaryButton} onClick={refresh} style={{ marginTop: 0 }} type="button">Actualizar</button>
                </div>
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
                      className={styles.browseRoomRow}
                      key={room.id}
                      onClick={() => showRoom(room.id)}
                      onFocus={() => showRoom(room.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") showRoom(room.id); }}
                      style={{
                        border: selected ? "1px solid #8a6511" : "1px solid rgba(69,58,45,0.18)",
                        background: selected ? "rgba(216,177,58,0.12)" : "rgba(255,253,246,0.55)",
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
                }) : <div className={styles.emptyRoomsMessage}>En este momento no hay salas abiertas disponibles...</div>}
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
                          <div className={styles.slotNameCell}><div className={styles.slotName}>{slot.label}</div><div className={styles.slotRole}>{slot.kind === "IA" ? `IA · ${slot.aiDifficulty || "Normal"}` : slot.role}</div></div>
                          <div className={styles.readonlyValue}>{slot.team}</div>
                          <div className={styles.readonlyValue}>{slot.clientId ? "Jugador" : (slot.kind === "IA" ? `IA · ${slot.aiDifficulty || "Normal"}` : slot.kind)}</div>
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

function CreateRoomScreen({ lobby: sharedLobby = null, playerName, onPlayerNameChange, onBack, onStartGame, statusText, setStatusText, backgroundSrc = CREATE_ROOM_BG, initialRoomId = null, initialIsHost = true, createRequestId = null }) {
  const screenRef = useRef(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [roomName, setRoomName] = useState(() => getDefaultRoomName(playerName));
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
  const autoCreateRequestedRef = useRef(false);
  const roomIdRef = useRef(roomId);
  const localClientIdRef = useRef(localClientId);
  const isLocalHostRef = useRef(isLocalHost);
  const slotsRef = useRef(slots);
  const createRequestIdRef = useRef(createRequestId || armPendingCreateRoomRequest());
  const fallbackLobby = useLobbySocket(playerName, setStatusText, !sharedLobby);
  const lobby = sharedLobby || fallbackLobby;
  const browserToken = getOrCreateOnlineBrowserToken();

  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { localClientIdRef.current = localClientId; }, [localClientId]);
  useEffect(() => { isLocalHostRef.current = isLocalHost; }, [isLocalHost]);
  useEffect(() => { slotsRef.current = slots; }, [slots]);

  function beginCountdown(matchConfig = null) {
    try {
      const currentSettings = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...currentSettings, gameMode: 2 }));
    } catch {
      // noop
    }

    const currentRoomId = roomIdRef.current;
    const currentLocalClientId = localClientIdRef.current;
    const currentSlots = slotsRef.current;
    const currentIsLocalHost = isLocalHostRef.current;
    const nextIsHost = currentLocalClientId
      ? !!currentSlots.find((slot) => slot.clientId === currentLocalClientId && slot.isHost)
      : currentIsLocalHost;
    updateOnlineSession({ roomId: currentRoomId, isHost: nextIsHost, inMatch: true, matchConfig });
    setStatusIsError(false);
    setStatusText("Todos listos. Iniciando partida online en 3...");
    setCountdown(3);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current == null) return current;
        if (current <= 1) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          window.setTimeout(() => onStartGame?.({ gameMode: "online_2v2" }), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    lobby.registerHandlers({
      client_identified: (payload) => {
        setLocalClientId(payload?.clientId || null);
      },
      joined_room: (payload) => {
        clearPendingCreateRoomRequest();
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
        setSlots(normalizeSlotsWithAiIdentity(payload.slots || []));
        setMessages((payload.messages || []).length ? payload.messages : [{ id: "sys-empty", author: "Sistema", text: "Sala sincronizada." }]);
        setIsCreated(true);
        const currentLocalClientId = localClientIdRef.current;
        const identifiedSlot = (payload.slots || []).find((slot) => slot.clientId && slot.clientId === currentLocalClientId) || null;
        const fallbackHostSlot = (!identifiedSlot && (isLocalHostRef.current || initialIsHost))
          ? ((payload.slots || []).find((slot) => slot.isHost) || null)
          : null;
        const mySlot = identifiedSlot || fallbackHostSlot;
        setIsLocalHost(!!mySlot?.isHost);
        if (mySlot) setIsHostReady(!!mySlot.isReady);
      },
      room_closed: () => {
        clearPendingCreateRoomRequest();
        setStatusText("La sala se cerró porque no quedaron jugadores humanos conectados.");
        setIsCreated(false);
        setRoomId(null);
        setSlots(buildInitialSlots(playerName));
        clearOnlineSession();
      },
      match_starting: (payload) => {
        setStatusIsError(false);
        beginCountdown(payload?.matchConfig || null);
      },
      error: (payload) => {
        setStatusIsError(true);
        setStatusText(payload?.message || "No se pudo completar la acción.");
      },
    });
    lobby.connect();
  }, [playerName, localClientId]);

  useEffect(() => {
    if (!initialRoomId) return;
    if (initialIsHost) {
      lobby.send("list_rooms", { roomId: initialRoomId });
      return;
    }
    lobby.send("join_room", { roomId: initialRoomId, playerName, reconnectToken: getOrCreateOnlineReconnectToken() });
  }, [initialRoomId, initialIsHost, playerName]);

  useEffect(() => {
    if (!initialIsHost || initialRoomId || roomId || autoCreateRequestedRef.current || !createRequestIdRef.current) return;

    autoCreateRequestedRef.current = true;
    const nextSlots = buildInitialSlots(playerName).map((slot, index) => {
      if (index === 0) return { ...slot, label: playerName || "Player1" };
      return slot;
    });
    const nextRoomName = roomName.trim() || getDefaultRoomName(playerName);

    setStatusText(`Abriendo "${nextRoomName}"...`);
    lobby.send("create_room", {
      createRequestId: createRequestIdRef.current,
      roomName: nextRoomName,
      playerName,
      browserToken,
      mode,
      density,
      rounds,
      lives,
      baseHits,
      slots: nextSlots,
    });
  }, [initialIsHost, initialRoomId, roomId, playerName, roomName, browserToken, mode, density, rounds, lives, baseHits]);

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

  const occupiedSlots = useMemo(() => getOccupiedCount(slots), [slots]);
  const localSlot = useMemo(
    () => (localClientId ? slots.find((slot) => slot.clientId === localClientId) || null : null),
    [slots, localClientId],
  );
  const effectiveIsLocalHost = localSlot ? !!localSlot.isHost : isLocalHost;
  const effectiveIsHostReady = localSlot ? !!localSlot.isReady : isHostReady;
  const isVisibleErrorStatus = statusIsError || /no se pudo conectar|error|no se pudo/i.test(String(statusText || ""));
  const footerText = countdown != null ? `Inicia en ${countdown}...` : statusText;
  const footerStatusClassName = countdown != null
    ? styles.roomFooterTextCountdown
    : (isVisibleErrorStatus ? styles.roomFooterTextError : styles.roomFooterTextInfo);
  const allHumansReady = useMemo(() => {
    const humans = slots.filter((slot) => slot.clientId);
    return humans.length > 0 && humans.every((slot) => slot.isReady);
  }, [slots]);
  const canStartMatch = isCreated && occupiedSlots === 4 && allHumansReady && countdown == null;

  useEffect(() => {
    if (!roomId) return;
    updateOnlineSession({ roomId, isHost: effectiveIsLocalHost, inMatch: false });
  }, [roomId, effectiveIsLocalHost]);

  useEffect(() => {
    if (!isCreated || !roomId || !effectiveIsLocalHost) return;
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
  }, [isCreated, roomId, effectiveIsLocalHost, roomName, playerName, mode, density, rounds, lives, baseHits, slots]);

  useEffect(() => {
    if (!roomId) return;
    lobby.send("set_ready", { roomId, isReady: isHostReady });
  }, [roomId, isHostReady]);

  function launchOnlineMatch() {
    if (!roomId) {
      setStatusText("La sala todavía no terminó de crearse en el servidor.");
      return;
    }
    if (!effectiveIsLocalHost || countdown != null) return;
    lobby.send("start_match", { roomId });
  }

  function updateSlot(slotId, field, value) {
    if (!effectiveIsLocalHost) return;
    setSlots((current) => normalizeSlotsWithAiIdentity(current.map((slot) => {
      if (slot.id !== slotId || slot.clientId || slot.isHost) return slot;
      if (field === "kind") {
        if (value === "IA") {
          return {
            ...slot,
            kind: value,
            label: pickRandomAiCelebrityName(current, slotId),
            aiDifficulty: normalizeAiDifficulty(slot.aiDifficulty),
          };
        }
        return {
          ...slot,
          kind: value,
          label: slot.baseRole || slot.role || slot.label,
        };
      }
      return {
        ...slot,
        [field]: field === "aiDifficulty"
          ? normalizeAiDifficulty(value)
          : (field === "color" ? normalizeCustomColor(value) : value),
      };
    })));
  }

  function updateMyOwnSlot(slotId, field, value) {
    setSlots((current) => current.map((slot) => {
      if (slot.id !== slotId) return slot;
      return {
        ...slot,
        [field]: field === "color" ? normalizeCustomColor(value) : value,
      };
    }));
    lobby.send("update_my_slot", { roomId, [field]: field === "color" ? normalizeCustomColor(value) : value });
  }

  function sendMessage(event) {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !roomId) return;
    lobby.send("room_chat", { roomId, text: trimmed });
    setChatInput("");
    setStatusText("Mensaje enviado al lobby.");
  }

  useGamepadMenuNavigation({
    enabled: true,
    rootRef: screenRef,
    onBack: () => {
      clearPendingCreateRoomRequest();
      if (roomIdRef.current) lobby.send("leave_room", { roomId: roomIdRef.current });
      clearOnlineSession();
      onBack?.();
    },
  });

  return (
    <div className={styles.viewport} ref={screenRef}>
      <div className={styles.stage}>
        <img alt="Crear sala" className={styles.background} src={backgroundSrc} />

        <div className={styles.createRoomOverlay}>
          <button className={styles.backButton} onClick={() => {
            clearPendingCreateRoomRequest();
            if (roomId) lobby.send("leave_room", { roomId });
            clearOnlineSession();
            onBack();
          }} type="button">
            ← Volver
          </button>

          <div className={styles.boardTopArea}>
              <div className={styles.setupContent}>
                <div className={styles.topSettingsGrid}>
                  <ReadonlySetting label="Nombre usuario" value={playerName} />
                  <InlineSetting label="Modo"><select className={styles.selectField} disabled={!effectiveIsLocalHost} onChange={(event) => setMode(event.target.value)} value={mode}>{MODE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <div className={styles.matchActionsInline}>
                    <label className={styles.readyToggle}>
                      <input checked={effectiveIsHostReady} className={styles.readyCheckbox} onChange={(event) => setIsHostReady(event.target.checked)} type="checkbox" />
                      <span className={styles.readyLabel}>ESTOY LISTO</span>
                    </label>
                    {effectiveIsLocalHost && (
                      <button className={`${styles.startMatchButton} ${canStartMatch ? styles.startMatchButtonReady : ""}`} onClick={launchOnlineMatch} type="button">COMENZAR PARTIDA</button>
                    )}
                  </div>
                  <InlineSetting label="Nombre sala"><input className={styles.textField} disabled={!effectiveIsLocalHost} maxLength={30} onChange={(event) => setRoomName(event.target.value)} placeholder="Sala de Player1" type="text" value={roomName} /></InlineSetting>
                  <InlineSetting label="Densidad"><select className={styles.selectField} disabled={!effectiveIsLocalHost} onChange={(event) => setDensity(event.target.value)} value={density}>{DENSITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                </div>

                <div className={styles.compactSettingsRow}>
                  <InlineSetting label="Rondas"><select className={styles.selectField} disabled={!effectiveIsLocalHost} onChange={(event) => setRounds(event.target.value)} value={rounds}>{ROUND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <InlineSetting label="Vidas p/ronda"><select className={styles.selectField} disabled={!effectiveIsLocalHost} onChange={(event) => setLives(event.target.value)} value={lives}>{LIVES_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                  <InlineSetting label="Balas vs base p/ronda"><select className={styles.selectField} disabled={!effectiveIsLocalHost} onChange={(event) => setBaseHits(event.target.value)} value={baseHits}>{BASE_HITS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></InlineSetting>
                </div>

                <div className={styles.slotsSection}>
                  <div className={styles.slotHeaderRow}><span /><span>Jugador</span><span>Equipo</span><span>Tipo</span></div>
                  <div className={styles.slotsTable}>
                    {slots.map((slot) => {
                      const isMySlot = !!slot.clientId && slot.clientId === localClientId;
                      const isMyHostSlot = effectiveIsLocalHost && slot.isHost;
                      const isEmptyHostEditable = !slot.clientId && !slot.isHost && effectiveIsLocalHost;
                      const canEditColor = isMySlot || isMyHostSlot || isEmptyHostEditable;
                      const canEditTeam = isMySlot || isMyHostSlot || isEmptyHostEditable;
                      const teamOptions = getTeamOptionsForSlot(slots, slot);
                      const selectedTeamValue = getEffectiveSlotTeamValue(slots, slot);
                      return (
                        <div className={styles.slotRow} key={slot.id}>
                          <ColorPicker
                            disabled={!canEditColor}
                            onChange={(nextColor) => (isMySlot || isMyHostSlot) ? updateMyOwnSlot(slot.id, "color", nextColor) : updateSlot(slot.id, "color", nextColor)}
                            onClose={() => setOpenColorSlotId(null)}
                            onToggle={() => setOpenColorSlotId((current) => current === slot.id ? null : slot.id)}
                            open={openColorSlotId === slot.id}
                            value={slot.color}
                          />
                          <div className={styles.slotNameCell}>
                            <div className={styles.slotName}>{slot.label}</div>
                            <div className={styles.slotRole}>{slot.isHost ? "Anfitrión" : (slot.kind === "IA" ? `IA · ${slot.aiDifficulty || "Normal"}` : slot.role)}</div>
                          </div>
                          {canEditTeam ? (
                            <select className={styles.slotSelect} onChange={(event) => (isMySlot || isMyHostSlot) ? updateMyOwnSlot(slot.id, "team", event.target.value) : updateSlot(slot.id, "team", event.target.value)} value={selectedTeamValue}>{teamOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                          ) : (
                            <div className={styles.readonlyValue}>{slot.team}</div>
                          )}
                          {slot.isHost ? <div className={styles.hostBadge}>Anfitrión</div> : slot.clientId ? <div className={styles.readonlyValue}>Jugador</div> : (
                            <div className={styles.slotTypeControls}>
                              <select className={styles.slotSelect} disabled={!effectiveIsLocalHost} onChange={(event) => updateSlot(slot.id, "kind", event.target.value)} value={slot.kind}>{SLOT_KIND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                              {slot.kind === "IA" ? (
                                <select className={`${styles.slotSelect} ${styles.slotDifficultySelect}`} disabled={!effectiveIsLocalHost} onChange={(event) => updateSlot(slot.id, "aiDifficulty", event.target.value)} value={slot.aiDifficulty || "Normal"}>{AI_DIFFICULTY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
          </div>


          <div className={styles.boardBottomArea}>
            <div className={styles.chatMessages}>
              {messages.map((message) => <div className={styles.chatMessage} key={message.id}><span className={styles.chatAuthor}>{message.author}:</span> {message.text}</div>)}
            </div>
          </div>

          <form className={styles.chatComposer} onSubmit={sendMessage}>
            <input className={styles.chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Escribí un mensaje para la sala" type="text" value={chatInput} />
            <button className={styles.sendButton} type="submit">Enviar</button>
          </form>

          <div className={`${styles.roomFooterText} ${footerStatusClassName}`}>{footerText}</div>
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
  const [pendingSurvivalSettings, setPendingSurvivalSettings] = useState(null);
  const lastNavAtRef = useRef(0);
  const lastAxisDirRef = useRef(0);
  const lastConfirmPressedRef = useRef(false);
  const lastBackPressedRef = useRef(false);

  const menu = useMemo(() => MENU_SCREENS[menuKey] ?? MENU_SCREENS.root, [menuKey]);
  const lobby = useLobbySocket(playerName, setStatusText);

  useEffect(() => {
    const isLobbyScreen = screen === "browseRooms" || screen === "createRoom" || screen === "joinedRoom";
    if (!isLobbyScreen) {
      lobby.registerHandlers({});
      lobby.disconnect();
    }
  }, [lobby, screen]);

  useEffect(() => {
    const initialPlayerName = readStoredOnlinePlayerName() || "Player1";
    setPlayerName(initialPlayerName);

    const initialLobbySession = getStoredLobbySession();
    if (!initialLobbySession) return;

    setJoinedRoomSession(initialLobbySession);
    setScreen(initialLobbySession.isHost ? "createRoom" : "joinedRoom");
    setStatusText(initialLobbySession.isHost ? "Reconectando con tu sala..." : "Reconectando con la sala...");
  }, []);

  useEffect(() => {
    const nextPlayerName = normalizedPlayerName(playerName);
    writeStoredOnlinePlayerName(nextPlayerName);
    if (screen === "browseRooms" || screen === "createRoom" || screen === "joinedRoom") {
      claimOnlinePlayerName(nextPlayerName);
      return;
    }
    releaseOnlinePlayerName();
  }, [playerName, screen]);

  useEffect(() => {
    const release = () => releaseOnlinePlayerName();
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  function normalizedPlayerName(value) {
    return value.trimStart() || "Player1";
  }

  function ensureMultiplayerPlayerName() {
    const storedName = readStoredOnlinePlayerName();
    if (storedName?.trim()) {
      const nextName = normalizedPlayerName(storedName);
      setPlayerName(nextName);
      return nextName;
    }

    const suggestedName = getSuggestedOnlinePlayerName();
    setPlayerName(suggestedName);
    return suggestedName;
  }

  function openMenu(nextMenuKey, nextStatusText = MENU_SCREENS[nextMenuKey]?.status || MENU_SCREENS.root.status) {
    setMenuKey(nextMenuKey);
    setSelectedIndex(0);
    setStatusText(nextStatusText);
    lastNavAtRef.current = performance.now();
    lastConfirmPressedRef.current = true;
    lastBackPressedRef.current = true;
  }

  function moveSelection(direction) {
    setSelectedIndex((current) => (current + direction + menu.items.length) % menu.items.length);
  }

  function activateCurrent() {
    const item = menu.items[selectedIndex];
    if (!item) return;
    if (item.next) {
      if (item.next === "survivalDifficulty") {
        setPendingSurvivalSettings(null);
      }
      if (item.next === "survivalMode") {
        setPendingSurvivalSettings(item.localSettings || null);
      }
      openMenu(item.next);
      return;
    }
    if (item.back) {
      const previousMenuKey = item.backTo || "root";
      if (previousMenuKey === "single" || previousMenuKey === "root") {
        setPendingSurvivalSettings(null);
      }
      const previousStatusText = previousMenuKey === "root"
        ? "Volviste al menú anterior."
        : MENU_SCREENS[previousMenuKey]?.status || "Volviste al menú anterior.";
      openMenu(previousMenuKey, previousStatusText);
      setStatusText(previousStatusText);
      return;
    }
    if (item.action === "play") {
      onStartGame?.({
        gameMode: item.gameMode || "classic",
        localSettings: item.gameMode === "survival"
          ? { ...(pendingSurvivalSettings || {}), ...(item.localSettings || {}) }
          : (item.localSettings || null),
      });
      return;
    }
    if (item.action === "createRoom") {
      ensureMultiplayerPlayerName();
      armPendingCreateRoomRequest();
      setJoinedRoomSession(null);
      setScreen("createRoom");
      setStatusText("Abriendo tu nueva sala...");
      return;
    }
    if (item.action === "browseRooms") {
      ensureMultiplayerPlayerName();
      setScreen("browseRooms");
      setStatusText("Buscando salas disponibles.");
      return;
    }
    setStatusText(item.status || "Sección en preparación.");
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((screen === "createRoom" || screen === "browseRooms") && ["Escape", "Backspace"].includes(event.key) && !isTypingTarget(event.target)) {
        event.preventDefault();
        clearOnlineSession();
        setScreen("menu");
        openMenu("root", "Volviste al menú principal.");
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
            clearOnlineSession();
            setScreen("menu");
            openMenu("root", "Volviste al menú principal.");
            lastNavAtRef.current = now;
          }
          frameId = window.requestAnimationFrame(loop);
          return;
        }
        const axisY = pad.axes?.[1] ?? 0;
        const downPressed = Boolean(pad.buttons?.[13]?.pressed);
        const upPressed = Boolean(pad.buttons?.[12]?.pressed);
        const confirmPressed = Boolean(pad.buttons?.[0]?.pressed);
        const backPressed = Boolean(pad.buttons?.[1]?.pressed || pad.buttons?.[9]?.pressed);
        let direction = 0;
        if (axisY > AXIS_DEADZONE || downPressed) direction = 1;
        if (axisY < -AXIS_DEADZONE || upPressed) direction = -1;
        if (direction !== 0 && (lastAxisDirRef.current !== direction || now - lastNavAtRef.current > NAV_REPEAT_MS)) {
          moveSelection(direction);
          lastNavAtRef.current = now;
        }
        lastAxisDirRef.current = direction;
        if (confirmPressed && !lastConfirmPressedRef.current && now - lastNavAtRef.current > 120) {
          activateCurrent();
          lastNavAtRef.current = now;
        }
        if (menuKey !== "root" && backPressed && !lastBackPressedRef.current && now - lastNavAtRef.current > 120) {
          setMenuKey("root");
          setStatusText("Volviste al menú anterior.");
          lastNavAtRef.current = now;
        }
        lastConfirmPressedRef.current = confirmPressed;
        lastBackPressedRef.current = backPressed;
      } else {
        lastAxisDirRef.current = 0;
        lastConfirmPressedRef.current = false;
        lastBackPressedRef.current = false;
      }
      frameId = window.requestAnimationFrame(loop);
    }
    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, [screen, menuKey, selectedIndex, menu.items]);

  if (screen === "createRoom") {
    return <CreateRoomScreen lobby={lobby} createRequestId={readPendingCreateRoomRequest()} initialIsHost={joinedRoomSession?.isHost ?? true} initialRoomId={joinedRoomSession?.isHost ? joinedRoomSession?.roomId || null : null} onBack={() => { clearPendingCreateRoomRequest(); setJoinedRoomSession(null); setScreen("browseRooms"); setStatusText("Volviste al listado de salas."); }} onPlayerNameChange={(value) => setPlayerName(normalizedPlayerName(value))} playerName={playerName} setStatusText={setStatusText} statusText={statusText} onStartGame={onStartGame} />;
  }

  if (screen === "joinedRoom") {
    return <CreateRoomScreen lobby={lobby} backgroundSrc={JOINED_ROOM_BG} initialIsHost={!!joinedRoomSession?.isHost} initialRoomId={joinedRoomSession?.roomId || null} onBack={() => { setJoinedRoomSession(null); setScreen("browseRooms"); setStatusText("Volviste al listado de salas."); }} onPlayerNameChange={(value) => setPlayerName(normalizedPlayerName(value))} playerName={playerName} setStatusText={setStatusText} statusText={statusText} onStartGame={onStartGame} />;
  }

  if (screen === "browseRooms") {
    return <BrowseRoomsScreen onBack={() => { setScreen("menu"); setMenuKey("root"); setStatusText("Volviste al menú principal."); }} onCreateRoom={() => {
      armPendingCreateRoomRequest();
      setJoinedRoomSession(null);
      setScreen("createRoom");
      setStatusText("Abriendo tu nueva sala...");
    }} onJoinRoom={(session) => { setJoinedRoomSession(session); setScreen("joinedRoom"); setStatusText("Uniéndote a la sala..."); }} onPlayerNameChange={(value) => setPlayerName(normalizedPlayerName(value))} playerName={playerName} setStatusText={setStatusText} />;
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
