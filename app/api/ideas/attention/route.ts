import { ensureDatabase } from "../../../../db";

type AttentionEvent = {
  id?: number;
  version?: number;
  event?: "view" | "active" | "interaction";
  activeMs?: number;
  action?: string;
  label?: string;
};

const interactionActions = new Set(["open", "details", "next", "back", "lane", "new_task", "context", "update"]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Blocked origin" }, { status: 403 });
  }

  const payload = (await request.json()) as AttentionEvent;
  const id = Number(payload.id);
  const version = Number(payload.version);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(version) || version < 1) {
    return Response.json({ error: "Invalid card" }, { status: 400 });
  }

  const db = await ensureDatabase();
  if (payload.event === "view") {
    await db.prepare(`
      INSERT INTO card_attention (idea_id, idea_version, view_count)
      SELECT id, version, 1 FROM ideas WHERE id = ? AND version = ?
      ON CONFLICT(idea_id, idea_version) DO UPDATE SET
        view_count = card_attention.view_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(id, version).run();
    return Response.json({ ok: true });
  }

  if (payload.event === "active") {
    const activeMs = Math.max(0, Math.min(15_000, Math.round(Number(payload.activeMs ?? 0))));
    if (!activeMs) return Response.json({ ok: true });
    await db.prepare(`
      INSERT INTO card_attention (idea_id, idea_version, active_ms, view_count)
      SELECT id, version, ?, 0 FROM ideas WHERE id = ? AND version = ?
      ON CONFLICT(idea_id, idea_version) DO UPDATE SET
        active_ms = card_attention.active_ms + excluded.active_ms,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(activeMs, id, version).run();
    return Response.json({ ok: true });
  }

  if (payload.event === "interaction") {
    const action = payload.action?.trim().slice(0, 40) ?? "";
    const label = payload.label?.trim().slice(0, 120) ?? "";
    if (!interactionActions.has(action)) return Response.json({ error: "Invalid interaction" }, { status: 400 });
    const activeMs = Math.max(0, Math.min(15_000, Math.round(Number(payload.activeMs ?? 0))));
    await db.batch([
      db.prepare(`
        INSERT INTO card_attention (idea_id, idea_version, active_ms, view_count)
        SELECT id, version, ?, 0 FROM ideas WHERE id = ? AND version = ?
        ON CONFLICT(idea_id, idea_version) DO UPDATE SET
          active_ms = card_attention.active_ms + excluded.active_ms,
          last_seen_at = CURRENT_TIMESTAMP
      `).bind(activeMs, id, version),
      db.prepare(`
        INSERT INTO card_interactions (idea_id, idea_version, action, label, active_ms, wall_ms)
        SELECT idea_id, idea_version, ?, ?, active_ms,
          MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER))
        FROM card_attention WHERE idea_id = ? AND idea_version = ?
      `).bind(action, label, id, version),
    ]);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Invalid attention event" }, { status: 400 });
}
