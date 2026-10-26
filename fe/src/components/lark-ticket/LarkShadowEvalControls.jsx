import { useEffect, useRef, useState } from "react";
import { createShadowEvalSample, listLarkTicketEvalSamples, loadShadowEvalSample } from "../../services/lark-ticket-eval/lark-ticket-eval-api.js";
import { createEvalSaveAttempt } from "../../lib/lark-ticket-eval-save.js";
import { getEvalStatusLabel } from "../../lib/lark-ticket-eval-display.js";
import { getLarkTicketEvalSaveErrorMessage } from "../../lib/lark-ticket-eval-validation.js";
import { formatDateTime } from "../../lib/formatters.js";
import { LarkTicketEvalEditor } from "./LarkTicketEvalEditor.jsx";

function candidate(context, datasetStatus = "badcase") {
  return { ticket: context.ticket, source: "shadow", outputVersion: context.outputVersion,
    snapshotVersion: context.shadowAi?.snapshotVersion, aiOutput: { shadowAi: context.shadowAi }, datasetStatus, failureLabels: [] };
}

export function LarkShadowEvalControls({ ticket, apiBaseUrl, onShadowLoaded }) {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(false), busy = useRef(false), sequence = useRef(0);
  const attempt = useRef(createEvalSaveAttempt());

  async function refresh() {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const updated = await loadShadowEvalSample({ apiBaseUrl, ticket });
      if (active.current && request === sequence.current) {
        setContext(updated); onShadowLoaded(updated.shadowAi); setError("");
      }
      return updated;
    } catch (cause) { if (active.current && request === sequence.current) setError(getLarkTicketEvalSaveErrorMessage(cause)); throw cause; }
    finally { if (active.current && request === sequence.current) setLoading(false); }
  }

  useEffect(() => {
    active.current = true;
    void refresh().catch(() => {});
    return () => { active.current = false; ++sequence.current; };
  }, [apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId]);

  function saved(sample) {
    setContext((current) => ({ ...current, sample })); setError(""); setNotice("标注已保存。");
  }

  async function add() {
    if (busy.current || !context || context.sample) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const sample = await createShadowEvalSample({ apiBaseUrl, ticket,
        update: attempt.current({ datasetStatus: "eval", failureLabels: [], outputVersion: context.outputVersion }) });
      if (active.current) saved(sample);
    } catch (cause) { if (active.current) setError(getLarkTicketEvalSaveErrorMessage(cause)); }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }

  async function reloadEditor(sample) {
    if (sample.id) {
      const samples = await listLarkTicketEvalSamples({ apiBaseUrl, ticket });
      return samples.find((item) => item.id === sample.id);
    }
    const updated = await refresh();
    if (updated.shadowAi?.status !== "ok" || !updated.shadowAi.snapshotVersion) throw new Error("暂无可评价的成功 Shadow 分析。");
    return updated.sample || candidate(updated, sample.datasetStatus);
  }

  const sample = context?.sample;
  const canEvaluate = context?.shadowAi?.status === "ok" && context.shadowAi.snapshotVersion > 0;
  return <div className="lark-app__eval" aria-label="Shadow 分析评测">
    <div className="lark-app__eval-heading">
      <div><strong>分析评测</strong><span className={`ticket-eval-status ticket-eval-status--${sample?.datasetStatus || "unmarked"}`}>{loading ? "正在读取…" : getEvalStatusLabel(sample)}</span></div>
      <button className="lark-app__eval-refresh" type="button" aria-label="重新读取" title="重新读取标注" disabled={loading || saving} onClick={() => void refresh().catch(() => {})}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8a6 6 0 1 0 0 4M16 3v5h-5" /></svg></button>
    </div>
    {sample?.evalAt && <small className="lark-app__muted">最近标注：{sample.evalBy || "未命名用户"} · {formatDateTime(sample.evalAt)}</small>}
    <div className="lark-app__eval-actions">
      {sample ? <button className="lark-app__primary" type="button" disabled={loading || saving} onClick={() => setEditor(sample)}>编辑标注</button>
        : <button className="lark-app__primary" type="button" disabled={loading || saving || !canEvaluate} onClick={() => void add()}>{saving ? "保存中…" : "纳入 Eval"}</button>}
      {sample?.datasetStatus !== "badcase" && <button type="button" disabled={loading || saving || !canEvaluate} onClick={() => setEditor(sample ? { ...sample, datasetStatus: "badcase" } : candidate(context))}>标记 Badcase</button>}
    </div>
    {!loading && !canEvaluate && <p className="lark-app__muted">暂无可评价的成功 Shadow 分析。</p>}
    {error && <p role="alert" className="ticket-eval-editor__error">{error}</p>}
    {notice && <p className="lark-app__eval-notice" role="status">{notice}</p>}
    {editor && <LarkTicketEvalEditor sample={editor} apiBaseUrl={apiBaseUrl} onSaved={saved} onClose={() => setEditor(null)} onReload={reloadEditor} />}
  </div>;
}
