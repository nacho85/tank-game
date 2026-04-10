import { HUD_SIDEBAR_WIDTH, MESSAGE_DURATION } from "../shared/constants";

function emitLocalOverlay(payload = null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tank-game:local-overlay", { detail: payload }));
}

function isRenderableHudNode(node) {
  return !!node && !!node.scene && node.active !== false;
}

function safeSetPosition(node, x, y) {
  if (!isRenderableHudNode(node)) return;
  try {
    node.setPosition(x, y);
  } catch {
    // noop
  }
}

function safeSetTextAt(node, x, y, text) {
  if (!isRenderableHudNode(node)) return;
  try {
    node.setPosition(x, y);
    node.setText(text);
  } catch {
    // El objeto puede existir por referencia pero tener destruida su textura interna.
  }
}

export function createHud(scene, width, height) {
  scene.messageText = scene.add
    .text(width / 2, 28, "", {
      fontFamily: "Arial",
      fontSize: "28px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6,
      align: "center",
    })
    .setOrigin(0.5)
    .setDepth(1000)
    .setVisible(false);

  scene.survivalWaveBannerText = scene.add
    .text(width / 2, height / 2, "", {
      fontFamily: "Arial",
      fontSize: "52px",
      fontStyle: "bold",
      color: "#fff4d6",
      stroke: "#000000",
      strokeThickness: 8,
      align: "center",
    })
    .setOrigin(0.5)
    .setDepth(1010)
    .setAlpha(0)
    .setVisible(false);

  scene.roundBannerSubText = scene.add
    .text(width / 2, (height / 2) + 42, "", {
      fontFamily: "Arial",
      fontSize: "28px",
      fontStyle: "bold",
      color: "#ffd166",
      stroke: "#000000",
      strokeThickness: 6,
      align: "center",
    })
    .setOrigin(0.5)
    .setDepth(1010)
    .setAlpha(0)
    .setVisible(false);

  scene.hudPanel = scene.add
    .rectangle(HUD_SIDEBAR_WIDTH / 2, height / 2, HUD_SIDEBAR_WIDTH - 8, height - 8, 0x0a0f14, 0.9)
    .setStrokeStyle(2, 0x26323d, 0.95)
    .setDepth(990);

  const hudX = 18;
  const hudWrapWidth = HUD_SIDEBAR_WIDTH - 36;

  scene.levelText = scene.add
    .text(hudX, 18, "", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffffff",
      wordWrap: { width: hudWrapWidth },
    })
    .setDepth(1000);

  scene.waveText = scene.add
    .text(hudX, 58, "", {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#ffffff",
      wordWrap: { width: hudWrapWidth },
    })
    .setDepth(1000);

  scene.livesText = scene.add
    .text(hudX, 148, "", {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#ffd166",
      wordWrap: { width: hudWrapWidth },
    })
    .setDepth(1000);

  scene.coopText = scene.add
    .text(hudX, 238, "P2: pulsa START en gamepad 2 para unirte", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#b4f8c8",
      wordWrap: { width: hudWrapWidth },
    })
    .setDepth(1000);

  scene.padStatusText = scene.add
    .text(hudX, 312, "Gamepads: esperando...", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#9ad1ff",
      wordWrap: { width: hudWrapWidth },
    })
    .setDepth(1000);

  scene.statsText = scene.add
    .text(hudX, 374, "", {
      fontFamily: "Arial",
      fontSize: "15px",
      color: "#d7f9ff",
      wordWrap: { width: hudWrapWidth },
      lineSpacing: 6,
    })
    .setDepth(1000);

  scene.onlineHeaderBar = scene.add
    .rectangle(width / 2, 28, width - 48, 1, 0x000000, 0)
    .setDepth(995)
    .setVisible(false);

  scene.onlineStatusDot = scene.add.circle(48, 48, 8, 0x2f8e3d).setDepth(1005).setVisible(false);
  scene.onlineStatusText = scene.add.text(64, 37, "", {
    fontFamily: "\"Trebuchet MS\", Verdana, sans-serif",
    fontSize: "21px",
    fontStyle: "bold",
    color: "#e5edf5",
    resolution: 2,
  }).setDepth(1005).setVisible(false);

  scene.onlineRoundText = scene.add.text(width / 2, 28, "", {
    fontFamily: "\"Trebuchet MS\", Verdana, sans-serif",
    fontSize: "25px",
    fontStyle: "bold",
    color: "#ffffff",
    align: "center",
    resolution: 2,
  }).setOrigin(0.5, 0).setDepth(1005).setVisible(false);

  scene.onlineResultText = scene.add.text(width / 2, 56, "", {
    fontFamily: "\"Trebuchet MS\", Verdana, sans-serif",
    fontSize: "19px",
    fontStyle: "bold",
    color: "#ffd166",
    align: "center",
    resolution: 2,
  }).setOrigin(0.5, 0).setDepth(1005).setVisible(false);

  scene.onlineLivesText = scene.add.text(width - 48, 37, "", {
    fontFamily: "\"Trebuchet MS\", Verdana, sans-serif",
    fontSize: "19px",
    fontStyle: "bold",
    color: "#b8f7c6",
    align: "right",
    resolution: 2,
  }).setOrigin(1, 0).setDepth(1005).setVisible(false);

  scene.onlineSummaryBackdrop = scene.add
    .rectangle(width / 2, height / 2, width, height, 0x030507, 0.72)
    .setDepth(3200)
    .setVisible(false);

  scene.onlineSummaryPanel = scene.add
    .rectangle(width / 2, height / 2, Math.min(980, width - 120), Math.min(620, height - 100), 0x0c1218, 0.96)
    .setStrokeStyle(2, 0x355066, 1)
    .setDepth(3210)
    .setVisible(false);

  scene.onlineSummaryTitle = scene.add
    .text(width / 2, height / 2 - 260, "", {
      fontFamily: "\"Arial\", \"Helvetica Neue\", sans-serif",
      fontSize: "42px",
      fontStyle: "bold",
      color: "#f5f7fa",
      align: "center",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 3,
    })
    .setOrigin(0.5)
    .setDepth(3220)
    .setVisible(false);

  scene.onlineSummarySubtitle = scene.add
    .text(width / 2, height / 2 - 220, "", {
      fontFamily: "\"Arial\", \"Helvetica Neue\", sans-serif",
      fontSize: "22px",
      color: "#c7d8e6",
      align: "center",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 3,
    })
    .setOrigin(0.5)
    .setDepth(3220)
    .setVisible(false);

  scene.onlineSummaryText = scene.add
    .text(width / 2, height / 2 - 184, "", {
      fontFamily: "Courier New",
      fontSize: "20px",
      color: "#e8f1f8",
      lineSpacing: 12,
      align: "left",
      wordWrap: { width: Math.min(900, width - 180) },
    })
    .setOrigin(0.5, 0)
    .setDepth(3220)
    .setVisible(false);

  scene.onlineSummaryRows = [];
  scene.onlineSummarySignature = "";
}

