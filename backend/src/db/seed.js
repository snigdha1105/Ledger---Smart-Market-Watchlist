import { db } from './index.js';

// A small, representative universe of NSE-style tickers across sectors.
// base_price is the starting reference price for the simulated feed.
const SYMBOLS = [
  ['RELIANCE', 'Reliance Industries', 'Energy', 2938.5],
  ['TCS', 'Tata Consultancy Services', 'IT', 4152.1],
  ['HDFCBANK', 'HDFC Bank', 'Banking', 1687.3],
  ['INFY', 'Infosys', 'IT', 1892.4],
  ['ICICIBANK', 'ICICI Bank', 'Banking', 1284.9],
  ['GROWW', 'Groww (BSE:GROWW)', 'Financial Services', 412.0],
  ['BHARTIARTL', 'Bharti Airtel', 'Telecom', 1732.6],
  ['ITC', 'ITC Ltd', 'FMCG', 468.2],
  ['SBIN', 'State Bank of India', 'Banking', 838.7],
  ['LT', 'Larsen & Toubro', 'Infrastructure', 3654.0],
  ['HINDUNILVR', 'Hindustan Unilever', 'FMCG', 2612.8],
  ['MARUTI', 'Maruti Suzuki', 'Auto', 12980.0],
  ['ASIANPAINT', 'Asian Paints', 'Consumer', 2894.5],
  ['BAJFINANCE', 'Bajaj Finance', 'NBFC', 7124.3],
  ['ADANIENT', 'Adani Enterprises', 'Diversified', 3021.9],
  ['TATAMOTORS', 'Tata Motors', 'Auto', 968.4],
  ['WIPRO', 'Wipro', 'IT', 542.1],
  ['SUNPHARMA', 'Sun Pharma', 'Pharma', 1789.2],
  ['NTPC', 'NTPC Ltd', 'Power', 402.6],
  ['ONGC', 'Oil & Natural Gas Corp', 'Energy', 289.4],
  ['NIFTY50', 'Nifty 50 Index', 'Index', 25142.0],
  ['SENSEX', 'BSE Sensex', 'Index', 82310.0],
  ['ZOMATO', 'Eternal (Zomato)', 'Consumer Internet', 298.7],
  ['PAYTM', 'One97 (Paytm)', 'Fintech', 892.3],
  ['IRCTC', 'IRCTC', 'Travel', 782.1],
];

const insert = db.prepare(
  `INSERT OR IGNORE INTO symbols (ticker, name, sector, base_price) VALUES (?, ?, ?, ?)`
);

const tx = db.transaction((rows) => {
  for (const row of rows) insert.run(...row);
});

tx(SYMBOLS);

console.log(`Seeded ${SYMBOLS.length} symbols (existing rows left untouched).`);
