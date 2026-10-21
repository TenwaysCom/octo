import { useEffect, useRef, useState } from "react";
import { useAiSessionPanel } from "../../hooks/useAiSessionPanel.js";
import { aiRunStatusLabel } from "../../lib/ai-session-panel.js";
import { getHermesAnswerHistory, getHermesTurns, isHermesAnswerSession, LARK_HERMES_ANSWER_ACTION } from "../../lib/lark-hermes-session.js";
import { formatDateTime } from "../../lib/formatters.js";
import { listLarkTicketAiSessions, loadLarkTicketAiSession, stopLarkTicketAiSession, streamLarkTicketAiSession, replyAcpPermission } from "../../services/lark-ticket-ai/lark-ticket-ai-api.js";
import { AcpPermissionPrompt } from "../ai-session/AcpPermissionPrompt.jsx";
import { AiSessionCopyButton } from "../ai-session/AiSessionCopyButton.jsx";
import { LarkAppMarkdown } from "./LarkAppMarkdown.jsx";

const running = (status) => ["running", "waiting_permission", "stopping"].includes(status);

export function LarkHermesPanel({ ticket, apiBaseUrl, visible = true }) {
  const [history, setHistory] = useState({ status: "loading", items: [] });
  const [draft, setDraft] = useState("");
  const refreshRef = useRef(null), initialized = useRef(false), submitPending = useRef(false);
  const { drawer, panel, isStreaming } = useAiSessionPanel(JSON.stringify([apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId, "hermes"]), {
    load: async (sessionId) => {
      const loaded = await loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId });
      if (!isHermesAnswerSession(loaded)) throw Object.assign(new Error("此会话不属于 Hermes 回答问题，请选择其他会话。"), { code: "SESSION_FORBIDDEN" });
      return loaded;
    },
    stream: (input) => streamLarkTicketAiSession({ ...input, apiBaseUrl, ticket }),
    stop: (sessionId, runId) => stopLarkTicketAiSession({ apiBaseUrl, ticket, sessionId, runId }),
    onChange: () => refreshRef.current?.(),
  });
  useEffect(() => {
    let active = true, sequence = 0, timer;
    const refresh = async () => {
      clearTimeout(timer);
      const version = ++sequence;
      try {
        const items = getHermesAnswerHistory(await listLarkTicketAiSessions({ apiBaseUrl, ticket }));
        if (!active || version !== sequence) return null;
        setHistory({ status: "ready", items });
        if (!initialized.current) {
          initialized.current = true;
          if (items[0] && !panel.getSnapshot()) void panel.open(items[0]);
        }
        if (items.some((item) => running(item.runStatus))) timer = setTimeout(() => void refresh(), 5000);
        return items;
      } catch {
        if (active && version === sequence) setHistory((current) => ({ ...current, status: "error" }));
        return null;
      }
    };
    refreshRef.current = refresh;
    void refresh();
    return () => { active = false; clearTimeout(timer); refreshRef.current = null; };
  }, [apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId, panel]);

  const selected = history.items.find((item) => item.sessionId === drawer?.sessionId);
  const busySession = history.items.find((item) => running(item.runStatus));
  const busy = isStreaming || Boolean(busySession);
  const uncertain = drawer?.status === "error" && !drawer.runId;
  const resumable = Boolean(drawer?.sessionId && isHermesAnswerSession({ ...selected, ...drawer }) && drawer.sessionId !== drawer.runId);
  async function recover() {
    const items = await refreshRef.current?.();
    if (!items) return;
    const session = items.find((item) => item.sessionId === drawer?.sessionId) || items[0];
    if (session) await panel.open(session);
    else panel.close();
  }
  async function send(event) {
    event?.preventDefault();
    if (submitPending.current || busy || history.status !== "ready" || drawer?.status === "loading" || uncertain) return;
    if (drawer && !resumable) return;
    const message = drawer ? draft.trim() : "回答问题";
    if (!message) return;
    submitPending.current = true;
    try {
      await panel.start({ message, sessionId: drawer?.sessionId || undefined, title: drawer?.title || "回答问题", actionKey: LARK_HERMES_ANSWER_ACTION });
      // Keep a failed request available for correction or an explicit retry.
      if (panel.getSnapshot()?.status === "ready") setDraft("");
    } finally { submitPending.current = false; }
  }
  const metadata = { ...selected, ...drawer };
  const turns = getHermesTurns(drawer?.messages || []);
  return <section className="lark-app__card lark-hermes" aria-label="Hermes Agent AI 问答">
    <div className="lark-app__section-title"><h2>Hermes Agent AI</h2><div className="lark-hermes__actions">
      <button type="button" onClick={() => void recover()}>读取进度</button>
      <button type="button" disabled={busy || uncertain || history.status !== "ready" || drawer?.status === "loading"} onClick={() => { panel.close(); setDraft(""); }}>新对话</button>
    </div></div>
    <p className="lark-app__muted">围绕当前 Ticket 回答和追问。使用最新资料，请新建对话。</p>
    {history.status === "loading" && <p role="status">正在读取会话…</p>}
    {history.status === "error" && <p role="alert">会话暂时无法读取，请点击“读取进度”重试。</p>}
    {history.items.length > 0 && <label className="lark-hermes__history">当前账号的历史会话<select aria-label="Hermes 历史会话" value={selected?.sessionId || ""} disabled={drawer?.status === "loading" || isStreaming} onChange={(event) => {
      const session = history.items.find((item) => item.sessionId === event.target.value);
      if (session) { setDraft(""); void panel.open(session); }
    }}><option value="" disabled>新对话</option>{history.items.map((item) => <option key={item.sessionId} value={item.sessionId}>{item.title || "回答问题"} · {formatDateTime(item.updatedAt)}{running(item.runStatus) ? ` · ${aiRunStatusLabel(item.runStatus)}` : ""}</option>)}</select></label>}
    {metadata.threadSnapshotVersion && <p className="lark-app__muted">聊天资料 v{metadata.threadSnapshotVersion}{metadata.threadContextSyncedAt ? ` · 同步于 ${formatDateTime(metadata.threadContextSyncedAt)}` : ""}</p>}
    {busySession && busySession.sessionId !== drawer?.sessionId && <p role="status">此 Ticket 有问答正在执行。<button type="button" onClick={() => void panel.open(busySession)}>恢复正在运行的会话</button></p>}
    {drawer && <div className="lark-hermes__transcript" aria-label="Hermes 对话内容" aria-busy={isStreaming}>
      {drawer.status === "loading" && <p role="status">正在恢复会话…</p>}
      {turns.map((turn, index) => <HermesTurn key={turn.id} turn={turn} apiBaseUrl={apiBaseUrl}
        runStatus={index === turns.length - 1 ? drawer.runStatus || "completed" : "completed"}
        active={index === turns.length - 1 && isStreaming}
        permissionActive={index === turns.length - 1 && visible && isStreaming && drawer.status !== "stopping"} />)}
      {drawer.connectionError && <p role="status">{drawer.connectionError}</p>}
      {drawer.status === "error" && <p role="alert">{drawer.error || "本轮未完成，请先读取进度后再继续。"}</p>}
      {drawer.status === "cancelled" && <p role="status">已停止，已有内容已保留。</p>}
    </div>}
    <form className="lark-hermes__composer" onSubmit={(event) => void send(event)}>
      {isStreaming && <p className="lark-hermes__progress" role="status" aria-live="polite">{drawer.status === "stopping"
        ? "正在停止，已有内容会保留。"
        : drawer.status === "waiting_permission"
          ? "Hermes 正在等待工具确认，请处理上方的确认请求。"
          : drawer.runId ? "问题已提交，Hermes 正在处理，回答会逐步显示。" : "正在提交问题…"}</p>}
      {drawer && <label>继续提问<textarea rows={3} maxLength={8000} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy || !resumable || drawer.status === "loading"} placeholder="补充问题或需要核实的条件…" /></label>}
      <div className="lark-hermes__actions">
        {isStreaming && <button type="button" disabled={!drawer.runId || drawer.status === "stopping"} onClick={() => void panel.stop()}>{drawer.status === "stopping" ? "正在停止…" : "停止"}</button>}
        <button className="lark-app__primary" type="submit" disabled={busy || history.status !== "ready" || drawer?.status === "loading" || uncertain || (drawer && (!resumable || !draft.trim()))}>{isStreaming ? "正在回答…" : drawer ? "发送追问" : "回答问题"}</button>
      </div>
    </form>
  </section>;
}

