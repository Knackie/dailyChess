import { Chess } from "chess.js";
import puzzlesData from "./puzzles.json";
import { dayNumber, todayKey, puzzleIndexForDay } from "./daily";
import { loadResult, saveResult, loadPseudo, savePseudo, type DailyResult } from "./storage";
import { Board, type MoveAttempt } from "./board";
import { Timer, formatMs } from "./timer";
import { hasBackend, submitScore, fetchLeaderboard, fetchStats, type LeaderboardEntry } from "./api";
import { estimateDifficulty } from "./difficulty";
import "./style.css";

interface Puzzle {
  fen: string;
  solutions: string[];
  toMove: "white" | "black";
}

const puzzles = puzzlesData as Puzzle[];
const PSEUDO_PATTERN = /^[\p{L}\p{N} _-]{1,20}$/u;

const SITE_URL = "https://knackie.github.io/dailyChess/";
const WRONG_MOVE_PENALTY_MS = 3000;

const app = document.querySelector<HTMLDivElement>("#app")!;

const today = new Date();
const dayKey = todayKey(today);
const dayNum = dayNumber(today);
const puzzleIndex = puzzleIndexForDay(dayNum, puzzles.length);
const puzzle = puzzles[puzzleIndex];
const difficulty = estimateDifficulty(puzzle.fen, puzzle.solutions);
const difficultyStars = "⭐".repeat(difficulty.stars);

app.innerHTML = `
  <main class="app">
    <header class="header">
      <h1>♟️ Échec du Jour <span class="day-number">#${dayNum}</span></h1>
      <p class="subtitle">Un mat en 1 coup, le même pour tout le monde. Trouvez-le le plus vite possible.</p>
    </header>

    <section class="start-screen" id="start-screen">
      <p class="turn-indicator">${puzzle.toMove === "white" ? "Trait aux Blancs ⚪" : "Trait aux Noirs ⚫"}</p>
      <p class="difficulty-badge difficulty-${difficulty.stars}">Difficulté : ${difficulty.label} ${difficultyStars} <span class="difficulty-elo">(≈ ${difficulty.elo} Elo)</span></p>
      <label class="pseudo-label" for="pseudo-input">Ton pseudo (pour le classement)</label>
      <input id="pseudo-input" class="pseudo-input" type="text" maxlength="20" placeholder="Ex : Kasparov42" />
      <p class="pseudo-error" id="pseudo-error" hidden>Pseudo invalide (1 à 20 caractères, lettres/chiffres).</p>
      <button id="start-button" class="start-button">Démarrer ▶️</button>
    </section>

    <section class="game-screen" id="game-screen" hidden>
      <div class="status" id="status"></div>
      <div class="board-wrapper">
        <div class="board" id="board"></div>
      </div>
      <div class="result" id="result" hidden>
        <p id="result-text"></p>
        <button id="share-button" class="share-button">Copier le résultat 📋</button>
      </div>
      <section class="leaderboard" id="leaderboard" hidden>
        <h2>🏆 Classement du jour</h2>
        <ol class="leaderboard-list" id="leaderboard-list"></ol>
        <p class="player-stats" id="player-stats"></p>
      </section>
    </section>
  </main>
`;

const startScreenEl = document.querySelector<HTMLElement>("#start-screen")!;
const gameScreenEl = document.querySelector<HTMLElement>("#game-screen")!;
const pseudoInput = document.querySelector<HTMLInputElement>("#pseudo-input")!;
const pseudoErrorEl = document.querySelector<HTMLParagraphElement>("#pseudo-error")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const boardContainer = document.querySelector<HTMLDivElement>("#board")!;
const resultEl = document.querySelector<HTMLDivElement>("#result")!;
const resultTextEl = document.querySelector<HTMLParagraphElement>("#result-text")!;
const shareButton = document.querySelector<HTMLButtonElement>("#share-button")!;
const leaderboardEl = document.querySelector<HTMLElement>("#leaderboard")!;
const leaderboardListEl = document.querySelector<HTMLOListElement>("#leaderboard-list")!;
const playerStatsEl = document.querySelector<HTMLParagraphElement>("#player-stats")!;

const existingResult = loadResult(dayKey);
const savedPseudo = loadPseudo();
if (savedPseudo) pseudoInput.value = savedPseudo;
if (!hasBackend) {
  startScreenEl.querySelectorAll(".pseudo-label, .pseudo-input").forEach((el) => {
    (el as HTMLElement).hidden = true;
  });
}

function renderTimer(elapsedMs: number): void {
  statusEl.textContent = `⏱️ ${formatMs(elapsedMs)} — trouvez le mat en 1 coup`;
}

function shareText(result: DailyResult): string {
  const attemptsLabel = result.attempts === 1 ? "1 essai" : `${result.attempts} essais`;
  return [
    `♟️ Échec du Jour #${result.puzzleNumber}`,
    `⏱️ Mat trouvé en ${formatMs(result.timeMs)} (${attemptsLabel})`,
    SITE_URL,
  ].join("\n");
}

