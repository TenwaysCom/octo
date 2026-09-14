export type WebPluginLoginChallengeStatus = "pending" | "approved" | "consumed";

export interface StoredWebPluginLoginChallenge {
  challengeIdHash: string;
  browserProofHash: string;
  status: WebPluginLoginChallengeStatus;
  masterUserId?: string;
  baseUrl?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  consumedAt?: string;
}

export interface WebPluginLoginChallengeStore {
  create(challenge: Omit<StoredWebPluginLoginChallenge, "createdAt" | "updatedAt" | "consumedAt">): Promise<StoredWebPluginLoginChallenge>;
  get(challengeIdHash: string): Promise<StoredWebPluginLoginChallenge | undefined>;
  approve(input: { challengeIdHash: string; masterUserId: string; baseUrl: string; now: string }): Promise<StoredWebPluginLoginChallenge | undefined>;
  consume(input: { challengeIdHash: string; browserProofHash: string; now: string }): Promise<StoredWebPluginLoginChallenge | undefined>;
}
