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
