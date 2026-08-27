import { useEffect, useState } from "react";
import { getMeegleSprintDetailHash } from "../app/routes/workspace-routes.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { formatDateTime } from "../lib/formatters.js";
import { buildMeegleSprintHistory, filterMeegleSprintItems } from "../lib/meegle-sprint-history.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";

const ACTIVITY_LABELS = {
  active: "进行中",
  completed: "已完成",
  planned: "待开始",
};

const LABEL_FIELDS = [
  { key: "sprint", label: "Sprint" },
  { key: "project", label: "项目" },
  { key: "priority", label: "优先级" },
];

function getMeegleWorkitemCategory(item) {
  if (item.workItemTypeKey === "story") return "story";
  const type = `${item.workItemType || ""} ${item.workItemTypeKey || ""}`.toLocaleLowerCase();
  if (type.includes("tech task")) return "tech-task";
  if (type.includes("bug")) return "bug";
  return "other";
}

function getMeegleWorkitemUrl(item) {
  const slugByCategory = { story: "story", "tech-task": "techtask", bug: "production_bug" };
  const slug = slugByCategory[getMeegleWorkitemCategory(item)] || item.workItemTypeKey;
  return `https://project.larksuite.com/${encodeURIComponent(item.projectKey)}/${encodeURIComponent(slug)}/detail/${encodeURIComponent(item.workItemId)}`;
}

