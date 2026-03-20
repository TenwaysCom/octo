import type { MeegleAuthAdapter } from "../../adapters/meegle/auth-adapter";
import {
  InMemoryMeegleTokenStore,
  type MeegleTokenStore,
} from "../../adapters/meegle/token-store";
import {
  exchangeCredential,
  refreshCredential,
} from "../../application/services/meegle-credential.service";
import {
  type MeegleAuthExchangeRequest,
  type MeegleAuthRefreshRequest,
  validateMeegleAuthExchangeRequest,
  validateMeegleAuthRefreshRequest,
} from "./meegle-auth.dto";

export interface MeegleAuthServiceDeps {
  authAdapter: MeegleAuthAdapter;
  tokenStore: MeegleTokenStore;
}

let defaultDeps: MeegleAuthServiceDeps | undefined;
const sharedTokenStore = new InMemoryMeegleTokenStore();

export function configureMeegleAuthServiceDeps(
  deps: MeegleAuthServiceDeps,
): void {
  defaultDeps = deps;
}

function getDeps(overrides?: Partial<MeegleAuthServiceDeps>): MeegleAuthServiceDeps {
  const merged = {
    ...defaultDeps,
    ...overrides,
  };

  if (!merged.authAdapter) {
    throw new Error("Meegle auth adapter is not configured");
  }

  return {
    authAdapter: merged.authAdapter,
    tokenStore: merged.tokenStore ?? sharedTokenStore,
  };
}

export async function exchangeAuthCode(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleAuthExchangeRequest =
    validateMeegleAuthExchangeRequest(input);
  return exchangeCredential(request, getDeps(overrides));
}

export async function refreshAuthToken(
  input: unknown,
  overrides?: Partial<MeegleAuthServiceDeps>,
) {
  const request: MeegleAuthRefreshRequest =
    validateMeegleAuthRefreshRequest(input);
  return refreshCredential(request, getDeps(overrides));
}
