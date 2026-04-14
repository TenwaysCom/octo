export type SupportedPlatform = "lark" | "meegle" | "github" | "unknown";
export type PageType = "lark_base" | "meegle" | "github";

export interface PageContext {
  pageType: PageType;
  url: string;
  detectedLarkId?: string;
  detectedMeegleUserKey?: string;
  detectedGithubId?: string;
  baseId?: string;
  tableId?: string;
  recordId?: string;
  projectKey?: string;
  workitemId?: string;
  repoOwner?: string;
  repoName?: string;
  prNumber?: number;
}

export interface IdentityBinding {
  operatorLarkId: string;
  mappingStatus: "bound" | "unbound" | "partial";
  meegleUserKey?: string;
  githubId?: string;
}
