import React from 'react';

export function formatPrice(n) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(n) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

export default function PriceTag({ price, pct }) {
  const up = pct >= 0;
  return (
    <span className={`price-tag ${up ? 'is-up' : 'is-down'}`}>
      <span className="price-tag__price">₹{formatPrice(price)}</span>
      <span className="price-tag__pct">{formatPct(pct)}</span>
    </span>
  );
}
