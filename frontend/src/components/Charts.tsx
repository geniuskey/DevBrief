import { useState } from "react";

// Single-series column chart: one hue, rounded data-ends, hover tooltip,
// and a table fallback so values never depend on reading the bars.
export function ColumnChart({
  data,
  label,
  unit = "건",
}: {
  data: { key: string; label: string; value: number }[];
  label: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = max <= 4 ? max : 4;
  const W = 560;
  const H = 180;
  const pad = { l: 28, r: 8, t: 12, b: 26 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const bar = Math.min(26, slot - 6);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  return (
    <figure className="chart">
      <div className="chart-canvas" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = Math.round((max / ticks) * i);
            return (
              <g key={i}>
                <line
                  className="grid"
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(v)}
                  y2={y(v)}
                />
                <text
                  className="axis"
                  x={pad.l - 6}
                  y={y(v) + 4}
                  textAnchor="end"
                >
                  {v}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const x = pad.l + slot * i + (slot - bar) / 2;
            const h = Math.max(d.value ? 3 : 0, (d.value / max) * innerH);
            const top = pad.t + innerH - h;
            const r = Math.min(4, h / 2);
            return (
              <g key={d.key}>
                <rect
                  className="hit"
                  x={pad.l + slot * i}
                  y={pad.t}
                  width={slot}
                  height={innerH}
                  onMouseEnter={() => setHover(i)}
                />
                {h > 0 && (
                  <path
                    className={`bar ${hover === i ? "bar-hover" : ""}`}
                    d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${top + h} Z`}
                  />
                )}
                {((data.length - 1 - i) % 2 === 0 || data.length <= 7) && (
                  <text
                    className="axis"
                    x={x + bar / 2}
                    y={H - 8}
                    textAnchor="middle"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line
            className="baseline"
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + innerH}
            y2={pad.t + innerH}
          />
        </svg>
        {hover !== null && (
          <div
            className="chart-tip"
            style={{
              left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`,
            }}
          >
            <strong>
              {data[hover].value}
              {unit}
            </strong>
            <span>{data[hover].key}</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>표로 보기</summary>
        <table className="table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>값</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.key}</td>
                <td>
                  {d.value}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// Part-to-whole bar for job states; status colors always carry a text label.
export function StatusBar({
  parts,
}: {
  parts: { key: string; label: string; value: number; tone: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="status-bar-wrap">
      <div
        className="status-bar"
        role="img"
        aria-label={
          shown.map((p) => `${p.label} ${p.value}`).join(", ") || "작업 없음"
        }
      >
        {total === 0 ? (
          <span className="seg seg-empty" style={{ flex: 1 }} />
        ) : (
          shown.map((p) => (
            <span
              key={p.key}
              className={`seg seg-${p.tone}`}
              style={{ flex: p.value }}
              title={`${p.label} ${p.value}`}
            />
          ))
        )}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`swatch seg-${p.tone}`} />
            {p.label}
            <strong>{p.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
