import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const executeInputSchema = z.object({
  root: z.enum(["support_workspace", "octo_server"]),
  script: z.string().trim().min(1).max(500),
  subcommand: z.string().trim().min(1).max(100),
  args: z.array(z.string().max(2_000)).max(20).default([]),
}).strict();

const manifestSchema = z.object({
  version: z.literal(1),
  scripts: z.array(z.object({
    root: z.enum(["support_workspace", "octo_server"]),
    path: z.string().trim().min(1),
    subcommands: z.array(z.string().trim().min(1)).min(1),
  }).strict()),
}).strict();

type ExecuteInput = z.infer<typeof executeInputSchema>;

export async function validateAndRunExecute(
  inputValue: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  const input = executeInputSchema.parse(inputValue);
  const supportWorkspace = requireEnv(env, "OCTO_EXECUTE_SUPPORT_WORKSPACE_DIR");
  const octoServerDir = requireEnv(env, "OCTO_EXECUTE_SERVER_DIR");
  const roots = {
    support_workspace: await realpath(supportWorkspace),
    octo_server: await realpath(octoServerDir),
  } as const;
  const manifestPath = resolve(roots.octo_server, "config/kimi-execute-manifest.json");
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const entry = manifest.scripts.find((candidate) => candidate.root === input.root
    && candidate.path === input.script
    && candidate.subcommands.includes(input.subcommand));
  if (!entry) throw new Error("Script or subcommand is not declared in the execute manifest.");

  const root = roots[input.root];
  const script = await realpath(resolve(root, input.script));
  if (!isWithinRoot(root, script) || !isWithinRoot(root, dirname(script))) {
    throw new Error("Manifest script resolves outside its declared root.");
  }
  validateContextBoundArguments(input, env, roots.support_workspace);

  return await new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [script, input.subcommand, ...input.args], {
      cwd: root,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error(`Execute failed with code ${code ?? "null"} signal ${signal ?? "none"}: ${stderr.slice(-2_000)}`));
      }
    });
  });
}

function validateContextBoundArguments(
  input: ExecuteInput,
  env: NodeJS.ProcessEnv,
  supportWorkspace: string,
): void {
  if (input.root !== "support_workspace"
    || input.script !== ".agents/skills/write-support-qa/scripts/write-support-qa.sh") {
    throw new Error("No argument policy is registered for this manifest entry.");
  }
  if (input.subcommand === "fetch") {
    const ticketNumber = requireEnv(env, "OCTO_EXECUTE_TICKET_NUMBER");
    if (input.args.length !== 2 || input.args[0] !== ticketNumber || input.args[1] !== "--json") {
      throw new Error("Fetch arguments do not match the current Ticket action.");
    }
    return;
  }
  if (input.subcommand === "analysis-update") {
    const analysisPath = requireEnv(env, "OCTO_EXECUTE_ANALYSIS_PATH");
    if (env.OCTO_EXECUTE_ACTION_KEY !== "lark-ticket-support-qa-summarize"
      || input.args.length !== 2
      || input.args[0] !== analysisPath
      || input.args[1] !== "--json"
      || !isWithinRoot(supportWorkspace, resolve(analysisPath))) {
      throw new Error("Analysis update arguments do not match the current action run.");
    }
    return;
  }
  if (input.subcommand === "update") {
    if (env.OCTO_EXECUTE_SKILL_ID !== "support_qa_write"
      || input.args.length < 2
      || input.args.length > 3
      || !isWithinRoot(supportWorkspace, resolve(input.args[0]!))
      || !input.args.slice(1).every((arg) => arg === "--json" || arg === "--dry-run")
      || !input.args.includes("--json")) {
      throw new Error("Knowledge update arguments do not match the current action.");
    }
    return;
  }
  throw new Error("Unsupported execute subcommand.");
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath !== ""
    && relativePath !== ".."
    && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    && !isAbsolute(relativePath);
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function writeResponse(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function handleRequest(request: Record<string, unknown>): Promise<void> {
  const id = request.id;
  const method = request.method;
  if (id === undefined || typeof method !== "string") return;
  try {
    if (method === "initialize") {
      const params = request.params && typeof request.params === "object"
        ? request.params as Record<string, unknown>
        : {};
      writeResponse({ jsonrpc: "2.0", id, result: {
        protocolVersion: params.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "octo-execute", version: "1.0.0" },
      } });
      return;
    }
    if (method === "ping") {
      writeResponse({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    if (method === "tools/list") {
      writeResponse({ jsonrpc: "2.0", id, result: { tools: [{
        name: "execute",
        description: "Execute one manifest-declared Octo workflow script. The server validates the root, script, subcommand, Ticket, action run, and file path before spawning without a shell command string.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["root", "script", "subcommand", "args"],
          properties: {
            root: { type: "string", enum: ["support_workspace", "octo_server"] },
            script: { type: "string" },
            subcommand: { type: "string" },
            args: { type: "array", items: { type: "string" } },
          },
        },
      }] } });
      return;
    }
    if (method === "tools/call") {
      const params = request.params as { name?: unknown; arguments?: unknown } | undefined;
      if (params?.name !== "execute") throw new Error("Unknown tool.");
      const result = await validateAndRunExecute(params.arguments);
      writeResponse({ jsonrpc: "2.0", id, result: {
        content: [{ type: "text", text: result.stdout || result.stderr || "Execute completed." }],
        isError: false,
      } });
      return;
    }
    writeResponse({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    writeResponse({ jsonrpc: "2.0", id, result: {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      isError: true,
    } });
  }
}

export function startExecuteMcpServer(): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    void Promise.resolve()
      .then(() => JSON.parse(line) as Record<string, unknown>)
      .then(handleRequest)
      .catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startExecuteMcpServer();
}
