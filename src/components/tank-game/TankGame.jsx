"use client";

import { startTransition, useEffect, useState } from "react";
import TankGameLanding from "./TankGameLanding";
import TankGameRuntime from "./TankGameRuntime";
import { clearOnlineSession, readOnlineSession } from "@/game/phaser/online/session";
import { SETTINGS_STORAGE_KEY } from "@/game/phaser/shared/constants";

const LOCAL_GAME_MODE_TO_SETTING = {
  classic: 0,
  survival: 1,
  online_2v2: 2,
};

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function persistLocalGameConfig(selectedMode, localSettings = null) {
  if (typeof window === "undefined") return;

  const gameMode = LOCAL_GAME_MODE_TO_SETTING[selectedMode];
  if (gameMode == null) return;

  try {
    const currentSettings = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...currentSettings, ...localSettings, gameMode }),
    );
  } catch {
    // noop
  }
}

function normalizeLocalGameStart(selection) {
  if (typeof selection === "string") {
    return { gameMode: selection, localSettings: null };
  }

  return {
    gameMode: selection?.gameMode || "classic",
    localSettings: selection?.localSettings || null,
  };
}

export default function TankGame({ initialMode = null }) {
  const [mode, setMode] = useState("landing");
  const [localGameMode, setLocalGameMode] = useState(normalizeLocalGameStart(initialMode).gameMode);
  const [localGameSettings, setLocalGameSettings] = useState(normalizeLocalGameStart(initialMode).localSettings);
  const isOnlineMatch = !!readOnlineSession()?.inMatch;
  const initialStartConfig = initialMode ? normalizeLocalGameStart(initialMode) : null;
  const effectiveLocalGameMode = initialStartConfig?.gameMode ?? localGameMode;
  const effectiveLocalGameSettings = initialStartConfig?.localSettings ?? localGameSettings;

  useEffect(() => {
    const handleKeyDownCapture = (event) => {
      if (event.key !== "Backspace") return;
      if (!isEditableTarget(event.target)) return;

      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, []);

  useEffect(() => {
    if (isOnlineMatch) {
      startTransition(() => {
        setMode("game");
      });
    }
  }, [isOnlineMatch]);

  useEffect(() => {
    if (!initialMode || isOnlineMatch) return;
    const startConfig = normalizeLocalGameStart(initialMode);
    persistLocalGameConfig(startConfig.gameMode, startConfig.localSettings);
    startTransition(() => {
      setMode("game");
    });
  }, [initialMode, isOnlineMatch]);

  function handleStartLocalGame(selection = "classic") {
    const startConfig = normalizeLocalGameStart(selection);
    setLocalGameMode(startConfig.gameMode);
    setLocalGameSettings(startConfig.localSettings);
    persistLocalGameConfig(startConfig.gameMode, startConfig.localSettings);
    setMode("game");
  }

  if (mode === "game") {
    return <TankGameRuntime localGameMode={isOnlineMatch ? null : effectiveLocalGameMode} localGameSettings={isOnlineMatch ? null : effectiveLocalGameSettings} onExit={() => { clearOnlineSession(); setMode("landing"); }} />;
  }

  return <TankGameLanding onStartGame={handleStartLocalGame} />;
}
