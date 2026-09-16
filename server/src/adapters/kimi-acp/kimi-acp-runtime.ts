/** Kimi defaults and compatibility exports over the shared ACP client runtime. */
import {
  createAcpSessionRuntime, listAcpSessions, runAcpSingleTurn,
  type AcpRuntimeOptions,
} from "../acp/acp-runtime.js";
import { buildKimiAcpRuntimeConfig } from "./kimi-acp-config.js";
import type { AcpKimiChatRequest } from "../../modules/acp-kimi/acp-kimi.dto.js";

export {
  AcpRuntimeError as KimiAcpRuntimeError,
  createAcpCollectingClient as createKimiAcpCollectingClient,
  CollectingClient, ACP_MCP_SERVERS as KIMI_ACP_MCP_SERVERS,
  type AcpRuntimeErrorCode as KimiAcpRuntimeErrorCode,
  type AcpConnection as KimiAcpConnection,
  type AcpConnectionFactoryInput as KimiAcpConnectionFactoryInput,
  type AcpSessionRuntime as KimiAcpSessionRuntime,
  type AcpSessionSummary as KimiAcpSessionSummary,
} from "../acp/acp-runtime.js";

export type KimiAcpRuntimeDeps = AcpRuntimeOptions;

export function createKimiAcpSessionRuntime(deps: KimiAcpRuntimeDeps = {}) {
  return createAcpSessionRuntime({ ...deps, buildSpawnConfig: deps.buildSpawnConfig ?? buildKimiAcpRuntimeConfig });
}

export function listKimiAcpSessions(deps: KimiAcpRuntimeDeps = {}) {
  return listAcpSessions({ ...deps, buildSpawnConfig: deps.buildSpawnConfig ?? buildKimiAcpRuntimeConfig });
}

export function runKimiAcpSingleTurn(input: AcpKimiChatRequest, deps: KimiAcpRuntimeDeps = {}) {
  return runAcpSingleTurn(input, { ...deps, buildSpawnConfig: deps.buildSpawnConfig ?? buildKimiAcpRuntimeConfig });
}
