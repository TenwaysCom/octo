import { useEffect, useId, useMemo, useState } from "react";
import { createLarkTicketEvalSample, listLarkTicketEvalSamples, updateLarkTicketEvalSample } from "../../services/lark-ticket-eval/lark-ticket-eval-api.js";
import { loadLarkTicketPreparedMessages } from "../../services/lark-ticket/lark-ticket-api.js";
import { getLarkTicketAiOutputMarker, getLarkTicketAiPipeline } from "../../lib/lark-ticket-ai-pipeline.js";
import { getLarkTicketEvalSaveErrorMessage, getLarkTicketEvalValidationMessage } from "../../lib/lark-ticket-eval-validation.js";
import { formatDateTime } from "../../lib/formatters.js";
import { LarkTicketBadge } from "./LarkTicketBadge.jsx";

const FAILURE_LABELS = [
  ["intent_incorrect", "意图错误"], ["fact_incorrect", "事实错误"], ["missing_evidence", "缺少证据"],
  ["risk_missed", "风险遗漏"], ["action_incorrect", "行动错误"], ["answer_unusable", "回答不可用"],
];

function text(value) { if (value == null) return ""; return Array.isArray(value) ? value.join("、") : typeof value === "object" ? JSON.stringify(value) : String(value); }
function initialDraft(sample) { return { datasetStatus: sample.datasetStatus, manualIntent: sample.manualIntent || "", expectedOutcome: sample.expectedOutcome || "", notes: sample.notes || "", failureLabels: sample.failureLabels || [] }; }

function EvalEditor({ sample, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => initialDraft(sample));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const validationMessage = getLarkTicketEvalValidationMessage(draft);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSaving(true); setError("");
    try {
      const updated = await updateLarkTicketEvalSample({ apiBaseUrl: sample.apiBaseUrl, sampleId: sample.id, update: { ...draft, actionRunId: crypto.randomUUID() } });
      onSaved(updated); onClose();
    } catch (cause) { setError(getLarkTicketEvalSaveErrorMessage(cause)); } finally { setSaving(false); }
  }
  return <div className="ticket-eval-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ticket-eval-editor" role="dialog" aria-modal="true" aria-labelledby="ticket-eval-editor-title">
      <header><div><small>快照 v{sample.snapshotVersion}</small><h2 id="ticket-eval-editor-title">{sample.ticket.title}</h2></div><button type="button" onClick={onClose} aria-label="关闭">×</button></header>
      <div className="ticket-eval-editor__ai"><strong>冻结的 AI 输出</strong><p>{text(sample.aiOutput?.["AI Ticket 总结"]) || "未记录 AI 总结"}</p><small>意图：{text(sample.aiOutput?.["AI Bug 分类"]) || "未设置"}</small></div>
      <label>人工标准意图<textarea value={draft.manualIntent} onChange={(event) => setDraft((current) => ({ ...current, manualIntent: event.target.value }))} placeholder="例如：用户登录故障" /></label>
      <label>期望结果<textarea value={draft.expectedOutcome} onChange={(event) => setDraft((current) => ({ ...current, expectedOutcome: event.target.value }))} placeholder="写出可判定的正确处理结果或回答要点" /></label>
      <label>标注备注<textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="可选：边界、复现条件或评测说明" /></label>
      <fieldset><legend>失败标签</legend><div>{FAILURE_LABELS.map(([value, label]) => <label key={value}><input type="checkbox" checked={draft.failureLabels.includes(value)} onChange={() => setDraft((current) => ({ ...current, failureLabels: current.failureLabels.includes(value) ? current.failureLabels.filter((item) => item !== value) : [...current.failureLabels, value] }))} />{label}</label>)}</div></fieldset>
      <label>数据集状态<select value={draft.datasetStatus} onChange={(event) => setDraft((current) => ({ ...current, datasetStatus: event.target.value }))}><option value="draft">草稿</option><option value="eval">纳入 Eval</option><option value="badcase">标记 Badcase</option></select></label>
      {error ? <p className="ticket-eval-editor__error">{error}</p> : null}
      <footer><button type="button" onClick={onClose}>取消</button><button className="button-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存样本"}</button></footer>
    </section>
  </div>;
}

