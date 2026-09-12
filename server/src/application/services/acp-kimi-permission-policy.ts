import type {
  CreateTerminalRequest,
  ReadTextFileRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { getAcpKimiPermissionProfile, type AcpKimiPermissionProfileId } from "../../domain/acp-kimi-permission-profile.js";
import { logger } from "../../logger.js";
import {
  acpKimiOperationAuditStore,
  type AcpKimiOperationAuditStatus,
  type AcpKimiOperationAuditStore,
} from "./acp-kimi-operation-audit.js";

const permissionLogger = logger.child({ module: "acp-kimi-permission-policy" });
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_TERMINAL_OUTPUT_BYTES = 256 * 1024;
const TERMINAL_TIMEOUT_MS = 60_000;
const SUPPORT_QA_SCRIPT = ".agents/skills/write-support-qa/scripts/octo-ticket-evidence.sh";

export interface AcpKimiPermissionContext {
  actionKey?: string | null;
  permissionProfileId?: AcpKimiPermissionProfileId | null;
  permissionProfileVersion?: string | null;
  workspaceDir?: string | null;
  scratchDir?: string | null;
  skillProfile?: string | null;
  skillId?: string | null;
  ticketNumber?: string | null;
  ticketRecordId?: string | null;
  actionRunId?: string | null;
  legacySession?: boolean;
}

export type AcpKimiPermissionHandler = (params: RequestPermissionRequest) => Promise<RequestPermissionResponse>;

export interface AcpKimiTerminalAuthorization {
  executable: string;
  args: string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  ruleId: string;
  timeoutMs: number;
  outputByteLimit: number;
}

export interface AcpKimiClientCapabilityPolicy {
  readonly canReadTextFile: boolean;
  readonly canWriteTextFile: boolean;
  readonly canUseTerminal: boolean;
  readonly permissionUpgradeRequired: boolean;
  authorizeTerminal(params: CreateTerminalRequest): Promise<AcpKimiTerminalAuthorization | undefined>;
  allowsReadTextFile(params: ReadTextFileRequest): Promise<boolean>;
  allowsWriteTextFile(params: WriteTextFileRequest): Promise<boolean>;
  recordTerminalAudit(input: {
    sessionId: string;
    ruleId: string;
    status: AcpKimiOperationAuditStatus;
    exitCode: number | null;
    signal: string | null;
  }): void;
}

export class AcpKimiCapabilityError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "AcpKimiCapabilityError";
  }
}

const CANCELLED: RequestPermissionResponse = { outcome: { outcome: "cancelled" } };

export function buildAcpKimiScratchDir(actionRunId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(actionRunId)) {
    throw new AcpKimiCapabilityError("ACP_ACTION_RUN_ID_INVALID", "Action run id is not safe for a temporary directory.");
  }
  return join(tmpdir(), "octo-support-qa", actionRunId);
}