function setLegacyHudVisible(scene, isVisible) {
  scene.hudPanel?.setVisible(isVisible);
  scene.levelText?.setVisible(isVisible);
  scene.waveText?.setVisible(isVisible);
  scene.livesText?.setVisible(isVisible);
  scene.coopText?.setVisible(isVisible);
  scene.padStatusText?.setVisible(isVisible);
  scene.statsText?.setVisible(isVisible);
}

function setHeaderVisible(scene, isVisible) {
  scene.onlineHeaderBar?.setVisible(isVisible);
  scene.onlineStatusDot?.setVisible(isVisible);
  scene.onlineStatusText?.setVisible(isVisible);
  scene.onlineRoundText?.setVisible(isVisible);
  scene.onlineResultText?.setVisible(isVisible);
  scene.onlineLivesText?.setVisible(isVisible);
}

function buildLocalLivesLabel(scene) {
  const totalLives = Math.max(1, scene.getConfiguredStartingLives?.() || 1);
  const p1Lives = Math.max(0, scene.playerLivesRemaining || 0);
  const p2Lives = Math.max(0, scene.playerTwoLivesRemaining || 0);
  const parts = [`P1 ${p1Lives}/${totalLives}`];
  const showJoinPrompt =
    (scene.currentGameMode === "survival" || scene.currentGameMode === "classic") &&
    !scene.playerTwo &&
    !scene.playerTwoJoined;
  const blinkPhase = Math.floor((scene.time?.now || 0) / 1000) % 2 === 0;

  if (showJoinPrompt) {
    parts.push(blinkPhase ? "P2" : "PRESS START");
  } else if (scene.playerTwo || scene.playerTwoJoined || scene.playerTwoLivesRemaining > 0) {
    parts.push(`P2 ${p2Lives}/${totalLives}`);
  }

  return { parts };
}

