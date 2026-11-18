export interface Env {
  DB: D1Database;
  ALLOW_ORIGIN: string;
  // Optionnels : laissés non définis tant que le bot WhatsApp n'est pas configuré,
  // auquel cas le déclenchement planifié ne fait rien (voir scheduled() plus bas).
  GREEN_API_URL?: string;
  GREEN_API_ID_INSTANCE?: string;
  GREEN_API_TOKEN?: string;
  GREEN_API_GROUP_CHAT_ID?: string;
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

/** Année/mois/jour/heure "muraux" dans le fuseau donné, pour une date donnée. */
function wallClockParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // hour12:false peut renvoyer "24" pour minuit selon les moteurs JS : on le ramène à 0.
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24 };
}

/**
 * Numéro de puzzle ("day") correspondant à la date du jour dans le fuseau donné.
 * Reprend exactement le calcul de dayNumber() côté frontend (src/daily.ts), en
 * remplaçant la date locale du navigateur par la date murale dans ce fuseau :
 * pour un club basé en France, c'est cette date-là qui doit déterminer le
 * puzzle "du jour" envoyé par le bot, indépendamment du fuseau du serveur.
 */
function dayNumberInTimeZone(date: Date, timeZone: string): number {
  const { year, month, day } = wallClockParts(date, timeZone);
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  const diffDays = Math.floor((localMidnightUtc - LAUNCH_DATE_UTC) / DAY_MS);
  return Math.max(0, diffDays) + 1;
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

function sanitizeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 200) return null;
  return trimmed;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Réclame le pseudo pour ce jeton s'il est encore libre, ou vérifie qu'il
 * appartient déjà à ce même jeton. Retourne false si le pseudo appartient à
 * un autre appareil (autre jeton), auquel cas l'appelant doit refuser la
 * requête plutôt que d'écraser le score de quelqu'un d'autre.
 */
async function claimOrVerifyPseudo(pseudo: string, token: string, env: Env): Promise<boolean> {
  const tokenHash = await hashToken(token);
  const existing = await env.DB.prepare("SELECT token_hash FROM players WHERE pseudo = ?")
    .bind(pseudo)
    .first<{ token_hash: string }>();

  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO players (pseudo, token_hash) VALUES (?, ?) ON CONFLICT (pseudo) DO NOTHING"
    )
      .bind(pseudo, tokenHash)
      .run();
    return true;
  }
  return existing.token_hash === tokenHash;
}

interface ScorePayload {
  day: number;
  pseudo: string;
  timeMs: number;
  attempts: number;
  token: string;
}

async function handleClaimPseudo(request: Request, env: Env): Promise<Response> {
  let body: { pseudo?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide" }, env, 400);
  }

  const pseudo = sanitizePseudo(body.pseudo);
  const token = sanitizeToken(body.token);
  if (!pseudo) {
    return json({ error: "pseudo invalide" }, env, 400);
  }
  if (!token) {
    return json({ error: "token invalide" }, env, 400);
  }

  const owns = await claimOrVerifyPseudo(pseudo, token, env);
  return json({ ok: owns }, env, owns ? 200 : 409);
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
  const token = sanitizeToken(body.token);

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
  if (!token) {
    return json({ error: "token invalide" }, env, 400);
  }

  // Empêche qu'un visiteur tapant le pseudo de quelqu'un d'autre écrase son
  // score : le pseudo doit appartenir au même jeton d'appareil (ou être
  // encore libre, auquel cas il est réclamé ici).
  const owns = await claimOrVerifyPseudo(pseudo, token, env);
  if (!owns) {
    return json({ error: "Ce pseudo est déjà pris par un autre appareil" }, env, 409);
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

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

const CLUB_TIME_ZONE = "Europe/Paris";
const DAILY_MEDALS = ["🥇", "🥈", "🥉"];

/** Construit le message WhatsApp du top 3 de la veille pour le puzzle `day`. */
async function buildDailyTopMessage(day: number, env: Env): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT pseudo, time_ms as timeMs, attempts FROM scores WHERE day = ? ORDER BY time_ms ASC, attempts ASC LIMIT 3"
  )
    .bind(day)
    .all<{ pseudo: string; timeMs: number; attempts: number }>();

  const entries = results ?? [];
  if (entries.length === 0) {
    return `♟️ Échec du Jour #${day}\nPersonne n'a résolu le puzzle d'hier 😢`;
  }

  const lines = entries.map((entry, index) => {
    const attemptsLabel = entry.attempts === 1 ? "1 essai" : `${entry.attempts} essais`;
    return `${DAILY_MEDALS[index]} ${entry.pseudo} — ${formatSeconds(entry.timeMs)} (${attemptsLabel})`;
  });

  return [`♟️ Échec du Jour #${day} — Top 3 d'hier`, ...lines].join("\n");
}

/** Envoie un message texte dans le groupe WhatsApp configuré, via Green-API. */
async function sendWhatsAppMessage(message: string, env: Env): Promise<void> {
  if (!env.GREEN_API_URL || !env.GREEN_API_ID_INSTANCE || !env.GREEN_API_TOKEN || !env.GREEN_API_GROUP_CHAT_ID) {
    console.log("Bot WhatsApp non configuré (variables GREEN_API_* manquantes), envoi ignoré.");
    return;
  }

  const url = `${env.GREEN_API_URL.replace(/\/$/, "")}/waInstance${env.GREEN_API_ID_INSTANCE}/sendMessage/${env.GREEN_API_TOKEN}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: env.GREEN_API_GROUP_CHAT_ID, message }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.log(`Échec d'envoi WhatsApp (${response.status}): ${body}`);
  }
}

/**
 * Déclenché par le Cron Trigger (voir wrangler.toml), programmé pour tourner
 * à plusieurs heures UTC couvrant 8h heure de Paris été comme hiver. On ne
 * fait réellement quelque chose que lorsque l'heure murale à Paris est bien
 * 8h, ce qui évite d'avoir à gérer le changement d'heure été/hiver à la main.
 */
async function handleScheduled(env: Env): Promise<void> {
  const now = new Date();
  const { hour } = wallClockParts(now, CLUB_TIME_ZONE);
  if (hour !== 8) return;

  const today = dayNumberInTimeZone(now, CLUB_TIME_ZONE);
  const yesterday = today - 1;
  if (yesterday < 1) return;

  const message = await buildDailyTopMessage(yesterday, env);
  await sendWhatsAppMessage(message, env);
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
    if (url.pathname === "/claim-pseudo" && request.method === "POST") {
      return handleClaimPseudo(request, env);
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

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
