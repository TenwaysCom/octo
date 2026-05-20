import {
  createMeegleClient,
  type MeegleClientFactoryDeps,
} from "../../application/services/meegle-client.factory.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "../../application/services/lark-auth-client.factory.js";
import { refreshCredential } from "../../application/services/meegle-credential.service.js";
import { getConfiguredMeegleAuthServiceDeps } from "../../modules/meegle-auth/meegle-auth.service.js";
import { getResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { logger } from "../../logger.js";
import { MeegleAuthenticationError } from "../../adapters/meegle/meegle-client.js";
import { resolveSlaTargetHours } from "../pm-analysis/sla-config.js";
import { LarkClient } from "../../adapters/lark/lark-client.js";
import type { GenerateSummaryRequest, ApplySummaryRequest } from "./meegle-summary.dto.js";

const summaryLogger = logger.child({ module: "meegle-summary-service" });

// ── AI 服务配置 ──────────────────────────────────────────────────────

const KIMI_ACP_SERVICE_ENABLED = process.env.KIMI_ACP_SERVICE_ENABLED === "true";
const KIMI_ACP_SERVICE_URL = process.env.KIMI_ACP_SERVICE_URL || "http://localhost:3456";

async function callKimiAcpService(message: string): Promise<string> {
  const res = await fetch(`${KIMI_ACP_SERVICE_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(`ACP service error: ${err.error || res.statusText}`);
  }

  const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!data.ok || !data.text) {
    throw new Error(`ACP service error: ${data.error || "empty response"}`);
  }

  return data.text;
}

async function callKimiAcpServiceYolo(message: string): Promise<string> {
  const res = await fetch(`${KIMI_ACP_SERVICE_URL}/prompt-yolo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(`ACP yolo service error: ${err.error || res.statusText}`);
  }

  const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!data.ok || !data.text) {
    throw new Error(`ACP yolo service error: ${data.error || "empty response"}`);
  }

  return data.text;
}

const MAX_DESCRIPTION_LEN = 3000;

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n\n[...内容已截断，原始描述请查看 workitem description 字段]";
}

