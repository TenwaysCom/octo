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
  loadA1Items?: (projectKeys: string[]) => Promise<A1AnalysisItem[]>;
  loadA2Items?: (projectKeys: string[]) => Promise<A2AnalysisItem[]>;
  loadBItems?: (projectKeys: string[]) => Promise<BAnalysisItem[]>;
  loadPRItems?: (projectKeys: string[]) => Promise<PullRequestAnalysisItem[]>;
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
  const [a1Items, a2Items, bItems, prItems] = await Promise.all([
    deps.loadA1Items?.(input.projectKeys) ?? buildDefaultA1Items(input.projectKeys),
    deps.loadA2Items?.(input.projectKeys) ?? buildDefaultA2Items(input.projectKeys),
    deps.loadBItems?.(input.projectKeys) ?? buildDefaultBItems(input.projectKeys),
    deps.loadPRItems?.(input.projectKeys) ?? buildDefaultPRItems(input.projectKeys),
  ]);

  const staleA1 = a1Items.filter((item) => item.status === "open" && item.ageDays >= 7);
  const staleBItems = bItems.filter((item) => item.status === "blocked" || item.ageDays >= 7);
  const pendingA2 = a2Items.filter((item) => item.status === "reviewed");
  const reviewPendingPrs = prItems.filter(
    (item) => item.status === "open" && item.reviewStatus === "pending",
  );

  const highlights = [
    `${staleA1.length} 个 A1 工单超过 7 天未关闭`,
    `${staleBItems.length} 个 B1/B2 工作项存在阻塞或长时间滞留`,
    `${reviewPendingPrs.length} 个 PR 等待 review`,
  ];

  return {
    summary: `项目范围 ${input.projectKeys.join(", ")} 存在 ${staleA1.length} 个滞留工单、${staleBItems.length} 个滞留执行项。`,
    totals: {
      staleA1Count: staleA1.length,
      staleBItemsCount: staleBItems.length,
      pendingA2Count: pendingA2.length,
      reviewPendingPrCount: reviewPendingPrs.length,
    },
    highlights,
    items: {
      staleA1,
      staleBItems,
      pendingA2,
      reviewPendingPrs,
    },
  };
}
