import { useEffect, useId, useRef, useState } from "react";
import { createShadowEvalSample, listLarkTicketEvalSamples, updateLarkTicketEvalSample } from "../../services/lark-ticket-eval/lark-ticket-eval-api.js";
import { getLarkTicketEvalSaveErrorMessage, getLarkTicketEvalValidationMessage } from "../../lib/lark-ticket-eval-validation.js";
import { createEvalSaveAttempt, initialEvalDraft, mergeEvalDraft } from "../../lib/lark-ticket-eval-save.js";
import { getShadowStageDetails } from "../../lib/lark-ticket-shadow-ai.js";
import { formatDateTime } from "../../lib/formatters.js";

const FAILURE_LABELS = [
  ["intent_incorrect", "意图错误"], ["fact_incorrect", "事实错误"], ["missing_evidence", "缺少证据"],
  ["risk_missed", "风险遗漏"], ["action_incorrect", "行动错误"], ["answer_unusable", "回答不可用"],
];

export function LarkTicketEvalEditor({ sample: initialSample, apiBaseUrl = initialSample.apiBaseUrl, onClose, onSaved, onReload }) {
  const [sample, setSample] = useState(initialSample);
  const [draft, setDraft] = useState(() => initialEvalDraft(initialSample));
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState(null);
  const busy = useRef(false), active = useRef(false), dialog = useRef(null);
  const attempt = useRef(createEvalSaveAttempt());
  const titleId = useId();
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement;
    dialog.current?.querySelector("button")?.focus();
    const keydown = (event) => {
      if (event.key === "Escape" && !busy.current) onClose();
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll("button:not(:disabled), summary, textarea:not(:disabled), select:not(:disabled), input:not(:disabled)")].filter((element) => element.getClientRects().length);
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) { event.preventDefault(); target?.focus(); }
    };
    const element = dialog.current;
    element.addEventListener("keydown", keydown);
    return () => { active.current = false; element.removeEventListener("keydown", keydown); previous?.focus?.(); };
  }, []);

  async function save() {
    if (busy.current || conflict) return;
    const validation = getLarkTicketEvalValidationMessage(draft, sample.source);
    if (validation) { setError(validation); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const update = attempt.current({ ...draft, ...(sample.id ? { expectedUpdatedAt: sample.updatedAt } : { outputVersion: sample.outputVersion }) });
      const updated = sample.id ? await updateLarkTicketEvalSample({ apiBaseUrl, sampleId: sample.id, update })
        : await createShadowEvalSample({ apiBaseUrl, ticket: sample.ticket, update });
      if (active.current) { onSaved(updated); onClose(); }
    } catch (cause) {
      if (active.current) { setError(getLarkTicketEvalSaveErrorMessage(cause)); setConflict(["EVAL_SAMPLE_CONFLICT", "SHADOW_OUTPUT_CHANGED"].includes(cause.code)); }
    } finally { busy.current = false; if (active.current) setSaving(false); }
  }

  async function reload() {
    if (busy.current) return;
    busy.current = true; setReloading(true);
    try {
      const updated = onReload ? await onReload(sample) : (await listLarkTicketEvalSamples({ apiBaseUrl, ticket: sample.ticket })).find((item) => item.id === sample.id);
      if (!updated) throw new Error("样本已不可用，请关闭后重新打开。");
      if (active.current) {
        setDraft((current) => mergeEvalDraft(current, sample, updated)); setSample(updated); setLatest(updated);
        setConflict(false); setError("");
      }
    } catch (cause) { if (active.current) setError(getLarkTicketEvalSaveErrorMessage(cause)); }
    finally { busy.current = false; if (active.current) setReloading(false); }
  }

  const shadow = sample.source === "shadow" ? sample.aiOutput?.shadowAi : undefined;
  const fields = shadow ? [...new Map(["intent", "summary", "answer"].flatMap((stage) => getShadowStageDetails(shadow, stage)).map((field) => [field.label, field])).values()]
    : [{ label: "意图", value: sample.aiOutput?.["AI意图"] || sample.aiOutput?.["AI Bug 分类"] || "未记录" }, { label: "问题总结", value: sample.aiOutput?.["AI Ticket 总结"] || "未记录" }];
  return <div className="ticket-eval-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy.current) onClose(); }}>
    <section ref={dialog} className="ticket-eval-editor" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><small>{shadow ? "Shadow AI" : "历史 Eval 样本"} · 快照 v{sample.snapshotVersion}</small><h2 id={titleId}>{sample.id ? "编辑标注" : "标记 Badcase"}</h2><p className="ticket-eval-editor__ticket">{sample.ticket.title}</p></div><button type="button" disabled={saving || reloading} onClick={onClose} aria-label="关闭">×</button></header>
      <div className="ticket-eval-editor__body">
        <details className="ticket-eval-editor__ai" open={Boolean(latest && !initialSample.id)}><summary>{sample.id ? "本样本冻结的 AI 输出" : "本次评价的 Shadow 输出"}<span>查看分析</span></summary>{shadow?.analyzedAt && <small>分析于 {formatDateTime(shadow.analyzedAt)}</small>}<dl>{fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl></details>
        {latest && <div className="ticket-eval-editor__latest" role="status"><strong>已重新读取，请核对后保存。已填写的修改保留。</strong><p>最新原因：{latest.notes || "未填写"}</p><p>最新人工意图：{latest.manualIntent || "未填写"} · 期望结果：{latest.expectedOutcome || "未填写"}</p><p>最新标签：{latest.failureLabels?.join("、") || "未选择"} · 状态：{latest.datasetStatus}</p></div>}
        <fieldset disabled={saving || reloading} className="ticket-eval-editor__fields">
          <label className="ticket-eval-editor__state">数据集状态<select value={draft.datasetStatus} onChange={(event) => setDraft((current) => ({ ...current, datasetStatus: event.target.value }))}><option value="draft">草稿</option><option value="eval">纳入 Eval</option><option value="badcase">标记 Badcase</option></select></label>
          <fieldset className="ticket-eval-editor__labels"><legend>失败标签（Badcase 至少一个）</legend><div>{FAILURE_LABELS.map(([value, label]) => <label className={draft.failureLabels.includes(value) ? "is-selected" : ""} key={value}><input type="checkbox" checked={draft.failureLabels.includes(value)} onChange={() => setDraft((current) => ({ ...current, failureLabels: current.failureLabels.includes(value) ? current.failureLabels.filter((item) => item !== value) : [...current.failureLabels, value] }))} />{label}</label>)}</div></fieldset>
          <div className="ticket-eval-editor__reason"><label>{sample.source === "shadow" ? "失败原因（Badcase 必填）" : "标注备注（选填）"}<textarea rows={3} maxLength={4000} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：讨论的是 UK 环境，分析给出了 EU 的处理路径。" /></label><small aria-hidden="true">{draft.notes.length} / 4000</small></div>
          <details className="ticket-eval-editor__optional" open={Boolean(initialSample.manualIntent || initialSample.expectedOutcome)}><summary>人工标准（选填）</summary><div>
            <label>人工标准意图（选填）<textarea rows={2} maxLength={4000} value={draft.manualIntent} onChange={(event) => setDraft((current) => ({ ...current, manualIntent: event.target.value }))} /></label>
            <label>期望结果（选填）<textarea rows={2} maxLength={4000} value={draft.expectedOutcome} onChange={(event) => setDraft((current) => ({ ...current, expectedOutcome: event.target.value }))} /></label>
          </div></details>
        </fieldset>
        {sample.evalAt && <small className="ticket-eval-editor__review">最近标注：{sample.evalBy || "未命名用户"} · {formatDateTime(sample.evalAt)}</small>}
      </div>
      {error && <p className="ticket-eval-editor__error" role="alert">{error}</p>}
      <footer><button type="button" disabled={saving || reloading} onClick={onClose}>取消</button>{conflict && <button type="button" disabled={reloading} onClick={() => void reload()}>{reloading ? "读取中…" : "重新读取"}</button>}<button className="button-primary" type="button" disabled={saving || reloading || conflict} onClick={() => void save()}>{saving ? "保存中…" : "保存标注"}</button></footer>
    </section>
  </div>;
}
