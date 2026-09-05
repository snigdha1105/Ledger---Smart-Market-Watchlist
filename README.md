# Ledger — a Smart Market Watchlist

---

## 1. Quick start

Requires Node.js 18+.

### Backend

```bash
cd backend
npm install
cp .env.example .env      # defaults work out of the box
npm run seed               # seeds ~25 instruments (NIFTY50, RELIANCE, GROWW, ...)
npm start                  # http://localhost:4000, ws://localhost:4000/ws
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

Open `http://localhost:5173`, create an account, and start adding tickers.
Prices tick every 4 seconds from the simulated feed — watch the "Since you
last checked" strip populate as things move.

### Production build

```bash
cd frontend && npm run build   # outputs frontend/dist — serve with any static host
cd backend && npm start        # serve the API separately, point the frontend proxy/env at it
```

---

## 2. What we built, mapped to the brief

| Brief requirement | Where it lives |
|---|---|
| Create and manage a watchlist | `POST/DELETE /api/watchlist`, `WatchlistTable.jsx`, `AddSymbol.jsx` |
| View latest market information | `price_state` table + live WebSocket ticks |
| Return later and see what changed | Per-user `checkpoint_*` columns + `evaluateChange()` in `priceEngine.js`, rendered by `ChangesFeed.jsx` |
| End-to-end (frontend + backend) | React (Vite) + Node/Express, real HTTP+WS wire protocol, no mocked layer |

---

## 3. Architecture

```
┌─────────────────┐        REST (JWT)        ┌───────────────────────────┐
│                  │ ───────────────────────▶ │   Express API             │
│   React (Vite)   │                          │   /api/auth  /api/symbols │
│   frontend       │                          │   /api/watchlist          │
│                  │ ◀─────────────────────── │                            │
│                  │       WebSocket           │   ws.js (per-user hub)    │
└─────────────────┘  (live price/changed)     └─────────────┬─────────────┘
                                                             │
                                                             ▼
                                              ┌───────────────────────────┐
                                              │  priceEngine.js            │
                                              │  - tick loop (4s)          │
                                              │  - meaningful-change rules │
                                              │  - staleness detection     │
                                              └─────────────┬─────────────┘
                                                             ▼
                                              ┌───────────────────────────┐
                                              │  MarketDataProvider        │
                                              │  (interface)                │
                                              │  → SimulatedProvider today  │
                                              │  → swap for a real feed    │
                                              │    later, zero call-site   │
                                              │    changes elsewhere       │
                                              └─────────────┬─────────────┘
                                                             ▼
                                              ┌───────────────────────────┐
                                              │  SQLite (better-sqlite3)   │
                                              │  users / symbols /         │
                                              │  price_state / price_ticks │
                                              │  / watchlist_items         │
                                              └───────────────────────────┘
```

**Backend** — Node.js, Express, `better-sqlite3` (file-based, zero external
infra to run), `jsonwebtoken` + `bcryptjs` for auth, `ws` for the live
channel.

**Frontend** — React 18 + Vite, `react-router-dom` for the two screens
(auth, dashboard). No UI kit — the ledger/trading-terminal look is custom
CSS using design tokens (see `frontend/src/styles/index.css`).

---

## 4. The design decisions the brief asked us to own

### What counts as a "meaningful change"?
Defined once, centrally, in `evaluateChange()` (`backend/src/services/priceEngine.js`).
A watchlist row is flagged **changed** if any of:
1. Price has moved ≥ `CHANGE_THRESHOLD` (default **2%**, env-configurable) *since the user's own checkpoint* — not since yesterday's close. Two different users watching the same stock can see different "changed" states depending on when they each last looked. That's deliberate: "meaningful" is relative to what you've already seen, not a fixed daily statistic.
2. A new day high or day low has been made since the checkpoint.
3. A user-set alert price has been crossed (checkpoint side vs. current side flips).

Crossing multiple day-high events between checks doesn't spam the user —
only the latest state is compared, so re-checking after 10 minor new-highs
shows one "new high" line, not ten.

