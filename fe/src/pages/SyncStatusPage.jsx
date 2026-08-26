import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { formatDateTime } from "../lib/formatters.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";
import { getPlatformSyncSources, syncPlatformSource } from "../services/platform-data/platform-sync-api.js";

const SOURCE_MATCHERS = {
  "lark-tickets": (items) => items,
  "meegle-user-stories": (items) => items.filter((item) => item.workItemTypeKey === "story"),
  "meegle-tech-tasks": (items) => items.filter((item) => item.workItemTypeKey === "66700acbf297a8f821b4b860"),
  "meegle-production-bugs": (items) => items.filter((item) => item.workItemTypeKey === "6932e40429d1cd8aac635c82"),
  "github-odoo-eu": (items) => items.filter((item) => item.owner === "TenwaysCom" && item.repo === "Tenways"),
  "github-odoo-uk": (items) => items.filter((item) => item.owner === "TenwaysCom" && item.repo === "tenways-ukk"),
  "github-odoo-us": (items) => items.filter((item) => item.owner === "TWS-lance" && item.repo === "odoo_tenways"),
};

const RUN_STATUS_LABELS = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "已合并",
};

function latestSync(items) {
  return items.reduce((latest, item) => {
    if (!latest || new Date(item.syncedAt).getTime() > new Date(latest).getTime()) return item.syncedAt;
    return latest;
  }, undefined);
}

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

export function SyncStatusPage({ profile, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const [state, setState] = useState({ status: "loading", sources: [], latestBySource: {} });
  const [runningId, setRunningId] = useState("");
  const [errorBySource, setErrorBySource] = useState({});

  const load = useCallback(async () => {
    const [sources, lark, meegle, github] = await Promise.all([
      getPlatformSyncSources({ apiBaseUrl }),
      getPlatformDataList({ apiBaseUrl, kind: "lark-tickets" }),
      getPlatformDataList({ apiBaseUrl, kind: "meegle-workitems" }),
      getPlatformDataList({ apiBaseUrl, kind: "github-pull-requests" }),
    ]);
    const platformItems = {
      "lark-tickets": lark.items,
      "meegle-user-stories": meegle.items,
      "meegle-tech-tasks": meegle.items,
      "meegle-production-bugs": meegle.items,
      "github-odoo-eu": github.items,
      "github-odoo-uk": github.items,
      "github-odoo-us": github.items,
    };
    setState({
      status: "ready",
      sources,
      latestBySource: Object.fromEntries(sources.map((source) => [source.id, latestSync(SOURCE_MATCHERS[source.id]?.(platformItems[source.id] ?? []) ?? [])])),
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;
    void load().catch(() => {
      if (active) setState({ status: "error", sources: [], latestBySource: {} });
    });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    let active = true;
    const timer = window.setInterval(() => {
      void getPlatformSyncSources({ apiBaseUrl }).then((sources) => {
        if (!active) return;
        setState((current) => current.status === "ready" ? { ...current, sources } : current);
      }).catch(() => undefined);
    }, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBaseUrl]);

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
      </header>
      {state.status === "loading" ? <p className="list-message">正在读取同步状态…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">同步状态暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" ? <section className="sync-source-grid" aria-label="数据源同步状态">
        {state.sources.map((source) => <SyncSourceCard
          key={source.id}
          source={source}
          latest={state.latestBySource[source.id]}
          running={runningId === source.id}
          error={errorBySource[source.id]}
          onSync={() => void sync(source.id)}
        />)}
      </section> : null}
    </section>
  </WorkspaceShell>;
}
