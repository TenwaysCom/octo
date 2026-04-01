export interface StoredOauthSession {
  state: string;
  provider: "lark";
  masterUserId?: string;
  baseUrl: string;
  status: "pending" | "completed" | "failed";
  authCode?: string;
  externalUserKey?: string;
  errorCode?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OauthSessionStore {
  save(session: Omit<StoredOauthSession, "createdAt" | "updatedAt">): Promise<StoredOauthSession>;
  get(state: string): Promise<StoredOauthSession | undefined>;
  markCompleted(input: {
    state: string;
    authCode: string;
    externalUserKey: string;
    masterUserId?: string;
  }): Promise<StoredOauthSession | undefined>;
  markFailed(input: {
    state: string;
    errorCode: string;
  }): Promise<StoredOauthSession | undefined>;
}
