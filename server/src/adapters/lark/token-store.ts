export interface StoredLarkToken {
  masterUserId: string;
  larkUserId: string;
  baseUrl: string;
  userToken: string;
  userTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  credentialStatus?: "active" | "expired";
}

export interface LarkTokenLookup {
  masterUserId: string;
  baseUrl: string;
  larkUserId?: string;
}

export interface LarkTokenStore {
  save(token: StoredLarkToken): Promise<void>;
  get(lookup: LarkTokenLookup): Promise<StoredLarkToken | undefined>;
  delete(lookup: LarkTokenLookup): Promise<void>;
}
