import { Chess } from "chess.js";
import puzzlesData from "./puzzles.json";
import { dayNumber, todayKey, puzzleIndexForDay } from "./daily";
import { loadResult, saveResult, type DailyResult } from "./storage";
import { Board, type MoveAttempt } from "./board";
import { Timer, formatMs } from "./timer";
import "./style.css";

interface Puzzle {
  fen: string;
  solutions: string[];
  toMove: "white" | "black";
}

const puzzles = puzzlesData as Puzzle[];

const SITE_URL = "https://knackie.github.io/dailyChess/";
const WRONG_MOVE_PENALTY_MS = 3000;

const app = document.querySelector<HTMLDivElement>("#app")!;

const today = new Date();
const dayKey = todayKey(today);
const dayNum = dayNumber(today);
const puzzleIndex = puzzleIndexForDay(dayNum, puzzles.length);
const puzzle = puzzles[puzzleIndex];

app.innerHTML = `
  <main class="app">
    <header class="header">
      <h1>♟️ Échec du Jour <span class="day-number">#${dayNum}</span></h1>
      <p class="subtitle">Un mat en 1 coup, le même pour tout le monde. Trouvez-le le plus vite possible.</p>
    </header>
    <div class="status" id="status"></div>
    <div class="board-wrapper">
      <div class="board" id="board"></div>
    </div>
    <div class="result" id="result" hidden>
      <p id="result-text"></p>
      <button id="share-button" class="share-button">Copier le résultat 📋</button>
    </div>
  </main>
`;

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const boardContainer = document.querySelector<HTMLDivElement>("#board")!;
const resultEl = document.querySelector<HTMLDivElement>("#result")!;
const resultTextEl = document.querySelector<HTMLParagraphElement>("#result-text")!;
const shareButton = document.querySelector<HTMLButtonElement>("#share-button")!;

const existingResult = loadResult(dayKey);

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
} else {
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
