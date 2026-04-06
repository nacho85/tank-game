"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeGameViewport,
  GAME_HEIGHT,
  GAME_WIDTH,
  PAGE_PADDING,
  UI_RESERVED_HEIGHT,
} from "@/game/phaser/shared/layout";

export default function TankGameRuntime() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const [error, setError] = useState("");
  const [gameViewport, setGameViewport] = useState({ width: GAME_WIDTH, height: GAME_HEIGHT });

  useEffect(() => {
    setGameViewport(computeGameViewport());

    function handleResize() {
      setGameViewport(computeGameViewport());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let destroyed = false;

    async function boot() {
      try {
        const Phaser = await import("phaser");
        const { createGameConfig } = await import("@/game/phaser/config");

        if (destroyed || !mountRef.current) return;

        const config = createGameConfig(mountRef.current);
        gameRef.current = new Phaser.Game(config);
      } catch (err) {
        console.error(err);
        setError(err?.message || "No se pudo cargar Phaser.");
      }
    }

    boot();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        color: "#e5e7eb",
        padding: `${PAGE_PADDING}px ${PAGE_PADDING}px 12px`,
        background: "#050505",
        minHeight: "100dvh",
        boxSizing: "border-box",
      }}
    >
      {error ? <div style={{ color: "#f87171", marginBottom: 12, textAlign: "center" }}>{error}</div> : null}
      <div
        ref={mountRef}
        style={{
          width: gameViewport.width,
          height: gameViewport.height,
          maxWidth: "100%",
          maxHeight: `calc(100dvh - ${UI_RESERVED_HEIGHT}px)`,
          border: "1px solid #232323",
          overflow: "hidden",
          background: "#000",
          margin: "0 auto",
          display: "block",
        }}
      />
    </div>
  );
}
