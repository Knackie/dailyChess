// Persistance locale des résultats (pas de backend : tout vit dans le navigateur).

export type GameMode = "speedrun" | "blindfold";

export interface DailyResult {
  dayKey: string;
  mode: GameMode;
  puzzleNumber: number;
  timeMs: number;
  attempts: number;
}

const STORAGE_PREFIX = "echec-du-jour:result:";

function storageKey(mode: GameMode, dayKey: string): string {
  return `${STORAGE_PREFIX}${mode}:${dayKey}`;
}

export function loadResult(mode: GameMode, dayKey: string): DailyResult | null {
  const raw = localStorage.getItem(storageKey(mode, dayKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyResult;
  } catch {
    return null;
  }
}

export function saveResult(result: DailyResult): void {
  localStorage.setItem(storageKey(result.mode, result.dayKey), JSON.stringify(result));
}
