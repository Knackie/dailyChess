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

const PSEUDO_KEY = "echec-du-jour:pseudo";

export function loadPseudo(): string | null {
  return localStorage.getItem(PSEUDO_KEY);
}

export function savePseudo(pseudo: string): void {
  localStorage.setItem(PSEUDO_KEY, pseudo);
}

const DEVICE_TOKEN_KEY = "echec-du-jour:device-token";

/**
 * Jeton anonyme propre à cet appareil/navigateur, généré une seule fois et
 * conservé dans localStorage. Il sert à "réclamer" un pseudo auprès du
 * backend (voir api.ts: claimPseudo) pour empêcher qu'un autre visiteur
 * tapant le même pseudo puisse écraser son score.
 */
export function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}
