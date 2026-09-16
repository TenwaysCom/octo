import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHermesAcpSpawnConfig, createHermesAcpSessionRuntime } from "./hermes-acp-runtime.js";
import type { AcpSessionRuntime } from "../acp/acp-runtime.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

const python = process.env.HERMES_ACP_TEST_PYTHON;
interface ModelMessage { role: string; content?: string | null; tool_call_id?: string }
interface ModelRequest { messages: ModelMessage[]; stream?: boolean }

describe.skipIf(!python)("Unmodified Hermes ACP with a loopback model fixture", () => {
  it("streams, uses native tools, asks approval, denies a command, reloads and cancels", async () => {
    const root = await mkdtemp(join(tmpdir(), "octo-hermes-native-"));
    const workspaceDir = join(root, "workspace");
    const hermesHome = join(root, "hermes");
    const events: AcpKimiStreamEvent[] = [];
    const permissions: RequestPermissionRequest[] = [];
    const requests: ModelRequest[] = [];
    let stalled = false;
    const model = createServer(async (request, response) => {
      if (!request.url?.endsWith("/chat/completions")) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: [{ id: "octo-fixture", context_length: 131072 }] }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const body: ModelRequest = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      const last = body.messages.at(-1)!;
      if (last.role === "user" && last.content?.includes("stall")) { stalled = true; return; }
      const file = last.role === "user" && last.content?.includes("approve script") ? "approved.txt"
        : last.role === "user" && last.content?.includes("deny script") ? "denied.txt" : null;
      const toolCalls = file ? [{ id: file, type: "function", function: { name: "terminal", arguments: JSON.stringify({
        command: `python3 -c "from pathlib import Path; Path('${file}').write_text('native tool')"`,
      }) } }] : undefined;
      const message = toolCalls ? { role: "assistant", content: null, tool_calls: toolCalls } : { role: "assistant", content: "fixture complete" };
      const finishReason = toolCalls ? "tool_calls" : "stop";
      if (body.stream) {
        response.setHeader("content-type", "text/event-stream");
        const delta = { ...message, tool_calls: toolCalls?.map((tool, index) => ({ ...tool, index })) };
        response.end(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "octo-fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "octo-fixture", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`);
      } else {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ id: "fixture", object: "chat.completion", created: 1, model: "octo-fixture", choices: [{ index: 0, message, finish_reason: finishReason }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
      }
    });
    let runtime: AcpSessionRuntime | undefined;
    try {
      await new Promise<void>((resolve, reject) => { model.once("error", reject); model.listen(0, "127.0.0.1", resolve); });
      const { port } = model.address() as { port: number };
      await mkdir(workspaceDir, { recursive: true });
      await mkdir(hermesHome, { recursive: true });
      await writeFile(join(hermesHome, "config.yaml"), `model:\n  default: octo-fixture\n  provider: custom\n  base_url: http://127.0.0.1:${port}/v1\n  context_length: 131072\napprovals:\n  mode: manual\n  command_allowlist: []\n`);
      const env = { PATH: process.env.PATH, HOME: root, HERMES_HOME: hermesHome, HERMES_ACP_PYTHON: python,
        TIRITH_ENABLED: "false", OPENAI_API_KEY: "local-fixture", OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`, PYTHONDONTWRITEBYTECODE: "1", KIMI_ACP_STARTUP_TIMEOUT_MS: "20000" };
      const deps = { env, cwd: workspaceDir, signal: AbortSignal.timeout(45_000), emit: (event: AcpKimiStreamEvent) => events.push(event),
        buildSpawnConfig: () => ({ ...buildHermesAcpSpawnConfig(env), args: [fileURLToPath(new URL("../../../scripts/hermes-acp/protocol_fixture.py", import.meta.url))] }),
      };
      runtime = await createHermesAcpSessionRuntime(deps);
      const sessionId = runtime.sessionId;
      expect(sessionId).not.toMatch(/^hermes_/);
      await runtime.prompt({ message: "approve script", emit: deps.emit, signal: deps.signal, permissionHandler: async (request) => {
        permissions.push(request);
        return { outcome: { outcome: "selected", optionId: request.options.find((item) => item.kind === "allow_once")!.optionId } };
      } });
      expect(permissions).toHaveLength(1);
      expect(permissions[0].sessionId).toBe(sessionId);
      expect(permissions[0].toolCall.rawInput).toMatchObject({ description: expect.any(String), command: expect.stringContaining("approved.txt") });
      expect(await readFile(join(workspaceDir, "approved.txt"), "utf8")).toBe("native tool");
      expect(JSON.stringify(events)).toContain("fixture complete");
      await runtime.prompt({ message: "deny script", emit: deps.emit, signal: deps.signal, permissionHandler: async (request) => {
        permissions.push(request);
        return { outcome: { outcome: "selected", optionId: request.options.find((item) => item.kind === "reject_once")!.optionId } };
      } });
      expect(permissions).toHaveLength(2);
      await expect(readFile(join(workspaceDir, "denied.txt"))).rejects.toThrow();
      await runtime.close();
      events.length = 0;
      runtime = await createHermesAcpSessionRuntime({ ...deps, sessionId });
      expect(JSON.stringify(events)).toContain("approve script");
      await runtime.prompt({ message: "followup", emit: deps.emit });
      expect(requests.at(-1)?.messages.some((item) => item.role === "user" && item.content === "approve script")).toBe(true);
      const abort = new AbortController();
      const pending = runtime.prompt({ message: "stall", emit: deps.emit, signal: abort.signal });
      const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.waitFor(() => expect(stalled).toBe(true), { timeout: 5000 });
      abort.abort();
      await rejected;
      await runtime.close();
      await expect(createHermesAcpSessionRuntime({ ...deps, sessionId: "nonexistent-native-session" })).rejects.toBeDefined();
    } finally {
      await runtime?.close();
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
