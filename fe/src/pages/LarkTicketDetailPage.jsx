import { useEffect, useState } from "react";
import { AiSessionCopyButton } from "../components/ai-session/AiSessionCopyButton.jsx";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { LarkTicketBadge } from "../components/lark-ticket/LarkTicketBadge.jsx";
import { LarkTicketResponsible } from "../components/lark-ticket/LarkTicketResponsible.jsx";
import { appendAiSessionEvent, createAiUserMessage, transcriptFromAiSessionEvents } from "../lib/ai-session-transcript.js";
import { formatDateTime } from "../lib/formatters.js";
import { LARK_TICKET_AI_QUICK_ACTIONS } from "../lib/lark-ticket-ai-actions.js";
import { getTicketAiSections } from "../lib/ticket-ai-sections.js";
import { confirmLarkTicketAiDraft, listLarkTicketAiSessions, loadLarkTicketAiSession, streamLarkTicketAiSession } from "../services/lark-ticket-ai/lark-ticket-ai-api.js";
import { loadLarkTicketSharedUrl } from "../services/lark-ticket/lark-ticket-api.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";

const UNVERIFIED_AI_ERROR_CODES = new Set(["SUPPORT_QA_EVIDENCE_NOT_FETCHED", "SUPPORT_ANALYSIS_NOT_UPDATED"]);

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

const SHADOW_STATUS_LABELS = { ok: "已生成", skipped: "已跳过", error: "失败" };

