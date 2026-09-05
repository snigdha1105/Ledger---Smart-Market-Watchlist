/**
 * MarketDataProvider is the contract every price source must satisfy.
 *
 * Why an interface at all: the brief explicitly leaves "how to handle stale,
 * delayed or conflicting data" open, and real market data in production
 * would come from a paid vendor (NSE feed, broker API, etc.) rather than
 * being simulated. By coding the rest of the system against this interface,
 * swapping the SimulatedProvider for a RealBrokerProvider later is a
 * one-line change in `index.js` — nothing in priceEngine, routes, or the
 * frontend needs to know which one is active.
 *
 * A provider may represent MULTIPLE upstream feeds internally (e.g. a
 * primary exchange feed + a fallback vendor). If it does, conflict
 * resolution (e.g. "prefer the freshest timestamp", "median of sources")
 * is the provider's responsibility — callers only ever see one clean
 * { price, volume, ts, ok } tick per symbol.
 */
export class MarketDataProvider {
  /**
   * @param {string[]} tickers
   * @returns {Promise<Record<string, {price:number, volume:number, ts:string, ok:boolean}>>}
   */
  async fetchTicks(tickers) {
    throw new Error('fetchTicks must be implemented by a provider');
  }
}
