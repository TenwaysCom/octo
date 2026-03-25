/**
 * Identity Sync Controller
 *
 * Handles syncing user identity (Lark ID, Meegle User Key) to user table
 */

import { z } from "zod";

// In-memory user store (replace with database in production)
const userStore = new Map<string, { larkId: string; meegleUserKey: string | null; updatedAt: string }>();

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

    // Use larkId as the primary key
    const userId = larkId || `meegle_${meegleUserKey}`;

    // Get existing user or create new
    const existingUser = userStore.get(userId);
    const updatedAt = new Date().toISOString();

    const user = {
      larkId: larkId || existingUser?.larkId || '',
      meegleUserKey: meegleUserKey || existingUser?.meegleUserKey || null,
      updatedAt,
    };

    userStore.set(userId, user);

    // If both IDs are present, create a mapping
    const mappingStatus = user.larkId && user.meegleUserKey ? 'bound' : 'unbound';

    console.log(`[Identity] Synced user: larkId=${user.larkId}, meegleUserKey=${user.meegleUserKey}`);

    return {
      ok: true,
      data: {
        larkId: user.larkId,
        meegleUserKey: user.meegleUserKey,
        mappingStatus,
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
    const user = userStore.get(request.larkId);

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
        mappingStatus: user.larkId && user.meegleUserKey ? 'bound' : 'unbound',
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