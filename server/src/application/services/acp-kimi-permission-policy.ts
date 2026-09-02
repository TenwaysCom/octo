import type {
  CreateTerminalRequest,
  ReadTextFileRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { AutomationExecutionPolicy } from "../../modules/public-config/public-config.controller.js";
import { logger } from "../../logger.js";

const permissionLogger = logger.child({ module: "acp-kimi-permission-policy" });

export interface AcpKimiPermissionContext {
  actionKey?: string | null;
  executionPolicy?: AutomationExecutionPolicy | null;
  workspaceDir?: string | null;
  octoServerDir?: string | null;
  skillProfile?: string | null;
  skillId?: string | null;
  ticketNumber?: string | null;
  ticketRecordId?: string | null;
  actionRunId?: string | null;
  policyVersion?: string | null;
}

export type AcpKimiPermissionHandler = (
  params: RequestPermissionRequest,
) => Promise<RequestPermissionResponse>;

export interface AcpKimiClientCapabilityPolicy {
  allowsTerminal(params: CreateTerminalRequest): Promise<boolean>;
  allowsReadTextFile(params: ReadTextFileRequest): Promise<boolean>;
  allowsWriteTextFile(params: WriteTextFileRequest): Promise<boolean>;
}

const CANCELLED: RequestPermissionResponse = {
  outcome: { outcome: "cancelled" },
};

const SUPPORT_QA_SCRIPT = ".agents/skills/write-support-qa/scripts/write-support-qa.sh";

/**
 * ACP approval requests do not reliably include a Bash command or Write path.
 * Only approve tools whose effects are independently checked by an ACP fs
 * callback or by the Octo execute MCP server. A complete legacy Bash payload is
 * still checked when present. Support-QA temporarily permits a Bash approval
 * without command evidence because Kimi ACP 0.38 sends the approval before the
 * command payload; this is intentionally scoped to the three Ticket actions.
 */
export function createAcpKimiPermissionHandler(
  context: AcpKimiPermissionContext | undefined,
): AcpKimiPermissionHandler {
  return async (params) => {
    const toolName = getToolName(params.toolCall.title);
    const policy = context?.executionPolicy ?? "read_only";
    const command = getToolCommand(params.toolCall);
    const temporaryBashAllowed = Boolean(context && isBashTool(toolName) && canUseTemporarySupportQaBash(context));
    const allowed = context ? (
      isReadTool(toolName)
      || isWriteTool(toolName) && canWrite(context)
      || isExecuteTool(toolName) && canExecute(context)
      || temporaryBashAllowed
      || Boolean(command && await isAllowedLegacyCommand(command, context))
    ) : false;
    const allowOnce = allowed
      ? params.options.find((option) => option.kind === "allow_once")
      : undefined;

    permissionLogger.info({
      sessionId: params.sessionId,
      actionKey: context?.actionKey ?? null,
      executionPolicy: policy,
      toolName,
      decision: allowOnce ? "allow_once" : "cancelled",
      reason: allowOnce
        ? temporaryBashAllowed && !command
          ? "temporary_unverified_bash"
          : "capability_guarded"
        : allowed
          ? "allow_once_not_offered"
          : "policy_denied",
      commandDiagnostic: command ? "present" : "missing",
      offeredOptionKinds: params.options.map((option) => option.kind),
    }, "ACP_KIMI_PERMISSION DECISION");

    return allowOnce
      ? { outcome: { outcome: "selected", optionId: allowOnce.optionId } }
      : CANCELLED;
  };
}

export function createAcpKimiClientCapabilityPolicy(
  context: AcpKimiPermissionContext | undefined,
): AcpKimiClientCapabilityPolicy {
  return {
    async allowsTerminal(params) {
      logCapabilityDecision("terminal", params.sessionId, context, false, {
        program: params.command,
      });
      return false;
    },
    async allowsReadTextFile(params) {
      const allowed = Boolean(context) && await isAllowedReadPath(params.path, context!);
      logCapabilityDecision("fs.read", params.sessionId, context, allowed, {
        pathScope: describePathScope(params.path, context),
      });
      return allowed;
    },
    async allowsWriteTextFile(params) {
      const allowed = Boolean(context && canWrite(context))
        && await isAllowedWorkspaceWritePath(params.path, context!.workspaceDir!);
      logCapabilityDecision("fs.write", params.sessionId, context, allowed, {
        pathScope: describePathScope(params.path, context),
        contentLength: params.content.length,
      });
      return allowed;
    },
  };
}

export interface AcpKimiExecuteCall {
  root: "support_workspace" | "octo_server";
  script: string;
  subcommand: string;
  args: string[];
}

export function extractAcpKimiExecuteCall(rawInput: unknown): AcpKimiExecuteCall | undefined {
  const direct = asRecord(rawInput);
  const nested = asRecord(direct?.arguments) ?? asRecord(direct?.input);
  const value = nested ?? direct;
  if (!value) return undefined;
  const args = value.args;
  if ((value.root !== "support_workspace" && value.root !== "octo_server")
    || typeof value.script !== "string"
    || typeof value.subcommand !== "string"
    || !Array.isArray(args)
    || !args.every((arg) => typeof arg === "string")) {
    return undefined;
  }
  return {
    root: value.root,
    script: value.script,
    subcommand: value.subcommand,
    args: args as string[],
  };
}

export function isAcpKimiSupportQaFetchExecuteCall(
  call: AcpKimiExecuteCall,
  context: Pick<AcpKimiPermissionContext, "ticketNumber">,
): boolean {
  return call.root === "support_workspace"
    && call.script === SUPPORT_QA_SCRIPT
    && call.subcommand === "fetch"
    && call.args.length === 2
    && call.args[0] === context.ticketNumber
    && call.args[1] === "--json";
}

export function isAcpKimiSupportAnalysisUpdateExecuteCall(
  call: AcpKimiExecuteCall,
  context: Pick<AcpKimiPermissionContext,
    "actionKey" | "skillId" | "ticketRecordId" | "actionRunId" | "workspaceDir">,
): boolean {
  return call.root === "support_workspace"
    && call.script === SUPPORT_QA_SCRIPT
    && call.subcommand === "analysis-update"
    && call.args.length === 2
    && call.args[0] === buildSupportAnalysisUpdatePath(context)
    && call.args[1] === "--json"
    && isSummaryAnalysisContext(context);
}

export function isAcpKimiSupportQaFetchCommand(
  command: string,
  context: Pick<AcpKimiPermissionContext, "ticketNumber">,
): boolean {
  const tokens = parseShellTokens(command);
  return Boolean(tokens && isSupportQaFetchTokens(tokens, context));
}

export function isAcpKimiSupportAnalysisUpdateCommand(
  command: string,
  context: Pick<AcpKimiPermissionContext,
    "actionKey" | "skillId" | "ticketRecordId" | "actionRunId" | "workspaceDir">,
): boolean {
  const tokens = parseShellTokens(command);
  return Boolean(tokens && isSupportAnalysisUpdateTokens(tokens, context));
}

export function buildSupportAnalysisUpdatePath(
  context: Pick<AcpKimiPermissionContext, "ticketRecordId" | "actionRunId" | "workspaceDir">,
): string | undefined {
  if (!context.workspaceDir || !context.ticketRecordId || !context.actionRunId) return undefined;
  const key = createHash("sha256")
    .update(`${context.ticketRecordId}:${context.actionRunId}`)
    .digest("hex")
    .slice(0, 24);
  return resolve(context.workspaceDir, `.octo-support-analysis-${key}.json`);
}

export function extractAcpKimiRawCommand(rawInput: unknown): string | undefined {
  if (typeof rawInput === "string") return rawInput;
  const raw = asRecord(rawInput);
  return typeof raw?.command === "string"
    ? raw.command
    : typeof raw?.input === "string"
      ? raw.input
      : undefined;
}

function canWrite(context: AcpKimiPermissionContext): boolean {
  return context.executionPolicy === "write+shell" && Boolean(context.workspaceDir);
}

function canExecute(context: AcpKimiPermissionContext): boolean {
  return (context.executionPolicy === "shell" || context.executionPolicy === "write+shell")
    && Boolean(context.workspaceDir)
    && Boolean(context.octoServerDir);
}

function canUseTemporarySupportQaBash(context: AcpKimiPermissionContext): boolean {
  return canExecute(context)
    && context.skillProfile === "support_qa_eu"
    && (context.skillId === "support_qa_query" || context.skillId === "support_qa_write")
    && (context.actionKey === "lark-ticket-support-qa-summarize"
      || context.actionKey === "lark-ticket-support-qa-answer"
      || context.actionKey === "lark-ticket-support-qa-document-preview");
}

async function isAllowedLegacyCommand(
  command: string,
  context: AcpKimiPermissionContext,
): Promise<boolean> {
  const tokens = parseShellTokens(command);
  if (!tokens || !canExecute(context)) return false;
  if (isSupportQaFetchTokens(tokens, context)) return true;
  if (context.executionPolicy !== "write+shell") return false;
  if (!isSupportAnalysisUpdateTokens(tokens, context)) return false;
  const path = tokens[3];
  return Boolean(path && await isAllowedWorkspaceReadPath(path, context.workspaceDir!));
}

function isSupportQaFetchTokens(
  tokens: string[],
  context: Pick<AcpKimiPermissionContext, "ticketNumber">,
): boolean {
  const [shell, script, operation, ticketNumber, output] = tokens;
  return shell === "bash"
    && script === SUPPORT_QA_SCRIPT
    && operation === "fetch"
    && ticketNumber === context.ticketNumber
    && output === "--json"
    && tokens.length === 5;
}

function isSupportAnalysisUpdateTokens(
  tokens: string[],
  context: Pick<AcpKimiPermissionContext,
    "actionKey" | "skillId" | "ticketRecordId" | "actionRunId" | "workspaceDir">,
): boolean {
  const [shell, script, operation, updateFile, output] = tokens;
  return shell === "bash"
    && script === SUPPORT_QA_SCRIPT
    && operation === "analysis-update"
    && updateFile === buildSupportAnalysisUpdatePath(context)
    && output === "--json"
    && tokens.length === 5
    && isSummaryAnalysisContext(context);
}

function isSummaryAnalysisContext(
  context: Pick<AcpKimiPermissionContext,
    "actionKey" | "skillId" | "ticketRecordId" | "actionRunId">,
): boolean {
  return context.actionKey === "lark-ticket-support-qa-summarize"
    && context.skillId === "support_qa_query"
    && Boolean(context.ticketRecordId)
    && Boolean(context.actionRunId);
}

async function isAllowedReadPath(
  path: string,
  context: AcpKimiPermissionContext,
): Promise<boolean> {
  if (context.workspaceDir && await isAllowedWorkspaceReadPath(path, context.workspaceDir)) {
    return true;
  }
  return Boolean(context.octoServerDir)
    && await isAllowedWorkspaceReadPath(path, context.octoServerDir!);
}

async function isAllowedWorkspaceReadPath(path: string, root: string): Promise<boolean> {
  try {
    const rootPath = await realpath(root);
    const candidate = await realpath(isAbsolute(path) ? path : resolve(rootPath, path));
    const relativePath = relative(rootPath, candidate).replaceAll("\\", "/");
    if (!isWithinRoot(relativePath) || isSensitiveRelativePath(relativePath)) return false;
    const stat = await lstat(candidate);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isAllowedWorkspaceWritePath(path: string, root: string): Promise<boolean> {
  try {
    const rootPath = await realpath(root);
    const requestedPath = resolve(isAbsolute(path) ? path : resolve(rootPath, path));
    const parent = await realpath(dirname(requestedPath));
    const candidate = resolve(parent, basename(requestedPath));
    const parentRelative = relative(rootPath, parent).replaceAll("\\", "/");
    if (parentRelative !== "" && !isWithinRoot(parentRelative)) return false;
    const relativePath = relative(rootPath, candidate).replaceAll("\\", "/");
    if (!isWithinRoot(relativePath) || isSensitiveRelativePath(relativePath)) return false;
    try {
      const stat = await lstat(candidate);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch (error) {
      return isMissingPathError(error);
    }
  } catch {
    return false;
  }
}

function isWithinRoot(relativePath: string): boolean {
  return relativePath !== ""
    && relativePath !== ".."
    && !relativePath.startsWith("../")
    && !isAbsolute(relativePath);
}

function isSensitiveRelativePath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const fileName = basename(relativePath).toLowerCase();
  return segments.some((segment) => segment === ".git" || segment === ".ssh")
    || fileName === ".env"
    || fileName.startsWith(".env.")
    || fileName.includes("credential")
    || extname(fileName) === ".pem"
    || extname(fileName) === ".key";
}

function describePathScope(
  path: string,
  context: AcpKimiPermissionContext | undefined,
): string {
  for (const [name, root] of [
    ["support_workspace", context?.workspaceDir],
    ["octo_server", context?.octoServerDir],
  ] as const) {
    if (!root) continue;
    const relativePath = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
    if (relativePath === "" || isWithinRoot(relativePath)) return `${name}:${relativePath || "."}`;
  }
  return "outside_allowed_roots";
}

function getToolCommand(toolCall: RequestPermissionRequest["toolCall"]): string | undefined {
  const rawCommand = extractAcpKimiRawCommand(toolCall.rawInput);
  const contentCommands = (toolCall.content ?? []).flatMap((item) => {
    const record = asRecord(item);
    const content = asRecord(record?.content);
    const text = typeof content?.text === "string"
      ? content.text
      : typeof record?.text === "string"
        ? record.text
        : undefined;
    if (!text) return [];
    const candidates = [...text.matchAll(/`(bash [^`\r\n]+)`/g)].map((match) => match[1]!);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().startsWith("bash ")) candidates.push(line.trim());
    }
    return candidates;
  });
  const unique = [...new Set(contentCommands)];
  if (unique.length > 1 || rawCommand && unique.length === 1 && rawCommand !== unique[0]) {
    return undefined;
  }
  return rawCommand ?? unique[0];
}

function parseShellTokens(command: string): string[] | undefined {
  if (!command || /[\0\r\n;&|><`$()\\*?\[\]{}~#'\"]/.test(command)) return undefined;
  const tokens = command.trim().split(/\s+/);
  return tokens.length > 0 && tokens.every(Boolean) ? tokens : undefined;
}

function getToolName(title: string | null | undefined): string {
  return title?.trim() ?? "";
}

function isReadTool(title: string): boolean {
  return /^(read|readfile|read_file)(?:\b|:)/i.test(title);
}

function isWriteTool(title: string): boolean {
  return /^(write|writefile|write_file|applypatch|apply_patch|strreplacefile)(?:\b|:)/i.test(title);
}

function isExecuteTool(title: string): boolean {
  const normalized = title.toLowerCase().replaceAll("-", "_");
  return normalized === "execute"
    || normalized === "mcp__octo_execute__execute"
    || normalized.includes("octo_execute") && normalized.includes("execute");
}

function isBashTool(title: string): boolean {
  return /^(bash)(?:\b|:)/i.test(title);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}

function logCapabilityDecision(
  capability: string,
  sessionId: string,
  context: AcpKimiPermissionContext | undefined,
  allowed: boolean,
  details: Record<string, unknown>,
): void {
  permissionLogger.info({
    sessionId,
    actionKey: context?.actionKey ?? null,
    executionPolicy: context?.executionPolicy ?? "read_only",
    capability,
    decision: allowed ? "allow_once" : "cancelled",
    ...details,
  }, "ACP_KIMI_CAPABILITY DECISION");
}
