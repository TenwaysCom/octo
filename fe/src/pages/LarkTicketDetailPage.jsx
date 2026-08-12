import { useEffect, useState } from "react";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { appendAiSessionEvent, createAiUserMessage, transcriptFromAiSessionEvents } from "../lib/ai-session-transcript.js";
import { formatDateTime } from "../lib/formatters.js";
import { listLarkTicketAiSessions, loadLarkTicketAiSession, streamLarkTicketAiSession } from "../services/lark-ticket-ai/lark-ticket-ai-api.js";
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

function TicketProperty({ label, tone, children }) {
  return <div className="ticket-property">
    <dt>{label}</dt>
    <dd><span className={tone ? `ticket-property__value ticket-property__value--${tone}` : "ticket-property__value"}>{children || "未设置"}</span></dd>
  </div>;
}

function TicketLoadingState({ children }) {
  return <section className="profile-main ticket-detail-page"><p className="list-message">{children}</p></section>;
}

export function LarkTicketDetailPage({ profile, ticketRecordId, apiBaseUrl, onLogout, isBusy }) {
  const [state, setState] = useState({ status: "loading", ticket: undefined });
  const [aiSessions, setAiSessions] = useState({ status: "idle", items: [], error: "" });
  const [newSessionDraft, setNewSessionDraft] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [drawerDraft, setDrawerDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

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
    setDrawer({ sessionId: session.sessionId, title: session.title, status: "loading", messages: [], error: "", lastMessage: "" });
    setDrawerDraft("");
    try {
      const loaded = await loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId: session.sessionId });
      setDrawer({ sessionId: loaded.sessionId, title: session.title, status: "ready", messages: transcriptFromAiSessionEvents(loaded.events), error: "", lastMessage: "" });
    } catch (error) {
      setDrawer({ sessionId: session.sessionId, title: session.title, status: "error", messages: [], error: error.message || "AI Session 无法打开。", lastMessage: "" });
    }
  }

  async function streamAiSession({ message, sessionId, title }) {
    if (!ticket || !message.trim()) return;
    const trimmedMessage = message.trim();
    setIsStreaming(true);
    setDrawer((current) => ({
      sessionId: sessionId || current?.sessionId || null,
      title: title || current?.title || trimmedMessage,
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
        actionRunId: crypto.randomUUID(),
        onEvent: (event) => setDrawer((current) => current ? {
          ...current,
          sessionId: event.event === "session.created" ? event.data.sessionId : current.sessionId,
          status: event.event === "done" ? "ready" : "generating",
          messages: appendAiSessionEvent(current.messages, event),
        } : current),
      });
      void refreshAiSessions();
    } catch (error) {
      setDrawer((current) => current ? { ...current, status: "error", error: error.message || "AI Session 启动失败。" } : current);
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

  async function continueAiSession(event) {
    event.preventDefault();
    if (!drawerDraft.trim() || !drawer || isStreaming) return;
    const request = drawerDraft;
    setDrawerDraft("");
    await streamAiSession({ message: request, sessionId: drawer.sessionId || undefined, title: drawer.title });
  }

  if (state.status === "loading") {
    return <WorkspaceShell user={profile.user ?? {}} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy}><TicketLoadingState>正在加载 Ticket 详情…</TicketLoadingState></WorkspaceShell>;
  }
  if (state.status === "error") {
    return <WorkspaceShell user={profile.user ?? {}} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy}><TicketLoadingState>Ticket 详情暂时无法读取，请稍后重试。</TicketLoadingState></WorkspaceShell>;
  }
  if (!state.ticket) {
    return <WorkspaceShell user={profile.user ?? {}} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy}><TicketLoadingState>未在当前同步快照中找到该 Ticket。</TicketLoadingState></WorkspaceShell>;
  }

  const ticketNumber = ticket.ticketNumber || ticket.recordId;
  const resources = [
    [ticket.sharedUrl, "在 Lark Base 中打开"],
    [ticket.larkMessageLink, "关联 Lark 消息"],
    [ticket.meegleLink, "关联 Meegle 工作项"],
  ].filter(([href]) => href);

  return <WorkspaceShell user={profile.user ?? {}} activePage="lark-tickets" onLogout={onLogout} isBusy={isBusy}>
    <main className="profile-main ticket-detail-page">
      <div className="ticket-detail__topline">
        <a className="ticket-back-link" href="#lark-tickets"><span aria-hidden="true">←</span>全部 Lark Ticket</a>
        <ExternalResource href={ticket.sharedUrl}>在 Lark 中查看</ExternalResource>
      </div>
      <div className="ticket-detail-grid">
        <article className="ticket-detail__content">
          <p className="ticket-detail__identity"><span className="ticket-type-mark" aria-hidden="true">◫</span>{ticket.issueType || "Lark Ticket"}<span>·</span>{ticketNumber}</p>
          <h1>{ticket.title}</h1>

          <section className="ticket-detail-section">
            <h2>Description</h2>
            <p className={`ticket-description ${ticket.detailDescription ? "" : "ticket-description--empty"}`.trim()}>{ticket.detailDescription || "暂无描述。"}</p>
          </section>

          <section className="ticket-detail-section">
            <h2>Resources</h2>
            {resources.length ? <div className="ticket-resource-list">{resources.map(([href, label]) => <ExternalResource href={href} key={label}>{label}</ExternalResource>)}</div> : <p className="ticket-section-empty">暂无关联资源。</p>}
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
              <span className="ticket-ai-session-card__content"><strong>{session.title}</strong><small>{formatDateTime(session.updatedAt)}</small></span>
              <span className="ticket-ai-session-card__open" aria-hidden="true">›</span>
            </button>)}</div> : null}
            <form className="ticket-ai-session-create" onSubmit={createAiSession}>
              <label className="visually-hidden" htmlFor="ticket-ai-session-request">AI Session 请求</label>
              <textarea id="ticket-ai-session-request" value={newSessionDraft} onChange={(event) => setNewSessionDraft(event.target.value)} placeholder="例如：为这个 Ticket 创建 PRD，并列出待确认的问题…" rows="3" disabled={isStreaming} />
              <div><span>当前 Ticket 的标题、描述与资源会作为 AI 上下文。</span><button type="submit" disabled={!newSessionDraft.trim() || isStreaming}>{isStreaming ? "AI 正在回复…" : "新建 AI Session"}</button></div>
            </form>
          </section>
        </article>

        <aside className="ticket-detail__properties" aria-label="Ticket 属性">
          <h2>Properties</h2>
          <dl>
            <TicketProperty label="状态" tone="status">{ticket.ticketStatus}</TicketProperty>
            <TicketProperty label="紧急度" tone="priority">{ticket.priority}</TicketProperty>
            <TicketProperty label="负责人" tone="owner">{ticket.responsible}</TicketProperty>
            <TicketProperty label="标签" tone="label">{ticket.issueType}</TicketProperty>
          </dl>
          <p className="ticket-detail__sync-time">同步于 {formatDateTime(ticket.syncedAt)}</p>
        </aside>
      </div>
    </main>
    {drawer ? <div className="ticket-ai-drawer-backdrop" role="presentation" onMouseDown={() => !isStreaming && setDrawer(null)}>
      <aside className="ticket-ai-drawer" aria-label="AI Session 详情" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ticket-ai-drawer__header"><div><p>Kimi ACP AI Chat</p><h2>{drawer.title}</h2></div><button type="button" aria-label="关闭 AI Session" onClick={() => setDrawer(null)} disabled={isStreaming}>×</button></header>
        <div className="ticket-ai-drawer__body">
          {drawer.status === "loading" ? <p className="ticket-section-empty">正在加载会话…</p> : null}
          {drawer.messages.length ? drawer.messages.map((entry, index) => <AiSessionMessage entry={entry} key={entry.id || `${entry.kind}-${index}`} />) : null}
          {drawer.status === "generating" ? <p className="ticket-ai-generating">Kimi 正在生成回复…</p> : null}
          {drawer.status === "error" ? <div className="ticket-ai-drawer__error"><p>{drawer.error}</p>{drawer.lastMessage ? <button type="button" onClick={() => void streamAiSession({ message: drawer.lastMessage, sessionId: drawer.sessionId || undefined, title: drawer.title })} disabled={isStreaming}>Retry</button> : null}</div> : null}
        </div>
        <form className="ticket-ai-drawer__composer" onSubmit={continueAiSession}>
          <label className="visually-hidden" htmlFor="ticket-ai-followup">继续对话</label>
          <textarea id="ticket-ai-followup" value={drawerDraft} onChange={(event) => setDrawerDraft(event.target.value)} placeholder="继续这个 AI Session…" rows="2" disabled={isStreaming || drawer.status === "loading"} />
          <button type="submit" disabled={isStreaming || drawer.status === "loading" || !drawerDraft.trim()}>发送 ↑</button>
        </form>
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
  </div>;
}

function formatToolStatus(status) {
  return ({ pending: "待处理", in_progress: "进行中", completed: "已完成", failed: "失败" })[status] || "已记录";
}
