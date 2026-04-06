"use client";

import { useEffect, useState } from "react";
import TankGameLanding from "./TankGameLanding";
import TankGameRuntime from "./TankGameRuntime";

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

export default function TankGame() {
  const [mode, setMode] = useState("landing");

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

  if (mode === "game") {
    return <TankGameRuntime />;
  }

  return <TankGameLanding onStartGame={() => setMode("game")} />;
}
