import { db } from '../db/index.js';
import { SimulatedProvider } from '../marketData/simulatedProvider.js';

const TICK_MS = Number(process.env.TICK_MS || 4000);
const STALE_AFTER_MS = Number(process.env.STALE_AFTER_MS || 20000); // no fresh tick for 20s => stale
const HISTORY_KEEP_TICKS = 300; // ~20 min of history per symbol at 4s ticks

let wsHub = null; // set via attachHub() once the WS server exists

export function attachHub(hub) {
  wsHub = hub;
}

export function startPriceEngine() {
  const symbols = db.prepare('SELECT id, ticker, base_price FROM symbols').all();
  if (symbols.length === 0) {
    console.warn('No symbols found — run `npm run seed` first.');
  }

  // Seed in-memory walk state and price_state rows if empty.
  const walkState = new Map();
  const getState = db.prepare('SELECT * FROM price_state WHERE symbol_id = ?');
  const insertState = db.prepare(`
    INSERT INTO price_state (symbol_id, price, prev_close, day_open, day_high, day_low, volume, updated_at, is_stale)
    VALUES (@symbol_id, @price, @prev_close, @day_open, @day_high, @day_low, @volume, @updated_at, 0)
  `);

  const now = new Date().toISOString();
  for (const sym of symbols) {
    const volatility = sym.ticker.includes('NIFTY') || sym.ticker.includes('SENSEX') ? 0.0015 : 0.004;
    walkState.set(sym.ticker, { price: sym.base_price, anchor: sym.base_price, volatility });

    if (!getState.get(sym.id)) {
      insertState.run({
        symbol_id: sym.id,
        price: sym.base_price,
        prev_close: sym.base_price,
        day_open: sym.base_price,
        day_high: sym.base_price,
        day_low: sym.base_price,
        volume: 0,
        updated_at: now,
      });
    }
  }

  const provider = new SimulatedProvider(walkState);

  const updateState = db.prepare(`
    UPDATE price_state
    SET price = @price, day_high = @day_high, day_low = @day_low,
        volume = volume + @volume, updated_at = @updated_at, is_stale = 0, stale_since = NULL
    WHERE symbol_id = @symbol_id
  `);
  const markStale = db.prepare(`
    UPDATE price_state SET is_stale = 1, stale_since = COALESCE(stale_since, @ts) WHERE symbol_id = ?
  `);
  const insertTick = db.prepare(
    `INSERT INTO price_ticks (symbol_id, price, volume, ts) VALUES (?, ?, ?, ?)`
  );
  const trimTicks = db.prepare(`
    DELETE FROM price_ticks WHERE symbol_id = ? AND id NOT IN (
      SELECT id FROM price_ticks WHERE symbol_id = ? ORDER BY id DESC LIMIT ?
    )
  `);

  async function tick() {
    const tickers = symbols.map((s) => s.ticker);
    const results = await provider.fetchTicks(tickers);
    const nowIso = new Date().toISOString();
    const changedTickers = [];

    const tx = db.transaction(() => {
      for (const sym of symbols) {
        const res = results[sym.ticker];
        const current = getState.get(sym.id);

        if (!res || res.ok === false) {
          // Delayed feed for this cycle. Only flip to "stale" if it's been
          // too long since the last good update — a single missed tick
          // should NOT alarm the user, only a sustained outage should.
          const lastUpdated = new Date(current.updated_at).getTime();
          if (Date.now() - lastUpdated > STALE_AFTER_MS) {
            markStale.run(nowIso, sym.id);
          }
          continue;
        }

        const dayHigh = Math.max(current.day_high, res.price);
        const dayLow = Math.min(current.day_low, res.price);
        updateState.run({
          symbol_id: sym.id,
          price: res.price,
          day_high: dayHigh,
          day_low: dayLow,
          volume: res.volume,
          updated_at: res.ts,
        });
        insertTick.run(sym.id, res.price, res.volume, res.ts);
        trimTicks.run(sym.id, sym.id, HISTORY_KEEP_TICKS);
        changedTickers.push(sym.ticker);
      }
    });
    tx();

    if (wsHub && changedTickers.length) {
      wsHub.broadcastPriceUpdate(changedTickers);
    }
  }

  tick(); // fire immediately so the UI isn't empty on boot
  const handle = setInterval(tick, TICK_MS);
  return () => clearInterval(handle);
}

/**
 * Meaningful-change detection.
 *
 * A watchlist row is "changed" relative to the user's own checkpoint
 * (the price/high/low that was true the last time THEY looked), not
 * relative to a generic previous-close. This is what makes the feature
 * personal: two users watching the same stock can see different
 * "what changed" states depending on when they last checked.
 *
 * A row is flagged changed if ANY of:
 *   1. |price - checkpoint_price| / checkpoint_price >= CHANGE_THRESHOLD
 *   2. current day_high > checkpoint_high  (new high made since they looked)
 *   3. current day_low  < checkpoint_low   (new low made since they looked)
 *   4. an alert_price was crossed (checkpoint side vs current side flips)
 */
const CHANGE_THRESHOLD = Number(process.env.CHANGE_THRESHOLD || 0.02); // 2%

export function evaluateChange(item, state) {
  const pctMove = (state.price - item.checkpoint_price) / item.checkpoint_price;
  const reasons = [];

  if (Math.abs(pctMove) >= CHANGE_THRESHOLD) {
    reasons.push({
      type: 'price_move',
      detail: `${pctMove >= 0 ? 'Up' : 'Down'} ${(Math.abs(pctMove) * 100).toFixed(1)}% since you last checked`,
    });
  }
  if (state.day_high > item.checkpoint_high) {
    reasons.push({ type: 'new_high', detail: `New day high of ${state.day_high.toFixed(2)}` });
  }
  if (state.day_low < item.checkpoint_low) {
    reasons.push({ type: 'new_low', detail: `New day low of ${state.day_low.toFixed(2)}` });
  }
  if (item.alert_price != null) {
    const wasBelow = item.checkpoint_price < item.alert_price;
    const isBelow = state.price < item.alert_price;
    if (wasBelow !== isBelow) {
      reasons.push({
        type: 'alert_crossed',
        detail: `Crossed your alert level of ${item.alert_price}`,
      });
    }
  }

  return { changed: reasons.length > 0, pctMove, reasons };
}

export { CHANGE_THRESHOLD };
