import { runPMAnalysis, type PMAnalysisDeps, type MeegleWorkitemAnalysisItem, type LarkTicketAnalysisItem } from "../../application/services/pm-analysis.service.js";
import { validatePMAnalysisRequest } from "./pm-analysis.dto.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { refreshCredential } from "../../application/services/meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../meegle-auth/meegle-auth.service.js";
import { createMeegleClient } from "../../application/services/meegle-client.factory.js";
import { resolveSlaTargetHours } from "./sla-config.js";
import { logger } from "../../logger.js";

const pmAnalysisControllerLogger = logger.child({ module: "pm-analysis-controller" });

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

export async function runPMAnalysisController(input: unknown) {
  const validated = validatePMAnalysisRequest(input);

  let deps: PMAnalysisDeps = {};

  if (validated.masterUserId && validated.baseUrl) {
    try {
      const resolvedUser = await getResolvedUserStore().getById(validated.masterUserId);
      const meegleUserKey = resolvedUser?.meegleUserKey;
      if (meegleUserKey) {
        const authDeps = getConfiguredMeegleAuthServiceDeps();
        const refreshResult = await refreshCredential(
          {
            masterUserId: validated.masterUserId,
            meegleUserKey,
            baseUrl: validated.baseUrl,
          },
          {
            authAdapter: authDeps.authAdapter,
            tokenStore: authDeps.tokenStore!,
            meegleAuthBaseUrl: authDeps.meegleAuthBaseUrl,
          },
        );

        if (refreshResult.tokenStatus === "ready" && refreshResult.userToken) {
          const meegleClient = await createMeegleClient({
            masterUserId: validated.masterUserId,
            meegleUserKey,
            baseUrl: validated.baseUrl,
          });

          deps.loadLarkTicketItems = async () => [];

          deps.loadMeegleWorkitemItems = async (projectKeys: string[], timeWindowDays: number) => {
            const cutoffMs = Date.now() - timeWindowDays * 24 * 3600 * 1000;
            const allItems: MeegleWorkitemAnalysisItem[] = [];

            for (const projectKey of projectKeys) {
              try {
                // Fetch story, issue, production_bug, techtask workitems
                const typeKeys = ["story", "issue", "production_bug", "techtask"];
                const workitems = await meegleClient.filterWorkitems(projectKey, {
                  workitemTypeKeys: typeKeys.map(resolveMeegleTypeKey),
                  autoPaginate: true,
                });

                for (const w of workitems) {
                  const createdAtMs = typeof w.fields.created_at === "number"
                    ? w.fields.created_at
                    : 0;
                  // Only include items created within the time window
                  if (createdAtMs < cutoffMs && createdAtMs > 0) {
                    continue;
                  }

                  const ageDays = createdAtMs > 0
                    ? Math.floor((Date.now() - createdAtMs) / (24 * 3600 * 1000))
                    : 0;

                  // Determine status from current_nodes or work_item_status
                  let status: MeegleWorkitemAnalysisItem["status"] = "in_progress";
                  const currentNodes = w.fields.current_nodes as Array<{ name?: string; state?: string }> | undefined;
                  const workItemStatus = w.fields.work_item_status as { state_key?: string } | undefined;
                  const nodeName = currentNodes?.[0]?.name || currentNodes?.[0]?.state || "";
                  const stateKey = workItemStatus?.state_key || "";

                  if (nodeName.includes("阻塞") || nodeName.includes("blocked") || stateKey.includes("blocked")) {
                    status = "blocked";
                  } else if (nodeName.includes("完成") || nodeName.includes("done") || nodeName.includes("closed") || stateKey.includes("done") || stateKey.includes("closed")) {
                    status = "done";
                  }

                  // SLA calculation
                  const elapsedHours = Math.floor((Date.now() - createdAtMs) / 3600000);
                  const urgency = getFieldValue(w, "紧急度") || "";
                  const priority = getFieldValue(w, "Priority") || "";
                  const slaTargetHours = resolveSlaTargetHours({
                    紧急度: urgency,
                    Urgency: urgency,
                    Priority: priority,
                    优先级: priority,
                  });
                  const slaBreached = elapsedHours > slaTargetHours;

                  allItems.push({
                    id: w.id || w.key || "",
                    projectKey,
                    status,
                    ageDays,
                    createdAt: createdAtMs,
                    elapsedHours,
                    slaTargetHours,
                    slaBreached,
                    name: w.name,
                  });
                }
              } catch (err) {
                pmAnalysisControllerLogger.warn({
                  projectKey,
                  error: err instanceof Error ? err.message : String(err),
                }, "PM_ANALYSIS_LOAD_PROJECT_FAIL");
              }
            }

            return allItems;
          };

          pmAnalysisControllerLogger.info({
            masterUserId: validated.masterUserId,
            projectCount: validated.projectKeys.length,
          }, "PM_ANALYSIS_REAL_LOADER_READY");
        }
      }
    } catch (err) {
      pmAnalysisControllerLogger.warn({
        masterUserId: validated.masterUserId,
        error: err instanceof Error ? err.message : String(err),
      }, "PM_ANALYSIS_LOADER_SETUP_FAIL");
    }
  }

  return runPMAnalysis(validated, deps);
}
