"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Bucket = { do: number; change: number; no: number; parked: number; likedPoints: number; medianActiveMs: number | null; medianDoMs: number | null; decided: number; doRate: number | null };
type Stats = {
  days: number;
  total: Bucket & { donePoints: number; points: number };
  clusters: Array<Bucket & { id: string; label: string; hint: string; open: number; done: number; rejected: number; donePoints: number }>;
  categories: Array<{ name: string; do: number; change: number; no: number; decided: number; doRate: number }>;
  days_series: Array<{ day: string; do: number; change: number; no: number; points: number }>;
  recent: Array<{ ideaId: number; headline: string; action: "do" | "change" | "no"; activeMs: number | null; decidedAt: string; cluster: string }>;
};

const COLORS: Record<string, string> = { growth: "#c2410c", support: "#1d4ed8", fix: "#15803d", product: "#6d28d9" };
const ACTION: Record<string, string> = { do: "#15803d", change: "#b45309", no: "#b91c1c" };

function seconds(ms: number | null) {
  return ms === null ? "—" : `${Math.round(ms / 1000)}s`;
}

function StackedBar({ b, width = 320 }: { b: { do: number; change: number; no: number }; width?: number }) {
  const total = b.do + b.change + b.no || 1;
  const parts = [["do", b.do], ["change", b.change], ["no", b.no]] as const;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${width} 22`} width="100%" height="22" role="img" aria-label={`${b.do} do, ${b.change} change, ${b.no} skip`}>
      {parts.map(([k, v]) => {
        const w = (width * v) / total;
        const el = <g key={k}><rect x={x} y={2} width={Math.max(0, w - 2)} height={18} rx={4} fill={ACTION[k]} />{w > 34 && <text x={x + 8} y={16} fill="white" fontSize="11" fontWeight="800">{v}</text>}</g>;
        x += w;
        return el;
      })}
    </svg>
  );
}

function DaySeries({ rows }: { rows: Stats["days_series"] }) {
  const max = Math.max(1, ...rows.map((r) => r.do + r.change + r.no));
  const w = 640, h = 140, gap = 4;
  const bw = Math.max(6, (w - gap * rows.length) / Math.max(rows.length, 1));
  return (
    <svg viewBox={`0 0 ${w} ${h + 26}`} width="100%" role="img" aria-label="Decisions per day">
      {rows.map((r, i) => {
        const x = i * (bw + gap);
        const hDo = (h * r.do) / max, hCh = (h * r.change) / max, hNo = (h * r.no) / max;
        return (
          <g key={r.day}>
            <rect x={x} y={h - hDo} width={bw} height={hDo} fill={ACTION.do} rx={2} />
            <rect x={x} y={h - hDo - hCh} width={bw} height={hCh} fill={ACTION.change} rx={2} />
            <rect x={x} y={h - hDo - hCh - hNo} width={bw} height={hNo} fill={ACTION.no} rx={2} />
            {(rows.length <= 14 || i % Math.ceil(rows.length / 10) === 0) && <text x={x + bw / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#6a665f">{r.day.slice(5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stats?days=${days}`, { cache: "no-store" }).then((r) => r.json()).then((s: Stats) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [days]);
  if (!stats) return <main className="stats-shell"><p>Counting…</p></main>;
  const t = stats.total;
  return (
    <main className="stats-shell">
      <header className="stats-header">
        <Link href="/" className="stats-back">← Agency</Link>
        <h1>What you actually do with cards</h1>
        <nav>{[7, 30, 90].map((d) => <button key={d} className={d === days ? "is-active" : ""} onClick={() => setDays(d)}>{d}d</button>)}</nav>
      </header>

      <section className="stats-tiles">
        <div><b>{t.points}</b><span>points · one verified ticket is worth its impact, 0 to 10</span></div>
        <div><b>{t.doRate ?? "—"}%</b><span>Do rate · {t.do} do / {t.change} change / {t.no} skip</span></div>
        <div><b>{seconds(t.medianDoMs)}</b><span>median time to a Do · all decisions {seconds(t.medianActiveMs)}</span></div>
        <div><b>{t.parked}</b><span>parked over 30 min before deciding</span></div>
      </section>

      <section className="stats-block">
        <h2>By kind of work</h2>
        <p className="stats-note">Points come from finished work only: a verified completed ticket is worth its impact score, 0 to 10. Do, Change and Skip are counted, not scored. A high Do rate with a low median time is what a good lane looks like.</p>
        <div className="stats-clusters">
          {stats.clusters.map((c) => (
            <article key={c.id} style={{ borderTopColor: COLORS[c.id] }}>
              <header><strong>{c.label}</strong><span>{c.hint}</span></header>
              <StackedBar b={c} />
              <dl>
                <div><dt>Do rate</dt><dd>{c.doRate ?? "—"}%</dd></div>
                <div><dt>median Do</dt><dd>{seconds(c.medianDoMs)}</dd></div>
                <div><dt>points</dt><dd>{c.donePoints}</dd></div>
                <div><dt>open / done / skipped</dt><dd>{c.open} / {c.done} / {c.rejected}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="stats-block">
        <h2>Decisions per day</h2>
        <DaySeries rows={stats.days_series} />
        <p className="stats-legend"><i style={{ background: ACTION.do }} /> do <i style={{ background: ACTION.change }} /> change <i style={{ background: ACTION.no }} /> skip</p>
      </section>

      <section className="stats-block stats-two">
        <div>
          <h2>What you say yes to</h2>
          <table>
            <thead><tr><th>category</th><th>decided</th><th>do rate</th><th></th></tr></thead>
            <tbody>{stats.categories.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.decided}</td><td>{c.doRate}%</td><td><StackedBar b={c} width={160} /></td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2>Last decisions</h2>
          <ul className="stats-recent">
            {stats.recent.map((r) => <li key={`${r.ideaId}-${r.decidedAt}`}><i style={{ background: ACTION[r.action] }} /><Link href={`/?card=${r.ideaId}`}>{r.headline}</Link><span>{r.action} · {seconds(r.activeMs)} · <em style={{ color: COLORS[r.cluster] }}>{r.cluster}</em></span></li>)}
          </ul>
        </div>
      </section>
    </main>
  );
}
