import { useEffect, useMemo, useState } from "react";
import { getMeegleSprintDetailHash } from "../app/routes/workspace-routes.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut.js";
import { formatDateTime } from "../lib/formatters.js";
import {
  buildMeegleSprintHistory,
  filterMeegleSprintHistory,
  filterMeegleSprintItems,
  getDefaultOpenMeegleSprint,
  groupMeegleSprintHistory,
} from "../lib/meegle-sprint-history.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";

const ACTIVITY_LABELS = {
  past: "Past",
  current: "Current",
  upcoming: "Upcoming",
  unknown: "日期未同步",
};

const SPRINT_LIFECYCLE_FILTERS = ["current", "upcoming", "past", "unknown"];

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

function SprintActivityBadge({ lifecycle }) {
  return <span className={`sprint-activity-badge sprint-activity-badge--${lifecycle}`}>{ACTIVITY_LABELS[lifecycle]}</span>;
}

function buildStepPath(points, field, width, top, bottom, maximum) {
  const y = (value) => bottom - value / maximum * (bottom - top);
  if (points.length <= 1) return `M 0 ${y(points[0]?.[field] || 0)} H ${width}`;
  return points.reduce((path, point, index) => {
    const x = index / (points.length - 1) * width;
    const nextY = y(point[field]);
    return index === 0 ? `M ${x} ${nextY}` : `${path} H ${x} V ${nextY}`;
  }, "");
}

