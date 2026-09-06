import type { AcpSessionRuntime } from "../acp/acp-runtime.js";
import type { AcpKimiPermissionContext } from "../../application/services/acp-kimi-permission-policy.js";

export interface KimiSessionRecord {
  sessionId: string;
  operatorLarkId: string;
  runtime: AcpSessionRuntime;
  agentProvider?: "kimi_acp" | "hermes_acp";
  agentSessionId?: string;
  permissionContext?: AcpKimiPermissionContext;
  busy: boolean;
}

export interface KimiSessionRegistry {
  get(sessionId: string): KimiSessionRecord | undefined;
  set(record: KimiSessionRecord): void;
  touch(sessionId: string): void;
  delete(sessionId: string): Promise<void>;
}
