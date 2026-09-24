import { useEffect, useId, useRef, useState } from "react";
import { useAiSessionPanel } from "../../hooks/useAiSessionPanel.js";
import { aiRunStatusLabel, isAiSessionRunning } from "../../lib/ai-session-panel.js";
import { getLarkAppUnderstanding, getLarkAppWikiHistory, LARK_APP_WIKI_ACTION } from "../../lib/lark-ticket-app.js";
import { getShadowStageDetails, getShadowStatusLabel } from "../../lib/lark-ticket-shadow-ai.js";
import { formatDateTime } from "../../lib/formatters.js";
import { listLarkTicketAiSessions, loadLarkTicketAiSession, stopLarkTicketAiSession, streamLarkTicketAiSession } from "../../services/lark-ticket-ai/lark-ticket-ai-api.js";
import { AiSessionCopyButton } from "../ai-session/AiSessionCopyButton.jsx";
import { LarkAppMarkdown } from "./LarkAppMarkdown.jsx";

function ConfidenceBadge({ value, kind = "intent" }) {
  const descriptionId = useId();
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  const label = kind === "intent" ? "意图判断" : "方案总结";
  return <span className="lark-app__confidence-wrap">
    <button type="button" className="lark-app__confidence" aria-label={`${label}：AI 自评 ${Math.round(value * 100)}%，查看说明`} aria-describedby={descriptionId}>AI 自评 {Math.round(value * 100)}%</button>
    <span id={descriptionId} className="lark-app__confidence-help" role="tooltip">模型对本次{label}的自评，未经正确率校准。分数高不代表结论已验证，请结合证据与信息时效判断。{kind === "answer" && "此评分针对已有方案总结，不代表回复草稿的可信度。"}</span>
  </span>;
}

export function LarkAppUnderstanding({ ticket }) {
  const descriptionId = useId();
  const items = getLarkAppUnderstanding(ticket);
  const sources = [...new Set(items.map((item) => item.source).filter(Boolean))];
  const sharedSource = sources.length === 1 ? sources[0] : "";
  return <section className="lark-app__card lark-app__understanding">
    <div className="lark-app__understanding-heading"><h2>AI 诉求理解</h2>
      {sharedSource && <span className="lark-app__badge lark-app__badge--source">{sharedSource}</span>}
      <span className="lark-app__confidence-wrap">
        <button type="button" className="lark-app__info" aria-label="AI 诉求理解说明" aria-describedby={descriptionId}>i</button>
        <span id={descriptionId} role="tooltip" className="lark-app__confidence-help">以上为已有 AI 推断，请结合最新讨论核对；期望结果、交付物及待补充信息仍需确认。</span>
      </span>
    </div>
    <dl className="lark-app__understanding-list">{items.map((item) => <div className={`lark-app__understanding-${item.id}`} key={item.id}>
      <dt>{item.label} {!sharedSource && item.source && <span className="lark-app__badge lark-app__badge--source">{item.source}</span>}</dt>
      <dd className={`lark-app__scored-value${item.text ? "" : " lark-app__muted"}`}><span>{item.text || "待确认"}</span>{item.text && <ConfidenceBadge value={item.confidence} />}</dd>
    </div>)}</dl>
  </section>;
}

function SavedAnalysis({ ticket }) {
  const shadow = ticket.shadowAi;
  const previewLabels = ["意图", "关键词", "问题总结", "方案摘要", "业务风险", "风险依据", "回复时机（分析时）", "回复依据", ...(shadow?.wikiContext ? ["Wiki 参考"] : [])];
  const fields = shadow ? (shadow.status === "ok" ? ["intent", "summary", "answer"] : ["intent"])
    .flatMap((stage) => getShadowStageDetails(shadow, stage)) : [];
  const preview = shadow?.status === "ok"
    ? previewLabels.map((label) => ({ label, value: fields.find((field) => field.label === label)?.value || "暂无信息" }))
    : [];
  const details = fields.filter((field) => !previewLabels.includes(field.label) && !["置信度", "答案置信", "分析时间"].includes(field.label));
  const renderFields = (items) => <dl>{items.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd className="lark-app__scored-value"><span>{value}</span>{shadow?.status === "ok" && fields.some((field) => field.label === label) && (label === "意图" || label === "方案摘要") && <ConfidenceBadge value={label === "意图" ? shadow.intentConfidence : shadow.resultConfidence} kind={label === "意图" ? "intent" : "answer"} />}</dd></div>)}</dl>;
  return <section className="lark-app__card">
    <div className="lark-app__shadow-heading"><h2>Shadow AI · {shadow ? getShadowStatusLabel(shadow.status) : "暂无分析"}</h2>{shadow?.analyzedAt && <time className="lark-app__muted" dateTime={shadow.analyzedAt} title="Shadow 分析时间">{formatDateTime(shadow.analyzedAt)}</time>}</div>
    {preview.length > 0 && renderFields(preview)}
    {!shadow && <p className="lark-app__muted">暂无已保存的 Shadow AI 分析。</p>}
    {details.length > 0 && <details className="lark-app__shadow-more">
      <summary>展开更多信息</summary>
      {renderFields(details)}
    </details>}
  </section>;
}

