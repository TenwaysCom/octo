import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getActiveProfile,
  listProfiles,
  loadConfig,
  removeProfile,
  saveConfig,
  setActiveProfile,
} from "../src/config.js";

test("stores named profiles and keeps tokens redacted in profile summaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "octo-cli-config-"));
  const configPath = join(directory, "config.json");
  try {
    await saveConfig({ serverUrl: "https://octo.test", apiToken: "secret" }, configPath, "test");
    await saveConfig({ serverUrl: "https://octo.prod", apiToken: "prod-secret" }, configPath, "prod");
    await setActiveProfile("prod", configPath);
    assert.equal(await getActiveProfile(configPath), "prod");
    assert.deepEqual(await loadConfig(configPath, "test"), { serverUrl: "https://octo.test", apiToken: "secret" });
    assert.deepEqual(await listProfiles(configPath), [
      { name: "test", active: false, config: { serverUrl: "https://octo.test", apiToken: "********" } },
      { name: "prod", active: true, config: { serverUrl: "https://octo.prod", apiToken: "********" } },
    ]);
    assert.doesNotMatch(await readFile(configPath, "utf8"), /\"apiToken\": \"\*+/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps legacy single-profile config readable and prevents deleting the active profile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "octo-cli-config-"));
  const configPath = join(directory, "config.json");
  try {
    await writeFile(configPath, JSON.stringify({ serverUrl: "https://octo.test", apiToken: "legacy-secret" }));
    assert.deepEqual(await loadConfig(configPath), { serverUrl: "https://octo.test", apiToken: "legacy-secret" });
    await assert.rejects(() => removeProfile("default", configPath), /Switch profiles/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
