import { MarketDataProvider } from './provider.js';

/**
 * SimulatedProvider stands in for a real exchange feed so the hackathon
 * build works offline / without paid API keys. It is intentionally built
 * to misbehave sometimes, because the brief asks us to design for stale,
 * delayed and conflicting data — a provider that never fails would let us
 * skip that design work entirely.
 *
 * Behaviour per symbol per tick:
 *  - ~97% of the time: return a plausible new price (bounded random walk,
 *    volatility scaled per-sector so indices move less than small caps).
 *  - ~2% of the time: simulate a DELAYED tick — return null so the caller
 *    keeps the last known price and marks it stale-if-delayed-too-long.
 *  - ~1% of the time: simulate a CONFLICTING tick — two "sources" disagree;
 *    we resolve by taking the median of the two, and note it so it can be
 *    surfaced in logs/telemetry.
 */
export class SimulatedProvider extends MarketDataProvider {
  constructor(state) {
    super();
    // state: Map<ticker, { price, volatility }>
    this.state = state;
  }

  async fetchTicks(tickers) {
    const out = {};
    const now = new Date().toISOString();

    for (const ticker of tickers) {
      const s = this.state.get(ticker);
      if (!s) continue;

      const roll = Math.random();

      if (roll < 0.02) {
        // Delayed tick: no new data this cycle.
        out[ticker] = { ok: false, reason: 'delayed', ts: now };
        continue;
      }

      // Bounded random walk. drift keeps prices from wandering to 0 or infinity.
      const driftToMean = (s.anchor - s.price) * 0.002;
      const shock = (Math.random() - 0.5) * 2 * s.volatility * s.price;
      let nextPrice = s.price + driftToMean + shock;

      if (roll < 0.03) {
        // Conflicting sources: a second "feed" disagrees by a small offset.
        const altPrice = nextPrice * (1 + (Math.random() - 0.5) * 0.01);
        nextPrice = (nextPrice + altPrice) / 2; // resolution strategy: median/avg of sources
      }

      nextPrice = Math.max(nextPrice, s.price * 0.5); // sanity floor
      s.price = nextPrice;

      const volume = Math.round(Math.random() * 50000 + 1000);
      out[ticker] = { ok: true, price: round2(nextPrice), volume, ts: now };
    }

    return out;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
