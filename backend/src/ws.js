import { WebSocketServer } from 'ws';
import { db } from './db/index.js';
import { verifyTokenRaw } from './services/auth.js';
import { evaluateChange } from './services/priceEngine.js';

/**
 * Design note on scaling (see README "Scaling" section for the full
 * discussion): this hub keeps an in-process Map of userId -> sockets and
 * recomputes each connected user's watchlist rows on every tick. That's
 * fine for a single Node process. To run this horizontally behind a load
 * balancer, the tick-fan-out would move to a pub/sub layer (Redis, NATS)
 * so any instance can push to any user's socket regardless of which
 * instance the price engine tick ran on — the per-connection logic below
 * would not need to change, only where `broadcastPriceUpdate` publishes to.
 */
export function createHub(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const userSockets = new Map(); // userId -> Set<WebSocket>

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const payload = token && verifyTokenRaw(token);

    if (!payload) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close();
      return;
    }

    const userId = payload.sub;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(ws);

    ws.on('close', () => {
      userSockets.get(userId)?.delete(ws);
    });
  });

  function pushToUser(userId, message) {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    const payload = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  const getWatchlistForUser = db.prepare(
    `SELECT w.*, s.ticker FROM watchlist_items w JOIN symbols s ON s.id = w.symbol_id WHERE w.user_id = ?`
  );
  const getState = db.prepare('SELECT * FROM price_state WHERE symbol_id = ?');

  // Called by the price engine after each tick with the list of tickers that moved.
  function broadcastPriceUpdate(changedTickers) {
    const changedSet = new Set(changedTickers);
    for (const [userId] of userSockets) {
      const items = getWatchlistForUser.all(userId);
      const updates = [];
      for (const item of items) {
        if (!changedSet.has(item.ticker)) continue;
        const state = getState.get(item.symbol_id);
        const { changed, pctMove, reasons } = evaluateChange(item, state);
        updates.push({
          watchlistItemId: item.id,
          ticker: item.ticker,
          price: state.price,
          dayHigh: state.day_high,
          dayLow: state.day_low,
          isStale: !!state.is_stale,
          updatedAt: state.updated_at,
          sinceLastChecked: { changed, pctMove, reasons },
        });
      }
      if (updates.length) pushToUser(userId, { type: 'price_update', updates });
    }
  }

  return { broadcastPriceUpdate };
}
