import type { PMAnalysisRequest } from "../../modules/pm-analysis/pm-analysis.dto.js";

export interface LarkTicketAnalysisItem {
  id: string;
  projectKey: string;
  issueType: string;
  status: string;
  ageDays: number;
}

export interface MeegleWorkitemAnalysisItem {
  id: string;
  projectKey: string;
  status: "in_progress" | "blocked" | "done";
  ageDays: number;
  createdAt?: number;
  elapsedHours?: number;
  slaTargetHours?: number;
  slaBreached?: boolean;
  name?: string;
}

export interface PullRequestAnalysisItem {
  id: string;
  projectKey: string;
  status: "open" | "merged";
  reviewStatus: "pending" | "approved";
}

export interface PMAnalysisDeps {
  loadLarkTicketItems?: (projectKeys: string[], timeWindowDays: number) => Promise<LarkTicketAnalysisItem[]>;
  loadMeegleWorkitemItems?: (projectKeys: string[], timeWindowDays: number) => Promise<MeegleWorkitemAnalysisItem[]>;
  loadPRItems?: (
    projectKeys: string[],
    timeWindowDays: number,
  ) => Promise<PullRequestAnalysisItem[]>;
}

function buildDefaultLarkTicketItems(projectKeys: string[]): LarkTicketAnalysisItem[] {
  return projectKeys.flatMap((projectKey, index) => [
    {
      id: `LarkTicket-bug-${index + 1}`,
      projectKey,
      issueType: "Bug",
      status: "open",
      ageDays: 5 + index * 10,
    },
    {
      id: `LarkTicket-story-${index + 1}`,
      projectKey,
      issueType: "User Story",
      status: index % 2 === 0 ? "reviewed" : "scheduled",
      ageDays: 2,
    },
  ]);
}

function buildDefaultMeegleWorkitemItems(projectKeys: string[]): MeegleWorkitemAnalysisItem[] {
  return projectKeys.flatMap((projectKey, index) => [
    {
      id: `MeegleWI-${index + 1}`,
      projectKey,
      status: "in_progress",
      ageDays: 3,
    },
    {
      id: `MeegleWI-blocked-${index + 1}`,
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
  const [larkTicketItems, meegleWorkitemItems, prItems] = await Promise.all([
    deps.loadLarkTicketItems?.(input.projectKeys, timeWindowDays) ??
      buildDefaultLarkTicketItems(input.projectKeys),
    deps.loadMeegleWorkitemItems?.(input.projectKeys, timeWindowDays) ??
      buildDefaultMeegleWorkitemItems(input.projectKeys),
    deps.loadPRItems?.(input.projectKeys, timeWindowDays) ??
      buildDefaultPRItems(input.projectKeys),
  ]);

  // Lark ticket analysis: stale = not closed and age >= window
  const staleLarkTickets = larkTicketItems.filter(
    (item) => item.status !== "closed" && item.status !== "done" && item.ageDays >= timeWindowDays,
  );
  const pendingReviewLarkTickets = larkTicketItems.filter(
    (item) => item.status === "reviewed",
  );
  // Missing descriptions only for story-like tickets in reviewed status
  const missingDescriptionItems = pendingReviewLarkTickets
    .filter((item) => /story|需求|user.story/i.test(item.issueType))
    .map((item) => ({
      id: item.id,
      projectKey: item.projectKey,
      reason: "需求已评审但描述仍待补全",
    }));

  const staleMeegleWorkitems = meegleWorkitemItems.filter((item) => item.ageDays >= timeWindowDays);
  const blockers = meegleWorkitemItems.filter((item) => item.status === "blocked");
  const reviewPendingPrs = prItems.filter(
    (item) => item.status === "open" && item.reviewStatus === "pending",
  );
  const staleItems = [...staleLarkTickets, ...staleMeegleWorkitems];

  // SLA analysis for bug-like items
  const slaItems = meegleWorkitemItems.filter((item) => item.slaTargetHours !== undefined);
  const slaBreachedItems = slaItems.filter((item) => item.slaBreached);
  const slaMetItems = slaItems.filter((item) => !item.slaBreached);

  const suggestedActions = [
    `${blockers.length} 个阻塞项需要优先跟进`,
    `${reviewPendingPrs.length} 个 PR 需要补 review`,
    ...(slaBreachedItems.length > 0 ? [`${slaBreachedItems.length} 个事项 SLA 已超期`] : []),
  ];

  return {
    summary: `本周期在 ${timeWindowDays} 天窗口内发现 ${blockers.length} 个阻塞项、${staleItems.length} 个滞留事项${slaBreachedItems.length > 0 ? `、${slaBreachedItems.length} 个 SLA 超期事项` : ""}。`,
    blockers,
    staleItems,
    missingDescriptionItems,
    suggestedActions,
    slaAnalysis: {
      total: slaItems.length,
      met: slaMetItems.length,
      breached: slaBreachedItems.length,
      breachedItems: slaBreachedItems,
    },
    totals: {
      staleLarkTicketCount: staleLarkTickets.length,
      staleMeegleWorkitemCount: staleMeegleWorkitems.length,
      pendingReviewLarkTicketCount: pendingReviewLarkTickets.length,
      reviewPendingPrCount: reviewPendingPrs.length,
      slaBreachedCount: slaBreachedItems.length,
    },
    items: {
      staleLarkTickets,
      staleMeegleWorkitems,
      pendingReviewLarkTickets,
      reviewPendingPrs,
    },
  };
}
