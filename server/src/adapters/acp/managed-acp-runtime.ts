import { randomUUID } from "node:crypto";
import { createHermesAcpSessionRuntime } from "../hermes-acp/hermes-acp-runtime.js";
import { createKimiAcpSessionRuntime } from "../kimi-acp/kimi-acp-runtime.js";
import type { AcpRuntimeOptions, AcpSessionRuntime } from "./acp-runtime.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";

export type AcpAgentProvider = "kimi_acp" | "hermes_acp";

export function resolveAcpSessionIdentity(saved: {
  sessionId: string;
  agentProvider?: AcpAgentProvider | null;
  agentSessionId?: string | null;
}) {
  return {
    agentProvider: saved.agentProvider ?? (/^hermes_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(saved.sessionId) ? "hermes_acp" : "kimi_acp"),
    // v2/v3 saved the full prefixed ID in Hermes itself. Never strip it.
    agentSessionId: saved.agentSessionId ?? saved.sessionId,
  };
}

export function mapAcpEventSession(event: AcpKimiStreamEvent, sessionId: string): AcpKimiStreamEvent {
  return "sessionId" in event.data ? { ...event, data: { ...event.data, sessionId } } as AcpKimiStreamEvent : event;
}

export async function createManagedAcpSessionRuntime(deps: AcpRuntimeOptions = {}): Promise<AcpSessionRuntime> {
  const identity = deps.sessionId ? resolveAcpSessionIdentity({ ...deps, sessionId: deps.sessionId }) : undefined;
  const agentProvider = identity?.agentProvider ?? deps.agentProvider ?? "kimi_acp";
  let sessionId = deps.sessionId ?? (agentProvider === "hermes_acp" ? `hermes_${randomUUID()}` : undefined);
  const mapEmit = (emit: (event: AcpKimiStreamEvent) => void) => (event: AcpKimiStreamEvent) => emit(sessionId ? mapAcpEventSession(event, sessionId) : event);
  const create = agentProvider === "hermes_acp" ? createHermesAcpSessionRuntime : createKimiAcpSessionRuntime;
  const native = await create({
    ...deps,
    sessionId: identity?.agentSessionId,
    emit: deps.emit ? mapEmit(deps.emit) : undefined,
    // Capability callbacks are a Kimi compatibility contract, not a native-tool sandbox.
    capabilityPolicy: agentProvider === "kimi_acp" ? deps.capabilityPolicy : undefined,
  });
  sessionId ??= native.sessionId;
  return {
    sessionId,
    agentProvider,
    agentSessionId: native.sessionId,
    prompt: (input) => native.prompt({ ...input, emit: mapEmit(input.emit) }),
    close: () => native.close(),
  };
}
