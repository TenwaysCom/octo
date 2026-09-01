import { useEffect, useMemo, useState } from "react";
import { createLarkTicketEvalSample, listLarkTicketEvalSamples, updateLarkTicketEvalSample } from "../../services/lark-ticket-eval/lark-ticket-eval-api.js";
import { getLarkTicketAiPipeline } from "../../lib/lark-ticket-ai-pipeline.js";

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
    setSaving(true); setError("");
    try {
      const updated = await updateLarkTicketEvalSample({ apiBaseUrl: sample.apiBaseUrl, sampleId: sample.id, update: { ...draft, actionRunId: crypto.randomUUID() } });
      onSaved(updated); onClose();
    } catch (cause) { setError(cause.message || "样本保存失败。"); } finally { setSaving(false); }
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

export function LarkTicketAiWorkspace({ apiBaseUrl, mode, groups, visibleColumns, collapsedGroups = [], onToggleGroup = () => {}, collapsedSubgroups = [], onToggleSubgroup = () => {} }) {
  const [samples, setSamples] = useState([]);
  const [sampleStatus, setSampleStatus] = useState("loading");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [creatingId, setCreatingId] = useState(null);
  useEffect(() => { let active = true; void listLarkTicketEvalSamples({ apiBaseUrl }).then((items) => { if (active) { setSamples(items); setSampleStatus("ready"); } }, (cause) => { if (active) { setSampleStatus("error"); setError(cause?.code === "EVAL_SAMPLE_LIST_FAILED" ? "Eval 数据集读取失败：请确认 Server 已重启，并已执行 db:migrate 创建本地样本表。" : `Eval 数据集读取失败：${cause?.code || "UNKNOWN_ERROR"}`); } }); return () => { active = false; }; }, [apiBaseUrl]);
  const sampleByTicket = useMemo(() => new Map(samples.map((sample) => [`${sample.ticket.baseId}:${sample.ticket.tableId}:${sample.ticket.recordId}`, sample])), [samples]);
  const evalGroups = useMemo(() => {
    const toSamples = (tickets) => tickets.flatMap((ticket) => {
      const sample = sampleByTicket.get(`${ticket.baseId}:${ticket.tableId}:${ticket.recordId}`);
      return sample ? [sample] : [];
    });
    return groups.map((group) => ({
      ...group,
      items: toSamples(group.items),
      subgroups: group.subgroups?.map((subgroup) => ({ ...subgroup, items: toSamples(subgroup.items) })),
    }));
  }, [groups, sampleByTicket]);
  async function createSample(ticket) { setCreatingId(ticket.recordId); setError(""); try { const sample = await createLarkTicketEvalSample({ apiBaseUrl, ticket, actionRunId: crypto.randomUUID() }); setSamples((current) => [sample, ...current.filter((item) => item.id !== sample.id)]); setEditor({ ...sample, apiBaseUrl }); } catch (cause) { setError(cause.message === "THREAD_SNAPSHOT_INCOMPLETE" ? "该 Ticket 的线程快照不完整，不能创建 Eval 样本。" : cause.message || "Eval 样本创建失败。"); } finally { setCreatingId(null); } }
  function saved(sample) { setSamples((current) => current.map((item) => item.id === sample.id ? sample : item)); }
  function renderAiRows(tickets) {
    const stageColumnKeys = { intent: "intent", summary: "problemSummary", answer: "answerSummary", document: "documentOutput" };
    return <div className="ticket-ai-output-list">{tickets.map((ticket) => { const sample = sampleByTicket.get(`${ticket.baseId}:${ticket.tableId}:${ticket.recordId}`); const hasOutput = Boolean(Object.keys(ticket.ticketAi?.fields || {}).length); const pipeline = getLarkTicketAiPipeline(ticket).filter((stage) => visibleColumns.includes(stageColumnKeys[stage.id])); return <article className="ticket-ai-output-row" key={ticket.recordId}><div className="ticket-ai-output-row__ticket"><a href={`#lark-tickets/${encodeURIComponent(ticket.recordId)}`}>{ticket.title}</a><small>{ticket.ticketNumber || ticket.recordId} · {ticket.ticketStatus || "未设置"}</small></div>{pipeline.length ? <div className="ticket-ai-output-row__pipeline" style={{ gridTemplateColumns: `repeat(${pipeline.length}, minmax(0, 1fr))` }}>{pipeline.map((stage) => <div className="ticket-ai-pipeline-stage" key={stage.id}><small>{stage.title}</small><span className={stage.status === "未生成" ? "ticket-ai-pipeline-stage__status ticket-ai-pipeline-stage__status--empty" : "ticket-ai-pipeline-stage__status"}>{stage.status}</span><strong title={stage.summary}>{stage.summary}</strong></div>)}</div> : null}<div className="ticket-ai-output-row__actions"><a href={`#lark-tickets/${encodeURIComponent(ticket.recordId)}`}>继续处理</a>{sample ? <button type="button" onClick={() => setEditor({ ...sample, apiBaseUrl })}>{sample.datasetStatus === "badcase" ? "Badcase" : sample.datasetStatus === "eval" ? "查看 Eval" : "继续标注"}</button> : <button className="button-primary" type="button" disabled={!hasOutput || creatingId === ticket.recordId} title={!hasOutput ? "需先有 AI 输出" : undefined} onClick={() => void createSample(ticket)}>{creatingId === ticket.recordId ? "创建中…" : "加入 Eval"}</button>}</div></article>; })}</div>;
  }
  function renderEvalRows(sampleItems) {
    return <div className="ticket-eval-sample-list">{sampleItems.map((sample) => <article className="ticket-eval-sample-row" key={sample.id}><div><strong>{sample.ticket.title}</strong><small>{visibleColumns.includes("snapshotVersion") ? `快照 v${sample.snapshotVersion} · ` : ""}{sample.ticket.recordId}</small></div>{visibleColumns.includes("datasetStatus") ? <span className={`ticket-eval-status ticket-eval-status--${sample.datasetStatus}`}>{sample.datasetStatus === "badcase" ? "Badcase" : sample.datasetStatus === "eval" ? "Eval" : "草稿"}</span> : null}{visibleColumns.includes("aiIntent") ? <div><small>AI 意图</small><strong>{text(sample.aiOutput?.["AI意图"] || sample.aiOutput?.["AI Bug 分类"]) || "未设置"}</strong></div> : null}{visibleColumns.includes("manualIntent") ? <div><small>人工意图</small><strong>{sample.manualIntent || "待标注"}</strong></div> : null}{visibleColumns.includes("expectedOutcome") ? <div><small>期望结果</small><strong>{sample.expectedOutcome || "待标注"}</strong></div> : null}{visibleColumns.includes("failureLabels") ? <div><small>失败标签</small><strong>{sample.failureLabels?.join("、") || "未标注"}</strong></div> : null}<button type="button" onClick={() => setEditor({ ...sample, apiBaseUrl })}>编辑</button></article>)}</div>;
  }
  return <section className="ticket-ai-workspace">
    {error ? <p className="list-message list-message--error">{error}</p> : null}
    {mode === "ai-output" ? groups.map((group) => <TicketGroup group={group} key={group.key} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}><TicketGroupRows group={group} renderRows={renderAiRows} collapsedSubgroups={collapsedSubgroups} onToggleSubgroup={onToggleSubgroup} /></TicketGroup>) : null}
    {mode === "eval-dataset" ? <>{sampleStatus === "loading" ? <p className="list-message">正在加载 Eval 数据集…</p> : null}{sampleStatus === "ready" && samples.length === 0 ? <p className="list-message">暂无样本。请先从 AI 输出视图选择 Ticket。</p> : null}{evalGroups.map((group) => <TicketGroup group={group} key={group.key} collapsedGroups={collapsedGroups} onToggleGroup={onToggleGroup}><TicketGroupRows group={group} renderRows={renderEvalRows} collapsedSubgroups={collapsedSubgroups} onToggleSubgroup={onToggleSubgroup} /></TicketGroup>)}</> : null}
    {editor ? <EvalEditor sample={editor} onClose={() => setEditor(null)} onSaved={saved} /> : null}
  </section>;
}
