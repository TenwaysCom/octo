import type {
  PermissionOption,
  RequestPermissionRequest,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import { acpLogger } from "../../logger.js";

const permissionPolicyLogger = acpLogger.child({ module: "acp-kimi-permission-policy" });

export type RiskLevel = "high" | "medium" | "low";

export interface PermissionPolicyResult {
  riskLevel: RiskLevel;
  action: "auto_allow" | "auto_reject" | "prompt_user";
  reason: string;
}

const HIGH_RISK_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /rm\s+-rf\s+\/\s/i,
  /sudo\b/i,
  /curl\s+.*-d\b/i,
  /wget\s+.*--post-data/i,
  /bash\s+-c\s+.*curl/i,
  /eval\s*\(/i,
  /\`.*\`/,
];

const SENSITIVE_PATH_PATTERNS = [
  /~\/\.ssh\b/i,
  /~\/\.aws\b/i,
  /~\/\.kube\b/i,
  /~\/\.gnupg\b/i,
  /\/etc\/passwd\b/i,
  /\/etc\/shadow\b/i,
  /\/etc\/hosts\b/i,
  /\/etc\/(ssh|ssl)\b/i,
  /id_rsa\b/i,
  /id_ed25519\b/i,
  /\.env\b/i,
  /\.git\/config\b/i,
];

const LOW_RISK_COMMANDS = [
  /^ls\b/i,
  /^pwd\b/i,
  /^cat\b/i,
  /^grep\b/i,
  /^find\b/i,
  /^head\b/i,
  /^tail\b/i,
  /^wc\b/i,
  /^echo\b/i,
  /^which\b/i,
  /^whoami\b/i,
  /^date\b/i,
  /^uname\b/i,
  /^git\s+(status|log|diff|show)\b/i,
  /^git\s+branch\b/i,
];

function isHighRisk(toolCall: ToolCallUpdate): { highRisk: boolean; reason: string } {
  const title = toolCall.title ?? "";
  const rawInput = extractRawInputText(toolCall.rawInput);
  const textToCheck = `${title} ${rawInput}`;

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return { highRisk: true, reason: `Matches dangerous pattern: ${pattern.source}` };
    }
  }

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return { highRisk: true, reason: `Accesses sensitive path matching: ${pattern.source}` };
    }
  }

  return { highRisk: false, reason: "" };
}

function isLowRisk(toolCall: ToolCallUpdate): { lowRisk: boolean; reason: string } {
  const title = toolCall.title ?? "";
  const rawInput = extractRawInputText(toolCall.rawInput);

  // Read operations on known-safe commands are low risk
  if (toolCall.kind === "read" || toolCall.kind === "search" || toolCall.kind === "think") {
    return { lowRisk: true, reason: `Safe tool kind: ${toolCall.kind}` };
  }

  if (toolCall.kind === "execute") {
    for (const pattern of LOW_RISK_COMMANDS) {
      if (pattern.test(rawInput) || pattern.test(title)) {
        return { lowRisk: true, reason: `Known safe command matching: ${pattern.source}` };
      }
    }
  }

  return { lowRisk: false, reason: "" };
}

function extractRawInputText(rawInput: unknown): string {
  if (typeof rawInput === "string") {
    return rawInput;
  }
  if (rawInput && typeof rawInput === "object") {
    const obj = rawInput as Record<string, unknown>;
    if (typeof obj.command === "string") {
      return obj.command;
    }
    if (typeof obj.text === "string") {
      return obj.text;
    }
    if (typeof obj.query === "string") {
      return obj.query;
    }
    try {
      return JSON.stringify(rawInput);
    } catch {
      return String(rawInput);
    }
  }
  return String(rawInput ?? "");
}

export function evaluatePermissionRequest(
  request: RequestPermissionRequest,
): PermissionPolicyResult {
  const toolCall = request.toolCall;
  const title = toolCall.title ?? "Unknown operation";
  const kind = toolCall.kind ?? "other";

  permissionPolicyLogger.info(
    {
      sessionId: request.sessionId,
      toolCallId: toolCall.toolCallId,
      kind,
      title,
    },
    "PERMISSION_POLICY_EVALUATE",
  );

  // High risk: auto-reject
  const highRiskCheck = isHighRisk(toolCall);
  if (highRiskCheck.highRisk) {
    permissionPolicyLogger.warn(
      {
        sessionId: request.sessionId,
        toolCallId: toolCall.toolCallId,
        title,
        reason: highRiskCheck.reason,
      },
      "PERMISSION_POLICY_AUTO_REJECT",
    );
    return {
      riskLevel: "high",
      action: "auto_reject",
      reason: highRiskCheck.reason,
    };
  }

  // Low risk: auto-allow
  const lowRiskCheck = isLowRisk(toolCall);
  if (lowRiskCheck.lowRisk) {
    permissionPolicyLogger.info(
      {
        sessionId: request.sessionId,
        toolCallId: toolCall.toolCallId,
        title,
        reason: lowRiskCheck.reason,
      },
      "PERMISSION_POLICY_AUTO_ALLOW",
    );
    return {
      riskLevel: "low",
      action: "auto_allow",
      reason: lowRiskCheck.reason,
    };
  }

  // Medium risk: prompt user
  permissionPolicyLogger.info(
    {
      sessionId: request.sessionId,
      toolCallId: toolCall.toolCallId,
      title,
      kind,
    },
    "PERMISSION_POLICY_PROMPT_USER",
  );
  return {
    riskLevel: "medium",
    action: "prompt_user",
    reason: `Tool kind "${kind}" requires user confirmation: ${title}`,
  };
}

export function selectAutoAllowOption(
  options: PermissionOption[],
): PermissionOption | undefined {
  return options.find(
    (opt) => opt.kind === "allow_once" || opt.kind === "allow_always",
  );
}

export function selectAutoRejectOption(
  options: PermissionOption[],
): PermissionOption | undefined {
  return options.find(
    (opt) => opt.kind === "reject_once" || opt.kind === "reject_always",
  );
}
