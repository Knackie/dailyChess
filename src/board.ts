import type { Chess, Square, PieceSymbol, Color } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const PIECE_GLYPHS: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

export interface MoveAttempt {
  from: Square;
  to: Square;
  promotion?: "q" | "r" | "b" | "n";
}

export type MoveResult = "mate" | "illegal-or-not-mate";

interface BoardOptions {
  container: HTMLElement;
  chess: Chess;
  orientation: Color; // couleur affichée en bas de l'échiquier
  onAttempt: (move: MoveAttempt) => MoveResult;
}

/** Échiquier interactif en "point and click" : sélectionner une pièce puis sa case d'arrivée. */
export class Board {
  private readonly container: HTMLElement;
  private readonly chess: Chess;
  private readonly orientation: Color;
  private readonly onAttempt: (move: MoveAttempt) => MoveResult;
  private selected: Square | null = null;
  private legalTargets: Map<Square, boolean> = new Map(); // true si la case nécessite une promotion
  private locked = false;

  constructor(options: BoardOptions) {
    this.container = options.container;
    this.chess = options.chess;
    this.orientation = options.orientation;
    this.onAttempt = options.onAttempt;
    this.render();
  }

  lock(): void {
    this.locked = true;
    this.selected = null;
    this.legalTargets.clear();
    this.render();
  }

  private squareOrder(): Square[] {
    const ranks = this.orientation === "w" ? [...RANKS].reverse() : RANKS;
    const files = this.orientation === "w" ? FILES : [...FILES].reverse();
    const squares: Square[] = [];
    for (const rank of ranks) {
      for (const file of files) {
        squares.push((file + rank) as Square);
      }
    }
    return squares;
  }

  private select(square: Square): void {
    const piece = this.chess.get(square);
    if (!piece || piece.color !== this.chess.turn()) return;
    this.selected = square;
    this.legalTargets.clear();
    const moves = this.chess.moves({ square, verbose: true });
    for (const move of moves) {
      this.legalTargets.set(move.to as Square, Boolean(move.promotion));
    }
    this.render();
  }

  private handleSquareClick(square: Square): void {
    if (this.locked) return;

    if (this.selected && this.legalTargets.has(square)) {
      const needsPromotion = this.legalTargets.get(square);
      const from = this.selected;
      this.selected = null;
      this.legalTargets.clear();
      if (needsPromotion) {
        this.promptPromotion((promotion) => {
          this.onAttempt({ from, to: square, promotion });
          this.render();
        });
        return;
      }
      this.onAttempt({ from, to: square });
      this.render();
      return;
    }

    const piece = this.chess.get(square);
    if (piece && piece.color === this.chess.turn()) {
      this.select(square);
    } else {
      this.selected = null;
      this.legalTargets.clear();
      this.render();
    }
  }

  private promptPromotion(onChoose: (piece: "q" | "r" | "b" | "n") => void): void {
    const overlay = document.createElement("div");
    overlay.className = "promotion-overlay";
    const choices: Array<["q" | "r" | "b" | "n", string]> = [
      ["q", "♕"],
      ["r", "♖"],
      ["b", "♗"],
      ["n", "♘"],
    ];
    for (const [piece, glyph] of choices) {
      const button = document.createElement("button");
      button.className = "promotion-choice";
      button.textContent = glyph;
      button.addEventListener("click", () => {
        overlay.remove();
        onChoose(piece);
      });
      overlay.appendChild(button);
    }
    this.container.appendChild(overlay);
  }

  render(): void {
    this.container.innerHTML = "";
    this.container.classList.add("board");

    const order = this.squareOrder();
    order.forEach((square, index) => {
      const file = square.charCodeAt(0) - "a".charCodeAt(0);
      const rank = Number(square[1]);
      const isLight = (file + rank) % 2 === 1;
      const row = Math.floor(index / 8);
      const col = index % 8;

      const squareEl = document.createElement("button");
      squareEl.type = "button";
      squareEl.className = `square ${isLight ? "light" : "dark"}`;
      squareEl.dataset.square = square;
      if (this.selected === square) squareEl.classList.add("selected");
      if (this.legalTargets.has(square)) squareEl.classList.add("legal-target");

      const piece = this.chess.get(square);
      if (piece) {
        const glyph = document.createElement("span");
        glyph.className = `piece-glyph ${piece.color === "w" ? "piece-white" : "piece-black"}`;
        glyph.textContent = PIECE_GLYPHS[piece.color][piece.type];
        squareEl.appendChild(glyph);
      }

      // Repères de coordonnées : fichiers (a-h) sur la dernière rangée, rangs (1-8) sur la première colonne.
      if (row === 7 || col === 0) {
        const coord = document.createElement("span");
        coord.className = "coord";
        coord.textContent = row === 7 ? square[0] : square[1];
        squareEl.appendChild(coord);
      }

      squareEl.addEventListener("click", () => this.handleSquareClick(square));
      this.container.appendChild(squareEl);
    });
  }
}
