import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAndRunExecute } from "./octo-kimi-execute-mcp.js";

describe("Octo Kimi execute MCP", () => {
  it("runs only a manifest-declared, context-bound subcommand", async () => {
    const root = await mkdtemp(join(tmpdir(), "octo-execute-mcp-"));
    const support = join(root, "support");
    const server = join(root, "server");
    const scriptDir = join(support, ".agents/skills/write-support-qa/scripts");
    await mkdir(scriptDir, { recursive: true });
    await mkdir(join(server, "config"), { recursive: true });
    const script = join(scriptDir, "write-support-qa.sh");
    await writeFile(script, "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\"\n");
    await chmod(script, 0o755);
    await writeFile(join(server, "config/kimi-execute-manifest.json"), JSON.stringify({
      version: 1,
      scripts: [{
        root: "support_workspace",
        path: ".agents/skills/write-support-qa/scripts/write-support-qa.sh",
        subcommands: ["fetch", "analysis-update"],
      }],
    }));
    const env = {
      PATH: process.env.PATH,
      OCTO_EXECUTE_SUPPORT_WORKSPACE_DIR: support,
      OCTO_EXECUTE_SERVER_DIR: server,
      OCTO_EXECUTE_ACTION_KEY: "lark-ticket-support-qa-summarize",
      OCTO_EXECUTE_SKILL_ID: "support_qa_query",
      OCTO_EXECUTE_TICKET_NUMBER: "LT-10",
      OCTO_EXECUTE_ANALYSIS_PATH: join(support, ".octo-analysis.json"),
    };

    try {
      await expect(validateAndRunExecute({
        root: "support_workspace",
        script: ".agents/skills/write-support-qa/scripts/write-support-qa.sh",
        subcommand: "fetch",
        args: ["LT-10", "--json"],
      }, env)).resolves.toMatchObject({ stdout: "fetch LT-10 --json\n" });
      await expect(validateAndRunExecute({
        root: "support_workspace",
        script: ".agents/skills/write-support-qa/scripts/write-support-qa.sh",
        subcommand: "fetch",
        args: ["LT-11", "--json"],
      }, env)).rejects.toThrow("current Ticket");
      await expect(validateAndRunExecute({
        root: "support_workspace",
        script: "../../outside.sh",
        subcommand: "fetch",
        args: ["LT-10", "--json"],
      }, env)).rejects.toThrow("manifest");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
