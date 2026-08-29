import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { applyUpgrade, checkForUpgrade, compareVersions, parseReleaseManifest, resolveManifestUrl } from "../src/upgrade.js";
const artifact = Buffer.from("octo-cli private release");
const artifactHash = createHash("sha256").update(artifact).digest("hex");
function release(version = "0.1.1") {
    return {
        schemaVersion: 1,
        package: "@tenways/octo-cli",
        version,
        publishedAt: "2026-08-29T00:00:00.000Z",
        artifact: {
            url: "https://releases.example.internal/octo-cli-0.1.1.tgz",
            sha256: artifactHash,
            size: artifact.length,
        },
    };
}
test("checks a valid private HTTPS release manifest", async () => {
    let authorization = null;
    const check = await checkForUpgrade("https://releases.example.internal/latest.json", {
        currentVersion: "0.1.0",
        updateToken: "release-reader-token",
        fetchImpl: async (_input, init) => {
            authorization = new Headers(init?.headers).get("authorization");
            return new Response(JSON.stringify(release()), { status: 200 });
        },
    });
    assert.equal(check.updateAvailable, true);
    assert.equal(check.release.version, "0.1.1");
    assert.equal(check.manifestUrl, "https://releases.example.internal/latest.json");
    assert.equal(authorization, "Bearer release-reader-token");
});
test("does not propose an equal or lower release", async () => {
    const fetchImpl = async () => new Response(JSON.stringify(release("0.1.0")), { status: 200 });
    const check = await checkForUpgrade("https://releases.example.internal/latest.json", { currentVersion: "0.1.0", fetchImpl });
    assert.equal(check.updateAvailable, false);
    assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
});
test("requires an HTTPS manifest URL and a complete manifest", () => {
    assert.throws(() => resolveManifestUrl(undefined, {}), /UPGRADE_MANIFEST_URL_REQUIRED/);
    assert.throws(() => resolveManifestUrl("http://releases.example/latest.json"), /HTTPS/);
    assert.throws(() => parseReleaseManifest({ ...release(), artifact: { url: "https://release.example/a.tgz" } }), /UPGRADE_MANIFEST_INVALID/);
});
test("verifies the downloaded artifact before invoking npm", async () => {
    const check = await checkForUpgrade("https://releases.example.internal/latest.json", {
        currentVersion: "0.1.0",
        fetchImpl: async () => new Response(JSON.stringify(release()), { status: 200 }),
    });
    const commands = [];
    const result = await applyUpgrade(check, {
        fetchImpl: async (input) => {
            if (String(input).endsWith("latest.json"))
                return new Response(JSON.stringify(release()), { status: 200 });
            return new Response(artifact, { status: 200 });
        },
        execute: async (file, args) => { commands.push({ file, args }); },
    });
    assert.deepEqual(result, { updated: true, version: "0.1.1" });
    assert.equal(commands.length, 1);
    assert.equal(commands[0].file, "npm");
    assert.deepEqual(commands[0].args.slice(0, 3), ["install", "--global", "--ignore-scripts"]);
    assert.match(String(commands[0].args[3]), /octo-cli-0\.1\.1\.tgz$/);
});
test("does not invoke npm when the artifact hash is wrong", async () => {
    const check = await checkForUpgrade("https://releases.example.internal/latest.json", {
        currentVersion: "0.1.0",
        fetchImpl: async () => new Response(JSON.stringify(release()), { status: 200 }),
    });
    let invoked = false;
    await assert.rejects(() => applyUpgrade(check, {
        fetchImpl: async () => new Response(Buffer.from("tampered"), { status: 200 }),
        execute: async () => { invoked = true; },
    }), /UPGRADE_ARTIFACT_SIZE_MISMATCH/);
    assert.equal(invoked, false);
});