export function buildSummaryPrompt(
  workitem: { name: string; assignee?: string; fields: Record<string, unknown> },
  larkRecord: { fields: Record<string, unknown>; created_time?: string } | null,
  isBug: boolean,
  meegleCreatedAt: number,
  chatHistory: string,
): string {
  const rawDescription = String(workitem.fields.description || "");
  const description = truncateText(rawDescription, MAX_DESCRIPTION_LEN);
  const name = workitem.name || "";
  const assignee = workitem.assignee || "未指派";
  const status = String(workitem.fields.status || "");

  const source = larkRecord
    ? String(larkRecord.fields["需求人"] || larkRecord.fields["Reporter"] || assignee)
    : assignee;
  const tag = larkRecord ? String(larkRecord.fields["tag"] || "") : "";
  const urgency = larkRecord
    ? String(larkRecord.fields["紧急度"] || larkRecord.fields["Urgency"] || "")
    : "";
  const priority = larkRecord
    ? String(larkRecord.fields["Priority"] || larkRecord.fields["优先级"] || "")
    : "";

  const typeLabel = isBug ? "Bug" : "Story";
  const createdTime = new Date(meegleCreatedAt).toISOString();
  const endTime = resolveWorkitemEndTime(workitem.fields.state_times);

  const larkInfo = larkRecord
    ? `Lark 原始记录信息：
- 需求人/Reporter：${source}
- 标签：${tag}
- 紧急度：${urgency}
- 优先级：${priority}`
    : "";

  const chatContext = chatHistory
    ? `相关 Lark 聊天记录摘要（来自消息 thread）：
${chatHistory}`
    : "";

  const slaBlockForPrompt = buildSlaBlock({
    createdTimeMs: meegleCreatedAt,
    larkRecord,
    stateTimes: workitem.fields.state_times,
  });

  const bugTemplate = `## ✅ 核心信息确认
根据下方的描述内容，判断以下检查项是否已包含。已包含的打 [x]，未包含的打 [ ]，并在括号中给出简要说明。
- [${description.includes("现象") || description.includes("问题") ? "x" : " "}] 问题现象 — 用户看到了什么异常？
- [${/环境|版本|系统|browser|chrome|ios|android/i.test(description) ? "x" : " "}] 发生环境 — 设备、系统版本、浏览器
- [${/步骤|复现|重现|repro|step/i.test(description) ? "x" : " "}] 复现步骤 — 可稳定重现的操作路径
- [${description.includes("期望") || description.includes("应该") ? "x" : " "}] 期望结果 — 正确行为应该是什么
- [${description.includes("实际") || description.includes("结果") ? "x" : " "}] 实际结果 — 实际发生了什么
- [${/https?:\/\//.test(description) ? "x" : " "}] 证据链接 — 截图、录屏、日志链接

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 如果某项未包含，请在本区块的括号中补充关键线索。

## 🔍 测试结论（测试填写 / 确认补充）
请根据描述中的测试信息，预填以下内容：
- 复现步骤（确认/补充）：
- 期望结果：
- 回归范围：

## 🔧 开发总结（开发填写）
请根据描述中的技术信息，预填以下内容：
- 根因分析：
- 修复方案：
- 技术影响面：
- 预防措施：

## 📢 产品评估（PM 填写）
请根据紧急度和优先级信息，预填以下内容：
- 严重程度：${urgency ? `（紧急度：${urgency}）` : ""}
- 客户影响判断：${priority ? `（优先级：${priority}）` : ""}
- 对外说明口径：

${slaBlockForPrompt}`;

  const storyTemplate = `## ✅ 核心信息确认
根据下方的描述内容，判断以下检查项是否已包含。已包含的打 [x]，未包含的打 [ ]，并在括号中给出简要说明。
- [${/背景|目标|目的|why/i.test(description) ? "x" : " "}] 业务背景 & 目标 — 为什么要做这个需求？
- [${/范围|影响|scope/i.test(description) ? "x" : " "}] 影响范围 — 涉及哪些模块/用户/页面？
- [${/验收|标准|acceptance|criteria/i.test(description) ? "x" : " "}] 验收标准 — 怎样算完成？
- [${/优先级|原因|priority/i.test(description) ? "x" : " "}] 优先级原因 — 为什么现在做？
- [${/不做|排除|out.of.scope/i.test(description) ? "x" : " "}] 明确不做范围 — 本次迭代不碰什么？
- [${/https?:\/\//.test(description) ? "x" : " "}] 关联文档链接 — PRD、设计稿、接口文档

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 如果某项未包含，请在本区块的括号中补充关键线索。

## 🎯 产品结论（PM 填写 / 确认补充）
请根据描述中的产品信息，预填以下内容：
- 影响范围（确认/补充）：
- 验收标准（确认/补充）：
- 优先级原因：${priority ? `（优先级：${priority}）` : ""}
- 明确不做：
- 验收人：${assignee}

## ⚙️ 开发总结（开发填写）
请根据描述中的技术信息，预填以下内容：
- 技术依赖：
- 技术风险：
- 关键设计决策：

## 🧪 测试总结（测试填写）
请根据描述中的测试信息，预填以下内容：
- 测试关注点：
- 验证结果：

## 🔗 关联 & 变更（AI 自动维护）
- 关联 Bug：（如果描述中提到了相关 Bug，请列出）
- 需求变更记录：（如果描述中有变更历史，请记录）

## ⏱️ 进度状态（AI 自动计算）
- 来源：${source}${tag ? ` / 标签：${tag}` : ""}
- 创建时间：${createdTime}
${endTime ? `- 完成时间：${new Date(endTime).toISOString()}
- 状态：✅ 已完成` : `- 当前节点：${status}`}`;

  return `【系统指令】
请忽略之前的所有对话内容，将以下信息作为全新的独立任务处理。请使用中文回答。

【角色】
你是一个资深产品经理助手，擅长从需求/缺陷描述中提炼结构化信息，生成清晰、可执行的 workitem 总结。

【输入信息】
Workitem 类型：${typeLabel}
Workitem 名称：${name}
当前状态：${status}
指派给：${assignee}
创建时间：${createdTime}

${larkInfo}

${chatContext}

描述内容（用于参考和提炼，总结中不要重复原文）：
${description}

【任务要求】
请基于以上信息，生成一份结构化的 Markdown 总结。要求：

1. **不要重复原文**：总结字段只放提炼后的结论和待补充项，原始描述永远在 description 里
2. **预填已确认项**：如果描述中已包含某部分信息（如业务背景、根因分析），请在对应区块预填提炼后的内容，不要留空
3. **标注待补充项**：如果描述中缺少某部分关键信息，保留该区块的标题和占位符，让后续人员补充
4. **使用 Markdown 格式**：用 ## 分隔区块，用 - [x] / - [ ] 表示检查清单
5. **简洁有力**：每个要点控制在 1-3 句话，不要长篇大论

【输出格式】
直接输出以下 Markdown 内容，不要加任何解释性前言或结语：

${isBug ? bugTemplate : storyTemplate}`;
}

