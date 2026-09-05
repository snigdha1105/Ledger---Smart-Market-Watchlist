import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'watchlist.db');

import fs from 'node:fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
// Design notes (see README for full rationale):
// - `symbols` is the master instrument list (seeded once).
// - `price_state` holds the CURRENT snapshot per symbol (single row per symbol,
//   overwritten every tick) so reads are O(1) regardless of history size.
// - `price_ticks` is an append-only history table used for sparklines and for
//   recomputing "since you last checked" deltas. It is trimmed periodically
//   so the DB doesn't grow unbounded (see priceEngine.trimHistory).
// - `watchlist_items` stores, per user+symbol, the price/timestamp that was
//   true the last time the user actually looked at that row ("checkpoint").
//   Meaningful-change detection is always current-price vs checkpoint, never
//   vs some global "yesterday" — this is what makes "what changed since you
//   last checked" personal to each user instead of a generic day-change %.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS symbols (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker   TEXT UNIQUE NOT NULL,
  name     TEXT NOT NULL,
  sector   TEXT NOT NULL,
  base_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS price_state (
  symbol_id     INTEGER PRIMARY KEY REFERENCES symbols(id),
  price         REAL NOT NULL,
  prev_close    REAL NOT NULL,
  day_open      REAL NOT NULL,
  day_high      REAL NOT NULL,
  day_low       REAL NOT NULL,
  volume        INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  is_stale      INTEGER NOT NULL DEFAULT 0,
  stale_since   TEXT
);

CREATE TABLE IF NOT EXISTS price_ticks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL REFERENCES symbols(id),
  price     REAL NOT NULL,
  volume    INTEGER NOT NULL,
  ts        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON price_ticks(symbol_id, ts);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol_id          INTEGER NOT NULL REFERENCES symbols(id),
  added_at           TEXT NOT NULL DEFAULT (datetime('now')),
  checkpoint_price   REAL NOT NULL,
  checkpoint_at      TEXT NOT NULL,
  checkpoint_high    REAL NOT NULL,
  checkpoint_low     REAL NOT NULL,
  alert_price        REAL,
  UNIQUE(user_id, symbol_id)
);
`);
