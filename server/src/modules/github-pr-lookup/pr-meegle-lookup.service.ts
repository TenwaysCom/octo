/**
 * PR Meegle Lookup Service
 *
 * Extracts Meegle workitem references from PR description and fetches workitem details
 */

import { MeegleClient } from "../../adapters/meegle/meegle-client.js";
import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "../../application/services/meegle-client.factory.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { refreshCredential } from "../../application/services/meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../meegle-auth/meegle-auth.service.js";
import { logger } from "../../logger.js";
import type {
  PrMeegleLookupRequest,
  ExtractedMeegleId,
  WorkitemInfo,
  PrMeegleLookupResult,
} from "./pr-meegle-lookup.dto.js";

const lookupLogger = logger.child({ module: "pr-meegle-lookup" });

// 从环境变量获取默认 projectKey
const DEFAULT_PROJECT_KEY = process.env.DEFAULT_MEEGLE_PROJECT_KEY || "";
const DEFAULT_MEEGLE_BASE_URL = process.env.MEEGLE_BASE_URL || "https://project.larksuite.com";

// 默认字段映射（可通过配置覆盖）
const DEFAULT_FIELD_MAPPING = {
  sprint: "field_sprint",      // 需要根据实际字段 key 调整
  feature: "field_feature",    // 需要根据实际字段 key 调整
};

export interface PrMeegleLookupDeps extends MeegleClientFactoryDeps {
  // 可注入的依赖
}

/**
 * 从文本中提取 Meegle ID（m-123 格式）
 */
function extractMeegleIds(text: string): ExtractedMeegleId[] {
  const ids: ExtractedMeegleId[] = [];
  const seen = new Set<string>();

  // 匹配模式：字母数字字母 + 连字符 + 数字，如 m-123, M-123, WORK-456
  // 支持的格式：
  // - m-123, M-123
  // - 在括号里：[m-123]，(m-123)
  // - 在链接中：https://.../m-123
  const pattern = /([a-zA-Z][a-zA-Z0-9]*)-([0-9]+)/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const projectKey = match[1];
    const numericId = match[2];
    const key = `${projectKey}-${numericId}`.toUpperCase();

    if (!seen.has(key)) {
      seen.add(key);
      ids.push({
        raw,
        key,
        projectKey: projectKey.toUpperCase(),
        numericId,
      });
      lookupLogger.debug({ raw, key, projectKey, numericId }, "EXTRACTED_ID");
    }
  }

  return ids;
}

/**
 * 从工作项字段中提取值
 */
