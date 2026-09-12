import { AcpPermissionPrompt } from "../components/ai-session/AcpPermissionPrompt.jsx";
import { useEffect, useState } from "react";
import { useAiSessionPanel } from "../hooks/useAiSessionPanel.js";
import { aiRunStatusLabel } from "../lib/ai-session-panel.js";
import { AiSessionCopyButton } from "../components/ai-session/AiSessionCopyButton.jsx";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { LarkTicketBadge } from "../components/lark-ticket/LarkTicketBadge.jsx";
import { LarkTicketEditableProperties } from "../components/lark-ticket/LarkTicketEditableProperties.jsx";
import { formatDateTime } from "../lib/formatters.js";
import { LARK_TICKET_AI_QUICK_ACTIONS } from "../lib/lark-ticket-ai-actions.js";
import { getLarkTicketDetailNavigation, getLarkTicketFromNavigationContext, updateLarkTicketNavigationContext } from "../lib/lark-ticket-detail-navigation.js";
import { getTicketAiSections, getTicketAiShadowNotice } from "../lib/ticket-ai-sections.js";
import { getLarkTicketDetailHash } from "../app/routes/workspace-routes.js";
import {
  formatShadowConfidence,
  formatShadowDuration,
  getShadowIntentLabel,
  getShadowStatusLabel,
} from "../lib/lark-ticket-shadow-ai.js";
import { replyAcpPermission, confirmLarkTicketEffectDraft, listLarkTicketAiSessions, listLarkTicketEffectDrafts, loadLarkTicketAiSession, stopLarkTicketAiSession, streamLarkTicketAiSession } from "../services/lark-ticket-ai/lark-ticket-ai-api.js";
import { loadLarkTicketSharedUrl } from "../services/lark-ticket/lark-ticket-api.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";

function ExternalResource({ href, children }) {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return <a className="ticket-resource" href={url.toString()} target="_blank" rel="noreferrer">{children}<span aria-hidden="true">↗</span></a>;
  } catch {
    return null;
  }
}

function TicketProperty({ label, children }) {
  return <div className="ticket-property">
    <dt>{label}</dt>
    <dd>{children || "未设置"}</dd>
  </div>;
}

function ShadowLongText({ value }) {
  return <span className="ticket-shadow-panel__long-text" title={value}>{value}</span>;
}

function ShadowInlineText({ value, title = value }) {
  return <span className="ticket-shadow-panel__inline-text" title={title}>{value}</span>;
}

function ShadowAiPanel({ shadowAi }) {
  const statusLabel = getShadowStatusLabel(shadowAi.status);
  const processingDuration = formatShadowDuration(shadowAi.processingDurationMs);
  return <section className="ticket-shadow-panel" aria-label="影子分析">
    <div className="ticket-shadow-panel__heading">
      <h2>影子分析</h2>
      <span className={`ticket-shadow-panel__status ticket-shadow-panel__status--${shadowAi.status}`}>{statusLabel}</span>
    </div>
    {shadowAi.status === "ok" ? <dl>
      {getShadowIntentLabel(shadowAi) ? <TicketProperty label="意图"><ShadowInlineText value={getShadowIntentLabel(shadowAi)} /></TicketProperty> : null}
      {typeof shadowAi.intentConfidence === "number" ? <TicketProperty label="置信度">{formatShadowConfidence(shadowAi.intentConfidence)}</TicketProperty> : null}
      {shadowAi.summary ? <TicketProperty label="问题总结"><ShadowLongText value={shadowAi.summary} /></TicketProperty> : null}
      {shadowAi.solutionSummary ? <TicketProperty label="方案摘要"><ShadowLongText value={shadowAi.solutionSummary} /></TicketProperty> : null}
    </dl> : null}
    {shadowAi.status === "skipped" ? <p className="ticket-shadow-panel__note">跳过原因：{shadowAi.reason || "未记录"}</p> : null}
    {shadowAi.status === "error" ? <p className="ticket-shadow-panel__note">{shadowAi.errorCode || "SHADOW_FAILED"}{shadowAi.errorMessage ? `：${shadowAi.errorMessage}` : ""}</p> : null}
    <p className="ticket-shadow-panel__meta">
      {shadowAi.analyzedAt ? `分析于 ${formatDateTime(shadowAi.analyzedAt)}` : "尚未分析"}
      {processingDuration ? ` · 耗时 ${processingDuration}` : ""}
      {shadowAi.snapshotVersion ? ` · 快照 v${shadowAi.snapshotVersion}` : ""}
      {shadowAi.promptVersion ? ` · 提示词 ${shadowAi.promptVersion}` : ""}
    </p>
  </section>;
}

