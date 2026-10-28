export interface Env {
  DB: D1Database;
  ALLOW_ORIGIN: string;
}

const MAX_PSEUDO_LENGTH = 20;
const MAX_TIME_MS = 24 * 60 * 60 * 1000; // garde-fou large, évite les valeurs absurdes
const MAX_ATTEMPTS = 500;

// Doit rester strictement identique à LAUNCH_DATE_UTC dans src/daily.ts côté frontend :
// c'est ce qui permet de retrouver, pour un mois calendaire donné, la plage de numéros
// de puzzle ("day") qui lui correspond, sans dupliquer de logique de date complexe.
const LAUNCH_DATE_UTC = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Plage [dayMin, dayMax] des numéros de puzzle appartenant au mois calendaire donné (UTC). */
function dayRangeForMonth(year: number, month: number): { dayMin: number; dayMax: number } {
  const monthStart = Date.UTC(year, month - 1, 1);
  const nextMonthStart = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
  const dayMin = Math.floor((monthStart - LAUNCH_DATE_UTC) / DAY_MS) + 1;
  const dayMax = Math.floor((nextMonthStart - LAUNCH_DATE_UTC) / DAY_MS);
  return { dayMin: Math.max(1, dayMin), dayMax: Math.max(1, dayMax) };
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function sanitizePseudo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_PSEUDO_LENGTH);
  if (trimmed.length === 0) return null;
  // Lettres/chiffres/espaces/tirets/underscore uniquement, pour éviter tout caractère piégeux.
  if (!/^[\p{L}\p{N} _-]+$/u.test(trimmed)) return null;
  return trimmed;
}

interface ScorePayload {
  day: number;
  pseudo: string;
  timeMs: number;
  attempts: number;
}

async function handleSubmitScore(request: Request, env: Env): Promise<Response> {
  let body: Partial<ScorePayload>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide" }, env, 400);
  }

  const day = Number(body.day);
  const pseudo = sanitizePseudo(body.pseudo);
  const timeMs = Number(body.timeMs);
  const attempts = Number(body.attempts);

  if (!Number.isInteger(day) || day <= 0) {
    return json({ error: "day invalide" }, env, 400);
  }
  if (!pseudo) {
    return json({ error: "pseudo invalide" }, env, 400);
  }
  if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs > MAX_TIME_MS) {
    return json({ error: "timeMs invalide" }, env, 400);
  }
  if (!Number.isInteger(attempts) || attempts <= 0 || attempts > MAX_ATTEMPTS) {
    return json({ error: "attempts invalide" }, env, 400);
  }

  // On ne garde que le meilleur score (temps le plus court) par joueur et par jour.
  const existing = await env.DB.prepare(
    "SELECT time_ms FROM scores WHERE day = ? AND pseudo = ?"
  )
    .bind(day, pseudo)
    .first<{ time_ms: number }>();

  if (existing && existing.time_ms <= timeMs) {
    return json({ ok: true, improved: false }, env);
  }

  await env.DB.prepare(
    `INSERT INTO scores (day, pseudo, time_ms, attempts)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (day, pseudo) DO UPDATE SET time_ms = excluded.time_ms, attempts = excluded.attempts, created_at = datetime('now')`
  )
    .bind(day, pseudo, timeMs, attempts)
    .run();

  return json({ ok: true, improved: true }, env);
}

async function handleLeaderboard(url: URL, env: Env): Promise<Response> {
  const day = Number(url.searchParams.get("day"));
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  if (!Number.isInteger(day) || day <= 0) {
    return json({ error: "day invalide" }, env, 400);
  }

  const { results } = await env.DB.prepare(
    "SELECT pseudo, time_ms as timeMs, attempts FROM scores WHERE day = ? ORDER BY time_ms ASC, attempts ASC LIMIT ?"
  )
    .bind(day, limit)
    .all();

  return json({ day, entries: results ?? [] }, env);
}

interface MonthlyRow {
  pseudo: string;
  points: number;
  daysPlayed: number;
}

async function handleMonthly(url: URL, env: Env): Promise<Response> {
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);

  if (!Number.isInteger(year) || year < 2026) {
    return json({ error: "year invalide" }, env, 400);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return json({ error: "month invalide" }, env, 400);
  }

  const { dayMin, dayMax } = dayRangeForMonth(year, month);

  // Points du jour = (nombre de joueurs du jour) - (rang du jour) + 1, donc le premier
  // gagne autant de points qu'il y a de joueurs ce jour-là, le dernier en gagne 1.
  // Sommés sur tout le mois, ça donne le classement général mensuel.
  const { results } = await env.DB.prepare(
    `WITH ranked AS (
       SELECT day, pseudo,
              RANK() OVER (PARTITION BY day ORDER BY time_ms ASC, attempts ASC) as rnk,
              COUNT(*) OVER (PARTITION BY day) as total
       FROM scores
       WHERE day BETWEEN ? AND ?
     )
     SELECT pseudo, SUM(total - rnk + 1) as points, COUNT(*) as daysPlayed
     FROM ranked
     GROUP BY pseudo
     ORDER BY points DESC, daysPlayed DESC
     LIMIT ?`
  )
    .bind(dayMin, dayMax, limit)
    .all<MonthlyRow>();

  return json({ year, month, entries: results ?? [] }, env);
}

async function handleStats(url: URL, env: Env): Promise<Response> {
  const pseudo = sanitizePseudo(url.searchParams.get("pseudo"));
  const today = Number(url.searchParams.get("today"));
  if (!pseudo) {
    return json({ error: "pseudo invalide" }, env, 400);
  }

  const summary = await env.DB.prepare(
    "SELECT COUNT(*) as solved, MIN(time_ms) as bestTimeMs, AVG(attempts) as avgAttempts FROM scores WHERE pseudo = ?"
  )
    .bind(pseudo)
    .first<{ solved: number; bestTimeMs: number | null; avgAttempts: number | null }>();

  let currentStreak = 0;
  if (Number.isInteger(today) && today > 0) {
    const { results } = await env.DB.prepare(
      "SELECT day FROM scores WHERE pseudo = ? ORDER BY day DESC"
    )
      .bind(pseudo)
      .all<{ day: number }>();

    let expectedDay = today;
    for (const row of results ?? []) {
      if (row.day === expectedDay) {
        currentStreak += 1;
        expectedDay -= 1;
      } else if (row.day < expectedDay) {
        break;
      }
    }
  }

  return json(
    {
      pseudo,
      solved: summary?.solved ?? 0,
      bestTimeMs: summary?.bestTimeMs ?? null,
      avgAttempts: summary?.avgAttempts ?? null,
      currentStreak,
    },
    env
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === "/score" && request.method === "POST") {
      return handleSubmitScore(request, env);
    }
    if (url.pathname === "/leaderboard" && request.method === "GET") {
      return handleLeaderboard(url, env);
    }
    if (url.pathname === "/monthly" && request.method === "GET") {
      return handleMonthly(url, env);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      return handleStats(url, env);
    }

    return json({ error: "Not found" }, env, 404);
  },
};
