// Estime la difficulté d'un mat en 1, uniquement à partir de la position (FEN)
// et de la ou des solutions, sans donnée supplémentaire à maintenir.
//
// Heuristique : un mat est plus dur à trouver quand il y a beaucoup de coups
// légaux à envisager, quand plusieurs échecs "fausses pistes" ne matent pas
// (le joueur doit les écarter), et quand le coup gagnant est un coup calme
// (sans prise) plutôt qu'une prise, plus visible au premier coup d'œil.
//
// On calcule d'abord un Elo indicatif (purement heuristique, pas une vraie
// notation issue de parties jouées), puis le label et les étoiles en
// découlent directement de cet Elo pour rester cohérents entre eux.
import { Chess } from "chess.js";

export interface Difficulty {
  label: "Facile" | "Moyen" | "Difficile";
  stars: number; // 1 à 3
  elo: number; // estimation indicative, pas une vraie notation
}

export function estimateDifficulty(fen: string, solutions: string[]): Difficulty {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });
  const totalLegal = legalMoves.length;

  // Coups qui donnent échec (y compris les mats) : les candidats qu'un joueur
  // essaie naturellement en premier en cherchant un mat.
  const checkingMoves = legalMoves.filter((move) => /[+#]$/.test(move.san));
  const distractors = Math.max(0, checkingMoves.length - solutions.length);

  const solutionMoves = legalMoves.filter((move) => solutions.includes(move.san));
  const hasQuietSolution = solutionMoves.some((move) => !move.captured);

  const legalFactor = Math.min(totalLegal, 45) / 45;
  const distractorFactor = Math.min(distractors, 8) / 8;
  const quietBonus = hasQuietSolution ? 1 : 0;
  const soleSolutionBonus = solutions.length === 1 ? 0.5 : 0;

  const raw = legalFactor * 2 + distractorFactor * 2 + quietBonus + soleSolutionBonus; // 0 à 5.5
  const elo = Math.round((600 + (raw / 5.5) * 1700) / 10) * 10; // ≈ 600 à 2300

  let label: Difficulty["label"];
  let stars: number;
  if (elo <= 1550) {
    label = "Facile";
    stars = 1;
  } else if (elo <= 1800) {
    label = "Moyen";
    stars = 2;
  } else {
    label = "Difficile";
    stars = 3;
  }

  return { label, stars, elo };
}