function useMeegleSprintHistory(apiBaseUrl) {
  const [state, setState] = useState({ status: "loading", sprints: [] });
  useEffect(() => {
    let active = true;
    void getPlatformDataList({ apiBaseUrl, kind: "meegle-workitems" }).then(
      ({ items, sprintDetails }) => { if (active) setState({ status: "ready", sprints: buildMeegleSprintHistory(items, sprintDetails) }); },
      () => { if (active) setState({ status: "error", sprints: [] }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl]);
  return state;
}

function SprintActivityBadge({ activity, status }) {
  return <span className={`sprint-activity-badge sprint-activity-badge--${activity}`}>{status || ACTIVITY_LABELS[activity]}</span>;
}

function SprintProgressChart({ progress }) {
  const percent = (count) => progress.scope ? count / progress.scope * 100 : 0;
  return <section className="sprint-panel__progress" aria-label="Sprint 工作项统计">
    <header><strong>进度</strong><span>按工作项数量统计</span></header>
    <div className="sprint-progress-metrics">
      <div><i className="sprint-progress-key sprint-progress-key--scope" /><span>Scope</span><strong>{progress.scope}</strong></div>
      <div><i className="sprint-progress-key sprint-progress-key--started" /><span>Started</span><strong>{progress.started}</strong><small>{percent(progress.started).toFixed(0)}%</small></div>
      <div><i className="sprint-progress-key sprint-progress-key--completed" /><span>Completed</span><strong>{progress.completed}</strong><small>{progress.completionPercent}%</small></div>
    </div>
    <div className="sprint-progress-chart" role="img" aria-label={`${progress.completed} 个已完成，${progress.started} 个进行中，${progress.notStarted} 个待开始`}>
      <span className="sprint-progress-chart__completed" style={{ width: `${percent(progress.completed)}%` }} />
      <span className="sprint-progress-chart__started" style={{ width: `${percent(progress.started)}%` }} />
      <span className="sprint-progress-chart__planned" style={{ width: `${percent(progress.notStarted)}%` }} />
    </div>
  </section>;
}

function SprintLabelFilters({ sprint, activeFieldKey, selectedLabels, onActiveFieldChange, onToggle, onReset }) {
  const activeField = LABEL_FIELDS.find(({ key }) => key === activeFieldKey) || LABEL_FIELDS[0];
  const values = sprint.labels[activeField.key] || [];
  return <section className="sprint-panel__labels" aria-label="Sprint 标签筛选">
    <header><strong>标签筛选</strong><button type="button" onClick={onReset}>清空</button></header>
    <div className="list-tag-sidebar__tabs" role="tablist" aria-label="标签字段">
      {LABEL_FIELDS.map((field) => <button
        type="button"
        role="tab"
        aria-selected={field.key === activeField.key}
        className={field.key === activeField.key ? "list-tag-sidebar__tab--active" : ""}
        key={field.key}
        onClick={() => onActiveFieldChange(field.key)}
      >{field.label}</button>)}
    </div>
    <div className="list-tag-sidebar__values" role="group" aria-label={activeField.label}>
      {values.map((tag) => <button
        type="button"
        aria-pressed={selectedLabels[activeField.key]?.includes(tag.value) || false}
        className={selectedLabels[activeField.key]?.includes(tag.value) ? "list-tag-sidebar__value--active" : ""}
        key={tag.value}
        onClick={() => onToggle(activeField.key, tag.value)}
      ><span><i aria-hidden="true" />{tag.label}</span><small>{tag.count}</small></button>)}
      {!values.length ? <p>暂无可筛选的标签</p> : null}
    </div>
  </section>;
}

function SprintPanel({ sprint, selectedLabels, onSelectedLabelsChange }) {
  const [activeFieldKey, setActiveFieldKey] = useState("project");
  function toggleLabel(fieldKey, value) {
    onSelectedLabelsChange((current) => {
      const values = current[fieldKey] || [];
      return { ...current, [fieldKey]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
    });
  }
  return <aside className="sprint-detail-panel" aria-label="Sprint 详情">
    <section className="sprint-panel__overview">
      <div className="sprint-panel__badges"><SprintActivityBadge activity={sprint.activity} status={sprint.status} /><span>{sprint.sprintId ? "Sprint 快照" : "元数据未同步"}</span></div>
      <h2>{sprint.name}</h2>
      <p className="sprint-panel__description">{sprint.description || "Sprint 描述尚未同步到 Octo。"}</p>
      <dl className="sprint-panel__dates">
        <div><dt>开始时间</dt><dd>{sprint.startAt ? formatDateTime(sprint.startAt) : "尚未同步"}</dd></div>
        <div><dt>结束时间</dt><dd>{sprint.endAt ? formatDateTime(sprint.endAt) : "尚未同步"}</dd></div>
      </dl>
      <p className="sprint-panel__sync-note">Sprint 最近更新：{formatDateTime(sprint.sourceUpdatedAt || sprint.syncedAt || sprint.latestActivityAt)}</p>
    </section>
    <SprintProgressChart progress={sprint.progress} />
    <SprintLabelFilters
      sprint={sprint}
      activeFieldKey={activeFieldKey}
      selectedLabels={selectedLabels}
      onActiveFieldChange={setActiveFieldKey}
      onToggle={toggleLabel}
      onReset={() => onSelectedLabelsChange({})}
    />
  </aside>;
}

function SprintWorkitemList({ items }) {
  return <div className="data-table-wrap"><table className="data-table data-table--sprint-workitems">
    <thead><tr><th>工作项</th><th>类型</th><th>状态</th><th>项目</th><th>优先级</th><th>负责人</th><th>更新时间</th></tr></thead>
    <tbody>{items.map((item) => <tr key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`}>
      <td><a className="table-link" href={getMeegleWorkitemUrl(item)} target="_blank" rel="noreferrer">{item.workItemKey || item.workItemId}</a><small>{item.title}</small></td>
      <td><span className={`workitem-type-badge workitem-type-badge--${getMeegleWorkitemCategory(item)}`}>{item.workItemType || item.workItemTypeKey || "-"}</span></td>
      <td>{item.status || "未设置"}<small>{item.subStage || ""}</small></td>
      <td>{item.projectName || item.projectKey || "未设置"}</td>
      <td>{item.priority || "未设置"}</td>
      <td>{item.assignee || "未设置"}</td>
      <td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function MeegleSprintHistoryPage({ profile, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const state = useMeegleSprintHistory(apiBaseUrl);
  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="meegle-sprints" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page sprint-history-page">
      <header className="list-page__header"><div><h1>Sprint 历史</h1><p>基于已同步 Meegle 快照汇总；按开始时间和最近活动排序。</p></div></header>
      {state.status === "loading" ? <p className="list-message">正在加载 Sprint 历史…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">Sprint 历史暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" && !state.sprints.length ? <p className="list-message">暂无已同步 Sprint。</p> : null}
      {state.status === "ready" && state.sprints.length ? <div className="sprint-history-list">{state.sprints.map((sprint) => <article className="sprint-history-row" key={sprint.name}>
        <div className="sprint-history-row__date"><span>{formatDateTime(sprint.startAt || sprint.latestActivityAt)}</span><i aria-hidden="true" /></div>
        <a className="sprint-history-row__content" href={getMeegleSprintDetailHash(sprint.name)}>
          <span className={`sprint-history-row__marker sprint-history-row__marker--${sprint.activity}`} aria-hidden="true" />
          <div className="sprint-history-row__summary"><strong>{sprint.name}</strong><small>{sprint.projectCount} 个项目 · 最近工作项活动</small></div>
          <SprintActivityBadge activity={sprint.activity} status={sprint.status} />
          <span className="sprint-history-row__metric"><strong>{sprint.progress.completionPercent}%</strong><small>完成</small></span>
          <span className="sprint-history-row__metric"><strong>{sprint.progress.completed}</strong><small>已完成</small></span>
          <span className="sprint-history-row__metric"><strong>{sprint.progress.scope}</strong><small>Scope</small></span>
        </a>
      </article>)}</div> : null}
    </section>
  </WorkspaceShell>;
}

export function MeegleSprintDetailPage({ profile, sprintName, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const state = useMeegleSprintHistory(apiBaseUrl);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedLabels, setSelectedLabels] = useState({});
  const sprint = state.sprints.find((item) => item.name === sprintName);
  const visibleItems = sprint ? filterMeegleSprintItems(sprint.items, selectedLabels) : [];
  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="meegle-sprints" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page sprint-detail-page">
      {state.status === "loading" ? <p className="list-message">正在加载 Sprint 详情…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">Sprint 详情暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" && !sprint ? <p className="list-message">没有找到该 Sprint 的已同步工作项。<br /><a className="table-link" href="#meegle-sprints">返回 Sprint 历史</a></p> : null}
      {state.status === "ready" && sprint ? <>
        <div className="sprint-detail-toolbar">
          <div><strong>{sprint.items.length} 个工作项</strong>{visibleItems.length !== sprint.items.length ? <span> · 当前显示 {visibleItems.length}</span> : null}</div>
          <button
            className={`list-filter-button ${panelOpen ? "list-filter-button--active" : ""}`.trim()}
            type="button"
            aria-label="显示 Sprint 详情"
            aria-expanded={panelOpen}
            title="显示 Sprint 详情"
            onClick={() => setPanelOpen((open) => !open)}
          ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2V2Zm2 2v8h6V4H4Zm8 0v8h1V4h-1Z" /></svg></button>
        </div>
        <div className={`sprint-detail-layout ${panelOpen ? "sprint-detail-layout--with-panel" : ""}`.trim()}>
          <div className="sprint-detail-layout__main">
            {visibleItems.length ? <SprintWorkitemList items={visibleItems} /> : <p className="list-message">当前标签条件下没有工作项。</p>}
          </div>
          {panelOpen ? <SprintPanel sprint={sprint} selectedLabels={selectedLabels} onSelectedLabelsChange={setSelectedLabels} /> : null}
        </div>
      </> : null}
    </section>
  </WorkspaceShell>;
}
