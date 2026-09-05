import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api, connectSocket } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ChangesFeed from '../components/ChangesFeed.jsx';
import AddSymbol from '../components/AddSymbol.jsx';
import WatchlistTable from '../components/WatchlistTable.jsx';

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const [items, setItems] = useState([]);
  const [historyMap, setHistoryMap] = useState({});
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const loadWatchlist = useCallback(async () => {
    const { items } = await api.getWatchlist(token);
    setItems(items);

    // Backfill sparkline history for each symbol once on load.
    const entries = await Promise.all(
      items.map(async (i) => {
        const { history } = await api.getHistory(token, i.symbolId);
        return [i.symbolId, history.map((h) => h.price)];
      })
    );
    setHistoryMap(Object.fromEntries(entries));
  }, [token]);

  useEffect(() => {
    loadWatchlist().catch((err) => setError(err.message));
  }, [loadWatchlist]);

  // Live updates over WebSocket: merge price/change deltas into local state
  // and roll a fresh point into the sparkline history without re-fetching.
  useEffect(() => {
    const ws = connectSocket(token, (msg) => {
      if (msg.type === 'price_update') {
        setItems((prev) => {
          const byId = new Map(prev.map((i) => [i.id, i]));
          for (const u of msg.updates) {
            const existing = byId.get(u.watchlistItemId);
            if (!existing) continue;
            byId.set(u.watchlistItemId, {
              ...existing,
              price: u.price,
              dayHigh: u.dayHigh,
              dayLow: u.dayLow,
              isStale: u.isStale,
              updatedAt: u.updatedAt,
              sinceLastChecked: u.sinceLastChecked,
              dayChangePct: (u.price - existing.dayOpen) / existing.dayOpen,
            });
          }
          return prev.map((i) => byId.get(i.id));
        });

        setHistoryMap((prev) => {
          const next = { ...prev };
          for (const u of msg.updates) {
            const item = items.find((i) => i.id === u.watchlistItemId);
            const symbolId = item?.symbolId;
            if (symbolId == null) continue;
            const arr = next[symbolId] ? [...next[symbolId], u.price] : [u.price];
            next[symbolId] = arr.slice(-60);
          }
          return next;
        });
      }
    });
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const existingSymbolIds = useMemo(() => new Set(items.map((i) => i.symbolId)), [items]);

  async function handleAdd(symbolId) {
    try {
      await api.addToWatchlist(token, symbolId);
      await loadWatchlist();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(id) {
    await api.removeItem(token, id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleAck(id) {
    await api.ackItem(token, id);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              checkpoint: { price: i.price, at: i.updatedAt },
              sinceLastChecked: { changed: false, pctMove: 0, reasons: [] },
            }
          : i
      )
    );
  }

  async function handleSetAlert(id, alertPrice) {
    await api.setAlert(token, id, alertPrice);
    setItems((prev) => (prev.map((i) => (i.id === id ? { ...i, alertPrice } : i))));
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar__brand">Ledger</div>
        <div className="topbar__status">
          <span className={`dot ${connected ? 'dot--live' : 'dot--off'}`} />
          {connected ? 'Live feed connected' : 'Reconnecting…'}
        </div>
        <div className="topbar__user">
          <span>{user?.email}</span>
          <button className="link-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard__main">
        <section className="section">
          <h2>Since you last checked</h2>
          <ChangesFeed items={items} onAck={handleAck} />
        </section>

        <section className="section">
          <div className="section__head">
            <h2>Your watchlist</h2>
            <AddSymbol token={token} onAdd={handleAdd} existingSymbolIds={existingSymbolIds} />
          </div>
          {error && <div className="form-error">{error}</div>}
          <WatchlistTable
            items={items}
            historyMap={historyMap}
            onRemove={handleRemove}
            onSetAlert={handleSetAlert}
            onAck={handleAck}
          />
        </section>
      </main>
    </div>
  );
}
