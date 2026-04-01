/**
 * Lark Authentication Module
 *
 * Handles Lark user token exchange and management
 * Based on Lark OpenAPI authentication flow
 */

import { z } from "zod";

// ==================== DTOs ====================

const baseLarkAuthSchema = z.object({
  masterUserId: z.string().min(1),
  baseUrl: z.string().url(),
});

export const larkAuthCodeRequestSchema = baseLarkAuthSchema.extend({
  code: z.string().min(1),
  grantType: z.enum(["authorization_code"]).default("authorization_code"),
});

export const larkTokenRefreshRequestSchema = baseLarkAuthSchema.extend({
  refreshToken: z.string().min(1),
});

export const larkAuthStatusRequestSchema = baseLarkAuthSchema;
export const larkOauthSessionRequestSchema = baseLarkAuthSchema.extend({
  state: z.string().min(1),
});
export const larkAuthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export type LarkAuthCodeRequest = z.infer<typeof larkAuthCodeRequestSchema>;
export type LarkTokenRefreshRequest = z.infer<typeof larkTokenRefreshRequestSchema>;
export type LarkAuthStatusRequest = z.infer<typeof larkAuthStatusRequestSchema>;
export type LarkOauthSessionRequest = z.infer<typeof larkOauthSessionRequestSchema>;
export type LarkAuthCallbackQuery = z.infer<typeof larkAuthCallbackQuerySchema>;

// ==================== Response Types ====================

export interface LarkTokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
}

export interface LarkAuthStatusResponse {
  status: "ready" | "require_auth" | "expired" | "failed";
  masterUserId: string;
  baseUrl: string;
  reason?: string;
  credentialStatus?: "active" | "expired";
  expiresAt?: string;
}

export interface LarkAuthCodeResponse {
  ok: true;
  data: LarkTokenPair;
}

export interface LarkAuthErrorResponse {
  ok: false;
  error: {
    errorCode: string;
    errorMessage: string;
  };
}

// ==================== Validation ====================

export function validateLarkAuthCodeRequest(input: unknown): LarkAuthCodeRequest {
  return larkAuthCodeRequestSchema.parse(input);
}

export function validateLarkTokenRefreshRequest(input: unknown): LarkTokenRefreshRequest {
  return larkTokenRefreshRequestSchema.parse(input);
}

export function validateLarkAuthStatusRequest(input: unknown): LarkAuthStatusRequest {
  return larkAuthStatusRequestSchema.parse(input);
}

export function validateLarkOauthSessionRequest(input: unknown): LarkOauthSessionRequest {
  return larkOauthSessionRequestSchema.parse(input);
}

export function validateLarkAuthCallbackQuery(input: unknown): LarkAuthCallbackQuery {
  return larkAuthCallbackQuerySchema.parse(input);
}

export interface LarkAuthCallbackPage {
  statusCode: number;
  contentType: string;
  body: string;
}