### What information to surface
Deliberately narrow: current price, day range, day % change, a 60-point
sparkline, and — the actual point of the brief — a short list of *reasons*
this row is flagged ("Up 3.2% since you last checked", "New day high of
X"). We didn't add order books, news feeds, or fundamentals: the brief
rewards depth on one problem over breadth across many.

### How state persists across sessions/devices
Nothing lives in browser storage. Watchlist membership, checkpoints, and
alerts are rows in SQLite keyed to the authenticated user (`user_id`), so
logging in from a phone shows the exact same watchlist and the exact same
"since you last checked" state as the laptop — because the checkpoint is
genuinely the last time *the account* looked, not the last time *this
device* looked.

### How stale, delayed, or conflicting data is handled
This is where most of the engineering judgement lives, because the brief
explicitly calls it out and a naive feed would never exercise it:

- **`SimulatedProvider`** (`backend/src/marketData/simulatedProvider.js`)
  intentionally misbehaves: ~2% of ticks are *delayed* (returns nothing for
  that cycle) and ~1% are *conflicting* (two "sources" disagree by a small
  offset, resolved via averaging — the resolution strategy a real
  multi-source feed would need).
- A single missed tick is **not** surfaced to the user — that would be
  alarming for no reason. Only a *sustained* outage (`STALE_AFTER_MS`,
  default 20s of no fresh data) flips the row to a visible "Feed delayed"
  badge, while still showing the last known-good price rather than
  blanking the row.
- The provider is an interface (`marketData/provider.js`) specifically so
  a real broker/exchange feed — which will have its own delay and
  conflict characteristics — can be dropped in later without changing the
  price engine, the routes, or the frontend.

### How the system scales for larger watchlists and more users
- **Reads are O(1) per symbol**, not O(history): `price_state` holds one
  current row per symbol; `price_ticks` is only consulted for sparklines
  and is trimmed to the most recent ~300 ticks per symbol so it doesn't
  grow unbounded.
- **The tick loop batches**: one `fetchTicks()` call per cycle for *all*
  symbols, not one call per watchlist item — so 10,000 users all watching
  RELIANCE still costs one upstream call per tick, not 10,000.
- **WebSocket fan-out is per-connected-user**, computed from that user's
  own watchlist rows only, so payload size scales with what one person is
  watching, not with the whole symbol universe.
- **Horizontal scaling note** (not implemented, documented as the next
  step): the in-process `userSockets` map in `ws.js` only works for a
  single Node instance. Behind a load balancer with multiple instances,
  the tick fan-out would move to a pub/sub layer (Redis/NATS) keyed by
  user ID, so any instance can push to any user's socket regardless of
  which instance's price engine produced the tick. Nothing else in the
  architecture would need to change.

### Where we kept things simple vs. added complexity
- **Simple:** SQLite over Postgres (zero infra to run for a 72-hour
  judged demo), no Redux/state library (the watchlist fits comfortably in
  component state + WebSocket merge), no UI kit (custom CSS is faster to
  reason about at this size and avoids fighting a framework's defaults).
- **Deliberately not simple:** the checkpoint-based change model, the
  provider abstraction, and the delayed/conflicting-tick simulation. This
  is where the brief is actually testing engineering judgement, so it's
  where the extra design effort went, rather than on UI polish or feature
  count.

---

## 5. Edge cases considered

- Removing a symbol from the watchlist and re-adding it starts a **fresh**
  checkpoint at the current price — it doesn't resurrect old history.
- Setting an alert price retroactively is evaluated on the **next** tick
  onward, not against the past, so it can't fire immediately on save just
  because the price already happens to be on one side of it.
- A symbol that goes fully stale still renders its last-known price and
  range rather than disappearing — an empty row is worse than a slightly
  old one, as long as it's labelled.
- Auth tokens are validated on both the REST layer (`requireAuth`
  middleware) and the WebSocket handshake (`verifyTokenRaw`), so a socket
  can't be opened with an expired or forged token.

---

## 6. Project structure

```
groww-watchlist/
├── backend/
│   ├── src/
│   │   ├── db/            # schema + seed data
│   │   ├── marketData/    # provider interface + simulated feed
│   │   ├── services/      # auth, price engine + change-detection rules
│   │   ├── routes/        # auth, symbols, watchlist REST endpoints
│   │   ├── ws.js          # authenticated per-user WebSocket hub
│   │   └── index.js       # server entrypoint
│   └── .env.example
└── frontend/
    └── src/
        ├── pages/         # Login, Register, Dashboard
        ├── components/    # ChangesFeed, WatchlistTable, AddSymbol, Sparkline, PriceTag
        ├── context/       # AuthContext (JWT session)
        ├── api.js         # REST + WebSocket client
        └── styles/        # design-token based CSS
```

## 7. Environment variables (backend/.env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 4000 | API port |
| `JWT_SECRET` | dev value | **Change in any real deployment** |
| `TICK_MS` | 4000 | How often the simulated feed ticks |
| `STALE_AFTER_MS` | 20000 | No fresh tick for this long ⇒ mark stale |
| `CHANGE_THRESHOLD` | 0.02 | % move from checkpoint that counts as "changed" |
| `DB_PATH` | `./data/watchlist.db` | SQLite file location |
