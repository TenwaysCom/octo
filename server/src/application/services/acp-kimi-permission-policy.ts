import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { isAbsolute, relative, resolve } from "node:path";
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
  policyVersion?: string | null;
}

export type AcpKimiPermissionHandler = (
  params: RequestPermissionRequest,
) => Promise<RequestPermissionResponse>;

const CANCELLED: RequestPermissionResponse = {
  outcome: { outcome: "cancelled" },
};

export function createAcpKimiPermissionHandler(
  context: AcpKimiPermissionContext | undefined,
): AcpKimiPermissionHandler {
  return async (params) => {
    const policy = context?.executionPolicy ?? "read_only";
    const allowed = policy === "shell"
      ? allowsReadOnlyShell(params, context)
      : policy === "write+shell"
        ? allowsReadOnlyShell(params, context) || allowsRestrictedWrite(params, context)
        : false;
    const allowOnce = allowed
      ? params.options.find((option) => option.kind === "allow_once")
      : undefined;

    permissionLogger.info({
      sessionId: params.sessionId,
      actionKey: context?.actionKey ?? null,
      executionPolicy: policy,
      toolTitle: params.toolCall.title,
      decision: allowOnce ? "allow_once" : "cancelled",
      reason: allowOnce ? "policy_match" : policy === "full" ? "interactive_confirmation_required" : "policy_denied",
    }, "ACP_KIMI_PERMISSION DECISION");

    return allowOnce
      ? { outcome: { outcome: "selected", optionId: allowOnce.optionId } }
      : CANCELLED;
  };
}

function allowsReadOnlyShell(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
): boolean {
  if (params.toolCall.title !== "Bash") {
    return false;
  }
  const command = getCommand(params.toolCall.rawInput);
  if (!command || hasShellControlOperator(command) || !context?.workspaceDir) {
    return false;
  }
  const tokens = command.trim().split(/\s+/);
  return allowsFetch(tokens, context)
    || allowsReadFile(tokens, context);
}

function allowsRestrictedWrite(
  params: RequestPermissionRequest,
  context: AcpKimiPermissionContext | undefined,
): boolean {
  const command = getCommand(params.toolCall.rawInput);
  if (params.toolCall.title === "Bash") {
    if (!command || hasShellControlOperator(command) || !context?.workspaceDir) {
      return false;
    }
    return allowsUpdate(command.trim().split(/\s+/), context);
  }

  const raw = asRecord(params.toolCall.rawInput);
  const path = typeof raw?.path === "string"
    ? raw.path
    : typeof raw?.filePath === "string"
      ? raw.filePath
      : undefined;
  return Boolean(path
    && isWriteTool(params.toolCall.title ?? "")
    && context?.workspaceDir
    && isAllowedPath(path, context.workspaceDir, ["docs/support-qa/"]));
}

function allowsFetch(tokens: string[], context: AcpKimiPermissionContext): boolean {
  const [shell, script, operation, ticketNumber, output] = tokens;
  return shell === "bash"
    && script === ".agents/skills/write-support-qa/scripts/write-support-qa.sh"
    && operation === "fetch"
    && Boolean(ticketNumber)
    && ticketNumber === context.ticketNumber
    && output === "--json"
    && tokens.length === 5;
}

function allowsUpdate(tokens: string[], context: AcpKimiPermissionContext): boolean {
  const [shell, script, operation, updateFile, ...options] = tokens;
  if (shell !== "bash"
    || script !== ".agents/skills/write-support-qa/scripts/write-support-qa.sh"
    || operation !== "update"
    || !updateFile
    || !isAllowedPath(updateFile, context.workspaceDir!, [".octo/support-qa-sessions/"])) {
    return false;
  }
  return options.length > 0
    && options.every((option) => option === "--json" || option === "--dry-run")
    && options.includes("--json");
}

function allowsReadFile(tokens: string[], context: AcpKimiPermissionContext): boolean {
  const [program, ...args] = tokens;
  if (!program || args.length === 0) {
    return false;
  }
  if (program === "cat" || program === "head" || program === "tail") {
    return args.length === 1 && isAllowedPath(args[0], context.workspaceDir!, readRoots(context));
  }
  if (program === "sed") {
    return args.length === 3
      && args[0] === "-n"
      && /^\d+(,\d+)?p$/.test(args[1])
      && isAllowedPath(args[2], context.workspaceDir!, readRoots(context));
  }
  if (program === "rg") {
    const path = args.at(-1);
    return Boolean(path && isAllowedPath(path, context.workspaceDir!, readRoots(context)));
  }
  return false;
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

function getCommand(rawInput: unknown): string | undefined {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasShellControlOperator(command: string): boolean {
  return /[;&|><`$()\n\\]/.test(command) || /['"]/.test(command);
}

function isWriteTool(title: string): boolean {
  return /^(write|write_file|apply_patch)$/i.test(title);
}

function isAllowedPath(path: string, workspaceDir: string, roots: string[]): boolean {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(workspaceDir, path);
  const workspace = resolve(workspaceDir);
  const relativePath = relative(workspace, absolutePath).replaceAll("\\", "/");
  return relativePath !== ""
    && !relativePath.startsWith("../")
    && !isAbsolute(relativePath)
    && roots.some((root) => relativePath.startsWith(root));
}
