import {
  buildKimiAcpSpawnConfig,
  type KimiAcpSpawnConfig,
} from "./spawn-config.js";

export type { KimiAcpSpawnConfig };

export function buildKimiAcpRuntimeConfig(
  env: NodeJS.ProcessEnv,
): KimiAcpSpawnConfig {
  return buildKimiAcpSpawnConfig(env);
}
