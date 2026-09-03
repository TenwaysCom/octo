import type { McpServer } from "@agentclientprotocol/sdk";
import { resolve } from "node:path";
import {
  buildSupportAnalysisUpdatePath,
  type AcpKimiPermissionContext,
} from "./acp-kimi-permission-policy.js";

export function buildAcpKimiExecuteMcpServers(
  context: AcpKimiPermissionContext | undefined,
): McpServer[] {
  if (!context?.workspaceDir
    || !context.octoServerDir
    || (context.executionPolicy !== "shell" && context.executionPolicy !== "write+shell")) {
    return [];
  }
  const analysisPath = buildSupportAnalysisUpdatePath(context);
  const envEntries: Array<[string, string | null | undefined]> = [
    ["OCTO_EXECUTE_SUPPORT_WORKSPACE_DIR", context.workspaceDir],
    ["OCTO_EXECUTE_SERVER_DIR", context.octoServerDir],
    ["OCTO_EXECUTE_ACTION_KEY", context.actionKey],
    ["OCTO_EXECUTE_SKILL_ID", context.skillId],
    ["OCTO_EXECUTE_TICKET_NUMBER", context.ticketNumber],
    ["OCTO_EXECUTE_ANALYSIS_PATH", analysisPath],
  ];
  const env = envEntries.flatMap(([name, value]) => value ? [{ name, value }] : []);

  return [{
    name: "octo_execute",
    command: process.execPath,
    args: [resolve(context.octoServerDir, "dist/scripts/octo-kimi-execute-mcp.js")],
    env,
  }];
}