function showResult(result: DailyResult): void {
  resultEl.hidden = false;
  resultTextEl.textContent = shareText(result).replace(/\n/g, " · ");
  shareButton.onclick = async () => {
    const text = shareText(result);
    try {
      await navigator.clipboard.writeText(text);
      shareButton.textContent = "Copié ! ✅";
    } catch {
      shareButton.textContent = text;
    }
    setTimeout(() => {
      shareButton.textContent = "Copier le résultat 📋";
    }, 2000);
  };
}

function renderLeaderboard(entries: LeaderboardEntry[], pseudo: string | null): void {
  leaderboardListEl.innerHTML = "";
  entries.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "leaderboard-entry";
    if (pseudo && entry.pseudo === pseudo) li.classList.add("me");
    const rank = index + 1;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
    const attemptsLabel = entry.attempts === 1 ? "1 essai" : `${entry.attempts} essais`;
    li.textContent = `${medal} ${entry.pseudo} — ${formatMs(entry.timeMs)} (${attemptsLabel})`;
    leaderboardListEl.appendChild(li);
  });
}

async function loadAndShowLeaderboard(pseudo: string | null): Promise<void> {
  if (!hasBackend) return;
  leaderboardEl.hidden = false;
  leaderboardListEl.innerHTML = "<li>Chargement…</li>";
  playerStatsEl.textContent = "";

  const leaderboard = await fetchLeaderboard(dayNum);
  if (leaderboard) {
    renderLeaderboard(leaderboard.entries, pseudo);
  } else {
    leaderboardListEl.innerHTML = "<li>Classement indisponible pour le moment.</li>";
  }

  if (pseudo) {
    const stats = await fetchStats(pseudo, dayNum);
    if (stats && stats.solved > 0) {
      const bestLabel = stats.bestTimeMs !== null ? formatMs(stats.bestTimeMs) : "—";
      const avgAttempts = stats.avgAttempts !== null ? stats.avgAttempts.toFixed(1) : "—";
      playerStatsEl.textContent =
        `📊 ${pseudo} — ${stats.solved} jour(s) résolu(s) · meilleur temps ${bestLabel} · ` +
        `${avgAttempts} essai(s) en moyenne · série en cours : ${stats.currentStreak} jour(s)`;
    }
  }
}

function startGame(pseudo: string | null): void {
  startScreenEl.hidden = true;
  gameScreenEl.hidden = false;

  if (existingResult) {
    statusEl.textContent = "Puzzle du jour déjà résolu, revenez demain pour le prochain !";
    const chess = new Chess(puzzle.fen);
    new Board({
      container: boardContainer,
      chess,
      orientation: puzzle.toMove === "white" ? "w" : "b",
      onAttempt: () => "illegal-or-not-mate",
    }).lock();
    showResult(existingResult);
    void loadAndShowLeaderboard(pseudo);
    return;
  }

  const chess = new Chess(puzzle.fen);
  let attempts = 0;

  const timer = new Timer(renderTimer);

  const board = new Board({
    container: boardContainer,
    chess,
    orientation: puzzle.toMove === "white" ? "w" : "b",
    onAttempt: (move: MoveAttempt) => {
      attempts += 1;
      let applied;
      try {
        applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
      } catch {
        applied = null;
      }

      if (!applied) {
        return "illegal-or-not-mate";
      }

      if (chess.isCheckmate()) {
        const timeMs = timer.stop();
        const result: DailyResult = {
          dayKey,
          puzzleNumber: dayNum,
          timeMs,
          attempts,
        };
        saveResult(result);
        board.lock();
        statusEl.textContent = `🎉 Mat trouvé en ${formatMs(timeMs)} !`;
        showResult(result);
        if (pseudo) {
          void submitScore(dayNum, pseudo, timeMs, attempts).then(() => loadAndShowLeaderboard(pseudo));
        } else {
          void loadAndShowLeaderboard(null);
        }
        return "mate";
      }

      // Coup légal mais pas de mat : on l'annule et on pénalise.
      chess.undo();
      timer.addPenalty(WRONG_MOVE_PENALTY_MS);
      statusEl.classList.add("shake");
      setTimeout(() => statusEl.classList.remove("shake"), 300);
      return "illegal-or-not-mate";
    },
  });

  timer.start();
}

let gameStarted = false;

startButton.addEventListener("click", () => {
  // Garde-fou en plus du CSS : même si l'écran de démarrage redevenait
  // visible/cliquable par erreur, on ignore tout second clic pour empêcher
  // de relancer le chronomètre à zéro après avoir déjà vu le puzzle.
  if (gameStarted) return;

  if (!hasBackend) {
    gameStarted = true;
    startGame(null);
    return;
  }
  const pseudo = pseudoInput.value.trim();
  if (!PSEUDO_PATTERN.test(pseudo)) {
    pseudoErrorEl.hidden = false;
    return;
  }
  pseudoErrorEl.hidden = true;
  savePseudo(pseudo);
  gameStarted = true;
  startGame(pseudo);
});
