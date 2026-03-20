export type SupportedPlatform = "lark" | "meegle" | "github" | "unknown";

export interface PageContext {
  platform: SupportedPlatform;
  baseUrl: string;
  pathname: string;
  recordId?: string;
  projectKey?: string;
  workitemId?: string;
}

export interface IdentityBinding {
  larkId: string;
  meegleUserKey?: string;
  githubId?: string;
}
