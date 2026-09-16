export type AcpKimiOperationAuditStatus = "started" | "completed" | "failed" | "timed_out";

export interface AcpKimiOperationAudit {
  sessionId: string;
  actionRunId: string;
  permissionProfileId: string;
  permissionProfileVersion: string;
  ruleId: string;
  status: AcpKimiOperationAuditStatus;
  exitCode: number | null;
  signal: string | null;
  updatedAt: string;
}

export interface AcpKimiOperationAuditStore {
  record(input: Omit<AcpKimiOperationAudit, "updatedAt">): void;
  get(input: Pick<AcpKimiOperationAudit, "sessionId" | "actionRunId" | "ruleId">): AcpKimiOperationAudit | undefined;
}

const MAX_AUDITS = 1_024;

export function createInMemoryAcpKimiOperationAuditStore(): AcpKimiOperationAuditStore {
  const records = new Map<string, AcpKimiOperationAudit>();
  return {
    record(input) {
      const key = auditKey(input);
      records.delete(key);
      records.set(key, { ...input, updatedAt: new Date().toISOString() });
      while (records.size > MAX_AUDITS) {
        const oldest = records.keys().next().value;
        if (typeof oldest !== "string") break;
        records.delete(oldest);
      }
    },
    get(input) {
      return records.get(auditKey(input));
    },
  };
}

function auditKey(input: Pick<AcpKimiOperationAudit, "sessionId" | "actionRunId" | "ruleId">): string {
  return `${input.sessionId}\0${input.actionRunId}\0${input.ruleId}`;
}

export const acpKimiOperationAuditStore = createInMemoryAcpKimiOperationAuditStore();