function ShadowAiPanel({ shadowAi }) {
  const statusLabel = SHADOW_STATUS_LABELS[shadowAi.status] || shadowAi.status;
  return <section className="ticket-shadow-panel" aria-label="影子分析">
    <div className="ticket-shadow-panel__heading">
      <h2>影子分析</h2>
      <span className={`ticket-shadow-panel__status ticket-shadow-panel__status--${shadowAi.status}`}>{statusLabel}</span>
    </div>
    {shadowAi.status === "ok" ? <dl>
      {shadowAi.intentType ? <TicketProperty label="意图">{shadowAi.intentType}</TicketProperty> : null}
      {shadowAi.intentSubtype ? <TicketProperty label="子意图">{shadowAi.intentSubtype}</TicketProperty> : null}
      {typeof shadowAi.intentConfidence === "number" ? <TicketProperty label="置信度">{Math.round(shadowAi.intentConfidence * 100)}%</TicketProperty> : null}
      {shadowAi.summary ? <TicketProperty label="总结">{shadowAi.summary}</TicketProperty> : null}
    </dl> : null}
    {shadowAi.status === "skipped" ? <p className="ticket-shadow-panel__note">跳过原因：{shadowAi.reason || "未记录"}</p> : null}
    {shadowAi.status === "error" ? <p className="ticket-shadow-panel__note">{shadowAi.errorCode || "SHADOW_FAILED"}{shadowAi.errorMessage ? `：${shadowAi.errorMessage}` : ""}</p> : null}
    <p className="ticket-shadow-panel__meta">
      {shadowAi.analyzedAt ? `分析于 ${formatDateTime(shadowAi.analyzedAt)}` : "尚未分析"}
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

export function LarkTicketDetailPage({ profile, ticketRecordId, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const [state, setState] = useState({ status: "loading", ticket: undefined });
  const [sharedUrlStatus, setSharedUrlStatus] = useState("idle");
  const [aiSessions, setAiSessions] = useState({ status: "idle", items: [], error: "" });
  const [newSessionDraft, setNewSessionDraft] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSendingDraft, setIsSendingDraft] = useState(false);
  const [expandedTicketAiSectionId, setExpandedTicketAiSectionId] = useState(null);

  useEffect(() => {
    let active = true;
    void getPlatformDataList({ apiBaseUrl, kind: "lark-tickets" }).then(
      ({ items }) => {
        if (active) setState({ status: "ready", ticket: items.find((item) => item.recordId === ticketRecordId) });
      },
      () => { if (active) setState({ status: "error", ticket: undefined }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, ticketRecordId]);

  const ticket = state.ticket;

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

  useEffect(() => {
    if (!ticket) return undefined;
    let active = true;
    setAiSessions({ status: "loading", items: [], error: "" });
    void listLarkTicketAiSessions({ apiBaseUrl, ticket }).then(
      (items) => { if (active) setAiSessions({ status: "ready", items, error: "" }); },
      () => { if (active) setAiSessions({ status: "error", items: [], error: "AI Sessions 暂时无法读取。" }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, ticket?.baseId, ticket?.recordId, ticket?.tableId]);

  async function openAiSession(session) {
    if (!ticket) return;
    setDrawer({ sessionId: session.sessionId, title: session.title, actionKey: session.actionKey || null, oneShot: false, verificationStatus: session.runStatus === "failed" ? "unverified" : "verified", status: "loading", messages: [], error: "", lastMessage: "" });
    setDrawerDraft("");
    try {
      const loaded = await loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId: session.sessionId });
      setDrawer({ sessionId: loaded.sessionId, title: session.title, actionKey: session.actionKey || null, oneShot: false, verificationStatus: session.runStatus === "failed" ? "unverified" : "verified", status: "ready", messages: transcriptFromAiSessionEvents(loaded.events), error: session.runStatus === "failed" ? session.errorMessage || "证据校验未完成，当前内容仅作为未验证草稿保留。" : "", lastMessage: "" });
    } catch (error) {
      setDrawer({ sessionId: session.sessionId, title: session.title, actionKey: session.actionKey || null, oneShot: false, verificationStatus: session.runStatus === "failed" ? "unverified" : "verified", status: "error", messages: [], error: error.message || "AI Session 无法打开。", lastMessage: "" });
    }
  }

  async function streamAiSession({ message, sessionId, title, actionKey, oneShot = false }) {
    if (!ticket || !message.trim()) return;
    const trimmedMessage = message.trim();
    setIsStreaming(true);
    setDrawer((current) => ({
      sessionId: sessionId || current?.sessionId || null,
      title: title || current?.title || trimmedMessage,
      actionKey: actionKey || current?.actionKey || null,
      oneShot: oneShot || current?.oneShot || false,
      verificationStatus: actionKey ? "pending" : current?.verificationStatus || "verified",
      status: "generating",
      messages: [...(current?.messages || []), createAiUserMessage(trimmedMessage)],
      error: "",
      lastMessage: trimmedMessage,
    }));
    try {
      await streamLarkTicketAiSession({
        apiBaseUrl,
        ticket,
        message: trimmedMessage,
        sessionId,
        actionKey,
        actionRunId: crypto.randomUUID(),
        onEvent: (event) => setDrawer((current) => current ? {
          ...current,
          sessionId: event.event === "session.created" ? event.data.sessionId : current.sessionId,
          status: event.event === "done" ? "ready" : "generating",
          verificationStatus: event.event === "done" ? "verified" : current.verificationStatus,
          messages: appendAiSessionEvent(current.messages, event),
        } : current),
      });
      void refreshAiSessions();
    } catch (error) {
      const unverified = UNVERIFIED_AI_ERROR_CODES.has(error.code);
      setDrawer((current) => current ? { ...current, status: "error", verificationStatus: unverified ? "unverified" : current.verificationStatus, error: error.message || "AI Session 启动失败。" } : current);
      void refreshAiSessions();
    } finally {
      setIsStreaming(false);
    }
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

  async function confirmDraftSend() {
    const draft = [...(drawer?.messages || [])].reverse().find((entry) => entry.kind === "assistant" && entry.text)?.text;
    if (!ticket || !drawer?.sessionId || !draft || !window.confirm("确认将这份回复草案发送到当前 Lark Ticket thread？")) return;
    setIsSendingDraft(true);
    try {
      await confirmLarkTicketAiDraft({ apiBaseUrl, ticket, sessionId: drawer.sessionId, draft, actionRunId: crypto.randomUUID() });
      setDrawer((current) => current ? { ...current, draftSent: true } : current);
    } catch (error) {
      setDrawer((current) => current ? { ...current, status: "error", error: error.message || "回复草案发送失败。" } : current);
    } finally { setIsSendingDraft(false); }
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
  const ticketAiSections = getTicketAiSections(ticket.ticketAi?.fields);
  const hasTicketAiData = ticketAiSections.some((section) => section.hasData);

  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <main className="profile-main ticket-detail-page">
      <div className="ticket-detail__topline">
        <a className="ticket-back-link" href="#lark-tickets"><span aria-hidden="true">←</span>全部 Lark Ticket</a>
        <ExternalResource href={ticket.sharedUrl}>在 Lark 中查看</ExternalResource>
      </div>
      <div className="ticket-detail-grid">
        <article className="ticket-detail__content">
          <p className="ticket-detail__identity"><LarkTicketBadge kind="type" value={ticket.issueType} /><span>·</span>{ticketNumber}</p>
          <h1>{ticket.title}</h1>

          <section className="ticket-detail-section">
            <h2>Description</h2>
            <p className={`ticket-description ${ticket.detailDescription ? "" : "ticket-description--empty"}`.trim()}>{ticket.detailDescription || "暂无描述。"}</p>
          </section>

          <section className="ticket-detail-section">
            <h2>Resources</h2>
            {resources.length ? <div className="ticket-resource-list">{resources.map(([href, label]) => <ExternalResource href={href} key={label}>{label}</ExternalResource>)}</div> : sharedUrlStatus === "loading" ? <p className="ticket-section-empty">正在获取 Lark Ticket 链接…</p> : <p className="ticket-section-empty">暂无关联资源。</p>}
          </section>

          <section className="ticket-detail-section ticket-ai-data">
            <div className="ticket-section-heading"><h2>Ticket AI</h2><span>{hasTicketAiData ? "Octo 本地记录" : "暂无记录"}</span></div>
            <div className="ticket-ai-overview" aria-label="Ticket AI 概览">
              {ticketAiSections.map((section) => {
                const expanded = expandedTicketAiSectionId === section.id;
                return <button
                  className={`ticket-ai-overview-card ${section.hasData ? "ticket-ai-overview-card--filled" : "ticket-ai-overview-card--empty"}`}
                  type="button"
                  key={section.id}
                  aria-expanded={expanded}
                  aria-controls={`ticket-ai-section-${section.id}`}
                  onClick={() => setExpandedTicketAiSectionId((current) => current === section.id ? null : section.id)}
                >
                  <span className="ticket-ai-overview-card__heading"><strong>{section.title}</strong><small>{section.hasData ? "已生成" : "暂无数据"}</small></span>
                  <span className="ticket-ai-overview-card__summary">{section.summary.length ? section.summary.map((item) => formatTicketAiValue(item.value)).join(" · ") : section.emptyMessage}</span>
                  <span className="ticket-ai-overview-card__toggle" aria-hidden="true">{expanded ? "收起" : "查看"}</span>
                </button>;
              })}
            </div>
            {ticketAiSections.map((section) => expandedTicketAiSectionId === section.id ? <div className="ticket-ai-section-detail" id={`ticket-ai-section-${section.id}`} key={section.id}>
              <div className="ticket-ai-section-detail__heading"><h3>{section.title}</h3><span>{section.hasData ? `${section.items.length} 项信息` : "暂无数据"}</span></div>
              {section.hasData ? <dl className="ticket-ai-section-detail__fields">{section.items.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{formatTicketAiValue(item.value)}</dd></div>)}</dl> : <p className="ticket-section-empty">{section.emptyMessage}</p>}
            </div> : null)}
          </section>

          <section className="ticket-detail-section ticket-ai-sessions">
            <div className="ticket-section-heading"><h2>AI Sessions</h2><span>{aiSessions.items.length} 个会话</span></div>
            {aiSessions.status === "loading" ? <p className="ticket-section-empty">正在加载 AI Sessions…</p> : null}
            {aiSessions.status === "error" ? <p className="ticket-ai-session-error">{aiSessions.error}</p> : null}
            {aiSessions.status === "ready" && aiSessions.items.length === 0 ? <div className="ticket-ai-session-empty">
              <span className="ticket-ai-session-empty__icon" aria-hidden="true">✦</span>
              <div><strong>暂无 AI Session</strong><p>输入目标后创建一个带有当前 Ticket 上下文的 Kimi ACP 会话。</p></div>
            </div> : null}
            {aiSessions.items.length ? <div className="ticket-ai-session-list">{aiSessions.items.map((session) => <button className="ticket-ai-session-card" type="button" key={session.sessionId} onClick={() => void openAiSession(session)}>
              <span className="ticket-ai-session-card__icon" aria-hidden="true">✦</span>
              <span className="ticket-ai-session-card__content"><strong>{session.title}</strong><small>{formatDateTime(session.updatedAt)}{session.runStatus === "failed" ? " · 未验证草稿" : ""}</small></span>
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
        </article>

        <aside className="ticket-detail__properties" aria-label="Ticket 属性">
          <h2>Properties</h2>
          <dl>
            <TicketProperty label="状态"><LarkTicketBadge kind="status" value={ticket.ticketStatus} /></TicketProperty>
            <TicketProperty label="紧急度"><LarkTicketBadge kind="priority" value={ticket.priority} /></TicketProperty>
            <TicketProperty label="需求人"><LarkTicketResponsible responsible={ticket.requester} /></TicketProperty>
            <TicketProperty label="负责人"><LarkTicketResponsible responsible={ticket.responsible} /></TicketProperty>
            <TicketProperty label="类型"><LarkTicketBadge kind="type" value={ticket.issueType} /></TicketProperty>
          </dl>
          <p className="ticket-detail__sync-time">同步于 {formatDateTime(ticket.syncedAt)}</p>
          {ticket.shadowAi ? <ShadowAiPanel shadowAi={ticket.shadowAi} /> : null}
        </aside>
      </div>
    </main>
    {drawer ? <div className="ticket-ai-drawer-backdrop" role="presentation" onMouseDown={() => !isStreaming && setDrawer(null)}>
      <aside className="ticket-ai-drawer" aria-label="AI Session 详情" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ticket-ai-drawer__header"><div><p>{drawer.oneShot ? "DeepSeek 一次性分析" : "Kimi ACP AI Chat"}</p><h2>{drawer.title}</h2></div><button type="button" aria-label="关闭 AI Session" onClick={() => setDrawer(null)} disabled={isStreaming}>×</button></header>
        <div className="ticket-ai-drawer__body">
          {drawer.verificationStatus === "unverified" ? <div className="ticket-ai-drawer__unverified"><strong>未验证草稿</strong><p>答案已保存，但证据获取或分析写回没有完成，未进入正式 Ticket AI 输出。</p></div> : null}
          {drawer.status === "loading" ? <p className="ticket-section-empty">正在加载会话…</p> : null}
          {drawer.messages.length ? drawer.messages.map((entry, index) => <AiSessionMessage entry={entry} key={entry.id || `${entry.kind}-${index}`} />) : null}
          {drawer.status === "generating" ? <p className="ticket-ai-generating">{drawer.oneShot ? "DeepSeek 正在生成总结…" : "Kimi 正在生成回复…"}</p> : null}
          {drawer.status === "error" ? <div className="ticket-ai-drawer__error"><p>{drawer.error}</p>{drawer.lastMessage || drawer.actionKey ? <button type="button" onClick={() => void streamAiSession({ message: drawer.lastMessage || drawer.title, sessionId: drawer.oneShot || drawer.verificationStatus === "unverified" ? undefined : drawer.sessionId || undefined, actionKey: drawer.oneShot || drawer.verificationStatus === "unverified" ? drawer.actionKey || undefined : undefined, oneShot: drawer.oneShot, title: drawer.title })} disabled={isStreaming}>重新执行</button> : null}</div> : null}
        </div>
        {drawer.oneShot ? drawer.status === "ready" ? <p className="ticket-ai-drawer__sent">问题总结已写入 Ticket AI；如需更新，请重新执行该 Quick Action。</p> : null : <form className="ticket-ai-drawer__composer" onSubmit={continueAiSession}>
          <label className="visually-hidden" htmlFor="ticket-ai-followup">继续对话</label>
          <textarea id="ticket-ai-followup" value={drawerDraft} onChange={(event) => setDrawerDraft(event.target.value)} placeholder={drawer.verificationStatus === "unverified" ? "请先重新执行受控动作" : "继续这个 AI Session…"} rows="2" disabled={isStreaming || drawer.status === "loading" || drawer.verificationStatus === "unverified"} />
          <button type="submit" disabled={isStreaming || drawer.status === "loading" || drawer.verificationStatus === "unverified" || !drawerDraft.trim()}>发送 ↑</button>
        </form>}
        {drawer.actionKey === "lark-ticket-support-qa-answer" && drawer.verificationStatus !== "unverified" && !drawer.draftSent && drawer.messages.some((entry) => entry.kind === "assistant" && entry.text) ? <button className="ticket-ai-drawer__confirm-send" type="button" onClick={() => void confirmDraftSend()} disabled={isStreaming || isSendingDraft}>{isSendingDraft ? "正在发送…" : "确认发送回复草案"}</button> : null}
        {drawer.draftSent ? <p className="ticket-ai-drawer__sent">回复草案已发送到当前 Ticket thread。</p> : null}
      </aside>
    </div> : null}
  </WorkspaceShell>;
}

function AiSessionMessage({ entry }) {
  const thoughts = entry.thoughts || [];
  const toolCalls = entry.toolCalls || [];
  return <div className={`ticket-ai-message ticket-ai-message--${entry.kind}`}>
    {thoughts.length ? <details className="ticket-ai-message__details">
      <summary>思考过程 <span>{thoughts.length} 条</span></summary>
      <div>{thoughts.map((thought, index) => <p key={thought.id || index}>{thought.text}</p>)}</div>
    </details> : null}
    {toolCalls.length ? <details className="ticket-ai-message__details">
      <summary>工具调用 <span>{toolCalls.length} 个</span></summary>
      <div>{toolCalls.map((toolCall, index) => <div className="ticket-ai-tool-call" key={toolCall.id || index}><strong>{toolCall.title}</strong><small>{formatToolStatus(toolCall.status)}</small>{toolCall.detail ? <p>{toolCall.detail}</p> : null}</div>)}</div>
    </details> : null}
    {entry.text ? <div className="ticket-ai-message__text">{entry.text}</div> : null}
    {entry.kind === "assistant" && entry.text ? <div className="ticket-ai-message__actions"><AiSessionCopyButton text={entry.text} /></div> : null}
  </div>;
}

function formatToolStatus(status) {
  return ({ pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败" })[status] || "已记录";
}
