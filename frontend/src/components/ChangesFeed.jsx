import React from 'react';
import { formatPct } from './PriceTag.jsx';

export default function ChangesFeed({ items, onAck }) {
  const changed = items.filter((i) => i.sinceLastChecked.changed);

  if (changed.length === 0) {
    return (
      <div className="changes-empty">
        Nothing has moved enough to flag since you last checked. Keep going about your day —
        we'll surface it here the moment something does.
      </div>
    );
  }

  return (
    <div className="changes-feed">
      {changed.map((item) => {
        const up = item.sinceLastChecked.pctMove >= 0;
        return (
          <div key={item.id} className={`change-card ${up ? 'is-up' : 'is-down'}`}>
            <div className="change-card__head">
              <span className="change-card__ticker">{item.ticker}</span>
              <span className="change-card__pct">{formatPct(item.sinceLastChecked.pctMove)}</span>
            </div>
            <div className="change-card__name">{item.name}</div>
            <ul className="change-card__reasons">
              {item.sinceLastChecked.reasons.map((r, idx) => (
                <li key={idx}>{r.detail}</li>
              ))}
            </ul>
            <button className="change-card__ack" onClick={() => onAck(item.id)}>
              Mark as seen
            </button>
          </div>
        );
      })}
    </div>
  );
}
