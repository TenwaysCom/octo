import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { AutomationExecutionPolicy } from "../../modules/public-config/public-config.controller.js";
import { logger } from "../../logger.js";

const permissionLogger = logger.child({ module: "acp-kimi-permission-policy" });

export interface AcpKimiPermissionContext {
  actionKey?: string | null;
  executionPolicy?: AutomationExecutionPolicy | null;
  workspaceDir?: string | null;
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

interface AcpKimiPermissionPolicyDeps {
  supportQaTempDir?: string;
}

const CANCELLED: RequestPermissionResponse = {
  outcome: { outcome: "cancelled" },
};
const SUPPORT_QA_TEMP_DIR = "/tmp/support-qa";

export function createAcpKimiPermissionHandler(
  context: AcpKimiPermissionContext | undefined,
  deps: AcpKimiPermissionPolicyDeps = {},
): AcpKimiPermissionHandler {
  const supportQaTempDir = deps.supportQaTempDir ?? SUPPORT_QA_TEMP_DIR;
  return async (params) => {
    const policy = context?.executionPolicy ?? "read_only";
    const allowed = policy === "shell"
      ? await allowsReadOnlyShell(params, context, supportQaTempDir)
      : policy === "write+shell"
        ? await allowsReadOnlyShell(params, context, supportQaTempDir)
          || await allowsRestrictedWrite(params, context, supportQaTempDir)
        : false;
    const allowOnce = allowed
      ? params.options.find((option) => option.kind === "allow_once")
      : undefined;

    permissionLogger.info({
      sessionId: params.sessionId,
      actionKey: context?.actionKey ?? null,
      executionPolicy: policy,
      toolName: getToolName(params.toolCall.title),
      decision: allowOnce ? "allow_once" : "cancelled",
      reason: allowOnce
        ? "policy_match"
        : allowed
          ? "allow_once_not_offered"
          : policy === "full"
            ? "interactive_confirmation_required"
            : "policy_denied",
      offeredOptionKinds: params.options.map((option) => option.kind),
    }, "ACP_KIMI_PERMISSION DECISION");

    return allowOnce
      ? { outcome: { outcome: "selected", optionId: allowOnce.optionId } }
      : CANCELLED;
  };
}

async function allowsReadOnlyShell(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
  supportQaTempDir: string,
): Promise<boolean> {
  if (!isShellTool(params.toolCall.title)) {
    return false;
  }
  const command = getToolCommand(params.toolCall);
  const tokens = command ? parseShellTokens(command) : undefined;
  if (!tokens || !context?.workspaceDir) {
    return false;
  }
  return isSupportQaFetchTokens(tokens, context)
    || await allowsReadFile(tokens, context, supportQaTempDir);
}

async function allowsRestrictedWrite(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
  supportQaTempDir: string,
): Promise<boolean> {
  const command = getToolCommand(params.toolCall);
  if (isShellTool(params.toolCall.title)) {
    const tokens = command ? parseShellTokens(command) : undefined;
    if (!tokens || !context?.workspaceDir) {
      return false;
    }
    return await allowsUpdate(tokens, context, supportQaTempDir)
      || await allowsAnalysisUpdate(tokens, context, supportQaTempDir);
  }

  const path = getWritePath(params.toolCall);
  if (!path || !isWriteTool(params.toolCall.title ?? "") || !context?.workspaceDir) {
    return false;
  }
  return context.skillId === "support_qa_write"
    && (isAllowedPath(path, context.workspaceDir, ["docs/support-qa/"])
      || await isAllowedSupportQaTempJson(path, supportQaTempDir, false))
    || isSummaryAnalysisContext(context)
      && path === buildSupportAnalysisUpdatePath(context, supportQaTempDir)
      && await isAllowedSupportQaTempJson(path, supportQaTempDir, false);
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
  context: Pick<AcpKimiPermissionContext, "actionKey" | "skillId" | "ticketRecordId" | "actionRunId">,
  supportQaTempDir = SUPPORT_QA_TEMP_DIR,
): boolean {
  const tokens = parseShellTokens(command);
  return Boolean(tokens && isSupportAnalysisUpdateTokens(tokens, context, supportQaTempDir));
}

export function buildSupportAnalysisUpdatePath(
  context: Pick<AcpKimiPermissionContext, "ticketRecordId" | "actionRunId">,
  supportQaTempDir = SUPPORT_QA_TEMP_DIR,
): string | undefined {
  if (!context.ticketRecordId || !context.actionRunId) return undefined;
  const key = createHash("sha256")
    .update(`${context.ticketRecordId}:${context.actionRunId}`)
    .digest("hex")
    .slice(0, 24);
  return resolve(supportQaTempDir, `support-analysis-${key}.json`);
}

function isSupportQaFetchTokens(
  tokens: string[],
  context: Pick<AcpKimiPermissionContext, "ticketNumber">,
): boolean {
  const [shell, script, operation, ticketNumber, output] = tokens;
  return shell === "bash"
    && script === ".agents/skills/write-support-qa/scripts/write-support-qa.sh"
    && operation === "fetch"
    && Boolean(ticketNumber)
    && ticketNumber === context.ticketNumber
    && output === "--json"
    && tokens.length === 5;
}

async function allowsUpdate(
  tokens: string[],
  context: AcpKimiPermissionContext,
  supportQaTempDir: string,
): Promise<boolean> {
  const [shell, script, operation, updateFile, ...options] = tokens;
  if (shell !== "bash"
    || script !== ".agents/skills/write-support-qa/scripts/write-support-qa.sh"
    || operation !== "update"
    || !updateFile
    || context.skillId !== "support_qa_write"
    || !await isAllowedSupportQaTempJson(updateFile, supportQaTempDir, true)) {
    return false;
  }
  return options.length > 0
    && options.every((option) => option === "--json" || option === "--dry-run")
    && options.includes("--json");
}

async function allowsAnalysisUpdate(
  tokens: string[],
  context: AcpKimiPermissionContext,
  supportQaTempDir: string,
): Promise<boolean> {
  if (!isSupportAnalysisUpdateTokens(tokens, context, supportQaTempDir)) return false;
  const updateFile = tokens[3];
  return Boolean(updateFile && await isAllowedSupportQaTempJson(updateFile, supportQaTempDir, true));
}

function isSupportAnalysisUpdateTokens(
  tokens: string[],
  context: Pick<AcpKimiPermissionContext, "actionKey" | "skillId" | "ticketRecordId" | "actionRunId">,
  supportQaTempDir: string,
): boolean {
  const [shell, script, operation, updateFile, output] = tokens;
  return shell === "bash"
    && script === ".agents/skills/write-support-qa/scripts/write-support-qa.sh"
    && operation === "analysis-update"
    && updateFile === buildSupportAnalysisUpdatePath(context, supportQaTempDir)
    && output === "--json"
    && tokens.length === 5
    && isSummaryAnalysisContext(context);
}

function isSummaryAnalysisContext(
  context: Pick<AcpKimiPermissionContext, "actionKey" | "skillId" | "ticketRecordId" | "actionRunId">,
): boolean {
  return context.actionKey === "lark-ticket-support-qa-summarize"
    && context.skillId === "support_qa_query"
    && Boolean(context.ticketRecordId)
    && Boolean(context.actionRunId);
}

async function allowsReadFile(
  tokens: string[],
  context: AcpKimiPermissionContext,
  supportQaTempDir: string,
): Promise<boolean> {
  const [program, ...args] = tokens;
  if (!program || args.length === 0) {
    return false;
  }
  if (program === "cat" || program === "head" || program === "tail") {
    return args.length === 1
      && await isAllowedReadPath(args[0], context, supportQaTempDir);
  }
  if (program === "sed") {
    return args.length === 3
      && args[0] === "-n"
      && /^\d+(,\d+)?p$/.test(args[1])
      && await isAllowedReadPath(args[2], context, supportQaTempDir);
  }
  if (program === "ls") {
    const path = args.at(-1);
    const options = args.slice(0, -1);
    return path !== undefined
      && options.every(isAllowedLsOption)
      && await isAllowedReadPath(path, context, supportQaTempDir);
  }
  if (program === "grep") {
    const pattern = args.at(-2);
    const path = args.at(-1);
    const options = args.slice(0, -2);
    if (!pattern || !path || pattern.startsWith("-")
      || !options.every((option) => ALLOWED_GREP_OPTIONS.has(option))) {
      return false;
    }
    return isAllowedReadPath(path, context, supportQaTempDir);
  }
  if (program === "rg") {
    const pattern = args.at(-2);
    const path = args.at(-1);
    const options = args.slice(0, -2);
    if (!pattern || !path || pattern.startsWith("-")
      || !options.every((option) => ALLOWED_RG_OPTIONS.has(option))) {
      return false;
    }
    return isAllowedReadPath(path, context, supportQaTempDir);
  }
  return false;
}

async function isAllowedReadPath(
  path: string,
  context: AcpKimiPermissionContext,
  supportQaTempDir: string,
): Promise<boolean> {
  return isAllowedPath(path, context.workspaceDir!, readRoots(context))
    || await isAllowedSupportQaTempJson(path, supportQaTempDir, true);
}

function readRoots(context: AcpKimiPermissionContext): string[] {
  const roots = [
    ".agents/skills/query-support-qa/",
    ".agents/skills/write-support-qa/",
    "docs/support-qa/",
  ];
  return context.skillId === "support_qa_query"
    ? roots.filter((root) => root !== ".agents/skills/write-support-qa/")
    : roots;
}

function getToolCommand(toolCall: RequestPermissionRequest["toolCall"]): string | undefined {
  const rawCommand = extractAcpKimiRawCommand(toolCall.rawInput);
  const contentCommands = (toolCall.content ?? []).flatMap((item) => {
    const record = asRecord(item);
    const content = asRecord(record?.content);
    const text = record?.type === "content" && content?.type === "text"
      ? content.text
      : undefined;
    if (typeof text !== "string") {
      return [];
    }
    const match = text.match(/^Requesting approval to perform: Run command `([^`\r\n]+)`$/);
    return match ? [match[1]] : [];
  });
  const uniqueContentCommands = [...new Set(contentCommands)];
  if (uniqueContentCommands.length > 1
    || rawCommand && uniqueContentCommands.length === 1 && rawCommand !== uniqueContentCommands[0]) {
    return undefined;
  }
  return rawCommand ?? uniqueContentCommands[0];
}

export function extractAcpKimiRawCommand(rawInput: unknown): string | undefined {
  if (typeof rawInput === "string") {
    return rawInput;
  }
  const raw = asRecord(rawInput);
  return typeof raw?.command === "string"
    ? raw.command
    : typeof raw?.input === "string"
      ? raw.input
      : undefined;
}

function getWritePath(toolCall: RequestPermissionRequest["toolCall"]): string | undefined {
  const contentPaths = (toolCall.content ?? []).flatMap((item) => {
    const record = asRecord(item);
    return record?.type === "diff" && typeof record.path === "string"
      ? [record.path]
      : [];
  });
  const uniqueContentPaths = [...new Set(contentPaths)];
  if (uniqueContentPaths.length > 1) {
    return undefined;
  }
  if (uniqueContentPaths.length === 1) {
    return uniqueContentPaths[0];
  }
  const raw = asRecord(toolCall.rawInput);
  return typeof raw?.path === "string"
    ? raw.path
    : typeof raw?.filePath === "string"
      ? raw.filePath
      : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

const ALLOWED_GREP_OPTIONS = new Set([
  "-E",
  "-F",
  "-i",
  "-n",
  "-s",
  "-w",
  "-x",
  "--extended-regexp",
  "--fixed-strings",
  "--ignore-case",
  "--line-number",
  "--line-regexp",
  "--no-messages",
  "--word-regexp",
]);

const ALLOWED_RG_OPTIONS = new Set([
  "-F",
  "-i",
  "-n",
  "-s",
  "-w",
  "-x",
  "--case-sensitive",
  "--fixed-strings",
  "--hidden",
  "--ignore-case",
  "--line-number",
  "--line-regexp",
  "--no-filename",
  "--no-heading",
  "--with-filename",
  "--word-regexp",
]);

function isAllowedLsOption(option: string): boolean {
  return /^-[1aAlh]+$/.test(option)
    || option === "--all"
    || option === "--almost-all"
    || option === "--human-readable";
}

function parseShellTokens(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let tokenStarted = false;

  for (const character of command) {
    if (character === "\n" || character === "\r" || character === "\0") {
      return undefined;
    }
    if (quote) {
      if (character === quote) {
        quote = undefined;
        continue;
      }
      if (quote === "\"" && /[`$\\]/.test(character)) {
        return undefined;
      }
      current += character;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    if (/[;&|><`$()\\*?\[\]{}~#]/.test(character)) {
      return undefined;
    }
    current += character;
    tokenStarted = true;
  }

  if (quote) {
    return undefined;
  }
  if (tokenStarted) {
    tokens.push(current);
  }
  return tokens.length > 0 ? tokens : undefined;
}

function getToolName(title: string | null | undefined): string {
  return title?.split(":", 1)[0]?.trim() ?? "";
}

function isShellTool(title: string | null | undefined): boolean {
  return /^(bash|shell)$/i.test(getToolName(title));
}

function isWriteTool(title: string | null | undefined): boolean {
  return /^(write|writefile|write_file|applypatch|apply_patch|strreplacefile)$/i.test(getToolName(title));
}

function isAllowedPath(path: string, workspaceDir: string, roots: string[]): boolean {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(workspaceDir, path);
  const workspace = resolve(workspaceDir);
  const relativePath = relative(workspace, absolutePath).replaceAll("\\", "/");
  return relativePath !== ""
    && !relativePath.startsWith("../")
    && !isAbsolute(relativePath)
    && roots.some((root) => {
      const normalizedRoot = root.replace(/\/+$/, "");
      return relativePath === normalizedRoot
        || relativePath.startsWith(`${normalizedRoot}/`);
    });
}

async function isAllowedSupportQaTempJson(
  path: string,
  supportQaTempDir: string,
  requireExisting: boolean,
): Promise<boolean> {
  if (!isAbsolute(path) || extname(path) !== ".json") {
    return false;
  }
  const root = resolve(supportQaTempDir);
  const candidate = resolve(path);
  if (dirname(candidate) !== root) {
    return false;
  }
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return false;
    }
    try {
      const candidateStat = await lstat(candidate);
      return candidateStat.isFile() && !candidateStat.isSymbolicLink();
    } catch (error) {
      return !requireExisting && isMissingPathError(error);
    }
  } catch {
    return false;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "ENOENT";
}
