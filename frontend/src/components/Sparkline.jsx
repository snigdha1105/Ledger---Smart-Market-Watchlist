import React from 'react';

// Minimal dependency-free sparkline. `points` is an array of numbers.
export default function Sparkline({ points, width = 96, height = 32, positive = true }) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} className="sparkline sparkline--empty" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} className="sparkline" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={positive ? 'var(--accent-up)' : 'var(--accent-down)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
