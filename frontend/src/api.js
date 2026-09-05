const BASE = '/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  searchSymbols: (token, q) => request(`/symbols?q=${encodeURIComponent(q)}`, { token }),
  getHistory: (token, symbolId) => request(`/symbols/${symbolId}/history`, { token }),
  getWatchlist: (token) => request('/watchlist', { token }),
  addToWatchlist: (token, symbolId, alertPrice) =>
    request('/watchlist', { method: 'POST', token, body: { symbolId, alertPrice } }),
  ackItem: (token, id) => request(`/watchlist/${id}/ack`, { method: 'POST', token }),
  setAlert: (token, id, alertPrice) =>
    request(`/watchlist/${id}`, { method: 'PATCH', token, body: { alertPrice } }),
  removeItem: (token, id) => request(`/watchlist/${id}`, { method: 'DELETE', token }),
};

export function connectSocket(token, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.DEV ? 'localhost:4000' : window.location.host;
  const ws = new WebSocket(`${protocol}://${host}/ws?token=${encodeURIComponent(token)}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      /* ignore malformed frame */
    }
  };
  return ws;
}
