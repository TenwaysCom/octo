/**
 * Lark Client Factory
 *
 * Creates LarkClient instances from credentials
 */

import { LarkClient } from "../../adapters/lark/lark-client.js";

export interface LarkClientConfig {
  accessToken: string;
  baseUrl?: string;
}

/**
 * Create a LarkClient
 */
export function createLarkClient(config: LarkClientConfig): LarkClient {
  return new LarkClient({
    accessToken: config.accessToken,
    baseUrl: config.baseUrl,
  });
}
