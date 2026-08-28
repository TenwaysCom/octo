import { createHash } from "node:crypto";
import { access, constants, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { PlatformSyncStore, MeegleSprintMembershipSyncItem } from "../../adapters/postgres/platform-sync-store.js";
import { PostgresPlatformSyncStore } from "../../adapters/postgres/platform-sync-store.js";
import { getAcpKimiSessionOwnershipStore, type AcpKimiSessionOwnershipStore } from "../../adapters/postgres/acp-kimi-session-ownership-store.js";
import { getAcpKimiSprintSessionStore, type AcpKimiSprintSessionStore } from "../../adapters/postgres/acp-kimi-sprint-session-store.js";
import { getWorkflowPromptStore, type WorkflowPromptStore } from "../../adapters/postgres/workflow-prompt-store.js";
import { buildMeegleSprintSnapshot } from "./meegle-sprint-snapshot.js";
import { acpKimiProxyService, type AcpKimiProxyService } from "./acp-kimi-proxy.service.js";
import { acpKimiSessionHistoryService } from "./acp-kimi-session-history.service.js";
import type { AcpKimiPermissionContext } from "./acp-kimi-permission-policy.js";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";
import {
  AUTOMATION_SKILL_PROFILES,
  getSprintAiAutomationAction,
  type SprintAiAutomationActionConfig,
} from "../../modules/public-config/automation-actions.config.js";
import {
  DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE,
  renderWorkflowPromptTemplate,
} from "../../domain/workflow-prompts.js";
import { isMeegleProductionBugType } from "../../domain/meegle-workitem-types.js";

export interface MeegleSprintAiSessionRef {
  projectKey: string;
  sprintId: string;
}

export class MeegleSprintAiSessionError extends Error {
  constructor(
    readonly code: "SPRINT_NOT_FOUND" | "SESSION_NOT_FOUND" | "SESSION_FORBIDDEN" | "AI_ACTION_NOT_FOUND" | "SKILL_PROFILE_NOT_CONFIGURED",
    message: string,
    readonly diagnostic?: { layer: "server"; module: string; stage: string; actionRunId?: string },
  ) {
    super(message);
  }
}

interface ReleaseNotesItem {
  type: "story" | "tech_task" | "production_bug";
  title: string;
  summary?: string;
  project?: string;
  version?: string;
}

interface SprintReleaseNotesContext {
  sprint: { name: string; startAt?: string; endAt?: string };
  completedItems: ReleaseNotesItem[];
}

interface ResolvedSprintAiAction {
  action: SprintAiAutomationActionConfig;
  workspaceDir: string;
  skillPath: string;
}

export interface MeegleSprintAiSessionServiceDeps {
  syncStore?: PlatformSyncStore;
  ownershipStore?: AcpKimiSessionOwnershipStore;
  sprintSessionStore?: AcpKimiSprintSessionStore;
  acpService?: Pick<AcpKimiProxyService, "chat">;
  historyService?: { loadSession(input: { operatorLarkId: string; sessionId: string; signal?: AbortSignal }): Promise<unknown> };
  workflowPromptStore?: WorkflowPromptStore;
  resolveAction?: (actionKey: string) => Promise<ResolvedSprintAiAction | undefined>;
}

export function createMeegleSprintAiSessionService(deps: MeegleSprintAiSessionServiceDeps = {}) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();
  const ownershipStore = deps.ownershipStore ?? getAcpKimiSessionOwnershipStore();
  const sprintSessionStore = deps.sprintSessionStore ?? getAcpKimiSprintSessionStore();
  const acpService = deps.acpService ?? acpKimiProxyService;
  const historyService = deps.historyService ?? acpKimiSessionHistoryService;
  const workflowPromptStore = deps.workflowPromptStore ?? getWorkflowPromptStore();
  const resolveAction = deps.resolveAction ?? resolveSprintAiAction;

  async function assertRef(operatorLarkId: string, ref: MeegleSprintAiSessionRef, sessionId?: string) {
    const context = await buildSprintReleaseNotesContext(getSyncStore(), ref);
    if (!sessionId) return context;
    const [ownership, attached] = await Promise.all([ownershipStore.getBySessionId(sessionId), sprintSessionStore.get(sessionId)]);
    if (!ownership || ownership.deletedAt || !attached) {
      throw new MeegleSprintAiSessionError("SESSION_NOT_FOUND", "AI Session 未找到。");
    }
    if (ownership.operatorLarkId !== operatorLarkId || attached.operatorLarkId !== operatorLarkId
      || attached.projectKey !== ref.projectKey || attached.sprintId !== ref.sprintId) {
      throw new MeegleSprintAiSessionError("SESSION_FORBIDDEN", "AI Session 不属于当前 Sprint。",
        { layer: "server", module: "meegle-sprint-ai-session", stage: "server.auth.checked" });
    }
    return context;
  }

  return {
    async listSessions(input: { operatorLarkId: string; sprint: MeegleSprintAiSessionRef }) {
      await assertRef(input.operatorLarkId, input.sprint);
      const sessions = await sprintSessionStore.list({ operatorLarkId: input.operatorLarkId, ...input.sprint });
      return Promise.all(sessions.map(async (session) => {
        const ownership = await ownershipStore.getBySessionId(session.sessionId);
        return { sessionId: session.sessionId, title: ownership?.title || session.sessionId, updatedAt: session.updatedAt };
      }));
    },

    async loadSession(input: { operatorLarkId: string; sprint: MeegleSprintAiSessionRef; sessionId: string; signal?: AbortSignal }) {
      await assertRef(input.operatorLarkId, input.sprint, input.sessionId);
      return historyService.loadSession({ operatorLarkId: input.operatorLarkId, sessionId: input.sessionId, signal: input.signal });
    },

    async chat(input: {
      operatorLarkId: string;
      sprint: MeegleSprintAiSessionRef;
      message: string;
      sessionId?: string;
      actionKey?: string;
      actionRunId?: string;
      signal?: AbortSignal;
    }, emit: (event: AcpKimiStreamEvent) => void) {
      const context = await assertRef(input.operatorLarkId, input.sprint, input.sessionId);
      if (input.sessionId && input.actionKey) {
        throw new MeegleSprintAiSessionError("SESSION_FORBIDDEN", "已有 AI Session 不能切换快捷动作。");
      }
      const quickAction = input.sessionId || !input.actionKey ? undefined : await resolveAction(input.actionKey);
      if (input.actionKey && !quickAction) {
        throw new MeegleSprintAiSessionError("AI_ACTION_NOT_FOUND", "请求的 Sprint 快捷动作未配置。",
          { layer: "server", module: "meegle-sprint-ai-session", stage: "server.workflow.started", actionRunId: input.actionRunId });
      }
      const prompt = quickAction
        ? await buildQuickActionPrompt(workflowPromptStore, quickAction, context, input.message)
        : input.sessionId ? input.message : buildSprintPrompt(context, input.message);
      const permissionContext = quickAction ? createPermissionContext(quickAction) : undefined;
      let createdSessionId: string | undefined;
      await acpService.chat({
        operatorLarkId: input.operatorLarkId,
        sessionId: input.sessionId,
        actionRunId: input.actionRunId,
        message: prompt,
        permissionContext,
      }, (event) => {
        if (event.event === "session.created") createdSessionId = event.data.sessionId;
        emit(event);
      }, { signal: input.signal, session: input.sessionId ? undefined : null });
      if (createdSessionId) {
        await Promise.all([
          ownershipStore.rename(createdSessionId, input.operatorLarkId, deriveSessionTitle(input.message)),
          sprintSessionStore.attach({
          sessionId: createdSessionId,
          operatorLarkId: input.operatorLarkId,
          projectKey: input.sprint.projectKey,
          sprintId: input.sprint.sprintId,
          contextHash: contextHash(context),
          }),
        ]);
      } else if (input.sessionId) {
        await sprintSessionStore.touch(input.sessionId, input.operatorLarkId);
      }
    },
  };
}