export function LarkAppAnalysis({ ticket, apiBaseUrl, replyReference }) {
  const [tab, setTab] = useState("saved");
  const [history, setHistory] = useState({ status: "loading", items: [] });
  const refreshRef = useRef(null);
  const { drawer, panel, isStreaming } = useAiSessionPanel(JSON.stringify([apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId]), {
    load: (sessionId) => loadLarkTicketAiSession({ apiBaseUrl, ticket, sessionId }),
    stream: (input) => streamLarkTicketAiSession({ ...input, apiBaseUrl, ticket }),
    stop: (sessionId, runId) => stopLarkTicketAiSession({ apiBaseUrl, ticket, sessionId, runId }),
    onChange: () => refreshRef.current?.(),
  });
  useEffect(() => {
    let active = true;
    let version = 0;
    let timer;
    const refresh = async () => {
      clearTimeout(timer);
      const request = ++version;
      try {
        const items = getLarkAppWikiHistory(await listLarkTicketAiSessions({ apiBaseUrl, ticket }));
        if (!active || request !== version) return;
        setHistory({ status: "ready", items });
        if (items.some((item) => ["running", "stopping", "waiting_permission"].includes(item.runStatus))) timer = setTimeout(refresh, 10_000);
      } catch {
        if (active && request === version) setHistory((current) => ({ ...current, status: "error" }));
      }
    };
    refreshRef.current = refresh;
    void refresh();
    return () => { active = false; clearTimeout(timer); refreshRef.current = null; };
  }, [apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId]);

  const start = () => {
    if (isAiSessionRunning(panel.getSnapshot()) || panel.getSnapshot()?.status === "loading") return;
    void panel.start({ message: "wiki 问答", title: "Wiki 即时分析", actionKey: LARK_APP_WIKI_ACTION, oneShot: true });
  };
  const selected = history.items.find((item) => item.sessionId === drawer?.sessionId);
  return <>
    <div className="lark-app__tabs" role="tablist" aria-label="分析来源">
      {[ ["saved", "Shadow AI"], ["live", "WIKI Rag AI"] ].map(([id, label]) => <button key={id} id={`lark-app-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`lark-app-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault(); const next = event.key === "Home" ? "saved" : event.key === "End" ? "live" : tab === "live" ? "saved" : "live";
          setTab(next); document.getElementById(`lark-app-tab-${next}`)?.focus();
        }
      }}><span>{label}</span></button>)}
    </div>
    <div className="lark-app__panel" id="lark-app-panel-live" role="tabpanel" aria-labelledby="lark-app-tab-live" hidden={tab !== "live"}>
      <section className="lark-app__card">
        <div className="lark-app__section-title"><h2>Wiki 即时分析</h2><button className="lark-app__primary" onClick={start} disabled={isStreaming || drawer?.status === "loading"}>立即分析</button></div>
        <p className="lark-app__muted">点击后基于本次获取的 Ticket 材料检索 Wiki 并生成答案，不持续监听讨论。请核对依据与适用条件后使用。</p>
        {drawer && <div aria-label="即时分析结果">
          <p role="status">{drawer.status === "loading" ? "正在加载分析…" : aiRunStatusLabel(drawer.runStatus)}{(selected?.updatedAt || drawer.updatedAt) && ` · 运行更新：${formatDateTime(selected?.updatedAt || drawer.updatedAt)}`}</p>
          {drawer.messages.filter((entry) => entry.kind !== "user").map((entry) => entry.kind === "assistant" ? <div key={entry.id} className="lark-app__answer"><LarkAppMarkdown text={entry.text || ""} />{entry.text && <AiSessionCopyButton text={entry.text} />}</div> : entry.text ? <p key={entry.id} role="status" className="lark-app__muted">{entry.text}</p> : null)}
          {drawer.connectionError && <p role="status">{drawer.connectionError}</p>}
          {["error", "cancelled"].includes(drawer.status) && <div role="alert"><p>{drawer.error || "执行已停止，已有内容仅供参考。"}</p><p className="lark-app__muted">本轮未完成，请重新执行。</p><button onClick={start}>重新执行</button></div>}
          {isStreaming && <button onClick={() => void panel.stop()} disabled={!drawer.runId || drawer.status === "stopping"}>{drawer.status === "stopping" ? "正在停止…" : "停止分析"}</button>}
        </div>}
      </section>
      <section className="lark-app__card"><div className="lark-app__section-title"><h2>Wiki 分析历史</h2><button onClick={() => void refreshRef.current?.()}>刷新历史</button></div>
        <p className="lark-app__muted">仅显示当前账号在此 Ticket 下、服务端当前保留的 Wiki 运行记录。</p>
        {history.status === "loading" && <p role="status">正在读取历史…</p>}
        {history.status === "error" && <p role="alert">分析历史暂时无法读取，请刷新重试。</p>}
        {history.status === "ready" && !history.items.length && <p className="lark-app__muted">暂无可用的 Wiki 分析历史。</p>}
        <ul className="lark-app__history">{history.items.map((session) => <li key={session.sessionId}><button disabled={isStreaming || drawer?.status === "loading"} onClick={() => void panel.open(session, { oneShot: true })} aria-pressed={drawer?.sessionId === session.sessionId}><span>{session.title || "Wiki 问答"}</span><small>{aiRunStatusLabel(session.runStatus)} · {session.updatedAt ? formatDateTime(session.updatedAt) : "时间未提供"}</small></button></li>)}</ul>
      </section>
    </div>
    <div className="lark-app__panel" id="lark-app-panel-saved" role="tabpanel" aria-labelledby="lark-app-tab-saved" hidden={tab !== "saved"}>{replyReference}<SavedAnalysis ticket={ticket} /></div>
  </>;
}
