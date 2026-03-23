import { z } from "zod";

const baseAuthSchema = z.object({
  operatorLarkId: z.string().min(1),
  meegleUserKey: z.string().min(1),
  baseUrl: z.string().url(),
});

const baseGetAuthCodeSchema = z.object({
  operatorLarkId: z.string().min(1),
  meegleUserKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  cookie: z.string().min(1),
});

export const meegleAuthExchangeRequestSchema = baseAuthSchema.extend({
  requestId: z.string().min(1),
  authCode: z.string().min(1),
  state: z.string().min(1).optional(),
});

export const meegleAuthRefreshRequestSchema = baseAuthSchema;

export const meegleGetAuthCodeRequestSchema = baseGetAuthCodeSchema.extend({
  state: z.string().min(1).optional(),
});

export type MeegleAuthExchangeRequest = z.infer<
  typeof meegleAuthExchangeRequestSchema
>;
export type MeegleAuthRefreshRequest = z.infer<
  typeof meegleAuthRefreshRequestSchema
>;
export type MeegleGetAuthCodeRequest = z.infer<
  typeof meegleGetAuthCodeRequestSchema
>;

export function validateMeegleAuthExchangeRequest(
  input: unknown,
): MeegleAuthExchangeRequest {
  return meegleAuthExchangeRequestSchema.parse(input);
}

export function validateMeegleAuthRefreshRequest(
  input: unknown,
): MeegleAuthRefreshRequest {
  return meegleAuthRefreshRequestSchema.parse(input);
}

export function validateMeegleGetAuthCodeRequest(
  input: unknown,
): MeegleGetAuthCodeRequest {
  return meegleGetAuthCodeRequestSchema.parse(input);
}