function getSurvivalMapLabel(scene) {
  const algorithmIndex = Math.max(0, Math.min(3, Math.round(Number(scene.settings?.survivalMapAlgorithm ?? 0))));
  return ["Lago", "Río", "Isla abierta", "Archipiélago"][algorithmIndex] || "Lago";
}

export function refreshLocalTopHud(scene) {
  if (scene.currentGameMode !== "classic") return;

  setLegacyHudVisible(scene, false);
  setHeaderVisible(scene, false);
  const { parts } = buildLocalLivesLabel(scene);

  emitLocalOverlay({
    variant: "classic",
    levelLabel: `Nivel ${Math.max(1, (scene.currentLevelIndex || 0) + 1)}`,
    livesLabel: `❤ ${parts.join("  |  ")}`,
  });
}

export function updateStatsText(scene) {
  if (!scene.statsText) return;
  const p1 = scene.getAccuracySummary("player1");
  const p2 = scene.getAccuracySummary("player2");
  const enemy = scene.getAccuracySummary("enemies");
  const totalKills = scene.combatStats?.totals?.kills || 0;
  scene.statsText.setText(
    "Bajas totales: " + totalKills + "\n" +
      "Acc P1: " + p1.pct + "% (" + p1.hits + "/" + p1.shots + ")\n" +
      "Acc P2: " + p2.pct + "% (" + p2.hits + "/" + p2.shots + ")\n" +
      "Acc EN: " + enemy.pct + "% (" + enemy.hits + "/" + enemy.shots + ")"
  );
}

export function updateWaveText(scene) {
  const totalShots = scene.combatStats?.totals?.shots || 0;
  const totalHits = scene.combatStats?.totals?.hits || 0;
  const totalAcc = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;

  if (scene.isBossBattle && scene.boss) {
    emitLocalOverlay(null);
    setLegacyHudVisible(scene, true);
    setHeaderVisible(scene, false);
    scene.waveText.setText(
      "Boss\n" +
        "Helicóptero pesado\n" +
        "Vida: " + Math.max(0, scene.boss.health || 0) + "/" + (scene.boss.maxHealth || 0) + "\n" +
        "Ráfaga: " + (scene.boss.burstShotsRemaining > 0 ? "activa" : "cargando") + "\n" +
        "Acc total: " + totalAcc + "%"
    );
    return;
  }

  if (scene.currentGameMode === "survival") {
    const { parts } = buildLocalLivesLabel(scene);
    const kills = Math.max(0, Math.round(Number(scene.destroyedEnemiesCount || 0)));
    const enemiesAlive = Array.isArray(scene.enemies) ? scene.enemies.length : 0;
    const maxEnemies = Math.max(1, Math.round(Number(scene.maxConcurrentEnemies || 1)));
    const shuffleEveryKills = Math.max(0, Math.round(Number(scene.settings?.survivalShuffleEveryKills || 0)));
    const regenEveryKills = Math.max(0, Math.round(Number(scene.settings?.survivalFortressRegenEvery || 0)));
    const nextShuffleIn = shuffleEveryKills > 0 ? shuffleEveryKills - (kills % shuffleEveryKills || 0) : null;
    const nextRegenIn = regenEveryKills > 0 ? regenEveryKills - (kills % regenEveryKills || 0) : null;

    setLegacyHudVisible(scene, false);
    setHeaderVisible(scene, false);
    emitLocalOverlay({
      variant: "survival",
      title: "Survival",
      subtitle: `Ola ${Math.max(1, Math.round(Number(scene.survivalWaveIndex || 1)))}`,
      mapLabel: getSurvivalMapLabel(scene),
      leftStats: [
        { label: "Vidas", value: parts.join("  |  ") },
        { label: "Bajas", value: String(kills) },
        { label: "En juego", value: `${enemiesAlive}/${maxEnemies}` },
      ],
      rightStats: [
        { label: "Acc", value: `${totalAcc}%` },
        { label: "Reshuffle", value: nextShuffleIn == null ? "Off" : `${nextShuffleIn} bajas` },
        { label: "Fortaleza", value: nextRegenIn == null ? "Off" : `${nextRegenIn} bajas` },
      ],
    });
    return;
  }

  if (scene.currentGameMode === "online_2v2") {
    emitLocalOverlay(null);
    setLegacyHudVisible(scene, false);
    setHeaderVisible(scene, false);
    const online = scene.onlineState || {};
    const boardCenterX = (scene.boardOriginX || 0) + ((scene.boardPixelWidth || 0) / 2);
    const headerY = Math.max(42, (scene.boardOriginY || 0) - 46);
    const localPlayer = Array.isArray(online.snapshot?.players)
      ? online.snapshot.players.find((player) => player.id === online.localPlayerId) || null
      : null;
    const teammate = localPlayer && Array.isArray(online.snapshot?.players)
      ? online.snapshot.players.find((player) => player.id !== localPlayer.id && player.colorTeam === localPlayer.colorTeam) || null
      : null;
    const isConnected = online.connectionState === "conectado";
    const roundState = online.snapshot?.roundState || null;
    const roundLabel = roundState
      ? `Online 2v2 - Ronda ${roundState.currentRound}/${roundState.totalRounds}`
      : "Online 2v2 - Ronda 1/6";
    const resultLabel = roundState
      ? `Resultado  ${roundState.scores?.team1 ?? 0} - ${roundState.scores?.team2 ?? 0}`
      : `Resultado  0 - 0`;
    const myLives = localPlayer ? `${localPlayer.livesRemaining ?? (localPlayer.isDestroyed ? 0 : 1)}/${localPlayer.roundLives ?? 1}` : "--";
    const mateLives = teammate ? `${teammate.livesRemaining ?? (teammate.isDestroyed ? 0 : 1)}/${teammate.roundLives ?? 1}` : "--";

    safeSetPosition(scene.onlineHeaderBar, boardCenterX, 24);
    if (isRenderableHudNode(scene.onlineStatusDot)) {
      try {
        scene.onlineStatusDot.setPosition((scene.boardOriginX || 0) + 14, 28).setFillStyle(isConnected ? 0x2f8e3d : 0xa63d3d, 1);
      } catch {
        // noop
      }
    }
    safeSetTextAt(scene.onlineStatusText, (scene.boardOriginX || 0) + 30, 16, isConnected ? "Conectado" : "Desconectado");
    safeSetTextAt(scene.onlineRoundText, boardCenterX, 4, roundLabel);
    safeSetTextAt(scene.onlineResultText, boardCenterX, 30, resultLabel);
    safeSetTextAt(scene.onlineLivesText, (scene.boardOriginX || 0) + (scene.boardPixelWidth || 0) - 8, 16, `Vidas ${myLives}  |  Companero ${mateLives}`);
    return;
    return;
  }

  refreshLocalTopHud(scene);
}