async function buildSprintReleaseNotesContext(store: PlatformSyncStore, ref: MeegleSprintAiSessionRef): Promise<SprintReleaseNotesContext> {
  const snapshots = await store.listMeegleSprintSnapshots();
  const sprint = snapshots.map(buildMeegleSprintSnapshot)
    .find((candidate) => candidate?.projectKey === ref.projectKey && candidate.sprintId === ref.sprintId);
  if (!sprint) throw new MeegleSprintAiSessionError("SPRINT_NOT_FOUND", "当前 Sprint 不在已同步快照中。");
  const memberships = await store.listMeegleSprintMemberships();
  return {
    sprint: { name: sprint.name, ...(sprint.startAt ? { startAt: sprint.startAt } : {}), ...(sprint.endAt ? { endAt: sprint.endAt } : {}) },
    completedItems: memberships
      .filter((item) => item.projectKey === ref.projectKey && item.sprintId === ref.sprintId && Boolean(item.itemFinishTime))
      .flatMap(toReleaseNotesItem),
  };
}

function toReleaseNotesItem(item: MeegleSprintMembershipSyncItem): ReleaseNotesItem[] {
  const type = classifyWorkitem(item);
  if (!type) return [];
  const summary = cleanSummary(item.sourcePayload?.fields);
  return [{
    type,
    title: cleanText(item.title, 240),
    ...(summary ? { summary } : {}),
    ...(item.projectName ? { project: cleanText(item.projectName, 120) } : {}),
    ...(item.version ? { version: cleanText(item.version, 120) } : {}),
  }];
}