function SprintTimelineChart({ sprint, compact = false }) {
  const timeline = sprint.timeline;
  const points = timeline?.points || [];
  const latest = points.at(-1) || { scope: 0, started: 0, completed: 0 };
  const metrics = timeline?.coverageCount ? latest : sprint.progress;
  const maximum = Math.max(1, ...points.map((point) => point.scope));
  const width = 320;
  const top = 8;
  const bottom = 86;
  const dateLabel = (value) => value ? value.slice(5).replace("-", "/") : "-";
  const lastPointIndex = Math.max(0, points.length - 1);
  const dateTicks = [...new Set([0, Math.floor(lastPointIndex / 3), Math.floor(lastPointIndex * 2 / 3), lastPointIndex])]
    .map((index) => ({ date: points[index]?.date, position: lastPointIndex ? index / lastPointIndex * 100 : 0 }));
  return <section className={`sprint-timeline ${compact ? "sprint-timeline--compact" : ""}`.trim()} aria-label="Sprint 每日工作项统计">
    {!compact ? <header><strong>进度</strong><span>按日期统计工作项数量</span></header> : null}
    <div className="sprint-progress-metrics">
      <div><i className="sprint-progress-key sprint-progress-key--scope" /><span>Scope</span><strong>{metrics.scope}</strong></div>
      <div><i className="sprint-progress-key sprint-progress-key--started" /><span>Started</span><strong>{metrics.started}</strong></div>
      <div><i className="sprint-progress-key sprint-progress-key--completed" /><span>Completed</span><strong>{metrics.completed}</strong></div>
    </div>
    <div className="sprint-timeline__plot" role="img" aria-label={`Scope ${metrics.scope}，Started ${metrics.started}，Completed ${metrics.completed}`}>
      <svg viewBox={`0 0 ${width} 104`} preserveAspectRatio="none" aria-hidden="true">
        <line className="sprint-timeline__grid" x1="0" y1={bottom} x2={width} y2={bottom} />
        <path className="sprint-timeline__line sprint-timeline__line--scope" d={buildStepPath(points, "scope", width, top, bottom, maximum)} />
        <path className="sprint-timeline__line sprint-timeline__line--started" d={buildStepPath(points, "started", width, top, bottom, maximum)} />
        <path className="sprint-timeline__line sprint-timeline__line--completed" d={buildStepPath(points, "completed", width, top, bottom, maximum)} />
      </svg>
      <div className="sprint-timeline__dates">{dateTicks.map((tick) => <span
        key={`${tick.date}-${tick.position}`}
        style={{ left: `${tick.position}%`, transform: tick.position === 0 ? "none" : tick.position === 100 ? "translateX(-100%)" : "translateX(-50%)" }}
      >{dateLabel(tick.date)}</span>)}</div>
    </div>
    {timeline?.coverageCount < sprint.items.length ? <small className="sprint-timeline__coverage">已获得 {timeline?.coverageCount || 0}/{sprint.items.length} 个工作项的生命周期；重新同步后补齐。</small> : null}
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
      <div className="sprint-panel__badges"><SprintActivityBadge lifecycle={sprint.lifecycle} /><span>{sprint.sprintId ? "Sprint 快照" : "元数据未同步"}</span></div>
      <h2>{sprint.name}</h2>
      <p className="sprint-panel__description">{sprint.description || "Sprint 描述尚未同步到 Octo。"}</p>
      <dl className="sprint-panel__dates">
        <div><dt>开始时间</dt><dd>{sprint.startAt ? formatDateTime(sprint.startAt) : "尚未同步"}</dd></div>
        <div><dt>结束时间</dt><dd>{sprint.endAt ? formatDateTime(sprint.endAt) : "尚未同步"}</dd></div>
      </dl>
      <p className="sprint-panel__sync-note">Sprint 最近更新：{formatDateTime(sprint.sourceUpdatedAt || sprint.syncedAt || sprint.latestActivityAt)}</p>
    </section>
    <SprintTimelineChart sprint={sprint} />
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

function SprintHistoryFilterPanel({ selectedLifecycles, lifecycleCounts, onToggle, onReset }) {
  return <div className="list-filter-menu__panel sprint-history-filter-panel">
    <header className="list-filter-menu__header">
      <strong>筛选</strong>
      <button type="button" onClick={onReset}>清空</button>
    </header>
    <div className="sprint-history-filter-panel__values" role="group" aria-label="Sprint 生命周期">
      {SPRINT_LIFECYCLE_FILTERS.map((lifecycle) => <label key={lifecycle}>
        <input type="checkbox" checked={selectedLifecycles.includes(lifecycle)} onChange={() => onToggle(lifecycle)} />
        <span>{ACTIVITY_LABELS[lifecycle]}</span>
        <small>{lifecycleCounts[lifecycle] || 0}</small>
      </label>)}
    </div>
  </div>;
}

function SprintHistoryGroupPanel({ groupBy, onGroupByChange, onReset }) {
  return <div className="list-view-config-panel sprint-history-group-panel">
    <header className="list-view-config-panel__header">
      <strong>视图配置</strong>
      <button type="button" onClick={onReset}>重置</button>
    </header>
    <div className="list-view-config-section">
      <label htmlFor="meegle-sprint-group-by">分组</label>
      <select id="meegle-sprint-group-by" value={groupBy} onChange={(event) => onGroupByChange(event.target.value)}>
        <option value="date">按时间线</option>
        <option value="lifecycle">按生命周期</option>
      </select>
    </div>
  </div>;
}

function SprintHistoryList({ sprints, expandedSprintKey, onToggleSprint, idPrefix }) {
  return <div className="sprint-history-list">{sprints.map((sprint, index) => {
    const expanded = expandedSprintKey === sprint.identity;
    const chartId = `${idPrefix}-chart-${index}`;
    return <article className={`sprint-history-row ${expanded ? "sprint-history-row--expanded" : ""}`.trim()} key={sprint.identity}>
      <div className="sprint-history-row__date"><span>{formatDateTime(sprint.startAt || sprint.latestActivityAt)}</span><i aria-hidden="true" /></div>
      <div className="sprint-history-row__content">
        <button
          className={`sprint-history-row__toggle ${expanded ? "sprint-history-row__toggle--open" : ""}`.trim()}
          type="button"
          aria-label={`${expanded ? "收起" : "展开"} ${sprint.name} 图表`}
          aria-expanded={expanded}
          aria-controls={chartId}
          onClick={() => onToggleSprint(sprint.identity)}
        ><svg viewBox="0 0 8 12" aria-hidden="true"><path d="m1 1 5 5-5 5" /></svg><span className={`sprint-history-row__marker sprint-history-row__marker--${sprint.lifecycle}`} aria-hidden="true" /></button>
        <div className="sprint-history-row__summary"><a href={getMeegleSprintDetailHash(sprint.sprintId || sprint.name)}><strong>{sprint.name}</strong></a><small>{sprint.projectCount} 个项目 · 最近工作项活动</small></div>
        <SprintActivityBadge lifecycle={sprint.lifecycle} />
        <span className="sprint-history-row__metric"><strong>{sprint.progress.completionPercent}%</strong><small>完成</small></span>
        <span className="sprint-history-row__metric"><strong>{sprint.progress.completed}</strong><small>已完成</small></span>
        <span className="sprint-history-row__metric"><strong>{sprint.progress.scope}</strong><small>Scope</small></span>
      </div>
      {expanded ? <div id={chartId}><SprintTimelineChart sprint={sprint} compact /></div> : null}
    </article>;
  })}</div>;
}

export function MeegleSprintHistoryPage({ profile, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const state = useMeegleSprintHistory(apiBaseUrl);
  const [expandedSprintKey, setExpandedSprintKey] = useState();
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [selectedLifecycles, setSelectedLifecycles] = useState([]);
  const [groupBy, setGroupBy] = useState("date");
  const visibleSprints = useMemo(
    () => filterMeegleSprintHistory(state.sprints, selectedLifecycles),
    [selectedLifecycles, state.sprints],
  );
  const sprintGroups = useMemo(() => groupMeegleSprintHistory(visibleSprints, groupBy), [groupBy, visibleSprints]);
  const lifecycleCounts = Object.fromEntries(SPRINT_LIFECYCLE_FILTERS.map((lifecycle) => [
    lifecycle,
    state.sprints.filter((sprint) => sprint.lifecycle === lifecycle).length,
  ]));
  useEffect(() => {
    if (state.status !== "ready") return;
    setExpandedSprintKey((current) => {
      if (current === null) return null;
      if (current && visibleSprints.some((sprint) => sprint.identity === current)) return current;
      return getDefaultOpenMeegleSprint(visibleSprints);
    });
  }, [state.status, visibleSprints]);
  useKeyboardShortcut({
    key: "Escape",
    enabled: filterOpen || groupOpen,
    allowInEditableTarget: true,
    handler: (event) => {
      event.preventDefault();
      setFilterOpen(false);
      setGroupOpen(false);
    },
  });
  function toggleLifecycle(lifecycle) {
    setSelectedLifecycles((current) => current.includes(lifecycle)
      ? current.filter((value) => value !== lifecycle)
      : [...current, lifecycle]);
  }
  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="meegle-sprints" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page sprint-history-page">
      <header className="list-page__header">
        <div><h1>Sprint 历史</h1><p>按起止日期区分 Past、Current 和 Upcoming；默认展开 Current Sprint。</p></div>
        {state.status === "ready" ? <div className="list-toolbar__actions">
          <div className="list-view-menu">
            <button
              className={`list-filter-button ${groupOpen ? "list-filter-button--active" : ""}`.trim()}
              type="button"
              aria-label="配置 Sprint 列表分组"
              aria-expanded={groupOpen}
              title="分组"
              onClick={() => {
                setFilterOpen(false);
                setGroupOpen((open) => !open);
              }}
            ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1a1 1 0 0 1 1 1v1h10a1 1 0 1 1 0 2H4v1a1 1 0 1 1-2 0V5H1a1 1 0 1 1 0-2h1V2a1 1 0 0 1 1-1Zm10 8a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1H1a1 1 0 1 1 0-2h11v-1a1 1 0 0 1 1-1ZM8 5a1 1 0 0 1 1 1v1h6a1 1 0 1 1 0 2H9v1a1 1 0 1 1-2 0V9H1a1 1 0 1 1 0-2h6V6a1 1 0 0 1 1-1Z" /></svg></button>
            {groupOpen ? <SprintHistoryGroupPanel groupBy={groupBy} onGroupByChange={setGroupBy} onReset={() => setGroupBy("date")} /> : null}
          </div>
          <div className="list-filter-menu">
            <button
              className={`list-filter-button ${filterOpen ? "list-filter-button--active" : ""}`.trim()}
              type="button"
              aria-label="筛选 Sprint"
              aria-expanded={filterOpen}
              title="筛选"
              onClick={() => {
                setGroupOpen(false);
                setFilterOpen((open) => !open);
              }}
            ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2H1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm4 4a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" /></svg></button>
            {filterOpen ? <SprintHistoryFilterPanel
              selectedLifecycles={selectedLifecycles}
              lifecycleCounts={lifecycleCounts}
              onToggle={toggleLifecycle}
              onReset={() => setSelectedLifecycles([])}
            /> : null}
          </div>
        </div> : null}
      </header>
      {state.status === "loading" ? <p className="list-message">正在加载 Sprint 历史…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">Sprint 历史暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" && !state.sprints.length ? <p className="list-message">暂无已同步 Sprint。</p> : null}
      {state.status === "ready" && state.sprints.length > 0 && !visibleSprints.length ? <p className="list-message">当前筛选条件下没有 Sprint。</p> : null}
      {state.status === "ready" && visibleSprints.length ? <div className={`sprint-history-groups ${groupBy === "lifecycle" ? "sprint-history-groups--grouped" : ""}`.trim()}>
        {sprintGroups.map((group) => <section className="sprint-history-group" key={group.key}>
          {groupBy === "lifecycle" ? <header className="sprint-history-group__header"><strong>{ACTIVITY_LABELS[group.key]}</strong><span>{group.sprints.length} 个 Sprint</span></header> : null}
          <SprintHistoryList
            sprints={group.sprints}
            expandedSprintKey={expandedSprintKey}
            onToggleSprint={(identity) => setExpandedSprintKey((current) => current === identity ? null : identity)}
            idPrefix={`sprint-history-${group.key}`}
          />
        </section>)}
      </div> : null}
    </section>
  </WorkspaceShell>;
}

export function MeegleSprintDetailPage({ profile, sprintName, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const state = useMeegleSprintHistory(apiBaseUrl);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedLabels, setSelectedLabels] = useState({});
  const sprint = state.sprints.find((item) => item.sprintId === sprintName || item.name === sprintName);
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
