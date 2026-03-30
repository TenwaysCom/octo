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
  operatorLarkId?: string;
  baseUrl?: string;
  pageOrigin?: string;
  state?: string;
}

export interface LarkAuthEnsureResponse {
  status: "ready" | "require_auth_code" | "failed";
  baseUrl: string;
  state?: string;
  reason?: string;
  authCode?: string;
  tokenPair?: LarkTokenPair;
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
