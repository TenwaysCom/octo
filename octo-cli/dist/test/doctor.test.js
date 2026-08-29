import assert from "node:assert/strict";
import test from "node:test";
import { runDoctor } from "../src/doctor.js";
test("doctor validates local configuration without a network request in offline mode", async () => {
    const report = await runDoctor({ serverUrl: "https://octo.example", apiToken: "agent-token" }, { offline: true });
    assert.deepEqual(report, {
        ok: true,
        checks: [
            { name: "serverUrl", ok: true, detail: "https://octo.example" },
            { name: "apiToken", ok: true, detail: "Configured (redacted)." },
        ],
    });
});
test("doctor checks the public health route when online", async () => {
    const report = await runDoctor({ serverUrl: "https://octo.example", apiToken: "agent-token" }, { offline: false }, { fetchImpl: async () => new Response("ok", { status: 200 }) });
    assert.equal(report.ok, true);
    assert.deepEqual(report.checks.at(-1), { name: "health", ok: true, detail: "HTTP 200" });
});
