// Calcule quelle position du jour (index dans puzzles.json) doit être jouée,
// de façon déterministe et identique pour tout le monde, pour une date donnée.

// Date de lancement du jeu : sert de point de départ au numéro de puzzle (#1, #2, ...).
const LAUNCH_DATE_UTC = Date.UTC(2026, 0, 1); // 1er janvier 2026
const DAY_MS = 24 * 60 * 60 * 1000;

/** Retourne la clé du jour au format YYYY-MM-DD, en heure locale du joueur. */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Nombre de jours écoulés depuis le lancement (>= 0), utilisé comme numéro de puzzle. */
export function dayNumber(date: Date = new Date()): number {
  const localMidnightUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor((localMidnightUtc - LAUNCH_DATE_UTC) / DAY_MS);
  return Math.max(0, diffDays) + 1;
}

/** Index du puzzle du jour dans la liste, en bouclant si la liste est plus courte que le nombre de jours. */
export function puzzleIndexForDay(
  dayNum: number,
  puzzleCount: number,
): number {
  return (dayNum - 1) % puzzleCount;
}
