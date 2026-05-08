/**
 * GitHub Branch Create Service
 *
 * Fetches Meegle workitem details, resolves the System field to a GitHub repo,
 * generates a default branch name, and creates the branch via GitHub API.
 */

import { GitHubClient } from "../../adapters/github/github-client.js";
import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "../../application/services/meegle-client.factory.js";
import { refreshCredential } from "../../application/services/meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { logger } from "../../logger.js";
import { pinyin } from "pinyin-pro";

const branchLogger = logger.child({ module: "github-branch-create-service" });

// System field keys by work item type
const FIELD_SYSTEM_STORY = "field_0dba3a";
const FIELD_SYSTEM_STORY_LEGACY = "field_00f541";
const FIELD_SYSTEM_BUG = "field_4976fc";

// System sub-option value → GitHub repo mapping
const SYSTEM_REPO_MAP: Record<string, string> = {
  cyvssley1: "TenwaysCom/Tenways",     // Odoo (default to EU repo)
  ihib59zp4: "TenwaysCom/Tenways",      // Odoo EU
  wjuvtyuqx: "TenwaysCom/tenways-ukk",  // Odoo UK
  "76xrqgsmz": "TWS-lance/odoo_tenways", // Odoo US
  f9m7hf4o5: "TenwaysCom/Tenways",       // Odoo EU (new story field)
  pbn35bnap: "TenwaysCom/tenways-ukk",   // Odoo UK (new story field)
  "8h79nr2_o": "TWS-lance/odoo_tenways", // Odoo US (new story field)
};

const SYSTEM_LABEL_MAP: Record<string, string> = {
  cyvssley1: "Odoo",
  ihib59zp4: "Odoo EU",
  wjuvtyuqx: "Odoo UK",
  "76xrqgsmz": "Odoo US",
  f9m7hf4o5: "Odoo EU",
  pbn35bnap: "Odoo UK",
  "8h79nr2_o": "Odoo US",
  ebzvt6did: "Portal",
  "9nvjyudq5": "Portal EU",
  zxw12oyz6: "Portal UK",
  "5ye2igmb5": "Portal US",
  "2llp11l7n": "Tenways App",
  iah8c3288: "Tenways App IOS",
  h9op5g49a: "Tenways App Android",
  o0wesage1: "Tenways Backend Platform",
  "31j37nw9x": "Turbo App",
  "2u3x4uhi0": "Turbo App IOS",
  "07y3cfiw2": "Turbo App Android",
};

// Meegle api_name → type_key mapping (reused from meegle-lark-push.service)
const MEEGLE_API_NAME_TO_TYPE_KEY: Record<string, string> = {
  story: "story",
  issue: "issue",
  chart: "chart",
  sub_task: "sub_task",
  sprint1: "642ebe04168eea39eeb0d34a",
  epic: "642ec373f4af608bb3cb1c90",
  version: "642f8d55c7109143ec2eb478",
  test_plans: "63fc6b3a842ed46a33c769cf",
  test_cases: "63fc6356a3568b3fd3800e88",
  using_test_case: "63fc81008b7f897a30b36663",
  project_a: "65a8a9f954468841b9caa572",
  test_cases_set: "661c999c4c8ec6ff7208f393",
  voc: "6621e5b5be796e305e3a9229",
  techtask: "66700acbf297a8f821b4b860",
  changeapproval: "6819b8e43035408c4c94307d",
  production_bug: "6932e40429d1cd8aac635c82",
};

function resolveMeegleTypeKey(apiName: string): string {
  return MEEGLE_API_NAME_TO_TYPE_KEY[apiName] || apiName;
}

function isBugType(workItemTypeKey: string): boolean {
  const bugApiNames = ["issue", "production_bug", "bug"];
  return bugApiNames.includes(workItemTypeKey);
}

function getSystemFieldKeys(workItemTypeKey: string): string[] {
  if (isBugType(workItemTypeKey)) {
    return [FIELD_SYSTEM_BUG];
  }

  return [FIELD_SYSTEM_STORY, FIELD_SYSTEM_STORY_LEGACY];
}