function TicketLoadingState({ children }) {
  return <section className="profile-main ticket-detail-page"><p className="list-message">{children}</p></section>;
}

function formatTicketAiValue(value) {
  if (value == null || value === "") return "未设置";
  if (Array.isArray(value)) return value.map(formatTicketAiValue).join("、");
  if (typeof value === "object") return value.text || value.name || JSON.stringify(value);
  return String(value);
}

export function LarkTicketDetailPage({ profile, ticketRecordId, apiBaseUrl, onLogout, isBusy, breadcrumbs, larkTicketNavigationContext, onLarkTicketNavigationContextChange }) {
  const snapshotTicket = getLarkTicketFromNavigationContext({ navigationContext: larkTicketNavigationContext, recordId: ticketRecordId });
  const [state, setState] = useState(() => snapshotTicket
    ? { status: "ready", ticket: snapshotTicket }
    : { status: "loading", ticket: undefined });
  const [sharedUrlStatus, setSharedUrlStatus] = useState("idle");
  const [aiSessions, setAiSessions] = useState({ status: "idle", items: [], error: "" });
  const [effectDrafts, setEffectDrafts] = useState({ status: "idle", items: [], error: "" });
  const [newSessionDraft, setNewSessionDraft] = useState("");
  const [drawerDraft, setDrawerDraft] = useState("");
  const [isConfirmingEffect, setIsConfirmingEffect] = useState(false);
  const [expandedTicketAiSectionId, setExpandedTicketAiSectionId] = useState(null);

  useEffect(() => {
    if (snapshotTicket) {
      setState({ status: "ready", ticket: snapshotTicket });
      return undefined;
    }
    let active = true;
    void getPlatformDataList({ apiBaseUrl, kind: "lark-tickets" }).then(
      ({ items }) => {
        if (active) setState({ status: "ready", ticket: items.find((item) => item.recordId === ticketRecordId) });
      },
      () => { if (active) setState({ status: "error", ticket: undefined }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, snapshotTicket, ticketRecordId]);

  const ticket = state.ticket;
  const ticketNavigation = getLarkTicketDetailNavigation({
    navigationContext: larkTicketNavigationContext,
    currentRecordId: ticketRecordId,
  });
  const { drawer, panel, isStreaming, setDrawer } = useAiSessionPanel(JSON.stringify([apiBaseUrl, ticketRecordId, ticket?.baseId, ticket?.tableId]), {
    load: (sessionId) => loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId }),
    stream: (input) => streamLarkTicketAiSession({ ...input, apiBaseUrl, ticket }),
    stop: (sessionId, runId) => stopLarkTicketAiSession({ apiBaseUrl, ticket, sessionId, runId }),
    onChange: async () => { await refreshAiSessions(); await refreshEffectDrafts(); },
  });

  useEffect(() => {
    if (!ticket || ticket.sharedUrl) {
      setSharedUrlStatus(ticket?.sharedUrl ? "ready" : "idle");
      return undefined;
    }
    let active = true;
    setSharedUrlStatus("loading");
    void loadLarkTicketSharedUrl({ apiBaseUrl, ticket }).then(
      (sharedUrl) => {
        if (!active) return;
        setState((current) => current.ticket?.recordId === ticket.recordId
          ? { ...current, ticket: { ...current.ticket, sharedUrl } }
          : current);
        setSharedUrlStatus("ready");
      },
      () => { if (active) setSharedUrlStatus("error"); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, ticket?.baseId, ticket?.recordId, ticket?.sharedUrl, ticket?.tableId]);

  async function refreshAiSessions() {
    if (!ticket) return;
    setAiSessions((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const items = await listLarkTicketAiSessions({ apiBaseUrl, ticket });
      setAiSessions({ status: "ready", items, error: "" });
    } catch {
      setAiSessions((current) => ({ ...current, status: "error", error: "AI Sessions 暂时无法读取。" }));
    }
  }

  async function refreshEffectDrafts() {
    if (!ticket) return [];
    setEffectDrafts((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const items = await listLarkTicketEffectDrafts({ apiBaseUrl, ticket });
      setEffectDrafts({ status: "ready", items, error: "" });
      setDrawer((current) => current ? { ...current, effectDraft: items.find((draft) => draft.sessionId === current.sessionId) || current.effectDraft } : current);
      return items;
    } catch {
      setEffectDrafts((current) => ({ ...current, status: "error", error: "待确认操作暂时无法读取。" }));
      return [];
    }
  }

  useEffect(() => {
    if (!ticket) return undefined;
    let active = true;
    setAiSessions({ status: "loading", items: [], error: "" });
    let timer;
    const refresh = async () => {
      try {
        const items = await listLarkTicketAiSessions({ apiBaseUrl, ticket });
        if (active) setAiSessions({ status: "ready", items, error: "" });
      } catch {
        if (active) setAiSessions((current) => ({ ...current, status: "error", error: "AI Sessions 暂时无法读取。" }));
      }
      if (active) timer = setTimeout(refresh, 3000);
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [apiBaseUrl, ticket?.baseId, ticket?.recordId, ticket?.tableId]);

  useEffect(() => {
    if (!ticket) return undefined;
    let active = true;
    setEffectDrafts({ status: "loading", items: [], error: "" });
    void listLarkTicketEffectDrafts({ apiBaseUrl, ticket }).then(
      (items) => { if (active) setEffectDrafts({ status: "ready", items, error: "" }); },
      () => { if (active) setEffectDrafts({ status: "error", items: [], error: "待确认操作暂时无法读取。" }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, ticket?.baseId, ticket?.recordId, ticket?.tableId]);

  async function openAiSession(session) {
    if (!ticket) return;
    setDrawerDraft("");
    const effectDraft = effectDrafts.items.find((draft) => draft.sessionId === session.sessionId) || null;
    await panel.open(session, { effectDraft, oneShot: session.oneShot || false });
  }

  async function streamAiSession(input) {
    if (ticket) await panel.start(input);
  }

  async function createAiSession(event) {
    event.preventDefault();
    if (!newSessionDraft.trim() || isStreaming) return;
    const request = newSessionDraft;
    setNewSessionDraft("");
    await streamAiSession({ message: request, title: request });
  }

  async function createQuickAiSession(action) {
    if (isStreaming) return;
    await streamAiSession({
      message: action.title,
      title: action.title,
      actionKey: action.actionKey,
      oneShot: action.oneShot || false,
    });
  }

  async function continueAiSession(event) {
    event.preventDefault();
    if (!drawerDraft.trim() || !drawer || isStreaming) return;
    const request = drawerDraft;
    setDrawerDraft("");
    await streamAiSession({ message: request, sessionId: drawer.sessionId || undefined, title: drawer.title });
  }

  async function confirmEffectDraft(draft) {
    if (!ticket || !draft?.draftId || !draft.actionRunId || !window.confirm("确认执行这份已保存的操作草稿？")) return;
    setIsConfirmingEffect(true);
    try {
      const confirmed = await confirmLarkTicketEffectDraft({ apiBaseUrl, ticket, draftId: draft.draftId, actionRunId: draft.actionRunId });
      setDrawer((current) => current?.effectDraft?.draftId === confirmed.draftId ? { ...current, effectDraft: confirmed } : current);
      await refreshEffectDrafts();
    } catch (error) {
      setDrawer((current) => current ? { ...current, status: "error", error: error.message || "操作草稿确认失败。" } : current);
    } finally { setIsConfirmingEffect(false); }
  }

  if (state.status === "loading") {
    return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}><TicketLoadingState>正在加载 Ticket 详情…</TicketLoadingState></WorkspaceShell>;
  }
  if (state.status === "error") {
    return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}><TicketLoadingState>Ticket 详情暂时无法读取，请稍后重试。</TicketLoadingState></WorkspaceShell>;
  }
  if (!state.ticket) {
    return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}><TicketLoadingState>未在当前同步快照中找到该 Ticket。</TicketLoadingState></WorkspaceShell>;
  }

  const ticketNumber = ticket.ticketNumber || ticket.recordId;
  const resources = [
    [ticket.sharedUrl, "在 Lark Base 中打开"],
    [ticket.larkMessageLink, "关联 Lark 消息"],
    [ticket.meegleLink, "关联 Meegle 工作项"],
  ].filter(([href]) => href);
  const ticketAiSections = getTicketAiSections(ticket.ticketAi?.fields, ticket.shadowAi);
  const hasTicketAiData = ticketAiSections.some((section) => section.hasFormalData);
  const hasShadowAiData = ticketAiSections.some((section) => section.hasShadowData);
  const shadowAiNotice = getTicketAiShadowNotice(ticket.shadowAi);
  const shadowAiMeta = [
    ticket.shadowAi?.analyzedAt ? `分析于 ${formatDateTime(ticket.shadowAi.analyzedAt)}` : "尚未分析",
    formatShadowDuration(ticket.shadowAi?.processingDurationMs) ? `耗时 ${formatShadowDuration(ticket.shadowAi.processingDurationMs)}` : "",
    ticket.shadowAi?.snapshotVersion ? `快照 v${ticket.shadowAi.snapshotVersion}` : "",
    ticket.shadowAi?.promptVersion ? `提示词 ${ticket.shadowAi.promptVersion}` : "",
  ].filter(Boolean).join(" · ");
  const ticketNavigationActions = ticketNavigation ? <div role="group" aria-label="Ticket 前后导航" className="ticket-detail-navigation">
    <button type="button" disabled={!ticketNavigation.previousRecordId} onClick={() => { if (ticketNavigation.previousRecordId) window.location.hash = getLarkTicketDetailHash(ticketNavigation.previousRecordId); }}>上一条</button>
    <span aria-label={`当前第 ${ticketNavigation.position} 条，共 ${ticketNavigation.total} 条`}>{ticketNavigation.position} / {ticketNavigation.total}</span>
    <button type="button" disabled={!ticketNavigation.nextRecordId} onClick={() => { if (ticketNavigation.nextRecordId) window.location.hash = getLarkTicketDetailHash(ticketNavigation.nextRecordId); }}>下一条</button>
  </div> : null;

  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs} breadcrumbActions={ticketNavigationActions}>
    <main className="profile-main ticket-detail-page">
      <div className="ticket-detail-grid">
        <article className="ticket-detail__content">
          <p className="ticket-detail__identity"><LarkTicketBadge kind="type" value={ticket.issueType} /><span>·</span>{ticketNumber}</p>
          <h1>{ticket.title}</h1>

          <section className="ticket-detail-section">
            <h2>Description</h2>
            <p className={`ticket-description ${ticket.detailDescription ? "" : "ticket-description--empty"}`.trim()}>{ticket.detailDescription || "暂无描述。"}</p>
          </section>

          <section className="ticket-detail-section">
            <h2>解决方案</h2>
            <p className={`ticket-description ${ticket.solution ? "" : "ticket-description--empty"}`.trim()}>{ticket.solution || "暂无解决方案。"}</p>
          </section>

          <section className="ticket-detail-section">
            <h2>Resources</h2>
            {resources.length ? <div className="ticket-resource-list">{resources.map(([href, label]) => <ExternalResource href={href} key={label}>{label}</ExternalResource>)}</div> : sharedUrlStatus === "loading" ? <p className="ticket-section-empty">正在获取 Lark Ticket 链接…</p> : <p className="ticket-section-empty">暂无关联资源。</p>}
          </section>

          <section className="ticket-detail-section ticket-ai-data">
            <div className="ticket-section-heading"><h2>Ticket AI</h2><span>{hasTicketAiData ? "Octo 本地记录" : hasShadowAiData ? `影子分析${ticket.shadowAi?.analyzedAt ? ` · ${formatDateTime(ticket.shadowAi.analyzedAt)}` : ""}` : ticket.shadowAi ? `影子分析 · ${getShadowStatusLabel(ticket.shadowAi.status)}` : "暂无记录"}</span></div>
            <div className="ticket-ai-overview" aria-label="Ticket AI 概览">
              {ticketAiSections.map((section) => {
                const expanded = expandedTicketAiSectionId === section.id;
                const cardState = section.hasFormalData ? "filled" : section.hasShadowData ? "shadow" : "empty";
                return <button
                  className={`ticket-ai-overview-card ticket-ai-overview-card--${cardState}${section.shadowItems.length ? " ticket-ai-overview-card--has-details" : ""}`}
                  type="button"
                  key={section.id}
                  aria-expanded={expanded}
                  aria-controls={`ticket-ai-section-${section.id}`}
                  onClick={() => setExpandedTicketAiSectionId((current) => current === section.id ? null : section.id)}
                >
                  <span className="ticket-ai-overview-card__heading"><strong>{section.title}</strong><small>{section.hasFormalData ? "已生成" : section.hasShadowData ? "影子分析" : "暂无数据"}</small></span>
                  <span className="ticket-ai-overview-card__summary">{section.summary.length ? section.summary.map((item) => formatTicketAiValue(item.value)).join(" · ") : section.shadowSummary || section.emptyMessage}</span>
                  {section.shadowItems.length ? <span className="ticket-ai-overview-card__tooltip" role="presentation">
                    <b>影子分析</b>
                    <dl>{section.shadowItems.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
                  </span> : null}
                  <span className="ticket-ai-overview-card__toggle" aria-hidden="true">{expanded ? "收起" : "查看"}</span>
                </button>;
              })}
            </div>
            {ticketAiSections.map((section) => expandedTicketAiSectionId === section.id ? <div className="ticket-ai-section-detail" id={`ticket-ai-section-${section.id}`} key={section.id}>
              <div className="ticket-ai-section-detail__heading"><h3>{section.title}</h3><span>{section.hasData ? `${section.items.length + section.shadowItems.length} 项信息` : "暂无数据"}</span></div>
              {section.hasFormalData ? <dl className="ticket-ai-section-detail__fields">{section.items.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{formatTicketAiValue(item.value)}</dd></div>)}</dl> : null}
              {section.shadowItems.length ? <div className="ticket-ai-section-detail__shadow">
                <p className="ticket-ai-section-detail__source">影子分析 · 自动生成，未回写 Lark</p>
                <dl className="ticket-ai-section-detail__fields">{section.shadowItems.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
                <p className="ticket-ai-section-detail__meta">{shadowAiMeta}</p>
              </div> : null}
              {section.id === "analysis" && shadowAiNotice ? <p className="ticket-ai-section-detail__notice">{shadowAiNotice}</p> : null}
              {!section.hasData ? <p className="ticket-section-empty">{section.emptyMessage}</p> : null}
            </div> : null)}
          </section>

          <section className="ticket-detail-section ticket-ai-sessions">
            <div className="ticket-section-heading"><h2>AI Sessions</h2><span>{aiSessions.items.length} 个会话</span></div>
            {aiSessions.status === "loading" ? <p className="ticket-section-empty">正在加载 AI Sessions…</p> : null}
            {aiSessions.status === "error" ? <p className="ticket-ai-session-error">{aiSessions.error}</p> : null}
            {aiSessions.status === "ready" && aiSessions.items.length === 0 ? <div className="ticket-ai-session-empty">
              <span className="ticket-ai-session-empty__icon" aria-hidden="true">✦</span>
              <div><strong>暂无 AI Session</strong><p>输入目标后创建一个带有当前 Ticket 上下文的 AI 会话。</p></div>
            </div> : null}
            {aiSessions.items.length ? <div className="ticket-ai-session-list">{aiSessions.items.map((session) => <button className="ticket-ai-session-card" type="button" key={session.sessionId} onClick={() => void openAiSession(session)}>
              <span className="ticket-ai-session-card__icon" aria-hidden="true">✦</span>
              <span className="ticket-ai-session-card__content"><strong>{session.title}</strong><small>{formatDateTime(session.updatedAt)}{session.runStatus ? ` · ${aiRunStatusLabel(session.runStatus)}` : ""}</small></span>
              {session.runStatus === "failed" ? <span className="ticket-ai-session-card__status">未验证</span> : null}
              <span className="ticket-ai-session-card__open" aria-hidden="true">›</span>
            </button>)}</div> : null}
            <div className="ticket-ai-session-composer">
              <div className="ticket-ai-session-quick-actions" aria-label="AI Session 快捷操作">
                {LARK_TICKET_AI_QUICK_ACTIONS.map((action) => <button type="button" key={action.actionKey} onClick={() => void createQuickAiSession(action)} disabled={isStreaming}>
                  <span aria-hidden="true">{action.icon}</span>{action.title}
                </button>)}
              </div>
              <form className="ticket-ai-session-create" onSubmit={createAiSession}>
                <label className="visually-hidden" htmlFor="ticket-ai-session-request">AI Session 请求</label>
                <textarea id="ticket-ai-session-request" value={newSessionDraft} onChange={(event) => setNewSessionDraft(event.target.value)} placeholder="例如：为这个 Ticket 创建 PRD，并列出待确认的问题…" rows="3" disabled={isStreaming} />
                <div><span>当前 Ticket 的标题、描述与资源会作为 AI 上下文。</span><button type="submit" disabled={!newSessionDraft.trim() || isStreaming}>{isStreaming ? "AI 正在回复…" : "新建 AI Session"}</button></div>
              </form>
            </div>
          </section>

          <section className="ticket-detail-section ticket-effect-drafts">
            <div className="ticket-section-heading"><h2>待确认操作</h2><span>{effectDrafts.items.filter((draft) => draft.status !== "completed").length} 项</span></div>
            {effectDrafts.status === "loading" ? <p className="ticket-section-empty">正在加载操作草稿…</p> : null}
            {effectDrafts.status === "error" ? <p className="ticket-ai-session-error">{effectDrafts.error}</p> : null}
            {effectDrafts.status === "ready" && !effectDrafts.items.length ? <p className="ticket-section-empty">暂无待确认操作。</p> : null}
            {effectDrafts.items.map((draft) => <div className="ticket-effect-draft" key={draft.draftId}>
              <div><strong>{draft.effectType === "answer_feedback" ? "Answer 反馈" : "Ticket AI 更新"}</strong><small>{draft.status} · 快照 v{draft.snapshotVersion}</small></div>
              <pre>{JSON.stringify(draft.payload, null, 2)}</pre>
              {draft.status !== "completed" && draft.status !== "outcome_unknown" ? <button type="button" onClick={() => void confirmEffectDraft(draft)} disabled={isConfirmingEffect}>{isConfirmingEffect ? "正在确认…" : "确认执行"}</button> : null}
              {draft.status === "outcome_unknown" ? <p>外部写入结果未知，已禁止自动重试。</p> : null}
            </div>)}
          </section>
        </article>

        <aside className="ticket-detail__properties" aria-label="Ticket 属性">
          <h2>Properties</h2>
          <LarkTicketEditableProperties
            key={JSON.stringify([apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId])}
            ticket={ticket}
            apiBaseUrl={apiBaseUrl}
            canEdit={Boolean(profile.workspaceAccess?.platformSync)}
            onUpdated={(patch) => {
              const matches = (item) => item?.baseId === patch.baseId && item?.tableId === patch.tableId && item?.recordId === patch.recordId;
              setState((current) => matches(current.ticket) ? { ...current, ticket: { ...current.ticket, ...patch } } : current);
              onLarkTicketNavigationContextChange?.((current) => updateLarkTicketNavigationContext(current, patch));
            }}
          >
            <TicketProperty label="创建时间">{ticket.createdAt ? formatDateTime(ticket.createdAt) : "未设置"}</TicketProperty>
            <TicketProperty label="关闭时间">{ticket.closedAt ? formatDateTime(ticket.closedAt) : "未设置"}</TicketProperty>
          </LarkTicketEditableProperties>
          <p className="ticket-detail__sync-time">同步于 {formatDateTime(ticket.syncedAt)}</p>
          {ticket.shadowAi ? <ShadowAiPanel shadowAi={ticket.shadowAi} /> : null}
        </aside>
      </div>
    </main>
    {drawer ? <div className="ticket-ai-drawer-backdrop" role="presentation" onMouseDown={() => panel.close()}>
      <aside className="ticket-ai-drawer" aria-label="AI Session 详情" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ticket-ai-drawer__header"><div><p>{drawer.oneShot ? "AI 一次性生成" : "ACP AI Chat"}</p><h2>{drawer.title}</h2>{drawer.status === "waiting_permission" ? <p role="status">待审批：请确认或拒绝工具操作</p> : null}</div><button type="button" aria-label="关闭 AI Session" onClick={() => panel.close()}>×</button></header>
        <div className="ticket-ai-drawer__body">
          {drawer.verificationStatus === "unverified" ? <div className="ticket-ai-drawer__unverified"><strong>执行未完成</strong><p>上一轮未通过执行与结果校验；已有内容仅供参考，可以在当前会话继续处理。</p></div> : null}
          {drawer.status === "loading" ? <p className="ticket-section-empty">正在加载会话…</p> : null}
          {drawer.messages.length ? drawer.messages.map((entry, index) => <AiSessionMessage entry={entry} apiBaseUrl={apiBaseUrl} active={isStreaming && drawer.status !== "stopping"} key={entry.id || `${entry.kind}-${index}`} />) : null}
          {drawer.connectionError ? <p role="status">{drawer.connectionError}</p> : null}
          {drawer.status === "cancelled" ? <p role="status">已停止生成，已有内容已保留。</p> : null}
          {drawer.status === "stopping" ? <p role="status">正在停止生成…</p> : null}
          {drawer.status === "generating" ? <p className="ticket-ai-generating">{drawer.actionKey === "lark-ticket-wiki-qa" ? "正在检索 wiki 并生成回复…" : drawer.oneShot ? "AI 正在生成总结…" : "AI 正在生成回复…"}</p> : null}
          {drawer.status === "error" || drawer.status === "cancelled" ? <div className="ticket-ai-drawer__error"><p>{drawer.error}</p>{drawer.lastMessage || drawer.actionKey ? <button type="button" onClick={() => void streamAiSession({ message: drawer.lastMessage || drawer.title, sessionId: drawer.oneShot ? undefined : drawer.sessionId || undefined, actionKey: drawer.oneShot ? drawer.actionKey || undefined : undefined, oneShot: drawer.oneShot, title: drawer.title })} disabled={isStreaming}>{drawer.oneShot ? "重新执行" : "继续处理"}</button> : null}</div> : null}
          {drawer.effectDraft ? <div className="ticket-ai-drawer__effect-draft"><strong>待确认操作：{drawer.effectDraft.effectType === "answer_feedback" ? "Answer 反馈" : "Ticket AI 更新"}</strong><pre>{drawer.effectDraft.payload ? JSON.stringify(drawer.effectDraft.payload, null, 2) : "正在读取草稿…"}</pre></div> : null}
        </div>
        {drawer.oneShot && drawer.status === "ready" ? <p className="ticket-ai-drawer__sent">{drawer.actionKey === "lark-ticket-wiki-qa" ? "回复草稿已生成，请审核后使用。" : "问题总结已写入 Ticket AI；如需更新，请重新执行该 Quick Action。"}</p> : null}
        {!drawer.oneShot || isStreaming ? <form className={`ticket-ai-drawer__composer${drawer.oneShot ? " ticket-ai-drawer__composer--actions-only" : ""}`} onSubmit={continueAiSession}>
          {!drawer.oneShot ? <>
            <label className="visually-hidden" htmlFor="ticket-ai-followup">继续对话</label>
            <textarea id="ticket-ai-followup" value={drawerDraft} onChange={(event) => setDrawerDraft(event.target.value)} placeholder="继续这个 AI Session…" rows="2" disabled={isStreaming || drawer.status === "loading"} />
          </> : null}
          <div className="ticket-ai-drawer__composer-actions">
            {isStreaming ? <button className="ticket-ai-drawer__stop" type="button" aria-label="停止生成" title="停止生成" onClick={() => void panel.stop()} disabled={!drawer.runId || drawer.status === "stopping"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" fill="currentColor" /></svg>
            </button> : null}
            {!drawer.oneShot ? <button className="ticket-ai-drawer__send" type="submit" aria-label="发送" title="发送" disabled={isStreaming || drawer.status === "loading" || !drawerDraft.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
            </button> : null}
          </div>
        </form> : null}
        {drawer.effectDraft && drawer.effectDraft.status !== "completed" && drawer.effectDraft.status !== "outcome_unknown" ? <button className="ticket-ai-drawer__confirm-send" type="button" onClick={() => void confirmEffectDraft(drawer.effectDraft)} disabled={isStreaming || isConfirmingEffect}>{isConfirmingEffect ? "正在确认…" : "确认执行操作草稿"}</button> : null}
        {drawer.effectDraft?.status === "completed" ? <p className="ticket-ai-drawer__sent">操作草稿已执行并完成读回校验。</p> : null}
      </aside>
    </div> : null}
  </WorkspaceShell>;
}

function AiSessionMessage({ entry, apiBaseUrl, active }) {
  if (entry.kind === "permission") return <AcpPermissionPrompt permission={entry.permission} active={active} onReply={(input) => replyAcpPermission({ ...input, apiBaseUrl })} />;
  const thoughts = entry.thoughts || [];
  const toolCalls = entry.toolCalls || [];
  return <div className={`ticket-ai-message ticket-ai-message--${entry.kind}`}>
    {thoughts.length ? <details className="ticket-ai-message__details">
      <summary>思考过程 <span>{thoughts.length} 条</span></summary>
      <div>{thoughts.map((thought, index) => <p key={thought.id || index}>{thought.text}</p>)}</div>
    </details> : null}
    {entry.text ? <div className="ticket-ai-message__text">{entry.text}</div> : null}
    {toolCalls.length ? <details className="ticket-ai-message__details">
      <summary>工具调用 <span>{toolCalls.length} 个</span></summary>
      <div>{toolCalls.map((toolCall, index) => <div className="ticket-ai-tool-call" key={toolCall.id || index}><strong>{toolCall.title}</strong><small>{formatToolStatus(toolCall.status)}</small>{toolCall.detail ? <p>{toolCall.detail}</p> : null}</div>)}</div>
    </details> : null}
    {entry.kind === "assistant" && entry.text ? <div className="ticket-ai-message__actions"><AiSessionCopyButton text={entry.text} /></div> : null}
  </div>;
}

function formatToolStatus(status) {
  return ({ pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败" })[status] || "已记录";
}
