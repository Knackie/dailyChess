// Persistance locale du résultat du jour (pas de backend : tout vit dans le navigateur).

export interface DailyResult {
  dayKey: string;
  puzzleNumber: number;
  timeMs: number;
  attempts: number;
}

const STORAGE_PREFIX = "echec-du-jour:result:";

export function loadResult(dayKey: string): DailyResult | null {
  const raw = localStorage.getItem(STORAGE_PREFIX + dayKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyResult;
  } catch {
    return null;
  }
}

export function saveResult(result: DailyResult): void {
  localStorage.setItem(STORAGE_PREFIX + result.dayKey, JSON.stringify(result));
}
