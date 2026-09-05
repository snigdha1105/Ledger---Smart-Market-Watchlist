import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../services/auth.js';
import { evaluateChange, CHANGE_THRESHOLD } from '../services/priceEngine.js';

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth);

function serializeRow(item, sym, state) {
  const { changed, pctMove, reasons } = evaluateChange(item, state);
  const dayChangePct = (state.price - state.prev_close) / state.prev_close;
  return {
    id: item.id,
    symbolId: sym.id,
    ticker: sym.ticker,
    name: sym.name,
    sector: sym.sector,
    price: state.price,
    dayHigh: state.day_high,
    dayLow: state.day_low,
    dayOpen: state.day_open,
    dayChangePct,
    isStale: !!state.is_stale,
    staleSince: state.stale_since,
    updatedAt: state.updated_at,
    addedAt: item.added_at,
    alertPrice: item.alert_price,
    checkpoint: {
      price: item.checkpoint_price,
      at: item.checkpoint_at,
    },
    sinceLastChecked: {
      changed,
      pctMove,
      reasons, // list of { type, detail } — drives the "what changed" feed in the UI
    },
  };
}

// GET /api/watchlist -> full watchlist with live prices + change-since-checkpoint
watchlistRouter.get('/', (req, res) => {
  const items = db
    .prepare(
      `SELECT w.*, s.id as sym_id, s.ticker, s.name, s.sector
       FROM watchlist_items w JOIN symbols s ON s.id = w.symbol_id
       WHERE w.user_id = ? ORDER BY w.added_at ASC`
    )
    .all(req.user.id);

  const getState = db.prepare('SELECT * FROM price_state WHERE symbol_id = ?');

  const rows = items.map((item) => {
    const state = getState.get(item.symbol_id);
    const sym = { id: item.sym_id, ticker: item.ticker, name: item.name, sector: item.sector };
    return serializeRow(item, sym, state);
  });

  res.json({ items: rows, changeThreshold: CHANGE_THRESHOLD });
});

// POST /api/watchlist { symbolId, alertPrice? } -> add a symbol
watchlistRouter.post('/', (req, res) => {
  const { symbolId, alertPrice } = req.body || {};
  const sym = db.prepare('SELECT * FROM symbols WHERE id = ?').get(symbolId);
  if (!sym) return res.status(404).json({ error: 'Unknown symbol' });

  const state = db.prepare('SELECT * FROM price_state WHERE symbol_id = ?').get(symbolId);
  try {
    const info = db
      .prepare(
        `INSERT INTO watchlist_items
          (user_id, symbol_id, checkpoint_price, checkpoint_at, checkpoint_high, checkpoint_low, alert_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        symbolId,
        state.price,
        state.updated_at,
        state.day_high,
        state.day_low,
        alertPrice ?? null
      );
    const item = db.prepare('SELECT * FROM watchlist_items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ item: serializeRow(item, sym, state) });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Already in your watchlist' });
    }
    throw err;
  }
});

// POST /api/watchlist/:id/ack -> acknowledge current state as the new checkpoint
// This is the "I've seen this now" action: it resets the baseline so the
// item stops showing as "changed" until it moves again from here.
watchlistRouter.post('/:id/ack', (req, res) => {
  const item = db
    .prepare('SELECT * FROM watchlist_items WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const state = db.prepare('SELECT * FROM price_state WHERE symbol_id = ?').get(item.symbol_id);
  db.prepare(
    `UPDATE watchlist_items SET checkpoint_price = ?, checkpoint_at = ?, checkpoint_high = ?, checkpoint_low = ? WHERE id = ?`
  ).run(state.price, state.updated_at, state.day_high, state.day_low, item.id);

  res.json({ ok: true });
});

// PATCH /api/watchlist/:id { alertPrice } -> set/clear a price alert
watchlistRouter.patch('/:id', (req, res) => {
  const item = db
    .prepare('SELECT * FROM watchlist_items WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const { alertPrice } = req.body || {};
  db.prepare('UPDATE watchlist_items SET alert_price = ? WHERE id = ?').run(
    alertPrice ?? null,
    item.id
  );
  res.json({ ok: true });
});

// DELETE /api/watchlist/:id -> remove from watchlist
watchlistRouter.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM watchlist_items WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
