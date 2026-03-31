export interface StoredMeegleToken {
  masterUserId: string;
  meegleUserKey: string;
  baseUrl: string;
  pluginToken: string;
  pluginTokenExpiresAt?: string;
  userToken: string;
  userTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  credentialStatus?: "active" | "expired";
}

export interface MeegleTokenLookup {
  masterUserId: string;
  meegleUserKey: string;
  baseUrl: string;
}

export interface MeegleTokenStore {
  save(token: StoredMeegleToken): Promise<void>;
  get(lookup: MeegleTokenLookup): Promise<StoredMeegleToken | undefined>;
  delete(lookup: MeegleTokenLookup): Promise<void>;
}

function makeKey(input: MeegleTokenLookup): string {
  return `${input.masterUserId}:${input.meegleUserKey}:${input.baseUrl}`;
}

export class InMemoryMeegleTokenStore implements MeegleTokenStore {
  private readonly store = new Map<string, StoredMeegleToken>();

  async save(token: StoredMeegleToken): Promise<void> {
    this.store.set(makeKey(token), token);
  }

  async get(
    lookup: MeegleTokenLookup,
  ): Promise<StoredMeegleToken | undefined> {
    const exact = this.store.get(makeKey(lookup));
    if (exact) {
      return exact;
    }

    for (const token of this.store.values()) {
      if (
        token.masterUserId === lookup.masterUserId &&
        token.meegleUserKey === lookup.meegleUserKey
      ) {
        return token;
      }
    }

    return undefined;
  }

  async delete(lookup: MeegleTokenLookup): Promise<void> {
    this.store.delete(makeKey(lookup));
  }
}
