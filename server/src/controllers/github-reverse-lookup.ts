import { logger } from "../logger.js";
import type { GitHubClient } from "../adapters/github/github-client.js";
import type { MeegleClient, MeegleWorkitem } from "../adapters/meegle/meegle-client.js";
import { extractMeegleIds } from "../domain/meegle-id-extractor.js";

const lookupLogger = logger.child({ module: "github-reverse-lookup" });

// 从环境变量获取需要轮询的 work_item_type_key 列表（排除 tech_task）
const CANDIDATE_WORK_ITEM_TYPE_KEYS: string[] = [
  process.env.MEEGLE_WORKITEM_TYPE_KEY_STORY || "story",
  process.env.MEEGLE_WORKITEM_TYPE_KEY_PROD_BUG || "6932e40429d1cd8aac635c82",
].filter((k): k is string => Boolean(k));

// 字段映射：不同 work_item_type_key 对应的 Planned Version / Planned Sprint 字段 key
const PLANNED_VERSION_FIELD_MAP: Record<string, string> = {
  story: "field_1b9eb0",
  "6932e40429d1cd8aac635c82": "field_c6f6d0",
};

const PLANNED_SPRINT_FIELD_MAP: Record<string, string> = {
  story: "field_feb079",
  "6932e40429d1cd8aac635c82": "field_ee999e",
};

const BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";
const DEFAULT_PROJECT_KEY = process.env.MEEGLE_PROJECT_KEY || "";

// work_item_type_key → 可读类型名称 / URL slug 映射
const TYPE_DISPLAY_MAP: Record<string, string> = {
  story: "story",
  "6932e40429d1cd8aac635c82": "production_bug",
};

// 关联工作项（Version / Sprint）的 work_item_type_key
const RELATED_TYPE_KEY_VERSION = process.env.MEEGLE_WORKITEM_TYPE_KEY_VERSION || "642f8d55c7109143ec2eb478";
const RELATED_TYPE_KEY_SPRINT = process.env.MEEGLE_WORKITEM_TYPE_KEY_SPRINT || "642ebe04168eea39eeb0d34a";

function extractFieldValue(fields: Record<string, unknown> | undefined | null, key: string): string | undefined {
  if (!key || !fields) return undefined;

  const value = fields[key];

  // 直接是字符串
  if (typeof value === "string") {
    return value;
  }

  // 直接是数字（如关联工作项 ID）
  if (typeof value === "number") {
    return String(value);
  }

  // 对象形式：取 name / value / title
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.value === "number") return String(obj.value);
    if (typeof obj.title === "string") return obj.title;
    if (Array.isArray(obj.value) && obj.value.length > 0) {
      return obj.value.map((v: unknown) =>
        typeof v === "string" ? v : (v as Record<string, unknown>)?.name || String(v)
      ).join(", ");
    }
  }

  // field_value_pairs 格式（filter_across_project 返回的嵌套 fields 数组）
  const fieldValuePairs = fields.fields;
  if (Array.isArray(fieldValuePairs)) {
    const pair = fieldValuePairs.find(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        (p as Record<string, unknown>).field_key === key,
    ) as Record<string, unknown> | undefined;

    if (pair) {
      const fv = pair.field_value;
      if (typeof fv === "string") return fv;
      if (typeof fv === "number") return String(fv);
      if (fv && typeof fv === "object") {
        const obj = fv as Record<string, unknown>;
        if (typeof obj.name === "string") return obj.name;
        if (typeof obj.value === "string") return obj.value;
        if (typeof obj.value === "number") return String(obj.value);
        if (Array.isArray(obj.value) && obj.value.length > 0) {
          return obj.value.map((v: unknown) =>
            typeof v === "string" ? v : (v as Record<string, unknown>)?.name || String(v)
          ).join(", ");
        }
      }
    }
  }

  return undefined;
}

export interface LookupWorkitem {
  id: string;
  name: string;
  type: string;
  status: string;
  url: string;
  plannedVersion?: string;
  plannedSprint?: string;
}

export interface LookupResult {
  prInfo: {
    title: string;
    description: string | null;
    url: string;
  };
  extractedIds: string[];
  workitems: LookupWorkitem[];
  notFound: string[];
}

export class GitHubReverseLookupController {
  constructor(private githubClient: GitHubClient) {}