export function showMessage(scene, text) {
  scene.messageText.setText(text).setVisible(true);

  if (scene.messageHideEvent) {
    scene.messageHideEvent.remove(false);
  }

  scene.messageHideEvent = scene.time.delayedCall(MESSAGE_DURATION, () => {
    scene.messageText.setVisible(false);
  });
}

export function showSurvivalWaveBanner(scene, waveNumber, durationMs = 2000) {
  const wave = Math.max(1, Math.round(Number(waveNumber || 1)));
  const banner = scene.survivalWaveBannerText;
  if (!banner) return;

  banner
    .setText(`Ola ${wave}`)
    .setPosition(scene.scale.width / 2, scene.scale.height / 2)
    .setAlpha(1)
    .setVisible(true);

  if (scene.survivalWaveBannerTween) {
    scene.survivalWaveBannerTween.stop();
    scene.survivalWaveBannerTween = null;
  }
  if (scene.survivalWaveBannerHideEvent) {
    scene.survivalWaveBannerHideEvent.remove(false);
    scene.survivalWaveBannerHideEvent = null;
  }

  scene.survivalWaveBannerHideEvent = scene.time.delayedCall(durationMs, () => {
    scene.survivalWaveBannerTween = scene.tweens.add({
      targets: [banner, scene.roundBannerSubText].filter(Boolean),
      alpha: 0,
      duration: 220,
      onComplete: () => {
        banner.setVisible(false);
        scene.roundBannerSubText?.setVisible(false);
        scene.survivalWaveBannerTween = null;
      },
    });
  });
}

