// URL du backend (Cloudflare Worker). Vide tant que le backend n'est pas déployé :
// le classement est alors simplement masqué, le jeu reste utilisable sans lui.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const hasBackend = API_URL.length > 0;

export interface LeaderboardEntry {
  pseudo: string;
  timeMs: number;
  attempts: number;
}

export interface LeaderboardResponse {
  day: number;
  entries: LeaderboardEntry[];
}

export interface StatsResponse {
  pseudo: string;
  solved: number;
  bestTimeMs: number | null;
  avgAttempts: number | null;
  currentStreak: number;
}

export interface MonthlyEntry {
  pseudo: string;
  points: number;
  daysPlayed: number;
}

export interface MonthlyResponse {
  year: number;
  month: number;
  entries: MonthlyEntry[];
}

export async function submitScore(
  day: number,
  pseudo: string,
  timeMs: number,
  attempts: number,
  token: string
): Promise<void> {
  if (!hasBackend) return;
  try {
    await fetch(`${API_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, pseudo, timeMs, attempts, token }),
    });
  } catch {
    // Pas de backend joignable : on ignore silencieusement, le jeu reste jouable.
  }
}

/**
 * Vérifie qu'un pseudo est libre ou appartient déjà à cet appareil (via le
 * jeton local), et le réclame le cas échéant. `ok: false` signifie que le
 * pseudo est déjà utilisé par un autre appareil ; l'appelant doit alors
 * demander à l'utilisateur d'en choisir un autre plutôt que d'écraser son
 * score. En cas d'erreur réseau/serveur, on retourne `null` et on laisse
 * l'utilisateur continuer (on ne bloque pas le jeu si le backend a un souci).
 */
export async function claimPseudo(pseudo: string, token: string): Promise<{ ok: boolean } | null> {
  if (!hasBackend) return null;
  try {
    const res = await fetch(`${API_URL}/claim-pseudo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, token }),
    });
    if (res.status === 409) return { ok: false };
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean };
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(day: number): Promise<LeaderboardResponse | null> {
  if (!hasBackend) return null;
  try {
    const res = await fetch(`${API_URL}/leaderboard?day=${day}`);
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardResponse;
  } catch {
    return null;
  }
}

export async function fetchStats(pseudo: string, today: number): Promise<StatsResponse | null> {
  if (!hasBackend) return null;
  try {
    const res = await fetch(`${API_URL}/stats?pseudo=${encodeURIComponent(pseudo)}&today=${today}`);
    if (!res.ok) return null;
    return (await res.json()) as StatsResponse;
  } catch {
    return null;
  }
}

export async function fetchMonthly(year: number, month: number): Promise<MonthlyResponse | null> {
  if (!hasBackend) return null;
  try {
    const res = await fetch(`${API_URL}/monthly?year=${year}&month=${month}`);
    if (!res.ok) return null;
    return (await res.json()) as MonthlyResponse;
  } catch {
    return null;
  }
}