function TicketGroup({ group, children, collapsedGroups, onToggleGroup }) {
  const isCollapsible = group.key !== "__all__";
  const collapsed = isCollapsible && collapsedGroups.includes(group.key);
  return <section className="ticket-ai-workspace__group" key={group.key}>
    {isCollapsible ? <button className="grouped-list__header" type="button" aria-expanded={!collapsed} onClick={() => onToggleGroup(group.key)}>
      <svg className={collapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
      <strong>{group.label}</strong><span>{group.items.length} 条 Ticket</span>
    </button> : null}
    {!collapsed ? children : null}
  </section>;
}

function TicketSubgroup({ group, children, collapsedSubgroups, onToggleSubgroup }) {
  const collapsed = collapsedSubgroups.includes(group.key);
  return <section className="grouped-list__subgroup">
    <button className="grouped-list__subgroup-header" type="button" aria-expanded={!collapsed} onClick={() => onToggleSubgroup(group.key)}>
      <svg className={collapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
      <strong>{group.label}</strong><span>{group.items.length} 条 Ticket</span>
    </button>
    {!collapsed ? children : null}
  </section>;
}

function TicketGroupRows({ group, renderRows, collapsedSubgroups, onToggleSubgroup }) {
  if (!group.subgroups?.length) return renderRows(group.items);
  return <div className="grouped-list__subgroups">{group.subgroups.map((subgroup) => <TicketSubgroup
    group={subgroup}
    key={subgroup.key}
    collapsedSubgroups={collapsedSubgroups}
    onToggleSubgroup={onToggleSubgroup}
  >{renderRows(subgroup.items)}</TicketSubgroup>)}</div>;
}

function TicketThreadActions({ ticket, onShowPreparedMessages, messagesLabel = "查看 prepared messages" }) {
  const threadLink = ticket.larkMessageLink || ticket.threadLink;
  return <>{threadLink ? <a href={threadLink} target="_blank" rel="noreferrer">打开 Lark Thread</a> : <button type="button" disabled title="该 Ticket 没有已同步的 Lark Thread 链接">打开 Lark Thread</button>}<button type="button" onClick={() => void onShowPreparedMessages(ticket)}>{messagesLabel}</button></>;
}

function closeActionsMenu(event) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function EvalActionsMenu({ ticket, onShowPreparedMessages }) {
  return <details className="ticket-row-actions-menu">
    <summary aria-label="更多操作" title="更多操作">…</summary>
    <div className="ticket-row-actions-menu__panel">
      {ticket.larkMessageLink || ticket.threadLink
        ? <a href={ticket.larkMessageLink || ticket.threadLink} target="_blank" rel="noreferrer" onClick={closeActionsMenu}>打开 Lark Thread</a>
        : <button type="button" disabled title="该 Ticket 没有已同步的 Lark Thread 链接">打开 Lark Thread</button>}
      <button type="button" onClick={(event) => { closeActionsMenu(event); void onShowPreparedMessages(ticket); }}>查看messages</button>
    </div>
  </details>;
}

function AiPipelineStage({ stage, showStatus = true }) {
  const tooltipId = useId();
  const details = stage.details || stage.shadowDetails || [];
  const hasDetails = Boolean(details.length);
  const statusTone = stage.statusTone || (stage.status === "未生成" ? "empty" : "ready");
  return <div
    className={`ticket-ai-pipeline-stage${hasDetails ? " ticket-ai-pipeline-stage--has-details" : ""}`}
    tabIndex={hasDetails ? 0 : undefined}
    aria-describedby={hasDetails ? tooltipId : undefined}
  >
    <small>{stage.title}</small>
    {showStatus ? <span className={`ticket-ai-pipeline-stage__status ticket-ai-pipeline-stage__status--${statusTone}`}>{stage.status}</span> : null}
    <strong title={hasDetails ? undefined : stage.summary}>{stage.summary}</strong>
    {hasDetails ? <div className="ticket-ai-pipeline-stage__tooltip" id={tooltipId} role="tooltip">
      <b>{stage.detailTitle || "Shadow AI"}</b>
      <dl>{details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
    </div> : null}
  </div>;
}

function EvalTextField({ title, value }) {
  return <div className="ticket-ai-pipeline-stage ticket-eval-text-field">
    <small>{title}</small>
    <p>{typeof value === "string" && value.trim() ? value : "待标注"}</p>
  </div>;
}

function getEvalDetailStage(id, title, value) {
  const summary = text(value) || "待标注";
  return {
    id,
    title,
    summary,
    detailTitle: `${title}详情`,
    details: summary === "待标注" ? [] : [{ label: "完整内容", value: summary }],
  };
}

function PreparedMessagesDialog({ thread, onClose }) {
  return <div className="ticket-eval-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="ticket-prepared-messages" role="dialog" aria-modal="true" aria-labelledby="prepared-messages-title"><header><div><small>{thread.ticket.title}{thread.snapshotVersion ? ` · 快照 v${thread.snapshotVersion}` : ""}</small><h2 id="prepared-messages-title">Prepared messages</h2></div><button type="button" onClick={onClose} aria-label="关闭">×</button></header>{thread.status === "loading" ? <p>正在读取已准备消息…</p> : null}{thread.status === "error" ? <p className="ticket-eval-editor__error">{thread.error}</p> : null}{thread.status === "ready" ? <div className="ticket-prepared-messages__list">{thread.messages.map((message, index) => <article className={`ticket-prepared-message ticket-prepared-message--${message.senderRole || "unknown"}`} key={message.messageId || index}><small>{message.senderLabel || message.senderRole || "未知发送者"}{message.createdAt ? ` · ${formatDateTime(message.createdAt)}` : ""}{message.hasArtifact ? " · 含附件" : ""}</small><p>{message.text || "（空消息）"}</p></article>)}</div> : null}</section></div>;
}

export function LarkTicketAiWorkspace({ apiBaseUrl, mode, groups, visibleColumns, collapsedGroups = [], onToggleGroup = () => {}, collapsedSubgroups = [], onToggleSubgroup = () => {} }) {
  const [samples, setSamples] = useState([]);
  const [sampleStatus, setSampleStatus] = useState("loading");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [preparedThread, setPreparedThread] = useState(null);
  const [creatingId, setCreatingId] = useState(null);
  useEffect(() => { let active = true; void listLarkTicketEvalSamples({ apiBaseUrl }).then((items) => { if (active) { setSamples(items); setSampleStatus("ready"); } }, (cause) => { if (active) { setSampleStatus("error"); setError(cause?.code === "EVAL_SAMPLE_LIST_FAILED" ? "Eval 数据集读取失败：请确认 Server 已重启，并已执行 db:migrate 创建本地样本表。" : `Eval 数据集读取失败：${cause?.code || "UNKNOWN_ERROR"}`); } }); return () => { active = false; }; }, [apiBaseUrl]);
  const sampleByTicket = useMemo(() => new Map(samples.map((sample) => [`${sample.ticket.baseId}:${sample.ticket.tableId}:${sample.ticket.recordId}`, sample])), [samples]);
  const evalGroups = useMemo(() => {
    const toSamples = (tickets) => tickets.flatMap((ticket) => {
      const sample = sampleByTicket.get(`${ticket.baseId}:${ticket.tableId}:${ticket.recordId}`);
      return sample ? [{
        ...sample,
        ticket: { ...sample.ticket, ticketNumber: ticket.ticketNumber, issueType: ticket.issueType, ticketStatus: ticket.ticketStatus },
        shadowAi: ticket.shadowAi,
        threadLink: ticket.larkMessageLink || "",
      }] : [];
    });
    return groups.map((group) => ({
      ...group,
      items: toSamples(group.items),
      subgroups: group.subgroups?.map((subgroup) => ({ ...subgroup, items: toSamples(subgroup.items) })),
    }));
  }, [groups, sampleByTicket]);
  async function createSample(ticket) { setCreatingId(ticket.recordId); setError(""); try { const sample = await createLarkTicketEvalSample({ apiBaseUrl, ticket, actionRunId: crypto.randomUUID() }); setSamples((current) => [sample, ...current.filter((item) => item.id !== sample.id)]); setEditor({ ...sample, apiBaseUrl }); } catch (cause) { const code = cause?.code || cause?.message; setError(code === "THREAD_SNAPSHOT_INCOMPLETE" ? "该 Ticket 的线程快照不完整，不能创建 Eval 样本。" : code === "THREAD_SNAPSHOT_NOT_FOUND" ? "该 Ticket 尚未生成线程快照，请先进入详情页完成 AI 上下文准备。" : `创建 Eval 样本失败：${code || "UNKNOWN_ERROR"}`); } finally { setCreatingId(null); } }
  function saved(sample) { setSamples((current) => current.map((item) => item.id === sample.id ? sample : item)); }
  async function showPreparedMessages(ticket) {
    setPreparedThread({ ticket, status: "loading", messages: [], error: "" });
    try {
      const data = await loadLarkTicketPreparedMessages({ apiBaseUrl, ticket });
      setPreparedThread({ ticket, status: "ready", messages: data.messages, snapshotVersion: data.snapshotVersion, error: "" });
    } catch (cause) {
      setPreparedThread({ ticket, status: "error", messages: [], error: cause?.code === "THREAD_SNAPSHOT_NOT_FOUND" ? "该 Ticket 尚未准备线程消息。" : "Prepared messages 暂时无法读取。" });
    }
  }
  function renderAiRows(tickets) {
    const stageColumnKeys = { intent: "intent", summary: "problemSummary", answer: "answerSummary", document: "documentOutput" };
    return <div className="ticket-ai-output-list">{tickets.map((ticket) => { const sample = sampleByTicket.get(`${ticket.baseId}:${ticket.tableId}:${ticket.recordId}`); const pipeline = getLarkTicketAiPipeline(ticket).filter((stage) => visibleColumns.includes(stageColumnKeys[stage.id])); const outputMarker = getLarkTicketAiOutputMarker(ticket); return <article className="ticket-ai-output-row" key={ticket.recordId}><div className="ticket-ai-output-row__ticket"><a className="ticket-ai-output-row__title" href={`#lark-tickets/${encodeURIComponent(ticket.recordId)}`} title={ticket.title}>{ticket.title}</a><div className="ticket-ai-output-row__meta"><small>{ticket.ticketNumber || ticket.recordId} · {ticket.ticketStatus || "未设置"}</small><span className={`ticket-ai-marker${outputMarker.tone === "default" ? "" : ` ticket-ai-marker--${outputMarker.tone}`}`}>{outputMarker.label}</span>{ticket.issueType ? <LarkTicketBadge kind="type" value={ticket.issueType} /> : null}{ticket.priority ? <LarkTicketBadge kind="priority" value={ticket.priority} /> : null}</div></div>{pipeline.length ? <div className="ticket-ai-output-row__pipeline" style={{ gridTemplateColumns: `repeat(${pipeline.length}, minmax(0, 1fr))` }}>{pipeline.map((stage) => <AiPipelineStage stage={stage} key={stage.id} />)}</div> : null}<div className="ticket-ai-output-row__actions"><TicketThreadActions ticket={ticket} onShowPreparedMessages={showPreparedMessages} messagesLabel="查看messages" />{sample ? <button type="button" onClick={() => setEditor({ ...sample, apiBaseUrl })}>{sample.datasetStatus === "badcase" ? "Badcase" : sample.datasetStatus === "eval" ? "查看 Eval" : "继续标注"}</button> : <button className="button-primary" type="button" disabled={creatingId === ticket.recordId} onClick={() => void createSample(ticket)}>{creatingId === ticket.recordId ? "创建中…" : "加入 Eval"}</button>}</div></article>; })}</div>;
  }
  function renderEvalRows(sampleItems) {
    return <div className="ticket-eval-sample-list">{sampleItems.map((sample) => {
      const outputMarker = getLarkTicketAiOutputMarker({ ticketAi: { fields: sample.aiOutput || {} }, shadowAi: sample.shadowAi });
      const aiIntent = getLarkTicketAiPipeline({ ticketAi: { fields: sample.aiOutput || {} }, shadowAi: sample.shadowAi })[0];
      const formalIntent = text(sample.aiOutput?.["AI意图"] || sample.aiOutput?.["AI Bug 分类"]);
      const aiIntentDetails = [
        ...(formalIntent ? [{ label: "正式 AI 意图", value: formalIntent }] : []),
        ...(aiIntent.shadowDetails || []).map((detail) => detail.label === "意图" ? { ...detail, label: "Shadow 意图" } : detail),
      ];
      return <article className="ticket-eval-sample-row" key={sample.id}>
        <div className="ticket-eval-sample-row__ticket">
          <div className="ticket-eval-sample-row__heading">
            <span className={`ticket-eval-status ticket-eval-status--${sample.datasetStatus}`}>{sample.datasetStatus === "badcase" ? "Badcase" : sample.datasetStatus === "eval" ? "Eval" : "Draft"}</span>
            <a className="ticket-ai-output-row__title" href={`#lark-tickets/${encodeURIComponent(sample.ticket.recordId)}`} title={sample.ticket.title}>{sample.ticket.title}</a>
          </div>
          <div className="ticket-ai-output-row__meta">
            <small>{sample.ticket.ticketNumber || "未设置"}</small>
            <span className={`ticket-ai-marker${outputMarker.tone === "default" ? "" : ` ticket-ai-marker--${outputMarker.tone}`}`}>{outputMarker.label}</span>
            <LarkTicketBadge kind="type" value={sample.ticket.issueType} />
            <LarkTicketBadge kind="status" value={sample.ticket.ticketStatus} />
          </div>
        </div>
        {visibleColumns.includes("aiIntent") ? <AiPipelineStage showStatus={false} stage={{ ...aiIntent, detailTitle: "AI 意图详情", details: aiIntentDetails }} /> : null}
        {visibleColumns.includes("manualIntent") ? <EvalTextField title="人工意图" value={sample.manualIntent} /> : null}
        {visibleColumns.includes("expectedOutcome") ? <EvalTextField title="期望结果" value={sample.expectedOutcome} /> : null}
        {visibleColumns.includes("failureLabels") ? <AiPipelineStage showStatus={false} stage={getEvalDetailStage("failure-labels", "失败标签", sample.failureLabels)} /> : null}
        <div className="ticket-ai-output-row__actions ticket-eval-sample-row__actions">
          <button className="ticket-eval-edit-button" type="button" aria-label="编辑" title="编辑" onClick={() => setEditor({ ...sample, apiBaseUrl })}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.8 2.2 3 3L5 14H2v-3l8.8-8.8ZM9.3 3.7l3 3" /></svg>
          </button>
          <EvalActionsMenu ticket={{ ...sample.ticket, threadLink: sample.threadLink }} onShowPreparedMessages={showPreparedMessages} />
        </div>
      </article>;
    })}</div>;
  }
  return <section className="ticket-ai-workspace">
    {error ? <p className="list-message list-message--error">{error}</p> : null}
    {mode === "ai-output" ? groups.map((group) => <TicketGroup group={group} key={group.key} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}><TicketGroupRows group={group} renderRows={renderAiRows} collapsedSubgroups={collapsedSubgroups} onToggleSubgroup={onToggleSubgroup} /></TicketGroup>) : null}
    {mode === "eval-dataset" ? <>{sampleStatus === "loading" ? <p className="list-message">正在加载 Eval 数据集…</p> : null}{sampleStatus === "ready" && samples.length === 0 ? <p className="list-message">暂无样本。请先从 AI 输出视图选择 Ticket。</p> : null}{evalGroups.map((group) => <TicketGroup group={group} key={group.key} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}><TicketGroupRows group={group} renderRows={renderEvalRows} collapsedSubgroups={collapsedSubgroups} onToggleSubgroup={onToggleSubgroup} /></TicketGroup>)}</> : null}
    {editor ? <EvalEditor sample={editor} onClose={() => setEditor(null)} onSaved={saved} /> : null}
    {preparedThread ? <PreparedMessagesDialog thread={preparedThread} onClose={() => setPreparedThread(null)} /> : null}
  </section>;
}
