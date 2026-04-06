"use client";

import { useCallback, useMemo, useState } from "react";
import TankGame from "@/components/tank-game/TankGame";
import TankGameLanding from "@/components/tank-game/TankGameLanding";

const MENUS = {
  main: {
    title: "Centro de operaciones",
    subtitle: "Seleccioná un modo para continuar.",
    items: [
      { label: "Un jugador", action: { type: "submenu", target: "singlePlayer" } },
      { label: "Multiplayer", action: { type: "submenu", target: "multiplayer" } },
      { label: "Configuración", action: { type: "submenu", target: "settings" } },
    ],
  },
  singlePlayer: {
    title: "Un jugador",
    subtitle: "Elegí cómo querés entrar al juego.",
    items: [
      { label: "Clásico", action: { type: "startGame", mode: "classic", label: "Clásico" } },
      { label: "Survival", action: { type: "startGame", mode: "survival", label: "Survival" } },
      { label: "Volver", action: { type: "back" } },
    ],
  },
  multiplayer: {
    title: "Multiplayer",
    subtitle: "Acceso a salas y preparación de partida online.",
    items: [
      { label: "Buscar / ver salas", action: { type: "submenu", target: "browseRooms" } },
      { label: "Crear sala", action: { type: "submenu", target: "createRoom" } },
      { label: "Volver", action: { type: "back" } },
    ],
  },
  settings: {
    title: "Configuración",
    subtitle: "Ajustes generales del juego.",
    items: [
      { label: "Controles", action: { type: "submenu", target: "controls" } },
      { label: "Audio", action: { type: "submenu", target: "audio" } },
      { label: "Video", action: { type: "submenu", target: "video" } },
      { label: "Volver", action: { type: "back" } },
    ],
  },
  browseRooms: {
    title: "Buscar / ver salas",
    subtitle: "Más adelante vamos a armar esta pantalla estilo Age of Empires II.",
    items: [{ label: "Volver", action: { type: "back" } }],
    detail: {
      title: "Vista preliminar",
      body: "Acá después podés listar salas, jugadores conectados, mapa, modo y estado de la partida. Por ahora queda armado el acceso desde el menú principal y la navegación por joystick/teclado.",
      bullets: ["Listado de salas disponibles", "Filtros por modo o mapa", "Botón para unirse", "Datos rápidos de cada lobby"],
    },
  },
  createRoom: {
    title: "Crear sala",
    subtitle: "Paso previo al formulario real.",
    items: [{ label: "Volver", action: { type: "back" } }],
    detail: {
      title: "Vista preliminar",
      body: "Más adelante acá podemos poner nombre de sala, algoritmo/map style, límite de jugadores, privacidad y reglas básicas. Por ahora queda resuelto el flujo de entrada.",
      bullets: ["Nombre de la sala", "Tipo de mapa", "Cantidad máxima", "Privada / pública"],
    },
  },
  controls: {
    title: "Controles",
    subtitle: "Resumen del esquema de navegación actual.",
    items: [{ label: "Volver", action: { type: "back" } }],
    detail: {
      title: "Atajos disponibles",
      body: "Ya queda soportada navegación por teclado y joystick/gamepad desde la landing.",
      bullets: ["Stick izquierdo / cruceta: mover selección", "A / Enter / Space: confirmar", "B / Escape / Backspace: volver"],
    },
  },
  audio: {
    title: "Audio",
    subtitle: "Placeholder para la futura pantalla de audio.",
    items: [{ label: "Volver", action: { type: "back" } }],
    detail: {
      title: "Pendiente",
      body: "Podemos sumar volumen general, música, efectos y mute independiente más adelante.",
    },
  },
  video: {
    title: "Video",
    subtitle: "Placeholder para la futura pantalla de video.",
    items: [{ label: "Volver", action: { type: "back" } }],
    detail: {
      title: "Pendiente",
      body: "Acá después pueden ir escalado, fullscreen, pixel smoothing, sombras y otras opciones visuales.",
    },
  },
};

export default function TankGameShell() {
  const [screen, setScreen] = useState("menu");
  const [menuStack, setMenuStack] = useState(["main"]);
  const [selectedByMenu, setSelectedByMenu] = useState({ main: 0 });
  const [pendingGameMode, setPendingGameMode] = useState("classic");
  const [statusMessage, setStatusMessage] = useState("Listo para desplegar.");

  const currentMenuKey = menuStack[menuStack.length - 1] || "main";
  const currentMenu = MENUS[currentMenuKey] || MENUS.main;
  const selectedIndex = selectedByMenu[currentMenuKey] ?? 0;

  const selectIndex = useCallback(
    (nextIndex) => {
      const itemCount = currentMenu.items.length;
      if (!itemCount) return;
      const normalized = ((nextIndex % itemCount) + itemCount) % itemCount;
      setSelectedByMenu((prev) => ({ ...prev, [currentMenuKey]: normalized }));
    },
    [currentMenu.items.length, currentMenuKey],
  );

  const moveSelection = useCallback(
    (direction) => {
      selectIndex(selectedIndex + direction);
    },
    [selectIndex, selectedIndex],
  );

  const goBack = useCallback(() => {
    setMenuStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
    setStatusMessage("Volviste al menú anterior.");
  }, []);

  const handleAction = useCallback(
    (action) => {
      if (!action) return;

      if (action.type === "submenu") {
        setMenuStack((prev) => [...prev, action.target]);
        setSelectedByMenu((prev) => ({ ...prev, [action.target]: prev[action.target] ?? 0 }));
        setStatusMessage(`Entraste a ${MENUS[action.target]?.title ?? "la sección"}.`);
        return;
      }

      if (action.type === "back") {
        goBack();
        return;
      }

      if (action.type === "startGame") {
        setPendingGameMode(action.mode);
        setScreen("game");
        setStatusMessage(`Iniciando ${action.label}.`);
      }
    },
    [goBack],
  );

  const confirmSelection = useCallback(() => {
    handleAction(currentMenu.items[selectedIndex]?.action);
  }, [currentMenu.items, handleAction, selectedIndex]);

  const landingProps = useMemo(
    () => ({
      menuTitle: currentMenu.title,
      menuSubtitle: currentMenu.subtitle,
      menuItems: currentMenu.items,
      selectedIndex,
      onMoveSelection: moveSelection,
      onSelectIndex: selectIndex,
      onConfirmSelection: confirmSelection,
      onBack: goBack,
      canGoBack: menuStack.length > 1,
      detail: currentMenu.detail,
      statusMessage,
      breadcrumb: menuStack.map((key) => MENUS[key]?.title ?? key),
    }),
    [confirmSelection, currentMenu, goBack, menuStack, moveSelection, selectIndex, selectedIndex, statusMessage],
  );

  if (screen === "game") {
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setScreen("menu")}
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 50,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(12,18,16,0.88)",
            color: "#f3f4f6",
            padding: "10px 14px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          ← Volver al menú
        </button>
        <TankGame initialMode={pendingGameMode} />
      </div>
    );
  }

  return <TankGameLanding {...landingProps} />;
}