export function showOnlineRoundBanner(scene, roundNumber, scores = {}, durationMs = 2000) {
  const round = Math.max(1, Math.round(Number(roundNumber || 1)));
  const banner = scene.survivalWaveBannerText;
  const sub = scene.roundBannerSubText;
  if (!banner || !sub) return;

  banner
    .setText(`RONDA ${round}`)
    .setPosition(scene.scale.width / 2, scene.scale.height / 2 - 16)
    .setAlpha(1)
    .setVisible(true);

  sub
    .setText(`${scores.team1 ?? 0} - ${scores.team2 ?? 0}`)
    .setPosition(scene.scale.width / 2, scene.scale.height / 2 + 34)
    .setAlpha(1)
    .setVisible(true);

  if (scene.survivalWaveBannerTween) {
    scene.survivalWaveBannerTween.stop();
    scene.survivalWaveBannerTween = null;
  }
  if (scene.survivalWaveBannerHideEvent) {
    scene.survivalWaveBannerHideEvent.remove(false);
    scene.survivalWaveBannerHideEvent = null;
  }

  scene.survivalWaveBannerHideEvent = scene.time.delayedCall(durationMs, () => {
    scene.survivalWaveBannerTween = scene.tweens.add({
      targets: [banner, sub],
      alpha: 0,
      duration: 220,
      onComplete: () => {
        banner.setVisible(false);
        sub.setVisible(false);
        scene.survivalWaveBannerTween = null;
      },
    });
  });
}

export function showOnlineRoundWinnerBanner(scene, winnerLabel, durationMs = 2000) {
  const banner = scene.survivalWaveBannerText;
  const sub = scene.roundBannerSubText;
  if (!banner || !sub) return;

  banner
    .setText(`¡GANÓ ${winnerLabel.toUpperCase()}!`)
    .setPosition(scene.scale.width / 2, scene.scale.height / 2 - 16)
    .setAlpha(1)
    .setVisible(true);

  sub
    .setText("")
    .setAlpha(0)
    .setVisible(false);

  if (scene.survivalWaveBannerTween) {
    scene.survivalWaveBannerTween.stop();
    scene.survivalWaveBannerTween = null;
  }
  if (scene.survivalWaveBannerHideEvent) {
    scene.survivalWaveBannerHideEvent.remove(false);
    scene.survivalWaveBannerHideEvent = null;
  }

  scene.survivalWaveBannerHideEvent = scene.time.delayedCall(durationMs, () => {
    scene.survivalWaveBannerTween = scene.tweens.add({
      targets: [banner],
      alpha: 0,
      duration: 220,
      onComplete: () => {
        banner.setVisible(false);
        scene.survivalWaveBannerTween = null;
      },
    });
  });
}

export function showGameOverBanner(scene, kills = 0, durationMs = 1300) {
  const banner = scene.survivalWaveBannerText;
  if (!banner) return;

  const totalKills = Math.max(0, Math.round(Number(kills || 0)));
  banner
    .setText(`GAME OVER\n${totalKills} bajas`)
    .setPosition(scene.scale.width / 2, scene.scale.height / 2)
    .setAlpha(1)
    .setVisible(true);

  if (scene.survivalWaveBannerTween) {
    scene.survivalWaveBannerTween.stop();
    scene.survivalWaveBannerTween = null;
  }
  if (scene.survivalWaveBannerHideEvent) {
    scene.survivalWaveBannerHideEvent.remove(false);
    scene.survivalWaveBannerHideEvent = null;
  }

  scene.survivalWaveBannerHideEvent = scene.time.delayedCall(durationMs, () => {
    scene.survivalWaveBannerTween = scene.tweens.add({
      targets: banner,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        banner.setVisible(false);
        scene.survivalWaveBannerTween = null;
      },
    });
  });
}

function formatPct(value) {
  return `${Math.max(0, Math.round(Number(value) || 0))}%`;
}

function clearOnlineSummaryRows(scene) {
  (scene.onlineSummaryRows || []).forEach((node) => node?.destroy?.());
  scene.onlineSummaryRows = [];
}

function createSummaryNode(scene, x, y, text, style = {}, originX = 0, originY = 0.5) {
  const node = scene.add.text(x, y, text, {
    fontFamily: "\"Arial\", \"Helvetica Neue\", sans-serif",
    fontSize: "28px",
    color: "#e8f1f8",
    stroke: "#000000",
    strokeThickness: 2,
    resolution: 3,
    ...style,
  }).setOrigin(originX, originY).setDepth(3225);
  scene.onlineSummaryRows.push(node);
  return node;
}

