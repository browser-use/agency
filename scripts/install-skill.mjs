import { access, cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["--codex", "--claude"].includes(mode)) {
  console.error("Usage: node scripts/install-skill.mjs --codex | --claude");
  process.exit(1);
}
const source = fileURLToPath(new URL("../skills/agency/", import.meta.url));
const target = join(homedir(), mode === "--codex" ? ".codex" : ".claude", "skills", "agency");
await access(join(source, "SKILL.md"));
try {
  await access(target);
  console.error(`Not overwriting an existing skill: ${target}. Review the changes and back up that installation before updating it.`);
  process.exit(1);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: false, errorOnExist: true });
console.log(`Installed Agency at ${target}. Start a new agent session to load it. No connectors or schedules were changed.`);