  async lookup(prUrl: string, meegleClient: MeegleClient): Promise<LookupResult> {
    lookupLogger.info({ prUrl }, "Starting GitHub PR lookup");

    // Parse PR URL
    const { owner, repo, pullNumber } = this.githubClient.parsePrUrl(prUrl);
    lookupLogger.debug({ owner, repo, pullNumber }, "Parsed PR URL");

    // Fetch all PR data
    const [prDetails, commits, issueComments, reviewComments] = await Promise.all([
      this.githubClient.getPullRequest(owner, repo, pullNumber),
      this.githubClient.getCommits(owner, repo, pullNumber),
      this.githubClient.getIssueComments(owner, repo, pullNumber),
      this.githubClient.getReviewComments(owner, repo, pullNumber),
    ]);

    // Extract Meegle IDs
    const extractedIds = extractMeegleIds({
      title: prDetails.title,
      description: prDetails.body,
      commits: commits.map(c => ({ message: c.commit.message })),
      comments: [
        ...issueComments.map(c => ({ body: c.body })),
        ...reviewComments.map(c => ({ body: c.body })),
      ],
    });

    lookupLogger.info({ extractedIds }, "Extracted Meegle IDs");

    if (extractedIds.length === 0) {
      const error = new Error("No Meegle IDs found in PR");
      (error as Error & { code: string }).code = "NO_MEEGLE_ID_FOUND";
      throw error;
    }

    // Convert string IDs to numbers for the API
    const workItemIds = extractedIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n));

    if (workItemIds.length === 0) {
      const error = new Error("No valid numeric Meegle IDs found in PR");
      (error as Error & { code: string }).code = "NO_MEEGLE_ID_FOUND";
      throw error;
    }

    // Query Meegle across candidate work item types
    const allWorkitems: MeegleWorkitem[] = [];
    const foundIds = new Set<string>();

    for (const workitemTypeKey of CANDIDATE_WORK_ITEM_TYPE_KEYS) {
      try {
        lookupLogger.info({ workitemTypeKey, idCount: workItemIds.length }, "Querying Meegle for type");
        const items = await meegleClient.filterWorkitemsAcrossProjects({
          workitemTypeKey,
          workItemIds,
          pageSize: 50,
        });

        for (const item of items) {
          if (!foundIds.has(item.id)) {
            foundIds.add(item.id);
            allWorkitems.push(item);
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        lookupLogger.warn({ workitemTypeKey, error: msg }, "Meegle query failed for type, skipping");
      }
    }

    lookupLogger.info({ found: allWorkitems.length, totalTypes: CANDIDATE_WORK_ITEM_TYPE_KEYS.length }, "Meegle query complete");

    const notFound = extractedIds.filter(id => !foundIds.has(id));

    // Collect related workitem IDs (version & sprint) separately
    const versionIdSet = new Set<number>();
    const sprintIdSet = new Set<number>();
    for (const w of allWorkitems) {
      const versionKey = PLANNED_VERSION_FIELD_MAP[w.type];
      const sprintKey = PLANNED_SPRINT_FIELD_MAP[w.type];
      const versionRaw = extractFieldValue(w.fields, versionKey || "");
      const sprintRaw = extractFieldValue(w.fields, sprintKey || "");
      if (versionRaw) {
        const num = parseInt(versionRaw, 10);
        if (!isNaN(num)) versionIdSet.add(num);
      }
      if (sprintRaw) {
        const num = parseInt(sprintRaw, 10);
        if (!isNaN(num)) sprintIdSet.add(num);
      }
    }

    // Resolve related workitem names by type (best-effort; fallback to raw ID on failure)
    const relatedNameMap = new Map<string, string>();
    const relatedQueries: Array<{ label: string; typeKey: string; idSet: Set<number> }> = [
      { label: "version", typeKey: RELATED_TYPE_KEY_VERSION, idSet: versionIdSet },
      { label: "sprint", typeKey: RELATED_TYPE_KEY_SPRINT, idSet: sprintIdSet },
    ];

    for (const { label, typeKey, idSet } of relatedQueries) {
      if (idSet.size === 0) continue;
      try {
        const items = await meegleClient.filterWorkitemsAcrossProjects({
          workitemTypeKey: typeKey,
          workItemIds: Array.from(idSet),
          pageSize: idSet.size,
        });
        for (const item of items) {
          if (item.name) {
            relatedNameMap.set(item.id, item.name);
          }
        }
        lookupLogger.info({ label, resolved: items.length, total: idSet.size }, "Resolved related workitem names");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        lookupLogger.warn({ label, typeKey, error: msg }, "Failed to resolve related workitem names, falling back to IDs");
      }
    }

    // Enrich workitems with URL, readable type name, Planned Version and Planned Sprint
    // Only return fields the extension needs; drop the heavy raw `fields` blob.
    const enrichedWorkitems: LookupWorkitem[] = allWorkitems.map(w => {
      const versionKey = PLANNED_VERSION_FIELD_MAP[w.type];
      const sprintKey = PLANNED_SPRINT_FIELD_MAP[w.type];
      const projectKey = String(w.fields.project_key || w.fields.projectKey || DEFAULT_PROJECT_KEY);
      const urlSlug = TYPE_DISPLAY_MAP[w.type] || w.type;
      const versionRaw = extractFieldValue(w.fields, versionKey || "");
      const sprintRaw = extractFieldValue(w.fields, sprintKey || "");
      return {
        id: w.id,
        name: w.name,
        type: TYPE_DISPLAY_MAP[w.type] || w.type,
        status: w.status,
        url: `${BASE_URL}/${projectKey}/${urlSlug}/detail/${w.id}`,
        plannedVersion: relatedNameMap.get(versionRaw || "") || versionRaw,
        plannedSprint: relatedNameMap.get(sprintRaw || "") || sprintRaw,
      };
    });

    return {
      prInfo: {
        title: prDetails.title,
        description: prDetails.body,
        url: prDetails.html_url,
      },
      extractedIds,
      workitems: enrichedWorkitems,
      notFound,
    };
  }
}
