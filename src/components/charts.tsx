// Small dependency-free SVG charts for the admin overview.
// Single series: ink colour (the brand is monochrome); levels use their semantic colours.
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface Point { label: string; full: string; value: number }

/** Rounded-up axis maximum with 4 integer steps (1, 2, 5 × 10^k). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * mag >= raw)! * mag;
  return step * 4;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const H = 180;
const PAD = { top: 10, right: 8, bottom: 24, left: 32 };

/** Time series as bars or a line with area. Hover/tap shows the exact value. */
export function TimeChart({ data, kind = "bar", label, unit }: {
  data: Point[]; kind?: "bar" | "line"; label: string; unit: (n: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = H - PAD.top - PAD.bottom;
  const n = data.length;
  const band = n ? iw / n : 0;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => (max / 4) * k);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 56)))); // x labels that fit
  const barW = Math.max(2, Math.min(28, band - 4)); // 2px+ gap between adjacent bars

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - PAD.left) / band);
    setHover(i >= 0 && i < n ? i : null);
  }

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={label} onPointerMove={onMove}
          onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {data.map((d, i) => (i % every === (n - 1) % every ? (
            <text key={d.full} className="chart-tick" x={x(i)} y={H - 6} textAnchor="middle">{d.label}</text>
          ) : null))}
          {hover !== null && <line className="chart-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />}
          {kind === "bar" ? data.map((d, i) => {
            const top = y(d.value);
            const hh = PAD.top + ih - top;
            if (hh <= 0) return null;
            const r = Math.min(4, barW / 2, hh);
            const x0 = x(i) - barW / 2;
            const base = PAD.top + ih;
            // Rounded data end, square at the baseline.
            const p = `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`;
            return <path key={d.full} d={p} className={`chart-bar${hover !== null && hover !== i ? " dim" : ""}`} />;
          }) : (
            <>
              <path d={area} className="chart-area" />
              <path d={line} className="chart-line" />
              {h && hover !== null && <circle className="chart-dot" cx={x(hover)} cy={y(h.value)} r={5} />}
            </>
          )}
        </svg>
      )}
      {h && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 60), width - 60), top: Math.max(0, y(h.value) - 52) }}>
          <span className="muted small">{h.full}</span>
          <b>{unit(h.value)}</b>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>{data.map((d) => <tr key={d.full}><th>{d.full}</th><td>{d.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export interface Slice { key: string; label: ReactNode; text: string; value: number; color: string }

/** Donut with a legend that carries name, count and share (identity is never colour-only). */
export function Donut({ slices, label, center }: { slices: Slice[]; label: string; center: ReactNode }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70, W = 22, C = 2 * Math.PI * R;
  let acc = 0;
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={label}>
          <circle cx="90" cy="90" r={R} fill="none" className="donut-track" strokeWidth={W} />
          {total > 0 && slices.map((s) => {
            if (!s.value) return null;
            const len = (s.value / total) * C;
            const gap = slices.filter((x) => x.value).length > 1 ? Math.min(2, len / 2) : 0; // 2px surface gap
            const el = (
              <circle key={s.key} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth={hover === s.key ? W + 4 : W}
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc}
                transform="rotate(-90 90 90)" opacity={hover && hover !== s.key ? 0.35 : 1}
                onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)}>
                <title>{`${s.text}: ${s.value} (${pct(s.value)}%)`}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="donut-center">{center}</div>
      </div>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key} className={hover && hover !== s.key ? "dim" : ""}
            onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span className="legend-name">{s.label}</span>
            <b>{s.value}</b>
            <span className="muted small legend-pct">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
