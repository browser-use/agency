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

const CLUSTER: Record<string, string> = { growth: "#c2410c", support: "#1d4ed8", fix: "#15803d", product: "#6d28d9" };
const ACTION: Record<string, { color: string; label: string }> = {
  do: { color: "#1f7a4d", label: "did" },
  change: { color: "#a3630b", label: "changed" },
  no: { color: "#b3261e", label: "skipped" },
};

function seconds(ms: number | null) {
  if (ms === null) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function dayLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

/** Points per day as bars, decisions as a thin line of dots underneath. */
function PointsByDay({ rows }: { rows: Stats["days_series"] }) {
  const w = 900, h = 180, pad = 26, gap = 6;
  const max = Math.max(1, ...rows.map((r) => r.points));
  const bw = Math.max(8, (w - gap * (rows.length - 1)) / Math.max(rows.length, 1));
  const today = new Date().toLocaleDateString("en-CA");
  return (
    <svg viewBox={`0 0 ${w} ${h + pad + 46}`} width="100%" role="img" aria-label="Points earned per day">
      {[0.5, 1].map((f) => <line key={f} x1={0} x2={w} y1={pad + h - h * f} y2={pad + h - h * f} stroke="currentColor" strokeOpacity=".08" />)}
      {rows.map((r, i) => {
        const x = i * (bw + gap);
        const bh = (h * r.points) / max;
        const isToday = r.day === today;
        return (
          <g key={r.day}>
            <rect x={x} y={pad + h - bh} width={bw} height={Math.max(bh, r.points ? 2 : 0)} rx={4} fill={isToday ? "var(--accent)" : "var(--ink-3)"} fillOpacity={isToday ? 1 : 0.45} />
            {r.points > 0 && <text x={x + bw / 2} y={pad + h - bh - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" style={{ fontVariantNumeric: "tabular-nums" }}>{r.points}</text>}
            <text x={x + bw / 2} y={pad + h + 18} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity=".6">{dayLabel(r.day)}</text>
            <text x={x + bw / 2} y={pad + h + 34} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity=".45">{r.do + r.change + r.no} decisions</text>
          </g>
        );
      })}
    </svg>
  );
}

function Split({ b }: { b: { do: number; change: number; no: number } }) {
  const total = b.do + b.change + b.no || 1;
  return (
    <div className="stats-split" role="img" aria-label={`${b.do} did, ${b.change} changed, ${b.no} skipped`}>
      {(["do", "change", "no"] as const).map((k) => (
        <span key={k} style={{ width: `${(100 * b[k]) / total}%`, background: ACTION[k].color }} title={`${ACTION[k].label} ${b[k]}`} />
      ))}
    </div>
  );
}

export default function StatsPage() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stats?days=${days}`, { cache: "no-store" }).then((r) => r.json()).then((s: Stats) => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, [days]);
  if (!stats) return <main className="stats-shell"><p className="stats-loading">Counting…</p></main>;
  const t = stats.total;
  const today = new Date().toLocaleDateString("en-CA");
  const todayRow = stats.days_series.find((r) => r.day === today);
  const perDay = stats.days_series.length ? Math.round(t.points / stats.days_series.length) : 0;
  const best = stats.days_series.reduce((m, r) => (r.points > (m?.points ?? -1) ? r : m), stats.days_series[0]);

  return (
    <main className="stats-shell">
      <header className="stats-header">
        <Link href="/" className="stats-back">← Back</Link>
        <nav>{[7, 30, 90].map((d) => <button key={d} className={d === days ? "is-active" : ""} onClick={() => setDays(d)}>{d} days</button>)}</nav>
      </header>

      <section className="stats-hero">
        <div>
          <span className="stats-eyebrow">Today</span>
          <b>{(todayRow?.points ?? 0).toLocaleString("en-US")}</b>
          <span className="stats-sub">points from {todayRow ? todayRow.do + todayRow.change + todayRow.no : 0} decisions</span>
        </div>
        <div>
          <span className="stats-eyebrow">Last {stats.days} days</span>
          <b>{t.points.toLocaleString("en-US")}</b>
          <span className="stats-sub">{perDay} a day on average · best day {best ? `${best.points} on ${dayLabel(best.day)}` : "–"}</span>
        </div>
        <div>
          <span className="stats-eyebrow">You decide in</span>
          <b>{seconds(t.medianDoMs)}</b>
          <span className="stats-sub">median for a Do · {seconds(t.medianActiveMs)} across everything</span>
        </div>
      </section>

      <section className="stats-block">
        <h2>Points per day</h2>
        <PointsByDay rows={stats.days_series} />
      </section>

      <section className="stats-block">
        <div className="stats-block-head">
          <h2>Where the points come from</h2>
          <p>A verified finished ticket is worth its score. Did, changed, and skipped are counts, not points.</p>
        </div>
        <div className="stats-kinds">
          {stats.clusters.map((c) => (
            <div key={c.id} className="stats-kind">
              <div className="stats-kind-head"><i style={{ background: CLUSTER[c.id] }} /><strong>{c.label}</strong><span>{c.hint}</span></div>
              <div className="stats-kind-num"><b>{c.donePoints}</b><span>points · {c.done} done · {c.open} open</span></div>
              <Split b={c} />
              <div className="stats-kind-foot"><span>{c.doRate ?? "–"}% did</span><span>{seconds(c.medianDoMs)} to a Do</span></div>
            </div>
          ))}
        </div>
        <p className="stats-legend">{(["do", "change", "no"] as const).map((k) => <span key={k}><i style={{ background: ACTION[k].color }} />{ACTION[k].label}</span>)}</p>
      </section>

      <section className="stats-block stats-two">
        <div>
          <h2>What you say yes to</h2>
          <table>
            <thead><tr><th>kind of card</th><th>decided</th><th>did</th></tr></thead>
            <tbody>{stats.categories.slice(0, 12).map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.decided}</td><td><span className="stats-rate" style={{ ["--w" as string]: `${c.doRate}%` }}><b>{c.doRate}%</b></span></td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2>Last decisions</h2>
          <ul className="stats-recent">
            {stats.recent.slice(0, 20).map((r) => (
              <li key={`${r.ideaId}-${r.decidedAt}`}>
                <i style={{ background: ACTION[r.action].color }} title={ACTION[r.action].label} />
                <Link href={`/?card=${r.ideaId}`}>{r.headline}</Link>
                <span><em style={{ color: CLUSTER[r.cluster] }}>{r.cluster}</em> · {seconds(r.activeMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
