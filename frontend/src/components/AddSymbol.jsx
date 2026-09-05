import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

export default function AddSymbol({ token, onAdd, existingSymbolIds }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!open) return;
      try {
        const { symbols } = await api.searchSymbols(token, query);
        setResults(symbols.filter((s) => !existingSymbolIds.has(s.id)));
      } catch {
        /* ignore transient search errors */
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, token, existingSymbolIds]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="add-symbol" ref={boxRef}>
      <input
        type="text"
        placeholder="Add a ticker — try RELIANCE, TCS, NIFTY50…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && results.length > 0 && (
        <div className="add-symbol__dropdown">
          {results.map((s) => (
            <button
              key={s.id}
              className="add-symbol__option"
              onClick={() => {
                onAdd(s.id);
                setQuery('');
                setResults([]);
                setOpen(false);
              }}
            >
              <span className="add-symbol__ticker">{s.ticker}</span>
              <span className="add-symbol__name">{s.name}</span>
              <span className="add-symbol__sector">{s.sector}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
