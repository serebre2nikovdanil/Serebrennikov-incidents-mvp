// SVG-примитивы дашборда. Не зависят от @ant-design/charts — можно эту зависимость удалить.
// Скопировать в frontend/src/features/dashboard/dashboard-primitives.tsx

import React, { useEffect, useRef, useState } from 'react';

function useContainerWidth(defaultWidth = 760): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(defaultWidth);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => {
      if (ref.current) setW(ref.current.clientWidth || defaultWidth);
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [defaultWidth]);
  return [ref, w];
}

export const palette = {
  accent: 'var(--d-accent)',
  crit: 'var(--d-critical)',
  sig: 'var(--d-significant)',
  min: 'var(--d-minor)',
  good: 'var(--d-good)',
  c: ['var(--d-c1)', 'var(--d-c2)', 'var(--d-c3)', 'var(--d-c4)', 'var(--d-c5)', 'var(--d-c6)'] as const,
};

export function sevColor(code?: string | null): string {
  if (code === 'critical') return 'var(--d-critical)';
  if (code === 'significant') return 'var(--d-significant)';
  return 'var(--d-minor)';
}

// ─────────────────────────────────────────────────────────────
// Sparkline
// ─────────────────────────────────────────────────────────────
export function Sparkline({ data, color = 'var(--d-accent)', height = 36 }: {
  data: number[]; color?: string; height?: number;
}) {
  if (!data.length) return null;
  const w = 100;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const gid = `sg-${color.replace(/[^a-z]/gi, '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────
export interface KpiSpec {
  label: string;
  current: number;
  previous: number;
  unit?: string;
  reverse?: boolean; // true → рост = плохо
  hint?: string;
}

export function KpiCard({ k, sparkData, sparkColor }: {
  k: KpiSpec;
  sparkData?: number[];
  sparkColor?: string;
}) {
  const delta = k.previous ? ((k.current - k.previous) / k.previous) * 100 : 0;
  const isUp = delta >= 0;
  const good = k.reverse ? !isUp : isUp;
  const cls = Math.abs(delta) < 0.5 ? 'flat' : good ? 'good' : 'bad';
  const arrow = Math.abs(delta) < 0.5 ? '→' : isUp ? '↑' : '↓';
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span className="dot" style={{ background: sparkColor || palette.accent }} />
        {k.label}
      </div>
      <div className="kpi-row">
        <div className="kpi-value">
          {fmt(k.current)}
          {k.unit && <span className="unit">{k.unit}</span>}
        </div>
        <div className={`kpi-delta ${cls}`}>
          <span>{arrow}</span>
          {Math.abs(delta).toFixed(1)}%
        </div>
      </div>
      {sparkData && sparkData.length > 0 && (
        <div style={{ height: 36 }}>
          <Sparkline data={sparkData} color={sparkColor || palette.accent} />
        </div>
      )}
      <div className="kpi-foot">
        <span>{k.hint}</span>
        <span>пред. {fmt(k.previous)}{k.unit || ''}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Donut
// ─────────────────────────────────────────────────────────────
export interface DonutItem { name: string; count: number; code?: string; }

export function Donut({
  items, colorOf, total, centerLabel, centerSub, size = 170, thickness = 20,
}: {
  items: DonutItem[];
  colorOf?: (item: DonutItem, i: number) => string;
  total?: number;
  centerLabel?: React.ReactNode;
  centerSub?: React.ReactNode;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const tot = total ?? items.reduce((s, x) => s + x.count, 0);
  if (tot === 0) {
    return <div style={{ width: size, height: size, display: 'grid', placeItems: 'center', color: 'var(--d-text-subtle)', fontSize: 12 }}>Нет данных</div>;
  }
  let a = -Math.PI / 2;
  const segs = items.map((it, i) => {
    const frac = it.count / tot;
    if (frac <= 0) return null;
    const a0 = a;
    const a1 = a + frac * Math.PI * 2;
    a = a1;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1 - 0.005);
    const y1 = cy + r * Math.sin(a1 - 0.005);
    const color = colorOf?.(it, i) ?? palette.c[i % palette.c.length];
    return (
      <path key={i} d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
        stroke={color} strokeWidth={thickness} fill="none" />
    );
  });
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} stroke="var(--d-bg-muted)" strokeWidth={thickness} fill="none" />
        {segs}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {centerLabel}
          {centerSub && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--d-text-subtle)', marginTop: 2 }}>{centerSub}</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Horizontal bar
// ─────────────────────────────────────────────────────────────
export interface HBarItem { label: string; value: number; [k: string]: any; }

export function HBar({ items, max, colorOf, valueFmt, labelWidth = 200 }: {
  items: HBarItem[];
  max?: number;
  colorOf?: (it: HBarItem, i: number) => string;
  valueFmt?: (it: HBarItem) => React.ReactNode;
  labelWidth?: number;
}) {
  if (!items.length) return <div style={{ color: 'var(--d-text-subtle)', padding: 20, textAlign: 'center' }}>Нет данных</div>;
  const m = max ?? Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map((it, i) => {
        const pct = (it.value / m) * 100;
        const color = colorOf?.(it, i) ?? palette.c[i % palette.c.length];
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr 80px`, gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</div>
            <div style={{ height: 18, borderRadius: 4, background: 'var(--d-bg-muted)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color, borderRadius: 4 }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {valueFmt ? valueFmt(it) : it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stacked bar
// ─────────────────────────────────────────────────────────────
export function StackedBar({
  segments, height = 14, total,
}: { segments: { label: string; value: number; color: string }[]; height?: number; total?: number }) {
  const t = total ?? segments.reduce((s, x) => s + x.value, 0);
  if (t === 0) return null;
  return (
    <div style={{ display: 'flex', height, borderRadius: 4, overflow: 'hidden', background: 'var(--d-bg-muted)' }}>
      {segments.map((s, i) => (
        <div key={i} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / t) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Line chart
// ─────────────────────────────────────────────────────────────
export interface LineSeries<D> {
  key: keyof D & string;
  label: string;
  color: string;
  fill?: boolean;
  dots?: boolean;
}

export function LineChart<D extends Record<string, any>>({
  data, series, xKey, height = 220, yTicks = 4, showLegend = true,
}: {
  data: D[];
  series: LineSeries<D>[];
  xKey: keyof D & string;
  height?: number;
  yTicks?: number;
  showLegend?: boolean;
}) {
  const [ref, w] = useContainerWidth(760);
  if (!data.length) return <div style={{ color: 'var(--d-text-subtle)', padding: 40, textAlign: 'center' }}>Нет данных</div>;
  const padL = 32, padR = 12, padT = 14, padB = 24;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;
  const maxV = Math.max(1, ...data.flatMap(d => series.map(s => Number(d[s.key]) || 0)));
  const yScale = (v: number) => padT + innerH - (v / maxV) * innerH;
  const xScale = (i: number) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxV * i) / yTicks));

  return (
    <div ref={ref}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yScale(t)} x2={w - padR} y2={yScale(t)} stroke="var(--d-border)" strokeDasharray={i === 0 ? '0' : '2 3'} />
            <text x={padL - 6} y={yScale(t) + 3} fontSize="10" fill="var(--d-text-subtle)" textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const step = Math.max(1, Math.ceil(data.length / 10));
          if (i % step !== 0 && i !== data.length - 1) return null;
          return (
            <text key={i} x={xScale(i)} y={height - 6} fontSize="10" fill="var(--d-text-subtle)" textAnchor="middle">{String(d[xKey] ?? '')}</text>
          );
        })}
        {series.map((s) => {
          const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(Number(d[s.key]) || 0)}`).join(' ');
          const area = `${path} L${xScale(data.length - 1)},${yScale(0)} L${xScale(0)},${yScale(0)} Z`;
          const gid = `lg-${s.key}`;
          return (
            <g key={s.key}>
              {s.fill && (
                <>
                  <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill={`url(#${gid})`} />
                </>
              )}
              <path d={path} stroke={s.color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {s.dots !== false && data.map((d, i) => (
                <circle key={i} cx={xScale(i)} cy={yScale(Number(d[s.key]) || 0)} r="2.5" fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      {showLegend && (
        <div className="d-legend" style={{ marginTop: 8, justifyContent: 'center' }}>
          {series.map(s => (
            <div key={s.key} className="d-legend-item">
              <span className="d-legend-swatch" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Heatmap
// ─────────────────────────────────────────────────────────────
export function Heatmap<R extends { label: string }, C extends { label: string }>({
  rows, cols, valueOf, max, baseColor = '268', cellH = 26, labelW = 70, showValues = false,
}: {
  rows: R[]; cols: C[];
  valueOf: (r: R, c: C) => number;
  max?: number;
  baseColor?: string;
  cellH?: number;
  labelW?: number;
  showValues?: boolean;
}) {
  const m = max ?? Math.max(1, ...rows.flatMap(r => cols.map(c => valueOf(r, c) || 0)));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${labelW}px 1fr`, gap: 0 }}>
      <div />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 3, marginBottom: 4 }}>
        {cols.map((c, i) => (
          <div key={i} style={{ fontSize: 10, color: 'var(--d-text-subtle)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
        ))}
      </div>
      {rows.map((r, ri) => (
        <React.Fragment key={ri}>
          <div style={{ fontSize: 11, color: 'var(--d-text-muted)', paddingRight: 8, alignSelf: 'center', fontWeight: 500 }}>{r.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 3, marginBottom: 3 }}>
            {cols.map((c, ci) => {
              const v = valueOf(r, c) || 0;
              const alpha = m === 0 ? 0 : Math.max(0.06, v / m);
              const bg = v === 0 ? 'var(--d-bg-muted)' : `oklch(0.7 ${0.06 + alpha * 0.1} ${baseColor} / ${0.15 + alpha * 0.85})`;
              const txtColor = alpha > 0.55 ? 'white' : 'var(--d-text)';
              return (
                <div key={ci} style={{ height: cellH, background: bg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, color: txtColor, fontVariantNumeric: 'tabular-nums', borderRadius: 3 }}>
                  {showValues && v > 0 ? v : ''}
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sales Funnel
// ─────────────────────────────────────────────────────────────
export interface FunnelStage { name: string; count: number; order?: number; }

export function SalesFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return <div style={{ color: 'var(--d-text-subtle)', padding: 40, textAlign: 'center' }}>Нет данных</div>;
  const ordered = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const total = ordered.reduce((s, x) => s + x.count, 0) || 1;
  const max = Math.max(...ordered.map(s => s.count), 1);
  return (
    <div>
      {ordered.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        const shareOfTotal = (s.count / total) * 100;
        return (
          <div key={s.name} className="funnel-row">
            <div>
              <div className="funnel-stage-name">
                <span style={{ color: 'var(--d-text-subtle)', fontWeight: 600, marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>{String(s.order ?? i + 1).padStart(2, '0')}</span>
                {s.name}
              </div>
              <div className="funnel-stage-meta">
                {shareOfTotal.toFixed(1)}% от общего объёма
              </div>
            </div>
            <div className="funnel-bar">
              <div className="funnel-bar-fill" style={{ width: `${widthPct}%`, opacity: 0.95 }} />
            </div>
            <div className="funnel-count">{s.count}</div>
            <div className="funnel-pct">{shareOfTotal.toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}
