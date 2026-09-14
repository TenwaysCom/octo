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

export function SyncStatusPage({ profile, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const [state, setState] = useState({ status: "loading", sources: [], shadowSummary: undefined });
  const [runningId, setRunningId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorBySource, setErrorBySource] = useState({});

  const load = useCallback(async () => {
    const { sources, shadowSummary } = await getPlatformSyncSources({ apiBaseUrl });
    setState({ status: "ready", sources, shadowSummary });
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
        <p>查看数据源的快照状态，并按需发起单个数据源同步。</p>
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
      </section> : null}
    </section>
  </WorkspaceShell>;
}
