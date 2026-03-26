/**
 * Identity Sync Controller
 *
 * Handles syncing user identity (Lark ID, Meegle User Key) to user table
 */

import { z } from "zod";
import {
  sharedIdentityStore,
} from "../../adapters/sqlite/identity-store.js";

export const identitySyncRequestSchema = z.object({
  requestId: z.string().min(1),
  larkId: z.string().min(1).optional(),
  meegleUserKey: z.string().min(1).optional(),
});

export type IdentitySyncRequest = z.infer<typeof identitySyncRequestSchema>;

export interface IdentitySyncResponse {
  ok: boolean;
  data?: {
    larkId: string;
    meegleUserKey: string | null;
    mappingStatus: 'bound' | 'unbound';
    updatedAt: string;
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

/**
 * Sync user identity to user store
 */
export async function syncIdentityController(input: unknown): Promise<IdentitySyncResponse> {
  try {
    const request = identitySyncRequestSchema.parse(input);

    const { larkId, meegleUserKey } = request;

    if (!larkId && !meegleUserKey) {
      return {
        ok: false,
        error: {
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'At least one of larkId or meegleUserKey is required',
        },
      };
    }

    if (!larkId) {
      return {
        ok: false,
        error: {
          errorCode: 'INVALID_REQUEST',
          errorMessage: 'larkId is required to persist identity records',
        },
      };
    }

    const user = await sharedIdentityStore.save({
      larkId,
      meegleUserKey: meegleUserKey ?? null,
    });

    console.log(`[Identity] Synced user: larkId=${user.larkId}, meegleUserKey=${user.meegleUserKey}`);

    return {
      ok: true,
      data: {
        larkId: user.larkId,
        meegleUserKey: user.meegleUserKey,
        mappingStatus: user.mappingStatus,
        updatedAt: user.updatedAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        errorCode: 'IDENTITY_SYNC_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get user identity by Lark ID
 */
export async function getIdentityController(input: unknown): Promise<IdentitySyncResponse> {
  try {
    const request = z.object({ larkId: z.string().min(1) }).parse(input);
    const user = await sharedIdentityStore.getByLarkId(request.larkId);

    if (!user) {
      return {
        ok: true,
        data: {
          larkId: request.larkId,
          meegleUserKey: null,
          mappingStatus: 'unbound',
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      ok: true,
      data: {
        larkId: user.larkId,
        meegleUserKey: user.meegleUserKey,
        mappingStatus: user.mappingStatus,
        updatedAt: user.updatedAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        errorCode: 'IDENTITY_GET_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }
}
