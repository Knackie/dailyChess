// Icônes vectorielles (SVG) pour les pièces d'échecs, dessinées "maison" (formes
// géométriques simples) plutôt que des glyphes Unicode.
//
// Pourquoi : les glyphes Unicode (♟♞♝♜♛♚) dépendent entièrement de la police du
// système pour leur rendu, ce qui s'est révélé peu fiable sur mobile :
// - Sur Android, certaines polices traitent ces caractères comme des emojis à
//   couleur fixe et ignorent la couleur CSS appliquée (toutes les pièces
//   apparaissaient blanches, quelle que soit leur couleur réelle).
// - Sur iPhone, la police système ne dessine pas chaque symbole à la même
//   échelle (le pion ressortait visiblement plus petit que les autres pièces).
//
// Des SVG vectoriels, dimensionnés via un même viewBox et colorés en CSS
// (fill/stroke, qui s'appliquent et s'héritent normalement sur tous les
// éléments enfants), donnent un rendu strictement identique sur toutes les
// plateformes.
import type { PieceSymbol } from "chess.js";

const VIEWBOX = "0 0 45 45";

// Contenu interne (sans la balise <svg> englobante) de chaque pièce. La classe
// "piece-accent" désigne un détail dont la couleur est inversée par rapport au
// corps de la pièce (ex. l'œil du cavalier), pour rester visible sur les deux
// couleurs ; voir les règles .piece-white/.piece-black dans style.css.
const PIECE_SHAPES: Record<PieceSymbol, string> = {
  p: `
    <circle cx="22.5" cy="13" r="6.5" />
    <path d="M16 33 L19 22 L26 22 L29 33 Z" />
    <rect x="12" y="33" width="21" height="4" rx="1.5" />
  `,
  r: `
    <rect x="11" y="6" width="5" height="6" />
    <rect x="20" y="6" width="5" height="6" />
    <rect x="29" y="6" width="5" height="6" />
    <rect x="11" y="12" width="23" height="3" />
    <path d="M13 15 L31 15 L28 33 L16 33 Z" />
    <rect x="10" y="33" width="25" height="4" rx="1.5" />
  `,
  n: `
    <path d="M10 34 L10 28 C10 24 12 21 15 19 C13 17 12 14 13 11 C14 8 17 7 19 9 C20 10 19 11 21 11 C25 11 30 14 31 19 C32 22 31 26 31 28 L31 34 Z" />
    <circle class="piece-accent" cx="18" cy="14.5" r="1.4" />
    <rect x="9" y="34" width="25" height="4" rx="1.5" />
  `,
  b: `
    <circle cx="22.5" cy="7.5" r="2.3" />
    <path d="M22.5 10.5 C19 10.5 17 13.5 17 17.5 C17 20.5 19 21.5 18 24.5 C17 27.5 15 29.5 15 33 L30 33 C30 29.5 28 27.5 27 24.5 C26 21.5 28 20.5 28 17.5 C28 13.5 26 10.5 22.5 10.5 Z" />
    <line class="piece-accent" x1="17.5" y1="19" x2="27.5" y2="23" />
    <rect x="12" y="33" width="21" height="4" rx="1.5" />
  `,
  q: `
    <circle cx="12" cy="13" r="2.3" />
    <circle cx="17.5" cy="13" r="2.3" />
    <circle cx="22.5" cy="13" r="2.3" />
    <circle cx="27.5" cy="13" r="2.3" />
    <circle cx="33" cy="13" r="2.3" />
    <rect x="12" y="15" width="21" height="3" />
    <path d="M14 33 C13 27 15 22 14 18 L31 18 C30 22 32 27 31 33 Z" />
    <rect x="10" y="33" width="25" height="4" rx="1.5" />
  `,
  k: `
    <rect x="21" y="5" width="3" height="8" />
    <rect x="18" y="8" width="9" height="3" />
    <path d="M15 34 C14 28 16 23 15 19 C15 16 17 14 22.5 14 C28 14 30 16 30 19 C29 23 31 28 30 34 Z" />
    <rect x="11" y="34" width="23" height="4" rx="1.5" />
  `,
};

export function pieceSvgMarkup(type: PieceSymbol): string {
  return `<svg viewBox="${VIEWBOX}" class="piece-icon" aria-hidden="true">${PIECE_SHAPES[type]}</svg>`;
}
