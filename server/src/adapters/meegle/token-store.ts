export interface StoredMeegleToken {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
  pluginToken: string;
  userToken: string;
  refreshToken?: string;
}

export interface MeegleTokenLookup {
  operatorLarkId: string;
  meegleUserKey: string;
  baseUrl: string;
}

export interface MeegleTokenStore {
  save(token: StoredMeegleToken): Promise<void>;
  get(lookup: MeegleTokenLookup): Promise<StoredMeegleToken | undefined>;
  delete(lookup: MeegleTokenLookup): Promise<void>;
}

function makeKey(input: MeegleTokenLookup): string {
  return `${input.operatorLarkId}:${input.meegleUserKey}:${input.baseUrl}`;
}

export class InMemoryMeegleTokenStore implements MeegleTokenStore {
  private readonly store = new Map<string, StoredMeegleToken>();

  async save(token: StoredMeegleToken): Promise<void> {
    this.store.set(makeKey(token), token);
  }

  async get(
    lookup: MeegleTokenLookup,
  ): Promise<StoredMeegleToken | undefined> {
    return this.store.get(makeKey(lookup));
  }

  async delete(lookup: MeegleTokenLookup): Promise<void> {
    this.store.delete(makeKey(lookup));
  }
}