function renderTeamTable(scene, team, leftX, topY, width, accentColor) {
  const nameX = leftX;
  const baseX = leftX + Math.floor(width * 0.58);
  const killsX = leftX + Math.floor(width * 0.72);
  const deathsX = leftX + Math.floor(width * 0.84);
  const accX = leftX + width;
  const rowHeight = 34;
  const players = Array.isArray(team?.players) ? team.players : [];

  createSummaryNode(scene, leftX, topY, team?.name || "Equipo", {
    fontSize: "34px",
    fontStyle: "bold",
    color: accentColor,
  }, 0, 0);

  createSummaryNode(scene, nameX, topY + 42, "Jugador", { fontSize: "24px", color: "#a9bfd0" }, 0, 0);
  createSummaryNode(scene, baseX, topY + 42, "Bases", { fontSize: "24px", color: "#a9bfd0" }, 1, 0);
  createSummaryNode(scene, killsX, topY + 42, "Kills", { fontSize: "24px", color: "#a9bfd0" }, 1, 0);
  createSummaryNode(scene, deathsX, topY + 42, "Deaths", { fontSize: "24px", color: "#a9bfd0" }, 1, 0);
  createSummaryNode(scene, accX, topY + 42, "Acc", { fontSize: "24px", color: "#a9bfd0" }, 1, 0);

  players.forEach((player, index) => {
    const rowY = topY + 88 + (index * rowHeight);
    createSummaryNode(scene, nameX, rowY, String(player.label || player.roleLabel || "Jugador"), {
      fontSize: "28px",
      color: "#edf3f8",
    }, 0, 0);
    createSummaryNode(scene, baseX, rowY, String(player.basesDestroyed || 0), { fontSize: "28px", color: "#edf3f8" }, 1, 0);
    createSummaryNode(scene, killsX, rowY, String(player.kills || 0), { fontSize: "28px", color: "#edf3f8" }, 1, 0);
    createSummaryNode(scene, deathsX, rowY, String(player.deaths || 0), { fontSize: "28px", color: "#edf3f8" }, 1, 0);
    createSummaryNode(scene, accX, rowY, formatPct(player.accuracy), { fontSize: "28px", color: "#edf3f8" }, 1, 0);
  });
}

export function showOnlineMatchSummary(scene, summary = null, options = {}) {
  if (!scene.onlineSummaryBackdrop || !scene.onlineSummaryPanel) return;
  const { isFinal = false } = options;
  if (!summary) {
    scene.onlineSummaryBackdrop.setVisible(false);
    scene.onlineSummaryPanel.setVisible(false);
    scene.onlineSummaryTitle.setVisible(false);
    scene.onlineSummarySubtitle.setVisible(false);
    scene.onlineSummaryText.setVisible(false);
    clearOnlineSummaryRows(scene);
    scene.onlineSummarySignature = "";
    return;
  }

  const winner = summary.winnerTeamName || "Partida en curso";
  const signature = JSON.stringify({ summary, isFinal });

  scene.onlineSummaryTitle.setText(isFinal ? `🏆 ${winner} ganó el partido` : "Marcador parcial");
  scene.onlineSummarySubtitle.setText(
    isFinal
      ? "Presioná Enter, Espacio o Escape para volver al menú"
      : "Mantené Tab o Select para ver este panel"
  );
  scene.onlineSummaryText.setVisible(false);

  if (scene.onlineSummarySignature !== signature) {
    clearOnlineSummaryRows(scene);

    const panelWidth = scene.onlineSummaryPanel.width || 900;
    const panelLeft = scene.onlineSummaryPanel.x - (panelWidth / 2);
    const contentLeft = panelLeft + 48;
    const contentTop = scene.onlineSummaryPanel.y - 136;
    const tableWidth = panelWidth - 96;
    const firstTeamPlayers = Array.isArray(summary.team1?.players) ? summary.team1.players.length : 0;
    const firstTeamHeight = 120 + (firstTeamPlayers * 34);
    const secondTeamTop = contentTop + firstTeamHeight + 28;

    renderTeamTable(scene, summary.team1, contentLeft, contentTop, tableWidth, "#d7e86f");
    renderTeamTable(scene, summary.team2, contentLeft, secondTeamTop, tableWidth, "#7fc2ff");
    scene.onlineSummarySignature = signature;
  }

  scene.onlineSummaryBackdrop.setVisible(true);
  scene.onlineSummaryPanel.setVisible(true);
  scene.onlineSummaryTitle.setVisible(true);
  scene.onlineSummarySubtitle.setVisible(true);
  scene.onlineSummaryRows.forEach((node) => node?.setVisible?.(true));
}
