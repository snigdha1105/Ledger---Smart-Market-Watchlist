import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('watchlist_token'));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('watchlist_user');
    return raw ? JSON.parse(raw) : null;
  });

  const persist = (t, u) => {
    localStorage.setItem('watchlist_token', t);
    localStorage.setItem('watchlist_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const login = useCallback(async (email, password) => {
    const { token, user } = await api.login(email, password);
    persist(token, user);
  }, []);

  const register = useCallback(async (email, password) => {
    const { token, user } = await api.register(email, password);
    persist(token, user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('watchlist_token');
    localStorage.removeItem('watchlist_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