export async function ensureAcpKimiScratchDir(actionRunId: string): Promise<string> {
  const scratchRoot = join(tmpdir(), "octo-support-qa");
  const scratchDir = buildAcpKimiScratchDir(actionRunId);
  await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
  const root = await safeDirectoryRealpath(scratchRoot);
  if (!root) {
    throw new AcpKimiCapabilityError("ACP_SCRATCH_DIR_INVALID", "Support-QA scratch root is not a trusted directory.");
  }
  await mkdir(scratchDir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const resolved = await safeDirectoryRealpath(scratchDir);
  if (!resolved || relative(root, resolved) !== actionRunId) {
    throw new AcpKimiCapabilityError("ACP_SCRATCH_DIR_INVALID", "Action scratch directory failed realpath or symlink validation.");
  }
  await chmod(resolved, 0o700);
  return resolved;
}

export function createAcpKimiPermissionHandler(context: AcpKimiPermissionContext | undefined): AcpKimiPermissionHandler {
  return async (params) => {
    const toolName = params.toolCall.title?.trim() ?? "";
    const profile = resolveContextProfile(context);
    const allowed = Boolean(profile) && (
      isReadTool(toolName) && profile!.allowRead
      || isWriteTool(toolName) && profile!.allowWrite
      || isBashTool(toolName) && profile!.allowTerminal
    );
    const allowOnce = allowed ? params.options.find((option) => option.kind === "allow_once") : undefined;
    permissionLogger.info({
      sessionId: params.sessionId,
      actionKey: context?.actionKey ?? null,
      permissionProfileId: context?.permissionProfileId ?? null,
      permissionProfileVersion: context?.permissionProfileVersion ?? null,
      toolName,
      decision: allowOnce ? "allow_once" : "cancelled",
      reason: allowOnce
        ? "capability_requires_operation_guard"
        : context?.legacySession
          ? "session_permission_upgrade_required"
          : allowed
            ? "allow_once_not_offered"
            : "profile_denied",
      offeredOptionKinds: params.options.map((option) => option.kind),
    }, "ACP_KIMI_PERMISSION DECISION");
    return allowOnce ? { outcome: { outcome: "selected", optionId: allowOnce.optionId } } : CANCELLED;
  };
}

/** Return an allow-once response only for a fully verified Hermes edit.
 * Undefined deliberately falls back to the normal interactive/background permission flow. */
export async function tryAutoApproveAcpHermesEdit(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
): Promise<RequestPermissionResponse | undefined> {
  const edit = extractAcpHermesEdit(params, context);
  const allowOnce = params.options.find((option) => option.kind === "allow_once");
  if (!edit || !allowOnce) return undefined;

  const contentLength = Buffer.byteLength(edit.content, "utf8");
  const allowed = Boolean(resolveContextProfile(context)?.allowWrite && context)
    && isValidUtf8Text(edit.content)
    && contentLength <= MAX_WRITE_BYTES
    && await isAllowedWritePath(edit.path, context!);
  if (!allowed) {
    logHermesEditDecision(params, context, edit, false, "write_policy_denied", contentLength);
    return undefined;
  }
  if (edit.tool === "patch" && edit.oldText !== await readFile(edit.path, "utf8").catch(() => undefined)) {
    logHermesEditDecision(params, context, edit, false, "source_content_changed", contentLength);
    return undefined;
  }

  logHermesEditDecision(params, context, edit, true, "safe_structured_edit", contentLength);
  return { outcome: { outcome: "selected", optionId: allowOnce.optionId } };
}

export function createAcpKimiClientCapabilityPolicy(
  context: AcpKimiPermissionContext | undefined,
  auditStore: AcpKimiOperationAuditStore = acpKimiOperationAuditStore,
): AcpKimiClientCapabilityPolicy {
  const profile = resolveContextProfile(context);
  return {
    canReadTextFile: Boolean(profile?.allowRead),
    canWriteTextFile: Boolean(profile?.allowWrite),
    canUseTerminal: Boolean(profile?.allowTerminal),
    permissionUpgradeRequired: Boolean(context?.legacySession),
    async authorizeTerminal(params) {
      const authorization = profile?.allowTerminal && context ? await authorizeTerminalRequest(params, context) : undefined;
      logCapabilityDecision("terminal", params.sessionId, context, Boolean(authorization), { ruleId: authorization?.ruleId ?? null });
      return authorization;
    },
    async allowsReadTextFile(params) {
      const allowed = Boolean(profile?.allowRead && context) && await isAllowedReadPath(params.path, context!);
      logCapabilityDecision("fs.read", params.sessionId, context, allowed, { pathScope: describePathScope(params.path, context) });
      return allowed;
    },
    async allowsWriteTextFile(params) {
      const contentLength = Buffer.byteLength(params.content, "utf8");
      const allowed = Boolean(profile?.allowWrite && context)
        && isValidUtf8Text(params.content)
        && contentLength <= MAX_WRITE_BYTES
        && await isAllowedWritePath(params.path, context!);
      logCapabilityDecision("fs.write", params.sessionId, context, allowed, {
        pathScope: describePathScope(params.path, context),
        contentLength,
      });
      return allowed;
    },
    recordTerminalAudit(input) {
      if (!context?.actionRunId || !context.permissionProfileId || !context.permissionProfileVersion) return;
      auditStore.record({
        ...input,
        actionRunId: context.actionRunId,
        permissionProfileId: context.permissionProfileId,
        permissionProfileVersion: context.permissionProfileVersion,
      });
      permissionLogger.info({
        sessionId: input.sessionId,
        actionRunId: context.actionRunId,
        permissionProfileId: context.permissionProfileId,
        permissionProfileVersion: context.permissionProfileVersion,
        ruleId: input.ruleId,
        status: input.status,
        exitCode: input.exitCode,
        signal: input.signal,
      }, "ACP_KIMI_TERMINAL AUDIT");
    },
  };
}

export function extractAcpKimiRawCommand(rawInput: unknown): string | undefined {
  if (typeof rawInput === "string") return rawInput;
  const raw = asRecord(rawInput);
  return typeof raw?.command === "string" ? raw.command : typeof raw?.input === "string" ? raw.input : undefined;
}

export function isAcpKimiSupportQaFetchCommand(
  command: string,
  context: Pick<AcpKimiPermissionContext, "ticketNumber">,
): boolean {
  const tokens = parseStrictCommand(command);
  return Boolean(tokens && isSupportQaFetchTokens(tokens, context));
}

async function authorizeTerminalRequest(
  params: CreateTerminalRequest,
  context: AcpKimiPermissionContext,
): Promise<AcpKimiTerminalAuthorization | undefined> {
  if (!context.workspaceDir || !context.scratchDir || !context.actionRunId || params.env?.length) return undefined;
  const workspaceDir = await safeDirectoryRealpath(context.workspaceDir);
  const scratchDir = await resolveContextScratchDir(context);
  const cwd = await safeDirectoryRealpath(params.cwd ?? context.workspaceDir);
  if (!workspaceDir || !scratchDir || !cwd || cwd !== workspaceDir) return undefined;
  const tokens = normalizeTerminalTokens(params.command, params.args ?? []);
  if (!tokens) return undefined;
  const matched = await matchTerminalRule(tokens, context, workspaceDir);
  if (!matched) return undefined;
  const larkCli = matched.ruleId === "support_qa.fetch" ? await resolveLarkCliExecutable() : undefined;
  return {
    ...matched,
    cwd: workspaceDir,
    env: {
      OCTO_SUPPORT_QA_ACTION_DIR: scratchDir,
      OCTO_SUPPORT_QA_NODE: process.execPath,
      ...(larkCli ? { OCTO_SUPPORT_QA_LARK_CLI: larkCli } : {}),
    },
    timeoutMs: TERMINAL_TIMEOUT_MS,
    outputByteLimit: Math.min(Math.max(0, params.outputByteLimit ?? MAX_TERMINAL_OUTPUT_BYTES), MAX_TERMINAL_OUTPUT_BYTES),
  };
}

async function matchTerminalRule(
  tokens: string[],
  context: AcpKimiPermissionContext,
  workspaceDir: string,
): Promise<Pick<AcpKimiTerminalAuthorization, "executable" | "args" | "ruleId"> | undefined> {
  const program = basename(tokens[0] ?? "");
  if (program === "bash" && isSupportQaFetchTokens(tokens, context)) {
    const script = await resolveTrustedWorkspaceFile(workspaceDir, SUPPORT_QA_SCRIPT);
    return script ? { executable: "/bin/bash", args: [script, ...tokens.slice(2)], ruleId: "support_qa.fetch" } : undefined;
  }
  if (program === "bash" && isSupportQaFetchRecordTokens(tokens, context)) {
    const script = await resolveTrustedWorkspaceFile(workspaceDir, SUPPORT_QA_SCRIPT);
    return script ? { executable: "/bin/bash", args: [script, ...tokens.slice(2)], ruleId: "support_qa.fetch_record" } : undefined;
  }
  if (program === "git" && tokens.length === 3 && tokens[1] === "status" && tokens[2] === "--short") {
    const executable = await resolveExecutable("git");
    return executable ? { executable, args: tokens.slice(1), ruleId: "support_qa.repo_status" } : undefined;
  }
  return undefined;
}

function isSupportQaFetchTokens(tokens: string[], context: Pick<AcpKimiPermissionContext, "ticketNumber">): boolean {
  return basename(tokens[0] ?? "") === "bash"
    && tokens[1] === SUPPORT_QA_SCRIPT
    && tokens[2] === "fetch"
    && tokens[3] === context.ticketNumber
    && tokens[4] === "--json"
    && tokens.length === 5;
}

function isSupportQaFetchRecordTokens(tokens: string[], context: Pick<AcpKimiPermissionContext, "ticketRecordId">): boolean {
  return basename(tokens[0] ?? "") === "bash"
    && tokens[1] === SUPPORT_QA_SCRIPT
    && tokens[2] === "fetch-record"
    && tokens[3] === context.ticketRecordId
    && tokens[4] === "--json"
    && tokens.length === 5;
}

function normalizeTerminalTokens(command: string, args: string[]): string[] | undefined {
  if (!command || args.some(hasUnsafeArgument)) return undefined;
  const program = basename(command);
  if ((program === "bash" || program === "zsh") && args.length === 2 && args[0] === "-lc") return parseStrictCommand(args[1]!);
  if (args.length === 0 && /\s/.test(command)) return parseStrictCommand(command);
  if (/\s/.test(command) || hasUnsafeArgument(command)) return undefined;
  return [command, ...args];
}

function parseStrictCommand(command: string): string[] | undefined {
  if (!command || /[\0\r\n;&|><`$()\\*?\[\]{}~#]/.test(command)) return undefined;
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else token += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else {
      token += char;
    }
  }
  if (quote) return undefined;
  if (token) tokens.push(token);
  return tokens.length ? tokens : undefined;
}

function hasUnsafeArgument(value: string): boolean {
  return /[\0\r\n]/.test(value);
}

async function isAllowedReadPath(path: string, context: AcpKimiPermissionContext): Promise<boolean> {
  const scratchDir = await resolveContextScratchDir(context);
  if (scratchDir && await isAllowedExistingFile(path, scratchDir)) return true;
  if (!context.workspaceDir) return false;
  const relativePath = await existingRelativePath(path, context.workspaceDir);
  if (!relativePath || isSensitiveRelativePath(relativePath)) return false;
  return relativePath === "docs/llm-wiki" || relativePath.startsWith("docs/llm-wiki/")
    || relativePath.startsWith("docs/ai-dev/lifecycle/")
    || relativePath.startsWith(".agents/skills/query-support-qa/")
    || relativePath.startsWith(".agents/skills/write-support-qa/");
}

async function isAllowedWritePath(path: string, context: AcpKimiPermissionContext): Promise<boolean> {
  const scratchDir = await resolveContextScratchDir(context);
  if (scratchDir && await isAllowedWritableFile(path, scratchDir)) return true;
  if (!context.workspaceDir) return false;
  const relativePath = await writableRelativePath(path, context.workspaceDir);
  if (!relativePath) return false;
  // query-support-qa knowledge loop is available to both Support-QA profiles;
  // full wiki authoring stays document-preview-only.
  if (isAllowedQueryLoopRelativePath(relativePath)) return true;
  if (context.permissionProfileId !== "support-qa.document.v1") return false;
  return isAllowedDocumentRelativePath(relativePath);
}

function isAllowedQueryLoopRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.includes("..") || isSensitiveRelativePath(normalized)) return false;
  if (normalized === "docs/llm-wiki/log.md") return true;
  return /^docs\/llm-wiki\/queries\/[^/]+\.md$/.test(normalized);
}

function isAllowedDocumentRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.includes("..") || isSensitiveRelativePath(normalized)) return false;
  if (normalized === "docs/llm-wiki/index.md" || normalized === "docs/llm-wiki/log.md") return true;
  if (normalized === "docs/llm-wiki/_meta/state.jsonl") return true;
  if (normalized.startsWith("docs/llm-wiki/raw/transcripts/") && /^ticket-[A-Za-z0-9._-]+\.md$/.test(normalized.split("/").pop() ?? "")) return true;
  if (normalized.startsWith("docs/llm-wiki/concepts/") && extname(normalized) === ".md") return true;
  return normalized.startsWith("docs/llm-wiki/entities/") && extname(normalized) === ".md";
}

type AcpHermesEdit = {
  tool: "patch" | "write_file";
  path: string;
  content: string;
  oldText?: string;
};

function extractAcpHermesEdit(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
): AcpHermesEdit | undefined {
  if (params.toolCall.kind !== "edit" || !context?.workspaceDir) return undefined;
  const rawInput = asRecord(params.toolCall.rawInput);
  const tool = rawInput?.tool;
  const args = asRecord(rawInput?.arguments);
  if ((tool !== "patch" && tool !== "write_file") || !args) return undefined;

  const rawPath = typeof args.path === "string" ? args.path : undefined;
  const content = params.toolCall.content;
  const diff = content?.length === 1 ? asRecord(content[0]) : undefined;
  if (!rawPath || diff?.type !== "diff" || typeof diff.path !== "string" || typeof diff.newText !== "string") return undefined;

  const path = resolveEditPath(rawPath, context.workspaceDir);
  const diffPath = resolveEditPath(diff.path, context.workspaceDir);
  if (!path || path !== diffPath) return undefined;

  if (tool === "write_file") {
    return typeof args.content === "string" && args.content === diff.newText
      ? { tool, path, content: diff.newText }
      : undefined;
  }

  const mode = args.mode ?? "replace";
  if (mode !== "replace"
    || typeof args.old_string !== "string"
    || typeof args.new_string !== "string"
    || typeof diff.oldText !== "string"
    || args.replace_all !== undefined && typeof args.replace_all !== "boolean") return undefined;
  if (!args.old_string.length) return undefined;
  const parts = diff.oldText.split(args.old_string);
  if (parts.length < 2 || !args.replace_all && parts.length !== 2) return undefined;
  if (parts.join(args.new_string) !== diff.newText) return undefined;
  return { tool, path, content: diff.newText, oldText: diff.oldText };
}

function resolveEditPath(path: string, workspaceDir: string): string | undefined {
  if (!path || path.includes("\0")) return undefined;
  return resolve(isAbsolute(path) ? path : resolve(workspaceDir, path));
}

async function existingRelativePath(path: string, root: string): Promise<string | undefined> {
  const rootPath = await safeDirectoryRealpath(root);
  const candidate = rootPath && await safeRealpath(isAbsolute(path) ? path : resolve(rootPath, path));
  if (!rootPath || !candidate) return undefined;
  const relativePath = relative(rootPath, candidate).replaceAll("\\", "/");
  if (!isWithinRoot(relativePath)) return undefined;
  const stat = await lstat(candidate).catch(() => undefined);
  return stat?.isFile() && !stat.isSymbolicLink() ? relativePath : undefined;
}

async function writableRelativePath(path: string, root: string): Promise<string | undefined> {
  const rootPath = await safeDirectoryRealpath(root);
  if (!rootPath) return undefined;
  const requestedPath = resolve(isAbsolute(path) ? path : resolve(rootPath, path));
  const parent = await safeRealpath(dirname(requestedPath));
  if (!parent) return undefined;
  const candidate = resolve(parent, basename(requestedPath));
  const relativePath = relative(rootPath, candidate).replaceAll("\\", "/");
  if (!isWithinRoot(relativePath)) return undefined;
  const stat = await lstat(candidate).catch(() => undefined);
  return !stat || stat.isFile() && !stat.isSymbolicLink() ? relativePath : undefined;
}

async function isAllowedExistingFile(path: string, root: string, extension?: string): Promise<boolean> {
  const relativePath = await existingRelativePath(path, root);
  return Boolean(relativePath && (!extension || extname(relativePath) === extension));
}

async function isAllowedWritableFile(path: string, root: string): Promise<boolean> {
  const relativePath = await writableRelativePath(path, root);
  return Boolean(relativePath && !isSensitiveRelativePath(relativePath));
}

async function resolveTrustedWorkspaceFile(root: string, relativePath: string): Promise<string | undefined> {
  const rootPath = await safeDirectoryRealpath(root);
  if (!rootPath) return undefined;
  const requested = resolve(rootPath, relativePath);
  const requestedStat = await lstat(requested).catch(() => undefined);
  if (!requestedStat?.isFile() || requestedStat.isSymbolicLink()) return undefined;
  const candidate = await safeRealpath(requested);
  if (!rootPath || !candidate || relative(rootPath, candidate).startsWith("..")) return undefined;
  const stat = await lstat(candidate).catch(() => undefined);
  return stat?.isFile() && !stat.isSymbolicLink() ? candidate : undefined;
}

async function resolveExecutable(name: "git"): Promise<string | undefined> {
  for (const directory of ["/usr/bin", "/bin", "/usr/local/bin"]) {
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Try the next fixed system path.
    }
  }
  return undefined;
}

async function resolveLarkCliExecutable(): Promise<string | undefined> {
  for (const directory of [dirname(process.execPath), "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"]) {
    const candidate = join(directory, "lark-cli");
    try {
      await access(candidate, constants.X_OK);
      const trustedRoot = await realpath(join(directory, ".."));
      const resolved = await realpath(candidate);
      const relativePath = relative(trustedRoot, resolved);
      const metadata = await lstat(resolved);
      if (isWithinRoot(relativePath) && metadata.isFile() && !metadata.isSymbolicLink()) return resolved;
    } catch {
      // Try the next Server-owned executable search path.
    }
  }
  return undefined;
}

function resolveContextProfile(context: AcpKimiPermissionContext | undefined) {
  const profile = getAcpKimiPermissionProfile(context?.permissionProfileId);
  if (!profile
    || context?.permissionProfileVersion !== profile.version
    || !context.actionKey
    || !(profile.actionKeys as readonly string[]).includes(context.actionKey)) return undefined;
  return profile;
}

async function safeRealpath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

async function safeDirectoryRealpath(path: string): Promise<string | undefined> {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return undefined;
  return safeRealpath(path);
}

async function resolveContextScratchDir(context: AcpKimiPermissionContext): Promise<string | undefined> {
  if (!context.scratchDir || !context.actionRunId) return undefined;
  const scratchDir = await safeDirectoryRealpath(context.scratchDir);
  const expected = await safeDirectoryRealpath(buildAcpKimiScratchDir(context.actionRunId));
  return scratchDir && scratchDir === expected ? scratchDir : undefined;
}

function isWithinRoot(relativePath: string): boolean {
  return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith("../") && !isAbsolute(relativePath);
}

function isSensitiveRelativePath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const fileName = basename(relativePath).toLowerCase();
  const sensitiveExtension = new Set([".pem", ".key", ".p12", ".pfx", ".crt", ".cer"]);
  return segments.some((segment) => segment === ".git" || segment === ".ssh" || segment === ".aws" || segment === ".gnupg")
    || fileName.startsWith(".env")
    || fileName === ".npmrc"
    || fileName === ".netrc"
    || fileName === "authorized_keys"
    || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/.test(fileName)
    || fileName.includes("credential")
    || sensitiveExtension.has(extname(fileName));
}

function isValidUtf8Text(content: string): boolean {
  return !content.includes("\0") && Buffer.from(content, "utf8").toString("utf8") === content;
}

function describePathScope(path: string, context: AcpKimiPermissionContext | undefined): string {
  for (const [name, root] of [["action_scratch", context?.scratchDir], ["support_workspace", context?.workspaceDir]] as const) {
    if (!root) continue;
    const relativePath = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
    if (relativePath === "" || isWithinRoot(relativePath)) return `${name}:${relativePath || "."}`;
  }
  return "outside_allowed_roots";
}

function isReadTool(title: string): boolean {
  return /^(read|readfile|read_file)(?:\b|:)/i.test(title);
}

function isWriteTool(title: string): boolean {
  return /^(write|writefile|write_file|applypatch|apply_patch|strreplacefile)(?:\b|:)/i.test(title);
}

function isBashTool(title: string): boolean {
  return /^(bash)(?:\b|:)/i.test(title);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
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
    permissionProfileId: context?.permissionProfileId ?? null,
    permissionProfileVersion: context?.permissionProfileVersion ?? null,
    capability,
    decision: allowed ? "allow_once" : "cancelled",
    ...details,
  }, "ACP_KIMI_CAPABILITY DECISION");
}

function logHermesEditDecision(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
  edit: AcpHermesEdit,
  allowed: boolean,
  reason: string,
  contentLength: number,
): void {
  permissionLogger.info({
    sessionId: params.sessionId,
    actionKey: context?.actionKey ?? null,
    permissionProfileId: context?.permissionProfileId ?? null,
    permissionProfileVersion: context?.permissionProfileVersion ?? null,
    toolName: edit.tool,
    pathScope: describePathScope(edit.path, context),
    contentLength,
    decision: allowed ? "allow_once" : "manual_approval",
    reason,
  }, "ACP_HERMES_EDIT_PERMISSION DECISION");
}
