import type {
  MeegleAuthEnsureMessage,
  MeegleAuthEnsureResult,
} from "../types/protocol";
import type { EnsureMeegleAuthDeps } from "./handlers/meegle-auth";
import { ensureMeegleAuth } from "./handlers/meegle-auth";

export async function routeBackgroundAction(
  message: MeegleAuthEnsureMessage,
  deps: EnsureMeegleAuthDeps = {},
): Promise<MeegleAuthEnsureResult> {
  return {
    action: message.action,
    payload: await ensureMeegleAuth(message.payload, deps),
  };
}
