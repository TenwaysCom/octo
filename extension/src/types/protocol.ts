import type { IdentityBinding, PageContext } from "./context";
import type {
  MeegleAuthEnsureRequest,
  MeegleAuthEnsureResponse,
} from "./meegle";
import type {
  LarkAuthEnsureRequest,
  LarkAuthEnsureResponse,
  LarkAuthCallbackResult,
  LarkBaseCreateWorkitemRequest,
  LarkBaseCreateWorkitemResultPayload,
} from "./lark";

export const protocolActions = [
  "itdog.identity.resolve",
  "itdog.meegle.auth.ensure",
  "itdog.lark.auth.ensure",
  "itdog.lark.auth.callback.detected",
  "itdog.lark_base.create_workitem",
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

export type LarkAuthEnsureMessage = ProtocolEnvelope<
  "itdog.lark.auth.ensure",
  LarkAuthEnsureRequest
>;

export type LarkAuthEnsureResult = ProtocolEnvelope<
  "itdog.lark.auth.ensure",
  LarkAuthEnsureResponse
>;

export type LarkAuthCallbackDetectedMessage = ProtocolEnvelope<
  "itdog.lark.auth.callback.detected",
  LarkAuthCallbackResult
>;

export type LarkBaseCreateWorkitemMessage = ProtocolEnvelope<
  "itdog.lark_base.create_workitem",
  LarkBaseCreateWorkitemRequest
>;

export type LarkBaseCreateWorkitemResult = ProtocolEnvelope<
  "itdog.lark_base.create_workitem",
  LarkBaseCreateWorkitemResultPayload
>;
