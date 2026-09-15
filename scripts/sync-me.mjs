#!/usr/bin/env node
// A project's projects/<id>/me.md and that project's dream in the app are one document.
// This keeps them identical: whichever side changed last wins. Run it at the start and the
// end of every Agency wave. The shared checkout-root me.md (voice, preferences) is not synced.
//
//   node scripts/sync-me.mjs --project acme          # sync, newest wins
//   node scripts/sync-me.mjs --project acme --file-to-app
//   node scripts/sync-me.mjs --project acme --app-to-file
//   node scripts/sync-me.mjs --project acme --check  # report only, exit 1 if they differ
//
// Without --project, AGENCY_PROJECT or the default project is used. PROJECT_ME_PATH overrides the file.

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const PROJECT = (projectFlag >= 0 ? args[projectFlag + 1] : process.env.AGENCY_PROJECT) || "default";
if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(PROJECT)) throw new Error(`Invalid project id "${PROJECT}". Use lowercase letters, digits and dashes.`);
const flags = projectFlag >= 0 ? args.filter((_, index) => index !== projectFlag && index !== projectFlag + 1) : args;
const ME = process.env.PROJECT_ME_PATH ?? fileURLToPath(new URL(`../projects/${PROJECT}/me.md`, import.meta.url));
const RADAR = process.env.RADAR_URL ?? "http://localhost:3100";
const argument = flags[0] ?? "--sync";
const mode = ({ "--file-to-app": "--pull", "--app-to-file": "--push" })[argument] ?? argument;
if (!["--sync", "--pull", "--push", "--check"].includes(mode)) {
  throw new Error("Use --file-to-app, --app-to-file, --check, or no flag (newest wins). Legacy --pull/--push are also supported.");
}

async function readApp() {
  const response = await fetch(`${RADAR}/api/state?view=working&light=1&project=${PROJECT}`, { headers: { "x-radar-local-agent": "1" } });
  if (response.status === 404) throw new Error(`Unknown project "${PROJECT}". Create it in Settings or with POST /api/projects first.`);
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
    body: JSON.stringify({ text, projectId: PROJECT }),
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

if (file.missing && mode === "--pull") throw new Error(`Profile does not exist: ${ME}. Create the file first, or use --app-to-file for an existing app dream.`);
if (file.missing && !app.text.trim()) throw new Error(`No profile for project "${PROJECT}" yet. Let the agent create ${ME} from relevant context, or add the project's dream in Settings.`);
if (!file.missing && file.text.trim() === app.text.trim()) {
  console.log("in sync");
  process.exit(0);
}
if (mode === "--check") {
  console.log(`differ: file ${new Date(file.at).toISOString()}, app ${new Date(app.at).toISOString()}`);
  process.exit(1);
}

const fileWins = mode === "--pull" || (mode !== "--push" && file.at >= app.at);
const source = fileWins ? file : app;
const target = fileWins ? app : file;
if (!source.text.trim() && target.text.trim()) {
  throw new Error("Refusing to replace a nonempty profile with empty content. Neither copy was changed. Choose --file-to-app or --app-to-file from the copy you want to keep.");
}
if (fileWins) {
  await writeApp(file.text);
  console.log(`${ME} -> app project ${PROJECT} (${file.text.length} chars)`);
} else {
  await mkdir(dirname(ME), { recursive: true });
  await writeFile(ME, app.text.endsWith("\n") ? app.text : `${app.text}\n`);
  console.log(`app project ${PROJECT} -> ${ME} (${app.text.length} chars)`);
}
