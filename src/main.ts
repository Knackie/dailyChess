import { Chess } from "chess.js";
import puzzlesData from "./puzzles.json";
import { dayNumber, todayKey, puzzleIndexForDay } from "./daily";
import { loadResult, saveResult, type DailyResult, type GameMode } from "./storage";
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
const BLINDFOLD_MEMORIZE_SECONDS = 5;

const MODE_LABELS: Record<GameMode, string> = {
  speedrun: "Speedrun ⚡",
  blindfold: "Blindfold 🙈",
};

const app = document.querySelector<HTMLDivElement>("#app")!;

const today = new Date();
const dayKey = todayKey(today);
const dayNum = dayNumber(today);
const puzzleIndex = puzzleIndexForDay(dayNum, puzzles.length);
const puzzle = puzzles[puzzleIndex];
const orientation = puzzle.toMove === "white" ? "w" : "b";

app.innerHTML = `
  <main class="app">
    <header class="header">
      <h1>♟️ Échec du Jour <span class="day-number">#${dayNum}</span></h1>
      <p class="subtitle">Un mat en 1 coup, le même pour tout le monde. Trouvez-le le plus vite possible.</p>
    </header>
    <nav class="tabs" role="tablist">
      <button class="tab active" data-mode="speedrun" role="tab" aria-selected="true">${MODE_LABELS.speedrun}</button>
      <button class="tab" data-mode="blindfold" role="tab" aria-selected="false">${MODE_LABELS.blindfold}</button>
    </nav>
    <section class="panel" data-panel="speedrun">
      <p class="mode-hint">Jouez le mat en 1 coup le plus vite possible.</p>
      <div class="status" data-status></div>
      <div class="board-wrapper"><div class="board" data-board></div></div>
      <div class="result" data-result hidden>
        <p data-result-text></p>
        <button class="share-button" data-share-button>Copier le résultat 📋</button>
      </div>
    </section>
    <section class="panel" data-panel="blindfold" hidden>
      <p class="mode-hint">Mémorisez la position pendant ${BLINDFOLD_MEMORIZE_SECONDS} secondes, puis rejouez le mat de mémoire.</p>
      <div class="status" data-status></div>
      <div class="board-wrapper"><div class="board" data-board></div></div>
      <div class="result" data-result hidden>
        <p data-result-text></p>
        <button class="share-button" data-share-button>Copier le résultat 📋</button>
      </div>
    </section>
  </main>
`;

function shareText(result: DailyResult): string {
  const attemptsLabel = result.attempts === 1 ? "1 essai" : `${result.attempts} essais`;
  return [
    `♟️ Échec du Jour #${result.puzzleNumber} — ${MODE_LABELS[result.mode]}`,
    `⏱️ Mat trouvé en ${formatMs(result.timeMs)} (${attemptsLabel})`,
    SITE_URL,
  ].join("\n");
}

interface PanelRefs {
  statusEl: HTMLElement;
  boardContainer: HTMLElement;
  resultEl: HTMLElement;
  resultTextEl: HTMLElement;
  shareButton: HTMLButtonElement;
}

function getPanelRefs(mode: GameMode): PanelRefs {
  const panel = document.querySelector<HTMLElement>(`[data-panel="${mode}"]`)!;
  return {
    statusEl: panel.querySelector<HTMLElement>("[data-status]")!,
    boardContainer: panel.querySelector<HTMLElement>("[data-board]")!,
    resultEl: panel.querySelector<HTMLElement>("[data-result]")!,
    resultTextEl: panel.querySelector<HTMLElement>("[data-result-text]")!,
    shareButton: panel.querySelector<HTMLButtonElement>("[data-share-button]")!,
  };
}

function showResult(refs: PanelRefs, result: DailyResult): void {
  refs.resultEl.hidden = false;
  refs.resultTextEl.textContent = shareText(result).replace(/\n/g, " · ");
  refs.shareButton.onclick = async () => {
    const text = shareText(result);
    try {
      await navigator.clipboard.writeText(text);
      refs.shareButton.textContent = "Copié ! ✅";
    } catch {
      refs.shareButton.textContent = text;
    }
    setTimeout(() => {
      refs.shareButton.textContent = "Copier le résultat 📋";
    }, 2000);
  };
}

function shake(statusEl: HTMLElement): void {
  statusEl.classList.add("shake");
  setTimeout(() => statusEl.classList.remove("shake"), 300);
}

