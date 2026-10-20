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

interface DragState {
  pointerId: number;
  fromSquare: Square;
  ghost: HTMLElement;
}

/** Échiquier interactif : cliquer une pièce puis sa case d'arrivée, ou glisser-déposer la pièce directement. */
export class Board {
  private readonly container: HTMLElement;
  private readonly chess: Chess;
  private readonly orientation: Color;
  private readonly onAttempt: (move: MoveAttempt) => MoveResult;
  private selected: Square | null = null;
  private legalTargets: Map<Square, boolean> = new Map(); // true si la case nécessite une promotion
  private locked = false;
  private dragState: DragState | null = null;

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

  private attemptMove(from: Square, to: Square): void {
    const needsPromotion = this.legalTargets.get(to);
    this.selected = null;
    this.legalTargets.clear();
    if (needsPromotion) {
      this.promptPromotion((promotion) => {
        this.onAttempt({ from, to, promotion });
        this.render();
      });
      return;
    }
    this.onAttempt({ from, to });
    this.render();
  }

  private handlePointerDown(event: PointerEvent, square: Square): void {
    if (this.locked) return;

    // Case déjà sélectionnée et cible légale : un simple clic/tap joue le coup sans glisser.
    if (this.selected && square !== this.selected && this.legalTargets.has(square)) {
      event.preventDefault();
      this.attemptMove(this.selected, square);
      return;
    }

    const piece = this.chess.get(square);
    if (piece && piece.color === this.chess.turn()) {
      event.preventDefault();
      this.select(square);
      this.startDrag(event, square);
    } else {
      this.selected = null;
      this.legalTargets.clear();
      this.render();
    }
  }

  private startDrag(event: PointerEvent, square: Square): void {
    const squareEl = this.container.querySelector(`[data-square="${square}"]`) as HTMLElement | null;
    const pieceEl = squareEl?.querySelector(".piece-glyph") as HTMLElement | null;
    if (!squareEl || !pieceEl) return;

    const ghost = document.createElement("span");
    ghost.className = pieceEl.className + " piece-ghost";
    ghost.textContent = pieceEl.textContent;
    ghost.style.fontSize = getComputedStyle(squareEl).fontSize;
    document.body.appendChild(ghost);
    pieceEl.classList.add("piece-dragging");

    this.dragState = { pointerId: event.pointerId, fromSquare: square, ghost };
    this.positionGhost(event.clientX, event.clientY);

    const onMove = (e: PointerEvent) => {
      if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
      this.positionGhost(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
      cleanupListeners();
      this.endDrag(e.clientX, e.clientY);
    };
    const onCancel = (e: PointerEvent) => {
      if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
      cleanupListeners();
      this.cancelDrag();
    };
    const cleanupListeners = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }

  private positionGhost(x: number, y: number): void {
    if (!this.dragState) return;
    this.dragState.ghost.style.left = `${x}px`;
    this.dragState.ghost.style.top = `${y}px`;
  }

  private endDrag(x: number, y: number): void {
    if (!this.dragState) return;
    const { fromSquare } = this.dragState;
    const targetEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(".square") as
      | HTMLElement
      | null;
    const targetSquare = targetEl?.dataset.square as Square | undefined;
    this.cleanupDrag();

    if (targetSquare && targetSquare !== fromSquare && this.legalTargets.has(targetSquare)) {
      this.attemptMove(fromSquare, targetSquare);
    } else {
      // Case invalide ou retour sur la case d'origine : on garde juste la sélection active.
      this.render();
    }
  }

  private cancelDrag(): void {
    this.cleanupDrag();
    this.render();
  }

  private cleanupDrag(): void {
    if (!this.dragState) return;
    this.dragState.ghost.remove();
    this.dragState = null;
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

      squareEl.addEventListener("pointerdown", (event) => this.handlePointerDown(event, square));
      this.container.appendChild(squareEl);
    });
  }
}
