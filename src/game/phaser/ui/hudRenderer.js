import { HUD_SIDEBAR_WIDTH, MESSAGE_DURATION } from "../shared/constants";

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
    scene.waveText.setText(
      "Survival\n" +
        "Ola: " + scene.survivalWaveIndex + "\n" +
        "Bajas: " + scene.destroyedEnemiesCount + "\n" +
        "En pantalla: " + scene.enemies.length + "\n" +
        "Acc total: " + totalAcc + "%"
    );
    return;
  }

  if (scene.currentGameMode === "online_2v2") {
    const online = scene.onlineState || {};
    const connectedPlayers = Array.isArray(online.snapshot?.players) ? online.snapshot.players.length : 0;
    const clientState = online.connectionState || "desconectado";
    scene.waveText.setText(
      "Online 2v2\n" +
        "Estado: " + clientState + "\n" +
        "Jugadores: " + connectedPlayers + "/4\n" +
        "Slot: " + (online.localRoleLabel || "sin asignar") + "\n" +
        "Acc total: " + totalAcc + "%"
    );
    return;
  }

  const remainingToSpawn = scene.totalEnemiesForLevel - scene.spawnedEnemiesCount;
  scene.waveText.setText(
    "Nivel\n" +
      "Enemigos: " + scene.destroyedEnemiesCount + "/" + scene.totalEnemiesForLevel + "\n" +
      "En pantalla: " + scene.enemies.length + "\n" +
      "Restan: " + remainingToSpawn + "\n" +
      "Acc total: " + totalAcc + "%"
  );
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
