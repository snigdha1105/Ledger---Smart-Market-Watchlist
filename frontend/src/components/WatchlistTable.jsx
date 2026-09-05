import React, { useState } from 'react';
import PriceTag, { formatPrice } from './PriceTag.jsx';
import Sparkline from './Sparkline.jsx';

export default function WatchlistTable({ items, historyMap, onRemove, onSetAlert, onAck }) {
  if (items.length === 0) {
    return (
      <div className="table-empty">
        Your watchlist is empty. Add a ticker above to start tracking it — prices tick every few
        seconds from our simulated market feed.
      </div>
    );
  }

  return (
    <table className="ledger">
      <thead>
        <tr>
          <th>Instrument</th>
          <th>Price</th>
          <th>Day range</th>
          <th>Trend</th>
          <th>Alert</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            history={historyMap[item.symbolId] || []}
            onRemove={onRemove}
            onSetAlert={onSetAlert}
            onAck={onAck}
          />
        ))}
      </tbody>
    </table>
  );
}

function Row({ item, history, onRemove, onSetAlert, onAck }) {
  const [alertDraft, setAlertDraft] = useState(item.alertPrice ?? '');
  const changed = item.sinceLastChecked.changed;

  return (
    <tr className={changed ? 'ledger-row is-changed' : 'ledger-row'}>
      <td>
        <div className="ledger-instrument">
          <span className="ledger-ticker">{item.ticker}</span>
          <span className="ledger-name">{item.name}</span>
        </div>
        {item.isStale && <span className="badge badge-stale">Feed delayed</span>}
        {changed && <span className="badge badge-changed">Changed</span>}
      </td>
      <td>
        <PriceTag price={item.price} pct={item.dayChangePct} />
      </td>
      <td className="ledger-range">
        <span>{formatPrice(item.dayLow)}</span>
        <span className="ledger-range__sep">–</span>
        <span>{formatPrice(item.dayHigh)}</span>
      </td>
      <td>
        <Sparkline points={history} positive={item.dayChangePct >= 0} />
      </td>
      <td>
        <form
          className="alert-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSetAlert(item.id, alertDraft === '' ? null : Number(alertDraft));
          }}
        >
          <input
            type="number"
            step="0.01"
            placeholder="Set alert"
            value={alertDraft}
            onChange={(e) => setAlertDraft(e.target.value)}
          />
        </form>
      </td>
      <td className="ledger-actions">
        {changed && (
          <button className="link-btn" onClick={() => onAck(item.id)}>
            Seen
          </button>
        )}
        <button className="link-btn link-btn--danger" onClick={() => onRemove(item.id)}>
          Remove
        </button>
      </td>
    </tr>
  );
}