const FIELD_LARK_RECORD_LINK = "field_e8ad0a";
const FIELD_LARK_SHARED_RECORD_URL = "field_e7984b";
const FIELD_LARK_MESSAGE_LINK = "field_8d0341";

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

function parseLarkRecordLink(
  link: string,
): { baseId: string; tableId: string; recordId: string } | null {
  try {
    const url = new URL(link);
    const baseId = url.searchParams.get("base") || "";
    const tableId = url.searchParams.get("table") || "";
    const recordId = url.searchParams.get("record") || "";
    if (baseId && tableId && recordId) {
      return { baseId, tableId, recordId };
    }
    const segmentMatch = link.match(/\/base\/([^/]+)\/table\/([^/]+)\/record\/([^/?]+)/);
    if (segmentMatch) {
      return { baseId: segmentMatch[1], tableId: segmentMatch[2], recordId: segmentMatch[3] };
    }
    const queryMatch = link.match(/\/base\/([^/?]+).*?[?&]table=([^&]+).*?[?&]record=([^&]+)/);
    if (queryMatch) {
      return { baseId: queryMatch[1], tableId: queryMatch[2], recordId: queryMatch[3] };
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

export function parseLarkMessageLink(
  link: string,
): { threadId?: string; chatId?: string; messageId?: string } | null {
  try {
    const url = new URL(link);
    const threadId = url.searchParams.get("threadid") || undefined;
    const chatId = url.searchParams.get("chatid") || undefined;
    const messageId = url.searchParams.get("messageid") || undefined;
    if (threadId || chatId || messageId) {
      return { threadId, chatId, messageId };
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

export function extractTextFromLarkMessageContent(contentJson: string | undefined): string {
  if (!contentJson) return "";
  try {
    const parsed = JSON.parse(contentJson);
    if (typeof parsed.text === "string") {
      return parsed.text;
    }
    // post message (rich text)
    if (Array.isArray(parsed.content)) {
      const texts: string[] = [];
      for (const block of parsed.content) {
        if (Array.isArray(block)) {
          for (const element of block) {
            if (element?.tag === "text" && typeof element.text === "string") {
              texts.push(element.text);
            }
          }
        }
      }
      if (texts.length > 0) return texts.join(" ");
    }
    if (typeof parsed.content === "string") {
      return parsed.content;
    }
    return "";
  } catch {
    return contentJson;
  }
}

export async function fetchLarkChatHistory(
  larkClient: LarkClient,
  messageLink: string,
  maxChars = 2000,
): Promise<string> {
  const info = parseLarkMessageLink(messageLink);
  if (!info) return "";

  const messages: string[] = [];

  try {
    if (info.threadId) {
      summaryLogger.debug({ threadId: info.threadId }, "CHAT_HISTORY_FETCH_THREAD");
      const thread = await larkClient.getThreadMessages(info.threadId);
      for (const item of thread.items) {
        const text = extractTextFromLarkMessageContent(item.content);
        if (text) messages.push(text);
      }
      summaryLogger.debug({ count: messages.length }, "CHAT_HISTORY_THREAD_OK");
    } else if (info.messageId) {
      summaryLogger.debug({ messageId: info.messageId }, "CHAT_HISTORY_FETCH_MESSAGE");
      const msg = await larkClient.getMessage(info.messageId);
      const text = extractTextFromLarkMessageContent(msg.content);
      if (text) messages.push(text);
      summaryLogger.debug({ count: messages.length }, "CHAT_HISTORY_MESSAGE_OK");
    }
  } catch (err) {
    summaryLogger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "CHAT_HISTORY_FETCH_FAIL",
    );
    return "";
  }

  if (messages.length === 0) return "";

  // Take most recent messages (thread API returns chronological order)
  const maxMessages = 20;
  const recentMessages = messages.slice(-maxMessages);

  let result = "";
  for (const text of recentMessages) {
    const truncated = text.slice(0, 300);
    const line = `- ${truncated}`;
    if (result.length + line.length + 1 > maxChars) {
      result += "\n[...更多聊天记录已截断]";
      break;
    }
    result += (result ? "\n" : "") + line;
  }

  return result;
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

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"<>]+/g;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}

function formatDurationMs(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) {
    return `${days}天${remainingHours}小时`;
  }
  return `${hours}小时`;
}

function resolveWorkitemEndTime(stateTimes: unknown): number | undefined {
  if (!Array.isArray(stateTimes)) return undefined;
  // Find the last state with an end_time (workitem is finished)
  for (let i = stateTimes.length - 1; i >= 0; i--) {
    const state = stateTimes[i];
    if (state && typeof state.end_time === "number") {
      return state.end_time;
    }
  }
  return undefined;
}

function buildStatusSummary(
  workitem: { name: string; fields: Record<string, unknown> },
  meegleCreatedAt: number,
): string {
  const stateTimes = workitem.fields.state_times;
  const endTime = resolveWorkitemEndTime(stateTimes);
  const workItemStatus = workitem.fields.work_item_status as
    | { state_key?: string; history?: Array<{ state_key: string; updated_at: number }> }
    | undefined;

  if (endTime) {
    const elapsedMs = endTime - meegleCreatedAt;
    const finishedDate = new Date(endTime).toISOString().slice(0, 10);
    return `✅ 已完成 | 实际耗时 ${formatDurationMs(elapsedMs)} | ${finishedDate} 完成`;
  }

  const elapsedMs = Date.now() - meegleCreatedAt;
  const elapsedStr = formatDurationMs(elapsedMs);

  // Try to get the current state name from state_times
  if (Array.isArray(stateTimes) && stateTimes.length > 0) {
    const lastState = stateTimes[stateTimes.length - 1];
    const stateName = typeof lastState?.name === "string" ? lastState.name : "";
    if (stateName) {
      return `⏳ ${stateName} | 已耗时 ${elapsedStr}`;
    }
  }

  // Fallback to state_key from work_item_status
  const currentStateKey = workItemStatus?.state_key;
  if (currentStateKey) {
    return `⏳ ${currentStateKey} | 已耗时 ${elapsedStr}`;
  }

  return `⏳ 进行中 | 已耗时 ${elapsedStr}`;
}

function buildSlaBlock(options: {
  createdTimeMs: number;
  larkRecord: { fields: Record<string, unknown>; created_time?: string } | null;
  stateTimes: unknown;
}): string {
  const { createdTimeMs, larkRecord, stateTimes } = options;

  const endTime = resolveWorkitemEndTime(stateTimes);
  const endTimeOrNow = endTime ?? Date.now();
  const elapsedMs = endTimeOrNow - createdTimeMs;
  const elapsedStr = formatDurationMs(elapsedMs);

  const urgency = larkRecord
    ? String(larkRecord.fields["紧急度"] || larkRecord.fields["Urgency"] || "")
    : "";
  const priority = larkRecord
    ? String(larkRecord.fields["Priority"] || larkRecord.fields["优先级"] || "")
    : "";

  const slaTargetHours = resolveSlaTargetHours({
    紧急度: urgency,
    Urgency: urgency,
    Priority: priority,
    优先级: priority,
  });

  const slaTargetMs = slaTargetHours * 3600000;
  const slaStatus = endTime
    ? "✅ 已完成"
    : elapsedMs <= slaTargetMs
      ? "✅ 达标"
      : `❌ 超期 ${formatDurationMs(elapsedMs - slaTargetMs)}`;

  const createdTimeIso = new Date(createdTimeMs).toISOString();

  if (endTime) {
    return `## ⏱️ SLA 分析（AI 自动计算）
- 创建时间：${createdTimeIso}
- 实际完成时间：${new Date(endTime).toISOString()}
- 实际耗时：${elapsedStr}
- SLA 目标：${slaTargetHours}小时
- SLA 状态：${slaStatus}`;
  }

  return `## ⏱️ SLA 分析（AI 自动计算）
- 创建时间：${createdTimeIso}
- 当前已耗时：${elapsedStr}
- SLA 目标：${slaTargetHours}小时
- SLA 状态：${slaStatus}`;
}

export function generateStoryMarkdown(
  workitem: { name: string; assignee?: string; fields: Record<string, unknown> },
  larkRecord: { fields: Record<string, unknown>; created_time?: string } | null,
  meegleCreatedAt: number,
  chatHistory: string,
): string {
  const description = String(workitem.fields.description || "");
  const urls = extractUrls(description);
  const larkRecordUrl = getFieldValue(workitem, FIELD_LARK_RECORD_LINK) || "";
  const larkSharedUrl = getFieldValue(workitem, FIELD_LARK_SHARED_RECORD_URL) || "";
  const larkMessageUrl = getFieldValue(workitem, FIELD_LARK_MESSAGE_LINK) || "";

  const allLinks = [...urls];
  if (larkRecordUrl) allLinks.push(larkRecordUrl);
  if (larkSharedUrl) allLinks.push(larkSharedUrl);
  if (larkMessageUrl) allLinks.push(larkMessageUrl);
  const uniqueLinks = [...new Set(allLinks)];

  const source = larkRecord
    ? String(larkRecord.fields["需求人"] || larkRecord.fields["Reporter"] || workitem.assignee || "")
    : String(workitem.assignee || "");

  const tag = larkRecord ? String(larkRecord.fields["tag"] || "") : "";
  const createdTime = larkRecord?.created_time
    ? new Date(larkRecord.created_time).toISOString()
    : new Date(meegleCreatedAt).toISOString();

  const assignee = workitem.assignee || "未指派";

  // Simple heuristic: check if description contains key sections
  const hasBackground = /背景|目标|目的|why/i.test(description);
  const hasScope = /范围|影响|scope/i.test(description);
  const hasAcceptance = /验收|标准|acceptance|criteria/i.test(description);
  const hasPriorityReason = /优先级|原因|priority/i.test(description);
  const hasOutOfScope = /不做|排除|out.of.scope/i.test(description);
  const hasLinks = uniqueLinks.length > 0;

  const chatBlock = chatHistory
    ? `## 💬 Lark 聊天记录摘要
${chatHistory}
`
    : "";

  return `## ✅ 核心信息确认（description 应包含以下内容，已包含的请打勾）
- [${hasBackground ? "x" : " "}] 业务背景 & 目标
- [${hasScope ? "x" : " "}] 影响范围
- [${hasAcceptance ? "x" : " "}] 验收标准
- [${hasPriorityReason ? "x" : " "}] 优先级原因
- [${hasOutOfScope ? "x" : " "}] 明确不做范围
- [${hasLinks ? "x" : " "}] 关联文档链接

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 关联文档：${uniqueLinks.length > 0 ? uniqueLinks.join("、") : "未检测到"}

${chatBlock}## 🎯 产品结论（PM 填写 / 确认补充）
- 影响范围（确认/补充）：
- 验收标准（确认/补充）：
- 优先级原因：
- 明确不做：
- 验收人：${assignee}

## ⚙️ 开发总结（开发填写）
- 技术依赖：
- 技术风险：
- 关键设计决策：

## 🧪 测试总结（测试填写）
- 测试关注点：
- 验证结果：

## 🔗 关联 & 变更（AI 自动维护）
- 关联 Bug：
- 需求变更记录：

## ⏱️ 进度状态（AI 自动计算）
- 来源：${source || "未填写"}${tag ? ` / 标签：${tag}` : ""}
- 创建时间：${createdTime}
- 当前节点：${workitem.fields.current_nodes ? "见 workflow" : "未获取"}
`;
}

export function generateBugMarkdown(
  workitem: { name: string; assignee?: string; fields: Record<string, unknown> },
  larkRecord: { fields: Record<string, unknown>; created_time?: string } | null,
  meegleCreatedAt: number,
  chatHistory: string,
): string {
  const description = String(workitem.fields.description || "");
  const urls = extractUrls(description);
  const larkRecordUrl = getFieldValue(workitem, FIELD_LARK_RECORD_LINK) || "";
  const larkSharedUrl = getFieldValue(workitem, FIELD_LARK_SHARED_RECORD_URL) || "";
  const larkMessageUrl = getFieldValue(workitem, FIELD_LARK_MESSAGE_LINK) || "";

  const allLinks = [...urls];
  if (larkRecordUrl) allLinks.push(larkRecordUrl);
  if (larkSharedUrl) allLinks.push(larkSharedUrl);
  if (larkMessageUrl) allLinks.push(larkMessageUrl);
  const uniqueLinks = [...new Set(allLinks)];

  const createdTime = larkRecord?.created_time
    ? new Date(larkRecord.created_time).toISOString()
    : new Date(meegleCreatedAt).toISOString();

  const slaBlock = buildSlaBlock({
    createdTimeMs: new Date(createdTime).getTime(),
    larkRecord,
    stateTimes: workitem.fields.state_times,
  });

  // Heuristic checks for core info in description
  const hasPhenomenon = /现象|问题|bug|错误|异常/i.test(description);
  const hasEnvironment = /环境|版本|系统|browser|chrome|ios|android/i.test(description);
  const hasReproSteps = /步骤|复现|重现|repro|step/i.test(description);
  const hasExpected = /期望|应该|expected/i.test(description);
  const hasActual = /实际|结果|actual|结果/i.test(description);
  const hasLinks = uniqueLinks.length > 0;

  const chatBlock = chatHistory
    ? `## 💬 Lark 聊天记录摘要
${chatHistory}
`
    : "";

  return `## ✅ 核心信息确认（description 应包含以下内容，已包含的请打勾）
- [${hasPhenomenon ? "x" : " "}] 问题现象
- [${hasEnvironment ? "x" : " "}] 发生环境
- [${hasReproSteps ? "x" : " "}] 复现步骤
- [${hasExpected ? "x" : " "}] 期望结果
- [${hasActual ? "x" : " "}] 实际结果
- [${hasLinks ? "x" : " "}] 证据链接

> 💡 原始描述信息请查看 workitem 的 description 字段，此处不放重复内容。
> 关联链接：${uniqueLinks.length > 0 ? uniqueLinks.join("、") : "未检测到"}

${chatBlock}## 🔍 测试结论（测试填写 / 确认补充）
- 复现步骤（确认/补充）：
- 期望结果：
- 回归范围：

## 🔧 开发总结（开发填写）
- 根因分析：
- 修复方案：
- 技术影响面：
- 预防措施：

## 📢 产品评估（PM 填写）
- 严重程度：
- 客户影响判断：
- 对外说明口径：

${slaBlock}
`;
}

export interface MeegleSummaryDeps
  extends MeegleClientFactoryDeps, AuthenticatedLarkClientFactoryDeps {}

export interface GenerateSummaryResult {
  ok: true;
  generatedSummary: string;
  statusSummary: string;
  workItemType: "story" | "bug" | "unknown";
  prefilledSections: string[];
  emptySections: string[];
}

export interface ApplySummaryResult {
  ok: true;
  workItemId: string;
  summaryFieldKey: string;
  summaryStatusField: string;
}

export async function generateWorkitemSummary(
  request: GenerateSummaryRequest,
  deps: MeegleSummaryDeps = {},
): Promise<GenerateSummaryResult> {
  summaryLogger.info({
    projectKey: request.projectKey,
    workItemTypeKey: request.workItemTypeKey,
    workItemId: request.workItemId,
    masterUserId: request.masterUserId,
  }, "SUMMARY_GENERATE_START");

  const resolvedUser = await getResolvedUserStore().getById(request.masterUserId);
  const meegleUserKey = resolvedUser?.meegleUserKey;
  if (!meegleUserKey) {
    throw new Error("Meegle user key not found for master user");
  }

  const authDeps = getConfiguredMeegleAuthServiceDeps();
  const refreshResult = await refreshCredential(
    {
      masterUserId: request.masterUserId,
      meegleUserKey,
      baseUrl: request.baseUrl,
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
      masterUserId: request.masterUserId,
      meegleUserKey,
      baseUrl: request.baseUrl,
    },
    deps,
  );

  const resolvedTypeKey = resolveMeegleTypeKey(request.workItemTypeKey);
  summaryLogger.debug({ apiName: request.workItemTypeKey, resolvedTypeKey }, "SUMMARY_RESOLVE_TYPE_KEY");

  const workitems = await meegleClient.getWorkitemDetails(
    request.projectKey,
    resolvedTypeKey,
    [request.workItemId],
  );

  if (workitems.length === 0) {
    throw new Error(`Workitem ${request.workItemId} not found`);
  }

  const workitem = workitems[0];
  const isBug = isBugType(request.workItemTypeKey);
  summaryLogger.debug({ workItemId: request.workItemId, isBug, name: workitem.name }, "SUMMARY_WORKITEM_LOADED");
  summaryLogger.debug({
    larkRecordLink: getFieldValue(workitem, FIELD_LARK_RECORD_LINK),
    larkMessageLink: getFieldValue(workitem, FIELD_LARK_MESSAGE_LINK),
    workItemStatus: workitem.fields.work_item_status,
    stateTimes: workitem.fields.state_times,
  }, "SUMMARY_WORKITEM_FIELDS");

  // Fetch associated Lark record and chat history if links exist
  let larkRecord: { fields: Record<string, unknown>; created_time?: string } | null = null;
  let chatHistory = "";
  const larkRecordLink = getFieldValue(workitem, FIELD_LARK_RECORD_LINK);
  const larkMessageLink = getFieldValue(workitem, FIELD_LARK_MESSAGE_LINK);

  if (larkRecordLink || larkMessageLink) {
    try {
      const { client: larkClient } = await buildAuthenticatedLarkClient(
        request.masterUserId,
        request.larkBaseUrl || "https://open.larksuite.com",
        deps,
      );

      if (larkRecordLink) {
        const recordInfo = parseLarkRecordLink(larkRecordLink);
        if (recordInfo) {
          const larkResult = await larkClient.getRecord(recordInfo.baseId, recordInfo.tableId, recordInfo.recordId);
          larkRecord = larkResult;
          summaryLogger.debug({ recordId: recordInfo.recordId }, "SUMMARY_LARK_RECORD_LOADED");
        }
      }

      if (larkMessageLink) {
        chatHistory = await fetchLarkChatHistory(larkClient, larkMessageLink);
        if (chatHistory) {
          summaryLogger.debug({ chatHistoryLength: chatHistory.length }, "SUMMARY_CHAT_HISTORY_LOADED");
        }
      }
    } catch (err) {
      summaryLogger.warn({
        error: err instanceof Error ? err.message : String(err),
      }, "SUMMARY_LARK_DATA_FAIL");
    }
  }

  const meegleCreatedAt = typeof workitem.fields.created_at === "number"
    ? workitem.fields.created_at
    : Date.now();

  // ── AI 生成分支（statusSummary = 完整 Markdown 总结）─────────────────
  let fullMarkdown: string;
  let aiGenerated = false;

  if (KIMI_ACP_SERVICE_ENABLED) {
    try {
      const prompt = buildSummaryPrompt(workitem, larkRecord, isBug, meegleCreatedAt, chatHistory);
      const aiMarkdown = await callKimiAcpService(prompt);
      fullMarkdown = aiMarkdown;
      aiGenerated = true;
      summaryLogger.info(
        { workItemId: request.workItemId, aiMarkdownLength: aiMarkdown.length },
        "SUMMARY_AI_GENERATE_OK",
      );
    } catch (err) {
      summaryLogger.warn(
        {
          workItemId: request.workItemId,
          error: err instanceof Error ? err.message : String(err),
        },
        "SUMMARY_AI_GENERATE_FAIL_FALLBACK",
      );
      // fallback 到规则驱动
      fullMarkdown = isBug
        ? generateBugMarkdown(workitem, larkRecord, meegleCreatedAt, chatHistory)
        : generateStoryMarkdown(workitem, larkRecord, meegleCreatedAt, chatHistory);
    }
  } else {
    fullMarkdown = isBug
      ? generateBugMarkdown(workitem, larkRecord, meegleCreatedAt, chatHistory)
      : generateStoryMarkdown(workitem, larkRecord, meegleCreatedAt, chatHistory);
  }

  // ── generatedSummary 新逻辑 ────────────────────────────────────────
  // Story: 留空
  // Production Bug: 启动 yolo ACP Agent 深度分析
  let generatedSummaryValue = "";
  if (request.workItemTypeKey === "production_bug" && KIMI_ACP_SERVICE_ENABLED) {
    try {
      const yoloPrompt = `深度分析这个meegle production_bug/${request.workItemId}`;
      generatedSummaryValue = await callKimiAcpServiceYolo(yoloPrompt);
      summaryLogger.info(
        { workItemId: request.workItemId, yoloLength: generatedSummaryValue.length },
        "SUMMARY_YOLO_GENERATE_OK",
      );
    } catch (err) {
      summaryLogger.warn(
        {
          workItemId: request.workItemId,
          error: err instanceof Error ? err.message : String(err),
        },
        "SUMMARY_YOLO_GENERATE_FAIL",
      );
      generatedSummaryValue = "";
    }
  }

  const prefilledSections = isBug
    ? ["✅ 核心信息确认", aiGenerated ? "🤖 AI 生成" : "🐛 问题摘要（AI 预填）", "⏱️ SLA 分析（AI 自动计算）"]
    : ["✅ 核心信息确认", aiGenerated ? "🤖 AI 生成" : "📋 需求信息（AI 预填）"];

  const emptySections = isBug
    ? ["🔍 测试结论", "🔧 开发总结", "📢 产品评估"]
    : ["🎯 产品结论", "⚙️ 开发总结", "🧪 测试总结"];

  summaryLogger.info({
    workItemId: request.workItemId,
    isBug,
    workItemTypeKey: request.workItemTypeKey,
    statusSummaryLength: fullMarkdown.length,
    generatedSummaryLength: generatedSummaryValue.length,
  }, "SUMMARY_GENERATE_OK");

  return {
    ok: true,
    generatedSummary: generatedSummaryValue,
    statusSummary: fullMarkdown,
    workItemType: isBug ? "bug" : "story",
    prefilledSections,
    emptySections,
  };
}

export async function applyWorkitemSummary(
  request: ApplySummaryRequest,
  deps: MeegleClientFactoryDeps = {},
): Promise<ApplySummaryResult> {
  summaryLogger.info({
    projectKey: request.projectKey,
    workItemTypeKey: request.workItemTypeKey,
    workItemId: request.workItemId,
    generatedSummaryLength: request.generatedSummary.length,
    statusSummary: request.statusSummary,
  }, "SUMMARY_APPLY_START");

  const resolvedUser = await getResolvedUserStore().getById(request.masterUserId);
  const meegleUserKey = resolvedUser?.meegleUserKey;
  if (!meegleUserKey) {
    throw new Error("Meegle user key not found for master user");
  }

  const authDeps = getConfiguredMeegleAuthServiceDeps();
  const refreshResult = await refreshCredential(
    {
      masterUserId: request.masterUserId,
      meegleUserKey,
      baseUrl: request.baseUrl,
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
      masterUserId: request.masterUserId,
      meegleUserKey,
      baseUrl: request.baseUrl,
    },
    deps,
  );

  const resolvedTypeKey = resolveMeegleTypeKey(request.workItemTypeKey);

  const generatedSummaryField = "field_a5b617";
  const summaryStatusField = "field_e67b43";

  await meegleClient.updateWorkitem(
    request.projectKey,
    resolvedTypeKey,
    request.workItemId,
    [
      {
        fieldKey: generatedSummaryField,
        fieldValue: request.generatedSummary,
      },
      {
        fieldKey: summaryStatusField,
        fieldValue: request.statusSummary,
      },
    ],
  );

  summaryLogger.info({
    workItemId: request.workItemId,
    generatedSummaryField,
    summaryStatusField,
  }, "SUMMARY_APPLY_OK");

  return {
    ok: true,
    workItemId: request.workItemId,
    summaryFieldKey: generatedSummaryField,
    summaryStatusField,
  };
}

export function handleMeegleSummaryError(error: unknown): { ok: false; error: { errorCode: string; errorMessage: string } } {
  if (error instanceof MeegleAuthenticationError) {
    return {
      ok: false,
      error: {
        errorCode: "AUTH_EXPIRED",
        errorMessage: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
      },
    };
  }

  return {
    ok: false,
    error: {
      errorCode: "SUMMARY_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    },
  };
}
