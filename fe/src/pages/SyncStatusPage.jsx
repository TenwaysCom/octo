import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { formatDateTime } from "../lib/formatters.js";
import { getPlatformSyncSources, syncPlatformSource } from "../services/platform-data/platform-sync-api.js";

const RUN_STATUS_LABELS = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "已合并",
};

function SyncSourceCard({ source, latest, running, error, onSync }) {
  const ready = Boolean(latest);
  const configured = source.configured;
  const isRunning = running || source.runStatus === "running";
  const blocked = Boolean(source.blockedReason);
  return <article className="sync-source-card">
    <div className="sync-source-card__heading">
      <div><p className="profile-card__eyebrow">DATA SOURCE</p><h2>{source.label}</h2></div>
      <span className={`status-badge ${configured && ready && !blocked ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{!configured ? "未配置" : blocked ? "需处理" : isRunning ? "同步中" : ready ? "已同步" : "待同步"}
      </span>
    </div>
    <dl className="authorization-details">
      <div><dt>最近同步</dt><dd>{latest ? formatDateTime(latest) : "暂无同步记录"}</dd></div>
      <div><dt>任务状态</dt><dd>{source.runStatus ? RUN_STATUS_LABELS[source.runStatus] ?? source.runStatus : "暂无运行记录"}</dd></div>
      <div><dt>最近任务</dt><dd>{source.lastRunAt ? formatDateTime(source.lastRunAt) : "暂无运行记录"}</dd></div>
      <div><dt>自动同步</dt><dd>{blocked ? "已阻塞" : source.scheduled ? "已启用" : "未启用"}</dd></div>
      {source.nextRunAt && !blocked ? <div><dt>下次执行</dt><dd>{formatDateTime(source.nextRunAt)}</dd></div> : null}
      {source.blockedReason || source.lastErrorCode
        ? <div><dt>失败原因</dt><dd>{source.blockedReason || source.lastErrorCode}</dd></div>
        : null}
    </dl>
    {error ? <p className="profile-card__error">{error}</p> : null}
    <button className="secondary-button" type="button" disabled={!configured || isRunning} onClick={onSync}>
      {isRunning ? "同步中…" : "立即同步"}
    </button>
  </article>;
}

function ShadowSummaryCard({ summary }) {
  return <article className="sync-source-card" data-test="shadow-summary-card">
    <div className="sync-source-card__heading">
      <div><p className="profile-card__eyebrow">AI ANALYSIS</p><h2>Lark Ticket AI 分析</h2></div>
      <span className={`status-badge ${summary.enabled ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{summary.enabled ? "影子·运行中" : "影子·未启用"}
      </span>
    </div>
    <dl className="authorization-details">
      <div><dt>已分析</dt><dd>{summary.ok}</dd></div>
      <div><dt>已跳过</dt><dd>{summary.skipped}</dd></div>
      <div><dt>分析失败</dt><dd>{summary.error}</dd></div>
      <div><dt>待分析</dt><dd>{summary.pending}</dd></div>
      <div><dt>最近分析</dt><dd>{summary.lastAnalyzedAt ? formatDateTime(summary.lastAnalyzedAt) : "暂无分析记录"}</dd></div>
      <div><dt>自动分析</dt><dd>{summary.enabled ? "已启用" : "未启用"}</dd></div>
    </dl>
  </article>;
}

export function TicketBackgroundTaskCard({ task }) {
  const expiredRun = task.runStatus === "running" && !task.running;
  const statusLabel = !task.implemented ? "尚未实现"
    : task.statusUnavailable ? "状态暂不可用"
      : !task.configured ? "未配置"
        : task.running ? "执行中"
          : !task.enabled ? "未启用"
            : expiredRun ? "状态未知"
              : task.runStatus === "failed" ? "最近失败" : "已启用";
  const runLabel = expiredRun
    ? "状态未知（无有效运行租约）"
    : RUN_STATUS_LABELS[task.runStatus] ?? "暂无运行记录";
  return <article className="sync-source-card" data-test={task.id}>
    <div className="sync-source-card__heading">
      <div><p className="profile-card__eyebrow">TICKET AUTOMATION</p><h2>{task.label}</h2></div>
      <span className={`status-badge ${task.implemented && task.configured && task.enabled && !task.statusUnavailable && !expiredRun && task.runStatus !== "failed" ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{statusLabel}
      </span>
    </div>
    {!task.implemented ? <p>任务尚未实现，当前不会自动添加 Done 表情。</p> : <>
      <dl className="authorization-details">
        <div><dt>自动执行</dt><dd>{task.enabled ? "已启用（配置）" : "未启用"}</dd></div>
        <div><dt>扫描间隔</dt><dd>每 {task.intervalMinutes} 分钟</dd></div>
        {task.batchLimit !== undefined ? <div><dt>每轮处理上限</dt><dd>每个来源 {task.batchLimit} 条</dd></div> : null}
        {task.sourceCount !== undefined ? <div><dt>来源群数量</dt><dd>{task.sourceCount}</dd></div> : null}
        {task.targetStatus !== undefined ? <div><dt>目标状态</dt><dd>{task.targetStatus}</dd></div> : null}
        {task.overlapMinutes !== undefined ? <div><dt>重叠窗口</dt><dd>{task.overlapMinutes} 分钟</dd></div> : null}
        {task.targetCount !== undefined ? <div><dt>目标表数量</dt><dd>{task.targetCount}</dd></div> : null}
        <div><dt>最近任务结果</dt><dd>{task.statusUnavailable ? "暂不可用" : runLabel}</dd></div>
        <div><dt>最近执行</dt><dd>{task.statusUnavailable ? "暂不可用" : task.lastRunAt ? formatDateTime(task.lastRunAt) : "暂无运行记录"}</dd></div>
        <div><dt>执行结束</dt><dd>{task.statusUnavailable ? "暂不可用" : task.lastCompletedAt ? formatDateTime(task.lastCompletedAt) : "暂无完成记录"}</dd></div>
        {task.lastErrorCode ? <div><dt>失败原因</dt><dd>{task.lastErrorCode}</dd></div> : null}
      </dl>
      {task.statusUnavailable ? <p role="status">任务运行记录暂时无法读取，请刷新重试。</p> : null}
    </>}
  </article>;
}

export function SyncStatusPage({ profile, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const [state, setState] = useState({ status: "loading", sources: [], shadowSummary: undefined, backgroundTasks: [] });
  const [runningId, setRunningId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorBySource, setErrorBySource] = useState({});

  const load = useCallback(async () => {
    const { sources, shadowSummary, backgroundTasks } = await getPlatformSyncSources({ apiBaseUrl });
    setState({ status: "ready", sources, shadowSummary, backgroundTasks });
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;
    void load().catch(() => {
      if (active) setState({ status: "error", sources: [] });
    });
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await load();
    } catch {
      setState({ status: "error", sources: [] });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function sync(sourceId) {
    setRunningId(sourceId);
    setErrorBySource((current) => ({ ...current, [sourceId]: "" }));
    try {
      await syncPlatformSource({ apiBaseUrl, sourceId, actionRunId: crypto.randomUUID() });
      await load();
    } catch {
      setErrorBySource((current) => ({ ...current, [sourceId]: "同步失败，请检查授权和服务端配置后重试。" }));
    } finally {
      setRunningId("");
    }
  }

  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="sync" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main sync-page" data-test="sync-status-page">
      <header className="shortcuts-page__header">
        <p className="eyebrow">INTEGRATIONS</p>
        <h1>数据同步</h1>
        <p>查看数据源同步及 Ticket 自动任务状态，并按需发起单个数据源同步。</p>
        <button className="secondary-button" type="button" disabled={isRefreshing} onClick={() => void refresh()}>{isRefreshing ? "刷新中…" : "刷新状态"}</button>
      </header>
      {state.status === "loading" ? <p className="list-message">正在读取同步状态…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">同步状态暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" ? <section className="sync-source-grid" aria-label="数据源同步状态">
        {state.sources.map((source) => <SyncSourceCard
          key={source.id}
          source={source}
          latest={source.lastSyncedAt}
          running={runningId === source.id}
          error={errorBySource[source.id]}
          onSync={() => void sync(source.id)}
        />)}
        {state.shadowSummary ? <ShadowSummaryCard summary={state.shadowSummary} /> : null}
        {state.backgroundTasks.map((task) => <TicketBackgroundTaskCard key={task.id} task={task} />)}
      </section> : null}
    </section>
  </WorkspaceShell>;
}
