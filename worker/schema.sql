-- Un seul meilleur score conservé par joueur et par jour.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER NOT NULL,
  pseudo TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day, pseudo)
);

CREATE INDEX IF NOT EXISTS idx_scores_day ON scores (day, time_ms);
CREATE INDEX IF NOT EXISTS idx_scores_pseudo ON scores (pseudo);

-- "Propriétaire" de chaque pseudo : empêche qu'un autre visiteur tapant le
-- même pseudo puisse écraser le score de quelqu'un d'autre. Le pseudo est
-- réclamé par le premier appareil qui l'utilise (voir /claim-pseudo), et
-- toute soumission de score ultérieure doit présenter le même jeton.
CREATE TABLE IF NOT EXISTS players (
  pseudo TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