function extractFieldValue(workitem: { fields: Record<string, unknown> }, key: string): string | undefined {
  if (!key) return undefined;

  const fields = workitem.fields;

  // 直接字段访问
  const directValue = fields[key];
  if (typeof directValue === "string") {
    return directValue;
  }
  if (directValue && typeof directValue === "object") {
    const obj = directValue as Record<string, unknown>;
    // 尝试常见的值字段
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.title === "string") return obj.title;
    if (typeof obj.label === "string") return obj.label;
    // 尝试数组类型（如多选）
    if (Array.isArray(obj.value) && obj.value.length > 0) {
      return obj.value.map((v: unknown) =>
        typeof v === "string" ? v : (v as Record<string, unknown>)?.name || String(v)
      ).join(", ");
    }
  }

  // field_value_pairs 格式（某些 API 返回的格式）
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
      if (fv && typeof fv === "object") {
        const obj = fv as Record<string, unknown>;
        if (typeof obj.value === "string") return obj.value;
        if (typeof obj.name === "string") return obj.name;
        if (typeof obj.title === "string") return obj.title;
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

/**
 * 将 MeegleWorkitem 转换为 WorkitemInfo
 */
function mapToWorkitemInfo(
  workitem: { id: string; key: string; name: string; type: string; status: string; assignee?: string; fields: Record<string, unknown> },
  baseUrl: string,
  fieldMapping: { sprint?: string; feature?: string },
): WorkitemInfo {
  const sprintField = fieldMapping.sprint || DEFAULT_FIELD_MAPPING.sprint;
  const featureField = fieldMapping.feature || DEFAULT_FIELD_MAPPING.feature;

  // 尝试提取 sprint 和 feature
  let sprint = extractFieldValue(workitem, sprintField);
  let feature = extractFieldValue(workitem, featureField);

  // 如果默认字段没找到，尝试其他常见字段名
  if (!sprint) {
    const possibleSprintFields = ["sprint", "Sprint", "迭代", "iteration", "field_sprint"];
    for (const field of possibleSprintFields) {
      sprint = extractFieldValue(workitem, field);
      if (sprint) break;
    }
  }

  if (!feature) {
    const possibleFeatureFields = ["feature", "Feature", "功能", "requirement", "epic", "field_feature"];
    for (const field of possibleFeatureFields) {
      feature = extractFieldValue(workitem, field);
      if (feature) break;
    }
  }

  // 构建 Meegle URL
  const projectKey = workitem.key.split("-")[0]?.toLowerCase() || "";
  const typeKey = workitem.type;
  const url = `${baseUrl}/${projectKey}/${typeKey}/detail/${workitem.id}`;

  return {
    id: workitem.id,
    key: workitem.key,
    name: workitem.name,
    type: workitem.type,
    status: workitem.status,
    assignee: workitem.assignee,
    sprint,
    feature,
    fields: workitem.fields,
    url,
  };
}

/**
 * 通过 filterWorkitems 查询工作项
 */
async function findWorkitemsByFilter(
  client: MeegleClient,
  projectKey: string,
  ids: ExtractedMeegleId[],
): Promise<{ workitems: { id: string; key: string; name: string; type: string; status: string; assignee?: string; fields: Record<string, unknown> }[]; notFound: string[] }> {
  lookupLogger.info({ projectKey, idCount: ids.length }, "FILTER_WORKITEMS_START");

  try {
    // 获取项目下所有工作项（不限制类型，分页获取）
    const allWorkitems = await client.filterWorkitems(projectKey, {
      autoPaginate: true,
    });

    lookupLogger.info({ totalWorkitems: allWorkitems.length }, "FILTER_WORKITEMS_RESULT");

    const found: { id: string; key: string; name: string; type: string; status: string; assignee?: string; fields: Record<string, unknown> }[] = [];
    const foundIds = new Set<string>();

    // 匹配规则：key 匹配（不区分大小写）或 id 匹配
    for (const workitem of allWorkitems) {
      const workitemKeyUpper = workitem.key.toUpperCase();
      const workitemId = workitem.id;

      for (const id of ids) {
        if (foundIds.has(id.key)) continue;

        // key 匹配（不区分大小写）
        if (workitemKeyUpper === id.key) {
          found.push(workitem);
          foundIds.add(id.key);
          lookupLogger.debug({ key: id.key, workitemId: workitem.id }, "MATCHED_BY_KEY");
          break;
        }

        // id 匹配
        if (workitemId === id.numericId) {
          found.push(workitem);
          foundIds.add(id.key);
          lookupLogger.debug({ key: id.key, workitemId: workitem.id }, "MATCHED_BY_ID");
          break;
        }
      }
    }

    const notFound = ids.map(id => id.key).filter(key => !foundIds.has(key));

    lookupLogger.info({ found: found.length, notFound: notFound.length }, "FIND_WORKITEMS_COMPLETE");

    return { workitems: found, notFound };
  } catch (error) {
    lookupLogger.error({ error: error instanceof Error ? error.message : String(error) }, "FILTER_WORKITEMS_ERROR");
    throw error;
  }
}

/**
 * 执行 PR Meegle 反查
 */
export async function executePrMeegleLookup(
  request: PrMeegleLookupRequest,
  deps: PrMeegleLookupDeps = {},
): Promise<PrMeegleLookupResult> {
  lookupLogger.info({ masterUserId: request.masterUserId }, "LOOKUP_START");

  try {
    // 1. 从 PR 描述和标题中提取 Meegle ID
    const textToScan = [request.prDescription, request.prTitle].filter(Boolean).join("\n");
    const extractedIds = extractMeegleIds(textToScan);

    if (extractedIds.length === 0) {
      lookupLogger.info("NO_IDS_EXTRACTED");
      return {
        ok: true,
        data: {
          extractedIds: [],
          workitems: [],
          notFound: [],
        },
      };
    }

    lookupLogger.info({ extractedCount: extractedIds.length, ids: extractedIds.map(i => i.key) }, "IDS_EXTRACTED");

    // 2. 确定 projectKey
    // 优先级：请求参数 > 环境变量 > 从 ID 中推断
    let projectKey = request.projectKey || DEFAULT_PROJECT_KEY;

    if (!projectKey && extractedIds.length > 0) {
      // 使用第一个 ID 的 projectKey
      projectKey = extractedIds[0].projectKey;
    }

    if (!projectKey) {
      return {
        ok: false,
        error: {
          errorCode: "MISSING_PROJECT_KEY",
          errorMessage: "Project key not specified and DEFAULT_MEEGLE_PROJECT_KEY not configured",
        },
      };
    }

    lookupLogger.info({ projectKey }, "USING_PROJECT_KEY");

    // 3. 解析用户并获取 Meegle 凭证
    const resolvedUser = await getResolvedUserStore().getById(request.masterUserId);
    const meegleUserKey = resolvedUser?.meegleUserKey;

    if (!meegleUserKey) {
      return {
        ok: false,
        error: {
          errorCode: "USER_NOT_RESOLVED",
          errorMessage: "Meegle user key not found for master user",
        },
      };
    }

    const authDeps = getConfiguredMeegleAuthServiceDeps();
    const baseUrl = request.meegleBaseUrl || DEFAULT_MEEGLE_BASE_URL;

    const refreshResult = await refreshCredential(
      {
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl,
      },
      {
        authAdapter: authDeps.authAdapter,
        tokenStore: authDeps.tokenStore!,
        meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
      },
    );

    if (refreshResult.tokenStatus !== "ready" || !refreshResult.userToken) {
      return {
        ok: false,
        error: {
          errorCode: "AUTH_EXPIRED",
          errorMessage: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
        },
      };
    }

    // 4. 创建 Meegle Client
    const meegleClient = await createMeegleClient(
      {
        masterUserId: request.masterUserId,
        meegleUserKey,
        baseUrl,
      },
      deps,
    );

    // 5. 查询工作项
    const { workitems: foundWorkitems, notFound } = await findWorkitemsByFilter(
      meegleClient,
      projectKey,
      extractedIds,
    );

    // 6. 转换为 WorkitemInfo
    const fieldMapping = request.fieldMapping || {};
    const workitems = foundWorkitems.map(w => mapToWorkitemInfo(w, baseUrl, fieldMapping));

    lookupLogger.info({
      extracted: extractedIds.length,
      found: workitems.length,
      notFound: notFound.length,
    }, "LOOKUP_COMPLETE");

    return {
      ok: true,
      data: {
        extractedIds,
        workitems,
        notFound,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    lookupLogger.error({ error: errorMessage }, "LOOKUP_ERROR");

    return {
      ok: false,
      error: {
        errorCode: "LOOKUP_FAILED",
        errorMessage,
      },
    };
  }
}
