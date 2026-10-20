export interface Env {
  DB: D1Database;
  ALLOW_ORIGIN: string;
}

const MAX_PSEUDO_LENGTH = 20;
const MAX_TIME_MS = 24 * 60 * 60 * 1000; // garde-fou large, évite les valeurs absurdes
const MAX_ATTEMPTS = 500;

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
    if (url.pathname === "/stats" && request.method === "GET") {
      return handleStats(url, env);
    }

    return json({ error: "Not found" }, env, 404);
  },
};
