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
  "octo.identity.resolve",
  "octo.meegle.auth.ensure",
  "octo.lark.auth.ensure",
  "octo.lark.auth.callback.detected",
  "octo.lark_base.create_workitem",
  "octo.lark_base.bulk_preview_workitems",
  "octo.lark_base.bulk_create_workitems",
  "octo.pm.analysis.run",
  "octo.page.meegle.auth_code.request",
] as const;

export type ProtocolAction = (typeof protocolActions)[number];

export interface ProtocolEnvelope<TAction extends ProtocolAction, TPayload> {
  action: TAction;
  payload: TPayload;
}

export type IdentityResolveMessage = ProtocolEnvelope<
  "octo.identity.resolve",
  {
    requestId: string;
    pageContext: PageContext;
    binding?: IdentityBinding;
  }
>;

export type MeegleAuthEnsureMessage = ProtocolEnvelope<
  "octo.meegle.auth.ensure",
  MeegleAuthEnsureRequest
>;

export type MeegleAuthEnsureResult = ProtocolEnvelope<
  "octo.meegle.auth.ensure",
  MeegleAuthEnsureResponse
>;

export type LarkAuthEnsureMessage = ProtocolEnvelope<
  "octo.lark.auth.ensure",
  LarkAuthEnsureRequest
>;

export type LarkAuthEnsureResult = ProtocolEnvelope<
  "octo.lark.auth.ensure",
  LarkAuthEnsureResponse
>;

export type LarkAuthCallbackDetectedMessage = ProtocolEnvelope<
  "octo.lark.auth.callback.detected",
  LarkAuthCallbackResult
>;

export type LarkBaseCreateWorkitemMessage = ProtocolEnvelope<
  "octo.lark_base.create_workitem",
  LarkBaseCreateWorkitemRequest
>;

export type LarkBaseCreateWorkitemResult = ProtocolEnvelope<
  "octo.lark_base.create_workitem",
  LarkBaseCreateWorkitemResultPayload
>;

export type LarkBaseBulkPreviewWorkitemsMessage = ProtocolEnvelope<
  "octo.lark_base.bulk_preview_workitems",
  LarkBaseBulkWorkflowRequest
>;

export type LarkBaseBulkPreviewWorkitemsResult = ProtocolEnvelope<
  "octo.lark_base.bulk_preview_workitems",
  LarkBaseBulkPreviewResultPayload
>;

export type LarkBaseBulkCreateWorkitemsMessage = ProtocolEnvelope<
  "octo.lark_base.bulk_create_workitems",
  LarkBaseBulkWorkflowRequest
>;

export type LarkBaseBulkCreateWorkitemsResult = ProtocolEnvelope<
  "octo.lark_base.bulk_create_workitems",
  LarkBaseBulkCreateResultPayload
>;
