import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, utimes } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/sync-me.mjs", import.meta.url));

async function fixture(t, fileText, appText) {
  const dir = await mkdtemp(join(tmpdir(), "agency-profile-test-"));
  const profile = join(dir, "me.md");
  await writeFile(profile, fileText);
  const state = { text: appText, createdAt: "2000-01-01 00:00:00", writes: 0 };
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") return res.end(JSON.stringify({ context: state }));
    let body = "";
    for await (const chunk of req) body += chunk;
    state.text = JSON.parse(body).text;
    state.writes++;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const run = (flag) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...(flag ? [flag] : [])], {
      env: { ...process.env, ME_PATH: profile, RADAR_URL: `http://127.0.0.1:${server.address().port}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
  return { profile, state, run };
}

for (const flag of ["--app-to-file", "--push", undefined]) {
  test(`${flag ?? "automatic sync"} cannot erase a profile from an empty app`, async (t) => {
    const f = await fixture(t, "Ship the next release.\n", "");
    f.state.createdAt = "2099-01-01 00:00:00";
    const result = await f.run(flag);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Refusing to replace/);
    assert.equal(await readFile(f.profile, "utf8"), "Ship the next release.\n");
    assert.equal(f.state.writes, 0);
  });
}

for (const flag of ["--file-to-app", "--pull", undefined]) {
  test(`${flag ?? "automatic sync"} cannot erase an app dream from a blank file`, async (t) => {
    const f = await fixture(t, " \n", "Help our customers.");
    const result = await f.run(flag);
    assert.notEqual(result.code, 0);
    assert.equal(f.state.text, "Help our customers.");
    assert.equal(f.state.writes, 0);
    assert.equal(await readFile(f.profile, "utf8"), " \n");
  });
}

test("explicit directions copy the chosen nonempty profile", async (t) => {
  const f = await fixture(t, "File priorities.\n", "App priorities.");
  assert.equal((await f.run("--file-to-app")).code, 0);
  assert.equal(f.state.text, "File priorities.\n");
  f.state.text = "Updated priorities.";
  assert.equal((await f.run("--app-to-file")).code, 0);
  assert.equal(await readFile(f.profile, "utf8"), "Updated priorities.\n");
});

test("check is read-only and automatic sync respects the newer nonempty profile", async (t) => {
  const f = await fixture(t, "Old priorities.\n", "New priorities.");
  await utimes(f.profile, new Date("1999-01-01"), new Date("1999-01-01"));
  assert.equal((await f.run("--check")).code, 1);
  assert.equal(await readFile(f.profile, "utf8"), "Old priorities.\n");
  assert.equal(f.state.writes, 0);
  assert.equal((await f.run()).code, 0);
  assert.equal(await readFile(f.profile, "utf8"), "New priorities.\n");
});