function HermesTurn({ turn, apiBaseUrl, runStatus, active, permissionActive }) {
  const phase = runStatus === "waiting_permission" ? "等待确认"
    : runStatus === "stopping" ? "正在停止"
      : turn.latestActivity === "thinking" ? "正在思考"
        : turn.latestActivity === "tools" ? (turn.tools.some((tool) => ["pending", "in_progress"].includes(tool.status)) ? "正在使用工具" : "正在整理回答")
          : turn.latestActivity === "answering" ? "正在生成回答" : "正在准备回答";
  const status = active ? phase : aiRunStatusLabel(runStatus) || "已完成";
  const answer = turn.answers.map((entry) => entry.text).join("\n\n");
  const sources = active ? [] : turn.sources;
  return <article className="lark-hermes__turn">
    {turn.question && <div className="lark-hermes__question"><span>你的问题</span><p>{turn.question}</p></div>}
    <div className="lark-hermes__response">
      <header className="lark-hermes__response-header">
        <span className="lark-hermes__avatar" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m10 2 2.2 5.8L18 10l-5.8 2.2L10 18l-2.2-5.8L2 10l5.8-2.2Z" /></svg></span>
        <strong>Hermes</strong>
        <span className={`lark-hermes__run-state lark-hermes__run-state--${runStatus}`}>
          {active && <span className="lark-hermes__activity-dot" aria-hidden="true" />}{status}
        </span>
      </header>
      {turn.reasoning.length > 0 && <HermesReasoning entries={turn.reasoning} thinking={active && turn.latestActivity === "thinking"} interrupted={["failed", "cancelled"].includes(runStatus)} />}
      {turn.tools.length > 0 && <details className="lark-hermes__process">
        <summary><span className="lark-hermes__chevron" aria-hidden="true" /><span>工具步骤</span>
          {turn.tools.length > 0 && <span className="lark-hermes__tool-count">{turn.tools.length} 个工具</span>}
          <span className="lark-hermes__process-state">{active ? phase : "已结束"}</span>
        </summary>
        <ol>
          {turn.tools.map((tool) => <HermesTool key={tool.id} tool={tool} active={active} />)}
        </ol>
      </details>}
      {turn.permissions.map((entry) => <AcpPermissionPrompt key={entry.id} permission={entry.permission} active={permissionActive} onReply={(input) => replyAcpPermission({ ...input, apiBaseUrl })} />)}
      {answer ? <div className="lark-hermes__answer">
        {turn.answers.map((entry) => <LarkAppMarkdown key={entry.id} text={entry.text} />)}
        {sources.length > 0 && <HermesSources sources={sources} />}
        <div className="lark-hermes__answer-footer"><AiSessionCopyButton text={answer} /></div>
      </div> : <p className="lark-hermes__answer-placeholder">{active ? `${phase}…` : "本轮未返回答案正文。"}</p>}
    </div>
  </article>;
}

