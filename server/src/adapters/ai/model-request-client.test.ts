import { createServer, type ServerResponse } from "node:http";
import { Client } from "undici";
import { createModelRequestClient } from "./model-request-client.js";

describe("model request transport deadlines", () => {
  async function fixture(legacy = false) {
    let received!: (response: ServerResponse) => void;
    const request = new Promise<ServerResponse>((resolve) => { received = resolve; });
    const server = createServer((_req, res) => received(res));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    const url = `http://127.0.0.1:${address.port}`;
    const client = legacy ? new Client(url) : createModelRequestClient(url);
    return {
      request, client, url,
      async close() {
        vi.useRealTimers();
        await client.destroy();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  }

  it("reproduces the default 300s headers timeout with the same clock", async () => {
    const f = await fixture(true);
    try {
      vi.useFakeTimers();
      const init = { method: "GET", dispatcher: f.client };
      const pending = fetch(f.url, init);
      const assertion = expect(pending).rejects.toMatchObject({ cause: { code: "UND_ERR_HEADERS_TIMEOUT" } });
      await f.request;
      await vi.advanceTimersByTimeAsync(310_000);
      await assertion;
    } finally { await f.close(); }
  });

  it("allows headers after 300s while the application deadline is 350s", async () => {
    const f = await fixture();
    try {
      vi.useFakeTimers();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 350_000);
      const init = { dispatcher: f.client, signal: controller.signal };
      const pending = fetch(f.url, init).then((r) => r.text());
      const assertion = expect(pending).resolves.toBe("late response");
      const response = await f.request;
      await vi.advanceTimersByTimeAsync(310_000);
      expect(controller.signal.aborted).toBe(false);
      response.end("late response");
      await assertion;
      clearTimeout(timer);
    } finally { await f.close(); }
  });

  for (const phase of ["headers", "body"] as const) {
    it(`aborts stalled ${phase} at the application deadline`, async () => {
      const f = await fixture();
      try {
        vi.useFakeTimers();
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 350_000);
        const init = { dispatcher: f.client, signal: controller.signal };
        const responsePromise = fetch(f.url, init);
        const pending = responsePromise.then((r) => r.text());
        const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
        const response = await f.request;
        if (phase === "body") {
          response.writeHead(200, { "Content-Type": "text/plain" });
          response.write("incomplete");
          await responsePromise;
        }
        await vi.advanceTimersByTimeAsync(310_000);
        expect(controller.signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(40_000);
        await assertion;
      } finally { await f.close(); }
    });
  }
});
