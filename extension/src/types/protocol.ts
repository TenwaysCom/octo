import type { IdentityBinding, PageContext } from "./context";
import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "./meegle";

export const protocolActions = [
  "itdog.identity.resolve",
  "itdog.meegle.auth.ensure",
  "itdog.a1.analyze",
  "itdog.a1.create_b2_draft",
  "itdog.a1.apply_b2",
  "itdog.a2.analyze",
  "itdog.a2.create_b1_draft",
  "itdog.a2.apply_b1",
  "itdog.pm.analysis.run",
  "itdog.page.meegle.auth_code.request",
] as const;

export type ProtocolAction = (typeof protocolActions)[number];

export interface ProtocolEnvelope<TAction extends ProtocolAction, TPayload> {
  action: TAction;
  payload: TPayload;
}

export type IdentityResolveMessage = ProtocolEnvelope<
  "itdog.identity.resolve",
  {
    requestId: string;
    pageContext: PageContext;
    binding?: IdentityBinding;
  }
>;

export type MeegleAuthEnsureMessage = ProtocolEnvelope<
  "itdog.meegle.auth.ensure",
  MeegleAuthEnsureRequest
>;

export type MeegleAuthEnsureResult = ProtocolEnvelope<
  "itdog.meegle.auth.ensure",
  MeegleAuthEnsureResponse
>;
