/**
 * Lark authentication types for extension
 */

export interface LarkTokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
}

export interface LarkAuthEnsureRequest {
  requestId?: string;
  masterUserId?: string;
  baseUrl?: string;
  pageOrigin?: string;
  state?: string;
}

export interface LarkAuthEnsureResponse {
  status: "ready" | "require_auth" | "in_progress" | "failed";
  baseUrl: string;
  masterUserId?: string;
  state?: string;
  reason?: string;
  errorMessage?: string;
  credentialStatus?: "active" | "expired";
  expiresAt?: string;
}

export type LarkAuthCodeResponse =
  | {
      ok: true;
      data: LarkTokenPair;
    }
  | {
      ok: false;
      error: {
        errorCode: string;
        errorMessage: string;
      };
    };

export interface LarkAuthErrorResponse {
  ok: false;
  error: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface LarkAuthStatusServerResponse {
  ok: boolean;
  data?: {
    status: "ready" | "require_auth";
    masterUserId?: string;
    baseUrl: string;
    reason?: string;
    credentialStatus?: "active" | "expired";
    expiresAt?: string;
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface LarkAuthSessionServerResponse {
  ok: boolean;
  data?: {
    state: string;
    masterUserId?: string;
    baseUrl: string;
    status: "pending" | "completed" | "failed";
    expiresAt?: string;
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface LarkAuthCallbackResult {
  state: string;
  status: "ready" | "failed";
  masterUserId?: string;
  reason?: string;
}

export type LarkSourcePageType = "lark_a1" | "lark_a2";

export type LarkDetectedPageType = LarkSourcePageType | "unknown";

export interface LarkPageContext {
  pageType: LarkDetectedPageType;
  url: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  operatorLarkId?: string;
}

export interface LarkRecordSnapshotField {
  label: string;
  value: string;
}

export interface LarkRecordSnapshot {
  title: string;
  fields: LarkRecordSnapshotField[];
}

export interface LarkDraftFieldValuePair {
  fieldKey: string;
  fieldValue: unknown;
}

export interface LarkWorkflowDraft {
  draftId: string;
  draftType: "b1" | "b2";
  sourceRef: {
    sourcePlatform: LarkSourcePageType;
    sourceRecordId: string;
  };
  target: {
    projectKey: string;
    workitemTypeKey: string;
    templateId: string | number;
  };
  name: string;
  needConfirm: true;
  fieldValuePairs: LarkDraftFieldValuePair[];
  ownerUserKeys: string[];
  missingMeta: string[];
}

export interface LarkDraftApplyResult {
  status: "created";
  workitemId: string;
  draft: LarkWorkflowDraft;
}

export interface LarkDomDraftRequest extends LarkPageContext {
  snapshot: LarkRecordSnapshot;
}

export interface LarkDomApplyRequest extends LarkPageContext {
  snapshot: LarkRecordSnapshot;
  draft: LarkWorkflowDraft;
}
