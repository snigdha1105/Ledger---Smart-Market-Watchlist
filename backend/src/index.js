import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';

import { authRouter } from './routes/auth.js';
import { marketRouter } from './routes/market.js';
import { watchlistRouter } from './routes/watchlist.js';
import { startPriceEngine, attachHub } from './services/priceEngine.js';
import { createHub } from './ws.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRouter);
app.use('/api', marketRouter);
app.use('/api/watchlist', watchlistRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const hub = createHub(server);
attachHub(hub);
const stopEngine = startPriceEngine();

server.listen(PORT, () => {
  console.log(`Smart Watchlist API listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws?token=<JWT>`);
});

process.on('SIGINT', () => {
  stopEngine();
  server.close(() => process.exit(0));
});
