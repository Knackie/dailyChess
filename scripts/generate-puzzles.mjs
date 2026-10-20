// Génère un jeu de positions "mat en 1" garanties correctes.
// Principe : on joue des parties aléatoires, et après chaque coup on vérifie
// si le camp au trait dispose d'au moins un coup légal menant à l'échec et mat.
// Comme la validation s'appuie entièrement sur chess.js (moteur de règles),
// chaque puzzle généré est garanti correct.
import { Chess } from "chess.js";
import { writeFileSync } from "node:fs";

const TARGET_COUNT = 200;
const MAX_GAMES = 20000;
const MIN_PLY = 10; // évite les positions de début de partie, trop artificielles
const MAX_PLY = 60;

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

function findMatingMoves(chess) {
  const moves = chess.moves({ verbose: true });
  const mating = [];
  for (const move of moves) {
    chess.move(move.san);
    if (chess.isCheckmate()) {
      mating.push(move.san);
    }
    chess.undo();
  }
  return mating;
}

const puzzles = [];
const seenFens = new Set();

for (let game = 0; game < MAX_GAMES && puzzles.length < TARGET_COUNT; game++) {
  const chess = new Chess();
  for (let ply = 0; ply < MAX_PLY; ply++) {
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) break; // mat ou pat atteint par le jeu aléatoire

    // Position avant le coup : est-ce un mat en 1 pour le camp au trait ?
    if (ply >= MIN_PLY) {
      const fenBefore = chess.fen();
      if (!seenFens.has(fenBefore)) {
        const matingMoves = findMatingMoves(chess);
        if (matingMoves.length >= 1 && matingMoves.length <= 2) {
          seenFens.add(fenBefore);
          puzzles.push({
            fen: fenBefore,
            solutions: matingMoves,
            toMove: chess.turn() === "w" ? "white" : "black",
          });
          break; // on arrête cette partie, on a notre puzzle
        }
      }
    }

    const move = legalMoves[randomInt(legalMoves.length)];
    chess.move(move.san);
  }
}

puzzles.sort((a, b) => a.fen.localeCompare(b.fen));

writeFileSync(
  new URL("../src/puzzles.json", import.meta.url),
  JSON.stringify(puzzles, null, 2) + "\n",
  "utf-8"
);

console.log(`Généré ${puzzles.length} puzzles "mat en 1" dans src/puzzles.json`);
