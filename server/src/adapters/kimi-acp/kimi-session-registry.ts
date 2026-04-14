import type { KimiAcpSessionRuntime } from "./kimi-acp-runtime.js";

export interface KimiSessionRecord {
  sessionId: string;
  operatorLarkId: string;
  runtime: KimiAcpSessionRuntime;
  busy: boolean;
}

export interface KimiSessionRegistry {
  get(sessionId: string): KimiSessionRecord | undefined;
  set(record: KimiSessionRecord): void;
  touch(sessionId: string): void;
  delete(sessionId: string): Promise<void>;
}
