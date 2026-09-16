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
  "octo.async-action.track",
  "octo.pm.analysis.run",
  "octo.page.meegle.auth_code.request",
  "octo.web.plugin-login.approve",
  "octo.github-pr.odoo-devops-build.read",
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

export type AsyncActionTrackMessage = ProtocolEnvelope<
  "octo.async-action.track",
  {
    actionRunId: string;
    masterUserId: string;
    serverUrl: string;
    statusRoute: string;
    notification: {
      title: string;
      message: string;
    };
  }
>;

export type WebPluginLoginApprovalMessage = ProtocolEnvelope<
  "octo.web.plugin-login.approve",
  { challengeId: string; pageOrigin: string }
>;

export type WebPluginLoginApprovalResult = ProtocolEnvelope<
  "octo.web.plugin-login.approve",
  { status: "approved" | "failed"; errorCode?: string }
>;

export type GitHubPrOdooDevopsBuildMessage = ProtocolEnvelope<
  "octo.github-pr.odoo-devops-build.read",
  { owner: string; repo: string; pullNumber: number }
>;

export type GitHubPrOdooDevopsBuildResult = ProtocolEnvelope<
  "octo.github-pr.odoo-devops-build.read",
  {
    status: "ready" | "unavailable";
    data?: {
      environment: "eu" | "uk" | "us";
      headRef: string;
      build: { branch: string; status: string; result: string } | null;
    };
    errorCode?: string;
  }
>;
