import { Router } from 'express';
import { db } from '../db/index.js';

export const marketRouter = Router();

// GET /api/symbols?q=rel  -> search the master instrument list
marketRouter.get('/symbols', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, ticker, name, sector FROM symbols
         WHERE lower(ticker) LIKE ? OR lower(name) LIKE ?
         ORDER BY ticker LIMIT 20`
      )
      .all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT id, ticker, name, sector FROM symbols ORDER BY ticker LIMIT 25').all();
  }
  res.json({ symbols: rows });
});

// GET /api/symbols/:id/history -> recent ticks for sparkline
marketRouter.get('/symbols/:id/history', (req, res) => {
  const rows = db
    .prepare(
      `SELECT price, ts FROM price_ticks WHERE symbol_id = ? ORDER BY id DESC LIMIT 60`
    )
    .all(req.params.id)
    .reverse();
  res.json({ history: rows });
});
