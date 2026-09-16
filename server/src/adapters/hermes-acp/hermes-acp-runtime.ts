import { homedir } from "node:os";
import { join } from "node:path";
import { AcpRuntimeError, createAcpSessionRuntime, createDefaultConnection, type AcpRuntimeOptions, type AcpSessionRuntime } from "../acp/acp-runtime.js";
import type { AcpSpawnConfig } from "../acp/spawn-config.js";

export function buildHermesAcpSpawnConfig(env: NodeJS.ProcessEnv): AcpSpawnConfig {
  const hermesHome = env.HERMES_HOME || join(homedir(), ".hermes");
  const launchEnv: NodeJS.ProcessEnv = { ...env, HERMES_HOME: hermesHome, PYTHONUNBUFFERED: "1" };
  delete launchEnv.PYTHONPATH;
  delete launchEnv.PYTHONHOME;
  return {
    command: env.HERMES_ACP_PYTHON || join(hermesHome, "hermes-agent", "venv", "bin", "python"),
    args: ["-m", "acp_adapter"],
    env: launchEnv,
  };
}

export async function createHermesAcpSessionRuntime(deps: AcpRuntimeOptions = {}): Promise<AcpSessionRuntime> {
  return createAcpSessionRuntime({
    ...deps,
    buildSpawnConfig: deps.buildSpawnConfig ?? buildHermesAcpSpawnConfig,
    async createConnection(input) {
      const connection = await (deps.createConnection ? deps.createConnection(input) : createDefaultConnection(input, deps.spawnProcess));
      return {
        ...connection,
        async loadSession(input) {
          // Hermes 0.14 returns None for an absent session; its SDK normalizes
          // that to {}. Verify against the native list before accepting a load.
          let cursor: string | null = null;
          const seen = new Set<string>();
          do {
            const page = await connection.listSessions({ cursor });
            if (page.sessions.some((session) => session.sessionId === input.sessionId)) return connection.loadSession(input);
            cursor = page.nextCursor ?? null;
            if (cursor && seen.has(cursor)) break;
            if (cursor) seen.add(cursor);
          } while (cursor);
          throw new AcpRuntimeError("ACP_SESSION_NOT_FOUND", "adapter.acp.session", "Hermes could not find the saved native session.");
        },
      };
    },
  });
}