/** Mode Speedrun : le plateau est visible dès le départ, chrono lancé immédiatement. */
function mountSpeedrun(refs: PanelRefs): void {
  const existingResult = loadResult("speedrun", dayKey);
  const chess = new Chess(puzzle.fen);

  if (existingResult) {
    refs.statusEl.textContent = "Puzzle du jour déjà résolu, revenez demain pour le prochain !";
    new Board({
      container: refs.boardContainer,
      chess,
      orientation,
      onAttempt: () => "illegal-or-not-mate",
    }).lock();
    showResult(refs, existingResult);
    return;
  }

  let attempts = 0;
  const timer = new Timer((elapsedMs) => {
    refs.statusEl.textContent = `⏱️ ${formatMs(elapsedMs)} — trouvez le mat en 1 coup`;
  });

  const board = new Board({
    container: refs.boardContainer,
    chess,
    orientation,
    onAttempt: (move: MoveAttempt) => {
      attempts += 1;
      let applied;
      try {
        applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
      } catch {
        applied = null;
      }

      if (!applied) return "illegal-or-not-mate";

      if (chess.isCheckmate()) {
        const timeMs = timer.stop();
        const result: DailyResult = { dayKey, mode: "speedrun", puzzleNumber: dayNum, timeMs, attempts };
        saveResult(result);
        board.lock();
        refs.statusEl.textContent = `🎉 Mat trouvé en ${formatMs(timeMs)} !`;
        showResult(refs, result);
        return "mate";
      }

      chess.undo();
      timer.addPenalty(WRONG_MOVE_PENALTY_MS);
      shake(refs.statusEl);
      return "illegal-or-not-mate";
    },
  });

  timer.start();
}

/**
 * Mode Blindfold : le plateau est affiché quelques secondes pour mémorisation,
 * puis les pièces disparaissent. Le joueur doit rejouer le mat de mémoire,
 * en cliquant uniquement sur les cases (aucun indice de coup légal).
 */
function mountBlindfold(refs: PanelRefs): void {
  const existingResult = loadResult("blindfold", dayKey);
  const chess = new Chess(puzzle.fen);

  if (existingResult) {
    refs.statusEl.textContent = "Puzzle du jour déjà résolu, revenez demain pour le prochain !";
    new Board({
      container: refs.boardContainer,
      chess,
      orientation,
      blind: false,
      onAttempt: () => "illegal-or-not-mate",
    }).lock();
    showResult(refs, existingResult);
    return;
  }

  let attempts = 0;
  const timer = new Timer((elapsedMs) => {
    refs.statusEl.textContent = `⏱️ ${formatMs(elapsedMs)} — rejouez le mat de mémoire`;
  });

  const board = new Board({
    container: refs.boardContainer,
    chess,
    orientation,
    blind: false,
    onAttempt: (move: MoveAttempt) => {
      attempts += 1;
      let applied;
      try {
        applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
      } catch {
        applied = null;
      }

      if (!applied) {
        timer.addPenalty(WRONG_MOVE_PENALTY_MS);
        shake(refs.statusEl);
        return "illegal-or-not-mate";
      }

      if (chess.isCheckmate()) {
        const timeMs = timer.stop();
        const result: DailyResult = { dayKey, mode: "blindfold", puzzleNumber: dayNum, timeMs, attempts };
        saveResult(result);
        board.setBlind(false); // on révèle la position finale pour vérification
        board.lock();
        refs.statusEl.textContent = `🎉 Mat trouvé en ${formatMs(timeMs)} !`;
        showResult(refs, result);
        return "mate";
      }

      chess.undo();
      timer.addPenalty(WRONG_MOVE_PENALTY_MS);
      shake(refs.statusEl);
      return "illegal-or-not-mate";
    },
  });

  let remaining = BLINDFOLD_MEMORIZE_SECONDS;
  refs.statusEl.textContent = `👀 Mémorisez la position... ${remaining}`;
  const countdown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdown);
      board.setBlind(true);
      timer.start();
      return;
    }
    refs.statusEl.textContent = `👀 Mémorisez la position... ${remaining}`;
  }, 1000);
}

const mounted = new Set<GameMode>();
const mounters: Record<GameMode, (refs: PanelRefs) => void> = {
  speedrun: mountSpeedrun,
  blindfold: mountBlindfold,
};

function activateMode(mode: GameMode): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== mode;
  }
  if (!mounted.has(mode)) {
    mounted.add(mode);
    mounters[mode](getPanelRefs(mode));
  }
}

for (const tab of document.querySelectorAll<HTMLButtonElement>(".tab")) {
  tab.addEventListener("click", () => activateMode(tab.dataset.mode as GameMode));
}

activateMode("speedrun");
