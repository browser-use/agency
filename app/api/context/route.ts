import { ensureDatabase } from "../../../db";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { text?: string };
  const text = payload.text?.trim() ?? "";
  if (!text || text.length > 40000) return Response.json({ error: "Context must be 1–40000 characters." }, { status: 400 });
  const db = await ensureDatabase();
  await db.prepare("INSERT INTO contexts (text) VALUES (?)").bind(text).run();
  return Response.json({ ok: true }, { status: 201 });
}
