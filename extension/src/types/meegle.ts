export type MeegleAuthStatus = "ready" | "require_auth_code" | "failed";

export interface MeegleAuthEnsureRequest {
  requestId: string;
  masterUserId: string;
  meegleUserKey?: string;
  baseUrl: string;
  pageOrigin?: string;
  currentTabId?: number;
  currentPageIsMeegle?: boolean;
  state?: string;
}

export interface MeegleAuthEnsureResponse {
  status: MeegleAuthStatus;
  baseUrl: string;
  state?: string;
  authCode?: string;
  issuedAt?: string;
  credentialStatus?: "auth_code_received" | "token_ready" | "active" | "expired";
  expiresAt?: string;
  reason?: string;
  errorMessage?: string;
}

export interface MeegleAuthExchangeResponse {
  ok: boolean;
  requestId?: string;
  data?: {
    tokenStatus: "ready";
    credentialStatus: "active";
    expiresAt?: string;
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface MeegleAuthCodeRequest {
  baseUrl: string;
  pluginId: string;
  state: string;
}

export interface MeegleAuthCodeResponse {
  authCode: string;
  state: string;
  issuedAt: string;
}
