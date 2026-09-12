export interface StoredWebSession {
  sessionTokenHash: string;
  masterUserId: string;
  baseUrl: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  invalidatedAt?: string;
}

export interface WebSessionStore {
  create(session: Omit<StoredWebSession, "createdAt" | "updatedAt" | "invalidatedAt">): Promise<StoredWebSession>;
  get(sessionTokenHash: string): Promise<StoredWebSession | undefined>;
  invalidate(sessionTokenHash: string): Promise<void>;
}
