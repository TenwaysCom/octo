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
  LarkBaseBulkWorkflowRequest,
  LarkBaseBulkPreviewResultPayload,
  LarkBaseBulkCreateResultPayload,
} from "./lark";

export const protocolActions = [
  "itdog.identity.resolve",
  "itdog.meegle.auth.ensure",
  "itdog.lark.auth.ensure",
  "itdog.lark.auth.callback.detected",
  "itdog.lark_base.create_workitem",
  "itdog.lark_base.bulk_preview_workitems",
  "itdog.lark_base.bulk_create_workitems",
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

export type LarkBaseBulkPreviewWorkitemsMessage = ProtocolEnvelope<
  "itdog.lark_base.bulk_preview_workitems",
  LarkBaseBulkWorkflowRequest
>;

export type LarkBaseBulkPreviewWorkitemsResult = ProtocolEnvelope<
  "itdog.lark_base.bulk_preview_workitems",
  LarkBaseBulkPreviewResultPayload
>;

export type LarkBaseBulkCreateWorkitemsMessage = ProtocolEnvelope<
  "itdog.lark_base.bulk_create_workitems",
  LarkBaseBulkWorkflowRequest
>;

export type LarkBaseBulkCreateWorkitemsResult = ProtocolEnvelope<
  "itdog.lark_base.bulk_create_workitems",
  LarkBaseBulkCreateResultPayload
>;
