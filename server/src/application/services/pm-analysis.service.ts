import type { PMAnalysisRequest } from "../../modules/pm-analysis/pm-analysis.dto";

export interface A1AnalysisItem {
  id: string;
  projectKey: string;
  status: "open" | "closed";
  ageDays: number;
}

export interface A2AnalysisItem {
  id: string;
  projectKey: string;
  status: "reviewed" | "draft" | "scheduled";
}

export interface BAnalysisItem {
  id: string;
  projectKey: string;
  status: "in_progress" | "blocked" | "done";
  ageDays: number;
}

export interface PullRequestAnalysisItem {
  id: string;
  projectKey: string;
  status: "open" | "merged";
  reviewStatus: "pending" | "approved";
}

export interface PMAnalysisDeps {
  loadA1Items?: (projectKeys: string[], timeWindowDays: number) => Promise<A1AnalysisItem[]>;
  loadA2Items?: (projectKeys: string[], timeWindowDays: number) => Promise<A2AnalysisItem[]>;
  loadBItems?: (projectKeys: string[], timeWindowDays: number) => Promise<BAnalysisItem[]>;
  loadPRItems?: (
    projectKeys: string[],
    timeWindowDays: number,
  ) => Promise<PullRequestAnalysisItem[]>;
}

function buildDefaultA1Items(projectKeys: string[]): A1AnalysisItem[] {
  return projectKeys.map((projectKey, index) => ({
    id: `A1-${index + 1}`,
    projectKey,
    status: "open",
    ageDays: 5 + index * 10,
  }));
}

function buildDefaultA2Items(projectKeys: string[]): A2AnalysisItem[] {
  return projectKeys.map((projectKey, index) => ({
    id: `A2-${index + 1}`,
    projectKey,
    status: index % 2 === 0 ? "reviewed" : "scheduled",
  }));
}

function buildDefaultBItems(projectKeys: string[]): BAnalysisItem[] {
  return projectKeys.flatMap((projectKey, index) => [
    {
      id: `B1-${index + 1}`,
      projectKey,
      status: "in_progress",
      ageDays: 3,
    },
    {
      id: `B2-${index + 1}`,
      projectKey,
      status: "blocked",
      ageDays: 11,
    },
  ]);
}

function buildDefaultPRItems(projectKeys: string[]): PullRequestAnalysisItem[] {
  return projectKeys.map((projectKey, index) => ({
    id: `PR-${index + 1}`,
    projectKey,
    status: "open",
    reviewStatus: index % 2 === 0 ? "pending" : "approved",
  }));
}

export async function runPMAnalysis(
  input: PMAnalysisRequest,
  deps: PMAnalysisDeps = {},
) {
  const timeWindowDays = input.timeWindowDays ?? 14;
  const [a1Items, a2Items, bItems, prItems] = await Promise.all([
    deps.loadA1Items?.(input.projectKeys, timeWindowDays) ??
      buildDefaultA1Items(input.projectKeys),
    deps.loadA2Items?.(input.projectKeys, timeWindowDays) ??
      buildDefaultA2Items(input.projectKeys),
    deps.loadBItems?.(input.projectKeys, timeWindowDays) ??
      buildDefaultBItems(input.projectKeys),
    deps.loadPRItems?.(input.projectKeys, timeWindowDays) ??
      buildDefaultPRItems(input.projectKeys),
  ]);

  const staleA1 = a1Items.filter(
    (item) => item.status === "open" && item.ageDays >= timeWindowDays,
  );
  const staleBItems = bItems.filter((item) => item.ageDays >= timeWindowDays);
  const blockers = bItems.filter((item) => item.status === "blocked");
  const pendingA2 = a2Items.filter((item) => item.status === "reviewed");
  const reviewPendingPrs = prItems.filter(
    (item) => item.status === "open" && item.reviewStatus === "pending",
  );
  const missingDescriptionItems = pendingA2.map((item) => ({
    id: item.id,
    projectKey: item.projectKey,
    reason: "需求已评审但描述仍待补全",
  }));
  const staleItems = [...staleA1, ...staleBItems];
  const suggestedActions = [
    `${blockers.length} 个阻塞项需要优先跟进`,
    `${reviewPendingPrs.length} 个 PR 需要补 review`,
  ];

  return {
    summary: `本周期在 ${timeWindowDays} 天窗口内发现 ${blockers.length} 个阻塞项和 ${staleItems.length} 个滞留事项。`,
    blockers,
    staleItems,
    missingDescriptionItems,
    suggestedActions,
    totals: {
      staleA1Count: staleA1.length,
      staleBItemsCount: staleBItems.length,
      pendingA2Count: pendingA2.length,
      reviewPendingPrCount: reviewPendingPrs.length,
    },
    items: {
      staleA1,
      staleBItems,
      pendingA2,
      reviewPendingPrs,
    },
  };
}
