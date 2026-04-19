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
  force?: boolean;
}

export interface LarkAuthEnsureResponse {
  status: "ready" | "require_auth" | "require_refresh" | "in_progress" | "failed";
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
    status: "ready" | "require_auth" | "require_refresh";
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

export type LarkSourcePageType = "lark_base";

export type LarkDetectedPageType = LarkSourcePageType | "unknown";

export interface LarkPageContext {
  pageType: LarkDetectedPageType;
  url: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  viewId?: string;
  operatorLarkId?: string;
  masterUserId?: string;
}

export interface LarkRecordSnapshotField {
  label: string;
  value: string;
}

export interface LarkRecordSnapshot {
  title: string;
  fields: LarkRecordSnapshotField[];
  larkUrl: string;
}

export interface LarkBaseCreateWorkitemRequest extends LarkPageContext {
  snapshot?: LarkRecordSnapshot;
}

export interface LarkBaseCreateWorkitemResultPayload {
  ok: true;
  workitemId: string;
  meegleLink: string;
  recordId: string;
  workitems?: Array<{ workitemId: string; meegleLink: string }>;
}

export interface LarkBaseBulkWorkflowRequest {
  baseId?: string;
  tableId?: string;
  viewId?: string;
  masterUserId?: string;
}

export interface LarkBaseBulkPreviewRecord {
  recordId: string;
  title: string;
  priority: string;
}

export interface LarkBaseBulkSkippedRecord extends LarkBaseBulkPreviewRecord {
  reason: "ALREADY_LINKED";
}

export interface LarkBaseBulkCreatedRecord extends LarkBaseBulkPreviewRecord {
  workitemId: string;
  meegleLink: string;
}

export interface LarkBaseBulkFailedRecord extends LarkBaseBulkPreviewRecord {
  errorCode: string;
  errorMessage: string;
}

export type LarkBaseBulkWorkflowErrorPayload = {
  ok: false;
  error: {
    errorCode: string;
    errorMessage: string;
  };
};

export type LarkBaseBulkPreviewResultPayload =
  | {
      ok: true;
      baseId: string;
      tableId: string;
      viewId: string;
      totalRecordsInView: number;
      eligibleRecords: LarkBaseBulkPreviewRecord[];
      skippedRecords: LarkBaseBulkSkippedRecord[];
    }
  | LarkBaseBulkWorkflowErrorPayload;

export type LarkBaseBulkCreateResultPayload =
  | {
      ok: true;
      baseId: string;
      tableId: string;
      viewId: string;
      totalRecordsInView: number;
      summary: {
        created: number;
        failed: number;
        skipped: number;
      };
      createdRecords: LarkBaseBulkCreatedRecord[];
      failedRecords: LarkBaseBulkFailedRecord[];
      skippedRecords: LarkBaseBulkSkippedRecord[];
    }
  | LarkBaseBulkWorkflowErrorPayload;
