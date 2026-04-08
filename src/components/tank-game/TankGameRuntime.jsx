"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeGameViewport,
  GAME_HEIGHT,
  GAME_WIDTH,
  PAGE_PADDING,
  UI_RESERVED_HEIGHT,
} from "@/game/phaser/shared/layout";
import { SETTINGS_STORAGE_KEY } from "@/game/phaser/shared/constants";

const LOCAL_GAME_MODE_TO_SETTING = {
  classic: 0,
  survival: 1,
  online_2v2: 2,
};

function persistLocalGameSettings(selectedMode, localSettings = null) {
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

export default function TankGameRuntime({ localGameMode = null, localGameSettings = null, onExit = () => {} }) {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const [error, setError] = useState("");
  const [gameViewport, setGameViewport] = useState({ width: GAME_WIDTH, height: GAME_HEIGHT });
  const [onlineOverlay, setOnlineOverlay] = useState(null);
  const [localOverlay, setLocalOverlay] = useState(null);

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
        if (localGameMode) {
          persistLocalGameSettings(localGameMode, localGameSettings);
        }

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
  }, [localGameMode, localGameSettings]);

  useEffect(() => {
    function handleReturnToMenu() {
      onExit();
    }

    window.addEventListener("tank-game:return-to-menu", handleReturnToMenu);
    return () => window.removeEventListener("tank-game:return-to-menu", handleReturnToMenu);
  }, [onExit]);

  useEffect(() => {
    function handleOnlineOverlay(event) {
      setOnlineOverlay(event.detail || null);
    }

    window.addEventListener("tank-game:online-overlay", handleOnlineOverlay);
    return () => window.removeEventListener("tank-game:online-overlay", handleOnlineOverlay);
  }, []);

  useEffect(() => {
    function handleLocalOverlay(event) {
      setLocalOverlay(event.detail || null);
    }

    window.addEventListener("tank-game:local-overlay", handleLocalOverlay);
    return () => window.removeEventListener("tank-game:local-overlay", handleLocalOverlay);
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
        style={{
          position: "relative",
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
      >
        <div
          ref={mountRef}
          style={{
            width: "100%",
            height: "100%",
          }}
        />

        {localOverlay ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              color: "#f3f4f6",
              fontFamily: '"Courier New", "Courier Prime", Courier, "Liberation Mono", monospace',
              textRendering: "geometricPrecision",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              textShadow: "0 1px 2px rgba(0,0,0,0.7)",
            }}
          >
            {localOverlay.variant === "survival" ? (
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 18,
                  right: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "start",
                }}
              >
                <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 14, fontSize: 16, fontWeight: 800, color: "#d7efe0" }}>
                  {localOverlay.leftStats?.map((item) => (
                    <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {item.label === "Vidas" ? (
                        <span style={{ color: "#ff5a76", fontSize: 18 }}>❤</span>
                      ) : (
                        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#95b8a4" }}>{item.label}</span>
                      )}
                      <span style={{ color: "#f4fbf6" }}>{item.value}</span>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    justifySelf: "center",
                    textAlign: "center",
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: "#b6d57a" }}>{localOverlay.title}</div>
                  <div style={{ fontSize: 18, color: "#86a892" }}>-</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#ffffff" }}>{localOverlay.subtitle}</div>
                  {localOverlay.mapLabel ? <div style={{ fontSize: 18, color: "#86a892" }}>-</div> : null}
                  {localOverlay.mapLabel ? <div style={{ fontSize: 16, fontWeight: 800, color: "#d8e7de" }}>{localOverlay.mapLabel}</div> : null}
                </div>

                <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 14, fontSize: 16, fontWeight: 800, color: "#d7efe0" }}>
                  {localOverlay.rightStats?.map((item) => (
                    <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#95b8a4" }}>{item.label}</span>
                      <span style={{ color: "#f4fbf6" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 18,
                  right: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "start",
                  fontWeight: 700,
                }}
              >
                <div />
                <div style={{ justifySelf: "center", textAlign: "center", lineHeight: 1.1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{localOverlay.levelLabel}</div>
                </div>
                <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: "#b8f7c6" }}>
                  <span>{localOverlay.livesLabel}</span>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {onlineOverlay ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              color: "#f3f4f6",
              fontFamily: '"Courier New", "Courier Prime", Courier, "Liberation Mono", monospace',
              textRendering: "geometricPrecision",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 6,
                left: 0,
                right: 0,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "start",
                padding: "0 18px",
                fontWeight: 700,
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
              }}
            >
              <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: onlineOverlay.connected ? "#2f8e3d" : "#c34c3c",
                    boxShadow: onlineOverlay.connected ? "0 0 10px rgba(47,142,61,0.4)" : "0 0 10px rgba(195,76,60,0.35)",
                    flex: "0 0 auto",
                  }}
                />
                <span>{onlineOverlay.connected ? "Conectado" : "Desconectado"}</span>
              </div>

              <div style={{ justifySelf: "center", textAlign: "center", lineHeight: 1.1 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{onlineOverlay.roundLabel}</div>
                <div style={{ fontSize: 14, color: "#f0c75e" }}>{onlineOverlay.resultLabel}</div>
              </div>

              <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: "#b8f7c6" }}>
                <span style={{ color: "#ff5a76", fontSize: 18 }}>❤</span>
                <span>{onlineOverlay.myLives}</span>
                <span style={{ color: "rgba(184,247,198,0.55)" }}>|</span>
                <span>Compañero {onlineOverlay.mateLives}</span>
              </div>
            </div>

            {onlineOverlay.showSummary ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(3,5,7,0.72)",
                }}
              >
                <div
                  style={{
                    width: "min(980px, calc(100% - 120px))",
                    minHeight: 420,
                    background: "rgba(12,18,24,0.96)",
                    border: "2px solid #355066",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
                    padding: "26px 36px 30px",
                  }}
                >
                  <div style={{ textAlign: "center", marginBottom: 18 }}>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>
                      {onlineOverlay.summaryFinal ? `${onlineOverlay.summaryTitle}` : "Marcador parcial"}
                    </div>
                    <div style={{ fontSize: 13, color: "#c7d8e6", marginTop: 6 }}>
                      {onlineOverlay.summaryFinal
                        ? "Presioná Enter, Espacio o Escape para volver al menú"
                        : "Mantené Tab o Select para ver este panel"}
                    </div>
                  </div>

                  {onlineOverlay.teams.map((team) => (
                    <div key={team.id} style={{ marginBottom: 26 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: team.accent, marginBottom: 10 }}>{team.name}</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(220px, 1fr) 88px 88px 88px 88px",
                          gap: 10,
                          fontSize: 14,
                          color: "#a9bfd0",
                          marginBottom: 8,
                        }}
                      >
                        <div>Jugador</div>
                        <div style={{ textAlign: "right" }}>Bases</div>
                        <div style={{ textAlign: "right" }}>Kills</div>
                        <div style={{ textAlign: "right" }}>Deaths</div>
                        <div style={{ textAlign: "right" }}>Acc</div>
                      </div>

                      {team.players.map((player, index) => (
                        <div
                          key={`${team.id}-${player.label}-${index}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(220px, 1fr) 88px 88px 88px 88px",
                            gap: 10,
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#edf3f8",
                            padding: "4px 0",
                          }}
                        >
                          <div>{player.label}</div>
                          <div style={{ textAlign: "right" }}>{player.basesDestroyed}</div>
                          <div style={{ textAlign: "right" }}>{player.kills}</div>
                          <div style={{ textAlign: "right" }}>{player.deaths}</div>
                          <div style={{ textAlign: "right" }}>{player.accuracy}%</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
