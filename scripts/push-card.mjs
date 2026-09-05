import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const metaFile = process.argv[2];
if (!metaFile) {
  console.error("Usage: npm run card:push -- path/to/card.json");
  process.exit(1);
}

const absoluteMeta = resolve(metaFile);
const meta = JSON.parse(await readFile(absoluteMeta, "utf8"));
if (!meta.cardHtmlFile) {
  console.error("cardHtmlFile is required");
  process.exit(1);
}
const cardHtml = await readFile(resolve(dirname(absoluteMeta), meta.cardHtmlFile), "utf8");
delete meta.cardHtmlFile;

const baseUrl = process.env.RADAR_URL ?? "http://localhost:3100";
const response = await fetch(`${baseUrl}/api/ideas`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-radar-local-agent": "1" },
  body: JSON.stringify({ ...meta, cardHtml }),
});
const result = await response.json();
if (!response.ok) {
  console.error(result);
  process.exit(1);
}
console.log(`Pushed card ${result.idea?.id ?? ""}`.trim());