function getFieldValue(workitem: { fields: Record<string, unknown> }, key: string): string | undefined {
  const directValue = workitem.fields[key];
  if (typeof directValue === "string") {
    return directValue;
  }
  if (directValue && typeof directValue === "object") {
    const obj = directValue as Record<string, unknown>;
    if (typeof obj.value === "string") {
      return obj.value;
    }
  }

  const fieldValuePairs = workitem.fields.fields;
  if (Array.isArray(fieldValuePairs)) {
    const pair = fieldValuePairs.find(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        (p as Record<string, unknown>).field_key === key,
    ) as Record<string, unknown> | undefined;

    if (pair) {
      const fv = pair.field_value;
      if (typeof fv === "string") {
        return fv;
      }
      if (fv && typeof fv === "object") {
        const obj = fv as Record<string, unknown>;
        if (typeof obj.value === "string") {
          return obj.value;
        }
      }
    }
  }

  return undefined;
}

function parseSystemObjectCandidates(
  value: unknown,
): Array<{ systemValue: string; systemLabel: string }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const obj = value as Record<string, unknown>;
  const childCandidates = parseSystemObjectCandidates(obj.children);
  const currentValue = typeof obj.value === "string" ? obj.value : undefined;
  const currentLabel =
    typeof obj.label === "string"
      ? obj.label
      : currentValue
        ? (SYSTEM_LABEL_MAP[currentValue] || currentValue)
        : undefined;
  const currentCandidate =
    currentValue && currentLabel
      ? [{ systemValue: currentValue, systemLabel: currentLabel }]
      : [];

  return [...childCandidates, ...currentCandidate];
}

function getFieldSystemCandidates(
  workitem: { fields: Record<string, unknown> },
  key: string,
): Array<{ systemValue: string; systemLabel: string }> {
  const directValue = workitem.fields[key];
  if (typeof directValue === "string") {
    return parseSystemCandidates(directValue);
  }
  if (directValue && typeof directValue === "object") {
    const directCandidates = parseSystemObjectCandidates(directValue);
    if (directCandidates.length > 0) {
      return directCandidates;
    }
  }

  const fieldValuePairs = workitem.fields.fields;
  if (Array.isArray(fieldValuePairs)) {
    const pair = fieldValuePairs.find(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        (p as Record<string, unknown>).field_key === key,
    ) as Record<string, unknown> | undefined;

    if (pair) {
      const fv = pair.field_value;
      if (typeof fv === "string") {
        return parseSystemCandidates(fv);
      }
      if (fv && typeof fv === "object") {
        const pairCandidates = parseSystemObjectCandidates(fv);
        if (pairCandidates.length > 0) {
          return pairCandidates;
        }
      }
    }
  }

  return [];
}

function parseSystemCandidates(rawValue: string): Array<{ systemValue: string; systemLabel: string }> {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  if (!trimmed.startsWith("[")) {
    return [{
      systemValue: trimmed,
      systemLabel: SYSTEM_LABEL_MAP[trimmed] || trimmed,
    }];
  }

  try {
    const parsed = JSON.parse(trimmed) as Array<{ value: string; label: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }
    return parsed
      .slice()
      .reverse()
      .filter((item) => Boolean(item?.value))
      .map((item) => ({
        systemValue: item.value,
        systemLabel: item.label || item.value,
      }));
  } catch {
    return [];
  }
}

export function parseSystemValue(rawValue: string): { systemValue: string; systemLabel: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("[")) {
    return null; // Return null for invalid JSON (non-array) in parseSystemValue as expected by tests
  }
  const candidates = parseSystemCandidates(rawValue);
  return candidates[0] ?? null;
}

