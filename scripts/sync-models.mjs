import { pathToFileURL } from "node:url";
import { discoverCodexModels } from "./lib/codex-models.mjs";
import { agencyRequest, agencyUrl } from "./lib/agency-client.mjs";

export function mergeCodexCatalog(current, discovered) {
  // Refresh this runner without removing another installed runner's catalog.
  const models = [...current.models.filter((model) => model.runner !== "codex"), ...discovered.models];
  const currentDefaultModel = models.find((model) => model.id === current.runnerDefault?.modelId);
  const preserveOtherRunner = currentDefaultModel && currentDefaultModel.runner !== "codex"
    && currentDefaultModel.thinkingLevels.includes(current.runnerDefault.thinkingLevel);
  return { models, runnerDefault: preserveOtherRunner ? current.runnerDefault : discovered.runnerDefault };
}

export async function syncModels() {
  const base = agencyUrl();
  const discovered = await discoverCodexModels();
  const current = await agencyRequest(base, "/api/agent-settings");
  const result = await agencyRequest(base, "/api/agent-models", { ...mergeCodexCatalog(current, discovered), expectedRevision: current.revision });
  return { models: discovered.models.length, runner: "codex", revision: result.settingsRevision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help")) {
    console.log("Usage: RADAR_URL=http://localhost:3100 node scripts/sync-models.mjs\nReads your installed Codex model catalog and updates Agency. No model inference, credentials, worker or schedule is created.");
  } else {
    syncModels().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
