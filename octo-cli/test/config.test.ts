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
  resolveServerUrl,
  saveConfig,
  setActiveProfile,
  setProfileStrictMode,
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
      { name: "test", active: false, config: { serverUrl: "https://octo.test", apiToken: "********", strictMode: "off" } },
      { name: "prod", active: true, config: { serverUrl: "https://octo.prod", apiToken: "********", strictMode: "off" } },
    ]);
    assert.doesNotMatch(await readFile(configPath, "utf8"), /\"apiToken\": \"\*+/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts HTTPS or loopback demo URLs and rejects unsafe server URLs", () => {
  assert.equal(resolveServerUrl({ serverUrl: "https://octo.example/" }), "https://octo.example");
  assert.equal(resolveServerUrl({ serverUrl: "http://127.0.0.1:8788" }), "http://127.0.0.1:8788");
  assert.throws(() => resolveServerUrl({ serverUrl: "http://octo.example" }), /must use HTTPS/);
  assert.throws(() => resolveServerUrl({ serverUrl: "https://user:password@octo.example" }), /must not include credentials/);
  assert.throws(() => resolveServerUrl({ serverUrl: "https://octo.example/api" }), /must not include a path/);
});

test("strict Profile binds the configured server and cannot be overridden by an environment URL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "octo-cli-config-"));
  const configPath = join(directory, "config.json");
  try {
    await saveConfig({ serverUrl: "https://octo.example", apiToken: "agent-token" }, configPath, "prod");
    await setProfileStrictMode("prod", "host", configPath);
    assert.equal((await loadConfig(configPath, "prod")).strictMode, "host");
    assert.throws(
      () => resolveServerUrl(
        { serverUrl: "https://octo.example", strictMode: "host" },
        { OCTO_SERVER_URL: "https://other.example" } as NodeJS.ProcessEnv,
      ),
      /STRICT_PROFILE_SERVER_MISMATCH/,
    );
    await setProfileStrictMode("prod", "off", configPath);
    assert.equal((await loadConfig(configPath, "prod")).strictMode, undefined);
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