function slugifyTitle(title: string): string {
  const transliterated = pinyin(title, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  }).join(" ");

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function generateDefaultBranchName(
  workItemId: string,
  workItemTitle: string,
  isBug: boolean,
): Promise<string> {
  const prefix = isBug ? "fix" : "feat";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  
  // Base format: prefix/date-m-id-
  const base = `${prefix}/${dateStr}-m-${workItemId}`;

  // Helper function for the original pinyin logic
  const getPinyinSlug = (title: string): string => {
    const transliterated = pinyin(title, {
      toneType: "none",
      type: "array",
      nonZh: "consecutive",
    }).join(" ");

    return transliterated
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  };

  // Helper to format the final branch name and enforce length limits
  const formatFinalBranchName = (slug: string): string => {
    if (!slug) {
      return base.slice(0, 50);
    }
    const full = `${base}_${slug}`;
    if (full.length <= 50) {
      return full;
    }
    const maxSlugLen = 50 - base.length - 1;
    if (maxSlugLen <= 0) {
      return base.slice(0, 50);
    }
    return `${base}_${slug.slice(0, maxSlugLen)}`;
  };

  try {
    const prompt = `
作为一个高级软件工程师，请根据以下需求标题生成一个符合规范的 GitHub 分支名称后缀（英文，小写，单词之间用下划线连接）。
需求标题："${workItemTitle}"

规则：
1. 只返回英文分支名称后缀部分，不要包含前缀（如 feat/、fix/）。
2. 不要包含日期或 ID。
3. 保持简短、具有描述性，单词之间用下划线（_）连接。
4. 不要返回任何其他解释性文字。
5. 示例："user_login", "export_excel", "fix_null_pointer"。
`;

    branchLogger.info({ workItemId, workItemTitle }, "DEEPSEEK_BRANCH_NAME_REQUEST_START");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-11cbd6c80cc34cff81652d48d06b72da"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个专门用于生成代码分支名称的助手。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    branchLogger.info({ status: response.status, ok: response.ok }, "DEEPSEEK_BRANCH_NAME_RESPONSE_RECEIVED");

    if (!response.ok) {
      const errorText = await response.text();
      branchLogger.error({ status: response.status, errorText }, "DEEPSEEK_BRANCH_NAME_HTTP_ERROR");
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const aiSuggestedSuffix = data.choices?.[0]?.message?.content?.trim();
    
    if (aiSuggestedSuffix) {
      branchLogger.info({ model: data.model, original: workItemTitle, aiSuffix: aiSuggestedSuffix }, "DEEPSEEK_BRANCH_NAME_GENERATED");
      return formatFinalBranchName(aiSuggestedSuffix);
    }
    
    branchLogger.warn({ data }, "DEEPSEEK_BRANCH_NAME_EMPTY_RESPONSE");
    throw new Error("Empty AI response");
  } catch (error) {
    branchLogger.warn(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      "DEEPSEEK_BRANCH_NAME_FAILED_FALLBACK_TO_PINYIN"
    );
    return formatFinalBranchName(getPinyinSlug(workItemTitle));
  }
}

export interface GitHubBranchPreviewResult {
  ok: true;
  repo: string;
  defaultBranchName: string;
  workItemTitle: string;
  systemValue: string;
  systemLabel: string;
}

export interface GitHubBranchCreateResult {
  ok: true;
  repo: string;
  branchName: string;
  branchUrl: string;
}

export interface GitHubBranchPreviewInput {
  projectKey: string;
  workItemTypeKey: string;
  workItemId: string;
  masterUserId: string;
  baseUrl: string;
}

export interface GitHubBranchCreateInput extends GitHubBranchPreviewInput {
  branchName: string;
}

export interface GitHubBranchCreateDeps extends MeegleClientFactoryDeps {
  githubClient?: GitHubClient;
}

export async function previewBranchCreate(
  input: GitHubBranchPreviewInput,
  deps: GitHubBranchCreateDeps = {},
): Promise<GitHubBranchPreviewResult> {
  branchLogger.info({
    projectKey: input.projectKey,
    workItemTypeKey: input.workItemTypeKey,
    workItemId: input.workItemId,
    masterUserId: input.masterUserId,
  }, "BRANCH_PREVIEW_START");

  const resolvedUser = await getResolvedUserStore().getById(input.masterUserId);
  const meegleUserKey = resolvedUser?.meegleUserKey;
  if (!meegleUserKey) {
    throw new Error("Meegle user key not found for master user");
  }

  const authDeps = getConfiguredMeegleAuthServiceDeps();
  const refreshResult = await refreshCredential(
    {
      masterUserId: input.masterUserId,
      meegleUserKey,
      baseUrl: input.baseUrl,
    },
    {
      authAdapter: authDeps.authAdapter,
      tokenStore: authDeps.tokenStore!,
      meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
    },
  );
  if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
    throw new Error("Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。");
  }

  const meegleClient = await createMeegleClient(
    {
      masterUserId: input.masterUserId,
      meegleUserKey,
      baseUrl: input.baseUrl,
    },
    deps,
  );

  const resolvedTypeKey = resolveMeegleTypeKey(input.workItemTypeKey);
  branchLogger.debug({ apiName: input.workItemTypeKey, resolvedTypeKey }, "BRANCH_PREVIEW_RESOLVE_TYPE");

  const workitems = await meegleClient.getWorkitemDetails(
    input.projectKey,
    resolvedTypeKey,
    [input.workItemId],
  );

  if (workitems.length === 0) {
    throw new Error(`Workitem ${input.workItemId} not found`);
  }

  const workitem = workitems[0];
  const systemFieldKeys = getSystemFieldKeys(input.workItemTypeKey);
  const systemField = systemFieldKeys
    .map((key) => ({
      key,
      value: getFieldValue(workitem, key),
      candidates: getFieldSystemCandidates(workitem, key),
    }))
    .find((candidate) => Boolean(candidate.value) || candidate.candidates.length > 0);
  const rawSystemValue = systemField?.value;
  const systemCandidates = systemField?.candidates ?? [];
    
  branchLogger.debug(
    {
      systemFieldKeys,
      systemFieldKey: systemField?.key,
      rawSystemValue,
      systemCandidates,
    },
    "BRANCH_PREVIEW_SYSTEM_RAW",
  );

  if (!rawSystemValue && systemCandidates.length === 0) {
    throw new Error("该工作项未设置 System 字段，无法确定目标 GitHub 仓库。");
  }

  const resolvedCandidates =
    systemCandidates.length > 0
      ? systemCandidates
      : parseSystemCandidates(rawSystemValue || "");
  if (resolvedCandidates.length === 0) {
    throw new Error(`无法解析 System 字段值: ${rawSystemValue}`);
  }
  const systemParsed = resolvedCandidates.find((candidate) => SYSTEM_REPO_MAP[candidate.systemValue]);
  if (!systemParsed) {
    const primaryCandidate = resolvedCandidates[0];
    const knownSystems = Object.values(SYSTEM_REPO_MAP)
      .map((r) => r.split("/")[1])
      .join(", ");
    throw new Error(
      `System "${primaryCandidate.systemLabel}" (${primaryCandidate.systemValue}) 暂无对应的 GitHub 仓库。目前仅支持: ${knownSystems}`,
    );
  }

  const { systemValue, systemLabel } = systemParsed;
  const repo = SYSTEM_REPO_MAP[systemValue];

  if (!repo) {
    const knownSystems = Object.values(SYSTEM_REPO_MAP)
      .map((r) => r.split("/")[1])
      .join(", ");
    throw new Error(`System "${systemLabel}" (${systemValue}) 暂无对应的 GitHub 仓库。目前仅支持: ${knownSystems}`);
  }

  const isBug = isBugType(input.workItemTypeKey);
  const defaultBranchName = await generateDefaultBranchName(input.workItemId, workitem.name, isBug);

  branchLogger.info({
    repo,
    defaultBranchName,
    systemValue,
    systemLabel,
    isBug,
  }, "BRANCH_PREVIEW_OK");

  return {
    ok: true,
    repo,
    defaultBranchName,
    workItemTitle: workitem.name,
    systemValue,
    systemLabel,
  };
}

export async function executeBranchCreate(
  input: GitHubBranchCreateInput,
  deps: GitHubBranchCreateDeps = {},
): Promise<GitHubBranchCreateResult> {
  branchLogger.info({
    projectKey: input.projectKey,
    workItemTypeKey: input.workItemTypeKey,
    workItemId: input.workItemId,
    branchName: input.branchName,
  }, "BRANCH_CREATE_START");

  // Validate preview first to ensure repo exists
  const preview = await previewBranchCreate(input, deps);

  const githubClient = deps.githubClient;
  if (!githubClient) {
    throw new Error("GitHub client is not configured");
  }

  const [owner, repo] = preview.repo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo format: ${preview.repo}`);
  }

  const result = await githubClient.createBranch(owner, repo, input.branchName, "main");

  branchLogger.info({
    repo: preview.repo,
    branchName: input.branchName,
    ref: result.ref,
  }, "BRANCH_CREATE_OK");

  return {
    ok: true,
    repo: preview.repo,
    branchName: input.branchName,
    branchUrl: `https://github.com/${preview.repo}/tree/${input.branchName}`,
  };
}
