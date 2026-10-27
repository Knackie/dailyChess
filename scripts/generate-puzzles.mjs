// Génère un jeu de positions "mat en 1" garanties correctes.
// Principe : on joue des parties aléatoires, et après chaque coup on vérifie
// si le camp au trait dispose d'au moins un coup légal menant à l'échec et mat.
// Comme la validation s'appuie entièrement sur chess.js (moteur de règles),
// chaque puzzle généré est garanti correct.
//
// Diversité : sans contrainte, l'immense majorité des mats trouvés par parties
// aléatoires sont délivrés par la dame (elle est la pièce la plus mobile et
// la plus souvent encore sur l'échiquier), ce qui rend les puzzles très
// répétitifs. On collecte donc les candidats par "pièce qui mate" puis on
// compose le jeu final avec des quotas, pour obtenir un vrai mélange
// dame/tour/fou/cavalier/pion.
import { Chess } from "chess.js";
import { writeFileSync } from "node:fs";

const MIN_PLY = 10; // évite les positions de début de partie, trop artificielles
const MAX_PLY = 60;
const MAX_GAMES = 20000;

// Quotas visés pour la pièce qui délivre le mat (total = 200 puzzles).
const QUOTAS = { Q: 50, R: 30, B: 40, N: 40, P: 40 };

function randomInt(n) {
  return Math.floor(Math.random() * n);
}

function matingPiece(san) {
  const match = san.match(/^([QRBN])/);
  return match ? match[1] : "P";
}

const buckets = { Q: [], R: [], B: [], N: [], P: [] };
const seenFens = new Set();

function bucketsFull() {
  return Object.entries(QUOTAS).every(([piece, quota]) => buckets[piece].length >= quota);
}

for (let game = 0; game < MAX_GAMES && !bucketsFull(); game++) {
  const chess = new Chess();
  for (let ply = 0; ply < MAX_PLY; ply++) {
    // .moves() sans verbose suffit : chess.js inclut déjà "+"/"#" dans le SAN,
    // ce qui évite de rejouer chaque coup pour détecter un mat (bien plus rapide).
    const legalMoves = chess.moves();
    if (legalMoves.length === 0) break; // mat ou pat atteint par le jeu aléatoire

    // Position avant le coup : est-ce un mat en 1 pour le camp au trait ?
    if (ply >= MIN_PLY) {
      const fenBefore = chess.fen();
      if (!seenFens.has(fenBefore)) {
        const matingMoves = legalMoves.filter((san) => san.endsWith("#"));
        if (matingMoves.length >= 1 && matingMoves.length <= 2) {
          const piece = matingPiece(matingMoves[0]);
          if (buckets[piece].length < QUOTAS[piece]) {
            seenFens.add(fenBefore);
            buckets[piece].push({
              fen: fenBefore,
              solutions: matingMoves,
              toMove: chess.turn() === "w" ? "white" : "black",
            });
          }
          break; // on arrête cette partie, qu'on garde le puzzle ou non
        }
      }
    }

    const san = legalMoves[randomInt(legalMoves.length)];
    chess.move(san);
  }
}

const puzzles = Object.values(buckets).flat();
puzzles.sort((a, b) => a.fen.localeCompare(b.fen));

writeFileSync(
  new URL("../src/puzzles.json", import.meta.url),
  JSON.stringify(puzzles, null, 2) + "\n",
  "utf-8"
);

console.log(`Généré ${puzzles.length} puzzles "mat en 1" dans src/puzzles.json`);
for (const [piece, quota] of Object.entries(QUOTAS)) {
  console.log(`  ${piece}: ${buckets[piece].length}/${quota}`);
}