function classifyWorkitem(item: MeegleSprintMembershipSyncItem): ReleaseNotesItem["type"] | undefined {
  const value = `${item.workItemType || ""} ${item.workItemTypeKey}`.toLowerCase();
  if (item.workItemTypeKey === "story" || /^story\b/.test(value)) return "story";
  if (value.includes("tech task")) return "tech_task";
  if (isMeegleProductionBugType(item.workItemTypeKey) || value.includes("production bug")) return "production_bug";
  return undefined;
}

function cleanSummary(fields: Record<string, unknown> | undefined): string | undefined {
  if (!fields) return undefined;
  for (const key of ["summary", "description", "detail", "content"]) {
    const value = fields[key];
    const text = typeof value === "string" ? cleanText(value, 1200) : undefined;
    if (text) return text;
  }
  return undefined;
}

function cleanText(value: string, maxLength: number): string {
  const normalized = value.replace(/<[^>]*>/g, " ").replace(/\{\{[^}]*\}\}/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function deriveSessionTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 56 ? `${normalized.slice(0, 56)}…` : normalized;
}

function buildSprintPrompt(context: SprintReleaseNotesContext, request: string): string {
  return [
    "You are assisting with an internal Sprint Release Notes draft. Use only the provided context and do not claim any external change.",
    `Sprint context:\n${JSON.stringify(context)}`,
    `User request:\n${request}`,
  ].join("\n\n");
}

function contextHash(context: SprintReleaseNotesContext): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

async function resolveSprintAiAction(actionKey: string): Promise<ResolvedSprintAiAction | undefined> {
  const action = getSprintAiAutomationAction(actionKey);
  if (!action) return undefined;
  const profile = AUTOMATION_SKILL_PROFILES[action.skillProfile];
  const workspaceDir = process.env[profile.workspaceEnv]?.trim();
  const skillRelativePath = (profile.skills as Record<string, string>)[action.skillId];
  if (!workspaceDir || !skillRelativePath) {
    throw new MeegleSprintAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} 未配置。`);
  }
  const resolvedWorkspace = await realpath(workspaceDir);
  const skillPath = await realpath(resolve(resolvedWorkspace, skillRelativePath));
  const pathFromWorkspace = relative(resolvedWorkspace, skillPath);
  if (!pathFromWorkspace || pathFromWorkspace === ".." || pathFromWorkspace.startsWith("../") || pathFromWorkspace.startsWith("..\\")) {
    throw new MeegleSprintAiSessionError("SKILL_PROFILE_NOT_CONFIGURED", `Skill profile ${action.skillProfile} 的路径越界。`);
  }
  await access(skillPath, constants.R_OK);
  return { action, workspaceDir: resolvedWorkspace, skillPath };
}

function createPermissionContext(quickAction: ResolvedSprintAiAction): AcpKimiPermissionContext {
  return {
    actionKey: quickAction.action.key,
    executionPolicy: quickAction.action.executionPolicy,
    workspaceDir: quickAction.workspaceDir,
    skillProfile: quickAction.action.skillProfile,
    skillId: quickAction.action.skillId,
    policyVersion: "v1",
  };
}

async function buildQuickActionPrompt(promptStore: WorkflowPromptStore, quickAction: ResolvedSprintAiAction, context: SprintReleaseNotesContext, message: string) {
  const template = (await promptStore.getByKey(quickAction.action.promptKey))?.prompt.trim()
    || DEFAULT_MEEGLE_SPRINT_RELEASE_NOTES_PROMPT_TEMPLATE;
  return renderWorkflowPromptTemplate(template, {
    skill_path: quickAction.skillPath,
    sprint_context: JSON.stringify(context),
    user_message: message,
  });
}
