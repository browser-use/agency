#!/usr/bin/env node
// me.md and the app's "My dream" are one document. This keeps them identical: whichever
// side changed last wins. Run it at the start and the end of every Agency wave.
//
//   node scripts/sync-me.mjs          # sync, newest wins
//   node scripts/sync-me.mjs --pull   # force file  -> app
//   node scripts/sync-me.mjs --push   # force app   -> file
//   node scripts/sync-me.mjs --check  # report only, exit 1 if they differ

import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ME = process.env.ME_PATH ?? fileURLToPath(new URL("../me.md", import.meta.url));
const RADAR = process.env.RADAR_URL ?? "http://localhost:3100";
const mode = process.argv[2] ?? "--sync";
if (!["--sync", "--pull", "--push", "--check"].includes(mode)) {
  throw new Error("Use --pull (file to app), --push (app to file), --check, or no flag (newest wins).");
}

async function readApp() {
  const response = await fetch(`${RADAR}/api/state?view=working&light=1`, { headers: { "x-radar-local-agent": "1" } });
  if (!response.ok) throw new Error(`state ${response.status}`);
  const state = await response.json();
  const context = state.context;
  if (!context) return { text: "", at: 0 };
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const timestamp = String(context.createdAt ?? "").replace(" ", "T");
  return { text: context.text ?? "", at: Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`) || 0 };
}

async function writeApp(text) {
  const response = await fetch(`${RADAR}/api/context`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-radar-local-agent": "1" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`context ${response.status}: ${await response.text()}`);
}

const [file, app] = await Promise.all([
  Promise.all([readFile(ME, "utf8"), stat(ME)]).then(([text, info]) => ({ text, at: info.mtimeMs })).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return { text: "", at: 0, missing: true };
  }),
  readApp(),
]);

if (file.missing && mode === "--pull") throw new Error(`Profile does not exist: ${ME}. Add your dream in Settings and run --push, or create the file first.`);
if (file.missing && !app.text.trim()) throw new Error("No profile yet. Add your dream in Settings, then run --push.");
if (!file.missing && file.text.trim() === app.text.trim()) {
  console.log("in sync");
  process.exit(0);
}
if (mode === "--check") {
  console.log(`differ: file ${new Date(file.at).toISOString()}, app ${new Date(app.at).toISOString()}`);
  process.exit(1);
}

const fileWins = mode === "--pull" || (mode !== "--push" && file.at >= app.at);
if (fileWins) {
  await writeApp(file.text);
  console.log(`me.md -> app (${file.text.length} chars)`);
} else {
  await writeFile(ME, app.text.endsWith("\n") ? app.text : `${app.text}\n`);
  console.log(`app -> me.md (${app.text.length} chars)`);
}