function HermesReasoning({ entries, thinking, interrupted }) {
  const [expanded, setExpanded] = useState(false);
  return <details className={`lark-hermes__reasoning${thinking ? " lark-hermes__reasoning--active" : ""}`} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>
      <span className="lark-hermes__chevron" aria-hidden="true" />
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5v1a3 3 0 0 0 4 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Zm6 0a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5v1a3 3 0 0 1-4 3 3 3 0 0 1-3-3M6 7l1 1m7-1-1 1M5 12h2m8 0h-2" /></svg>
      <span>思考过程</span>
      <span className="lark-hermes__process-state">{thinking ? "正在思考…" : interrupted ? "已中断" : "查看记录"}</span>
      {thinking && <span className="lark-hermes__activity-dot" aria-hidden="true" />}
    </summary>
    {expanded && <div className="lark-hermes__reasoning-content" role="region" aria-label="Hermes 思考记录" tabIndex={0}>
      {entries.map((entry) => <LarkAppMarkdown key={entry.id} text={entry.text} />)}
    </div>}
  </details>;
}

function HermesSources({ sources }) {
  return <details className="lark-hermes__sources">
    <summary><span className="lark-hermes__chevron" aria-hidden="true" />
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3h6l4 4v10H6zM12 3v4h4M3 6v11" /></svg>
      <span>参考来源</span><span className="lark-hermes__source-count">{sources.length}</span>
      <span className="lark-hermes__process-state">查看引用</span>
    </summary>
    <div className="lark-hermes__sources-content">
      <p className="lark-hermes__sources-note">本轮回答列出的引用</p>
      <ul>{sources.map((source) => <li key={source.id}>
        {source.href ? <a className="lark-hermes__source-card" href={source.href} target="_blank" rel="noreferrer" title={source.href}>
          <HermesSourceContent source={source} /><span className="lark-hermes__source-open" aria-hidden="true">↗</span>
        </a> : <div className="lark-hermes__source-card" title={source.location}><HermesSourceContent source={source} /></div>}
      </li>)}</ul>
    </div>
  </details>;
}

function HermesSourceContent({ source }) {
  return <><span className="lark-hermes__source-icon" aria-hidden="true">{source.kind === "web" ? <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" /><ellipse cx="10" cy="10" rx="3" ry="7" /><path d="M3 10h14" /></svg> : <svg viewBox="0 0 20 20"><path d="M5 2h6l4 4v12H5zM11 2v4h4M8 10h4M8 13h4" /></svg>}</span>
    <span className="lark-hermes__source-info"><strong>{source.title}</strong><small>{source.kind === "document" ? "文档路径 · " : source.kind === "reference" ? "资料引用 · " : ""}{source.location}</small></span></>;
}

function HermesTool({ tool, active }) {
  const state = ["pending", "in_progress", "completed", "failed"].includes(tool.status) ? tool.status : "unknown";
  const label = ({ pending: active ? "待执行" : "未完成", in_progress: active ? "执行中" : "未完成", completed: "已完成", failed: "失败" })[state] || "已记录";
  return <li className={`lark-hermes__step lark-hermes__step--${state}`}>
    <span className="lark-hermes__step-dot" aria-hidden="true" />
    <span className="lark-hermes__tool-title" title={tool.title}>{tool.title}</span><small>{label}</small>
  </li>;
}
