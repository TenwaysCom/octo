import { useEffect, useState } from "react";
import { getMeegleSprintDetailHash } from "../app/routes/workspace-routes.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut.js";
import { formatDateTime } from "../lib/formatters.js";
import {
  DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS,
  groupSprintWorkitems,
  normalizeSprintWorkitemGroupBy,
  normalizeSprintWorkitemSort,
  normalizeSprintWorkitemSubGroupBy,
  normalizeSprintWorkitemVisibleColumns,
  sortSprintWorkitems,
  SPRINT_WORKITEM_GROUP_OPTIONS,
  SPRINT_WORKITEM_VIEW_COLUMNS,
} from "../lib/meegle-sprint-workitem-view.js";
import {
  buildMeegleSprintHistory,
  filterMeegleSprintItems,
  getDefaultOpenMeegleSprint,
} from "../lib/meegle-sprint-history.js";
import { countFilterValues, toggleFilterValue } from "../lib/platform-list-filters.js";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";

const ACTIVITY_LABELS = {
  past: "Past",
  current: "Current",
  upcoming: "Upcoming",
  unknown: "日期未同步",
};

const SPRINT_WORKITEM_FILTER_FIELDS = [
  { key: "workitemType", label: "类型", getValues: (item) => [item.workItemType || item.workItemTypeKey || "未设置"] },
  { key: "status", label: "状态", getValues: (item) => [item.status || "未设置"] },
  { key: "project", label: "项目", getValues: (item) => [item.projectName || item.projectKey || "未设置"] },
  { key: "priority", label: "优先级", getValues: (item) => [item.priority || "未设置"] },
  { key: "assignee", label: "负责人", getValues: (item) => [item.assignee || "未设置"] },
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

function SprintPanel({ sprint }) {
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
  </aside>;
}

function SprintRelatedPullRequests({ pullRequests }) {
  if (!pullRequests?.length) return "-";
  return <div className="github-pr-links">{pullRequests.map((pullRequest) => {
    const status = pullRequest.state || "closed";
    const label = `#${pullRequest.pullNumber}-${pullRequest.baseRef || "-"}`;
    return <div className="github-pr-links__item" key={`${pullRequest.owner}-${pullRequest.repo}-${pullRequest.pullNumber}`}>
      <a className={`table-link github-pr-link-badge github-pr-link-badge--${status}`} href={pullRequest.htmlUrl} target="_blank" rel="noreferrer" title={`${pullRequest.owner}/${pullRequest.repo} #${pullRequest.pullNumber}\n${pullRequest.title}\n${status}`}>{label}</a>
      <span className={`github-pr-status github-pr-status--${status}`}>{status}</span>
    </div>;
  })}</div>;
}

function SprintWorkitemCell({ columnKey, item }) {
  if (columnKey === "workitem") return <><a className="table-link" href={getMeegleWorkitemUrl(item)} target="_blank" rel="noreferrer">{item.workItemKey || item.workItemId}</a><small>{item.title}</small></>;
  if (columnKey === "workitemType") return <span className={`workitem-type-badge workitem-type-badge--${getMeegleWorkitemCategory(item)}`}>{item.workItemType || item.workItemTypeKey || "-"}</span>;
  if (columnKey === "status") return <>{item.status || "未设置"}<small>{item.subStage || ""}</small></>;
  if (columnKey === "project") return item.projectName || item.projectKey || "未设置";
  if (columnKey === "version") return item.version || "未设置";
  if (columnKey === "pullRequests") return <SprintRelatedPullRequests pullRequests={item.githubPullRequests} />;
  if (columnKey === "priority") return item.priority || "未设置";
  if (columnKey === "assignee") return item.assignee || "未设置";
  return formatDateTime(item.sourceUpdatedAt || item.syncedAt);
}

function SprintWorkitemList({ items, sort, visibleColumns, onSort }) {
  const columns = SPRINT_WORKITEM_VIEW_COLUMNS.filter(({ key }) => visibleColumns.includes(key));
  return <div className="data-table-wrap"><table className="data-table data-table--sprint-workitems" style={{ minWidth: Math.max(720, columns.length * 145) }}>
    <thead><tr>{columns.map((column) => <th key={column.key}>{column.sortKey
      ? <button className="sortable-column-header" type="button" onClick={() => onSort(column.sortKey)}>{column.label}<span className="sortable-column-header__arrows" aria-hidden="true">{sort.key === column.sortKey ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button>
      : column.label}</th>)}</tr></thead>
    <tbody>{items.map((item) => <tr key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`}>{columns.map((column) => <td key={column.key}><SprintWorkitemCell columnKey={column.key} item={item} /></td>)}</tr>)}</tbody>
  </table></div>;
}

function SprintWorkitemGroupedList({ groups, collapsedGroups, collapsedSubgroups, onToggleGroup, onToggleSubgroup, sort, visibleColumns, onSort }) {
  return <div className="grouped-list">{groups.map((group) => {
    const collapsed = collapsedGroups.includes(group.key);
    return <section className="grouped-list__section" key={group.key}>
      <button className="grouped-list__header" type="button" aria-expanded={!collapsed} onClick={() => onToggleGroup(group.key)}>
        <svg className={collapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg><strong>{group.label}</strong><span>{group.items.length} 条</span>
      </button>
      {!collapsed ? group.subgroups?.length ? <div className="grouped-list__subgroups">{group.subgroups.map((subgroup) => {
        const subgroupCollapsed = collapsedSubgroups.includes(subgroup.key);
        return <section className="grouped-list__subgroup" key={subgroup.key}>
          <button className="grouped-list__subgroup-header" type="button" aria-expanded={!subgroupCollapsed} onClick={() => onToggleSubgroup(subgroup.key)}>
            <svg className={subgroupCollapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg><strong>{subgroup.label}</strong><span>{subgroup.items.length} 条</span>
          </button>
          {!subgroupCollapsed ? <SprintWorkitemList items={subgroup.items} sort={sort} visibleColumns={visibleColumns} onSort={onSort} /> : null}
        </section>;
      })}</div> : <SprintWorkitemList items={group.items} sort={sort} visibleColumns={visibleColumns} onSort={onSort} /> : null}
    </section>;
  })}</div>;
}

function SprintWorkitemFilterPanel({ fields, activeFieldKey, onActiveFieldChange, onToggle, onReset }) {
  const activeField = fields.find(({ key }) => key === activeFieldKey) || fields[0];
  return <div className="list-filter-menu__panel sprint-workitem-filter-panel">
    <header className="list-filter-menu__header">
      <strong>筛选</strong>
      <button type="button" onClick={onReset}>清空</button>
    </header>
    <div className="list-filter-menu__columns">
      <nav className="list-filter-fields" aria-label="工作项筛选字段">
        <div className="list-filter-menu__field-list">
          {fields.map((field) => <button className={field.key === activeField?.key ? "list-filter-field--active" : ""} type="button" key={field.key} onClick={() => onActiveFieldChange(field.key)}><span>{field.label}</span>{field.selectedValues.length ? <small>{field.selectedValues.length}</small> : null}<span aria-hidden="true">›</span></button>)}
        </div>
      </nav>
      {activeField ? <section className="list-filter-values" aria-label={`${activeField.label} 的可选值`}><div className="list-filter-menu__value-list">{activeField.values.map(({ value, label }) => <label key={value}><input type="checkbox" checked={activeField.selectedValues.includes(value)} onChange={() => onToggle(activeField.key, value)} /><span>{label}</span></label>)}{!activeField.values.length ? <p>暂无可筛选的值</p> : null}</div></section> : null}
    </div>
  </div>;
}

function SprintWorkitemViewConfigPanel({ groupBy, subGroupBy, sort, visibleColumns, onGroupByChange, onSubGroupByChange, onSortChange, onToggleColumn, onReset }) {
  return <div className="list-view-config-panel sprint-workitem-view-config-panel">
    <header className="list-view-config-panel__header">
      <strong>视图配置</strong>
      <button type="button" onClick={onReset}>重置</button>
    </header>
    <div className="list-view-config-section">
      <label htmlFor="meegle-sprint-workitem-group-by">Group by</label>
      <select id="meegle-sprint-workitem-group-by" value={groupBy} onChange={(event) => onGroupByChange(event.target.value)}>
        {SPRINT_WORKITEM_GROUP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="list-view-config-section">
      <label htmlFor="meegle-sprint-workitem-sub-group-by">Sub group by</label>
      <select id="meegle-sprint-workitem-sub-group-by" value={subGroupBy} disabled={groupBy === "none"} onChange={(event) => onSubGroupByChange(event.target.value)}>
        {SPRINT_WORKITEM_GROUP_OPTIONS.filter(([value]) => value === "none" || value !== groupBy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="list-view-config-section list-view-config-section--ordering">
      <label htmlFor="meegle-sprint-workitem-order-by">排序</label>
      <select id="meegle-sprint-workitem-order-by" value={sort.key} onChange={(event) => onSortChange({ ...sort, key: event.target.value })}>
        {SPRINT_WORKITEM_VIEW_COLUMNS.map(({ label, sortKey }) => <option key={sortKey} value={sortKey}>{label}</option>)}
      </select>
      <div className="list-view-direction" role="group" aria-label="排序方向"><button className={sort.direction === "asc" ? "list-view-direction--active" : ""} type="button" aria-label="升序" title="升序" onClick={() => onSortChange({ ...sort, direction: "asc" })}>↑</button><button className={sort.direction === "desc" ? "list-view-direction--active" : ""} type="button" aria-label="降序" title="降序" onClick={() => onSortChange({ ...sort, direction: "desc" })}>↓</button></div>
    </div>
    <fieldset className="list-view-fields"><legend>显示字段</legend><div>{SPRINT_WORKITEM_VIEW_COLUMNS.map((column) => <label className={visibleColumns.includes(column.key) ? "list-view-field--active" : ""} key={column.key}><input type="checkbox" checked={visibleColumns.includes(column.key)} disabled={column.required} onChange={() => onToggleColumn(column.key)} />{column.label}</label>)}</div></fieldset>
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
  useEffect(() => {
    if (state.status !== "ready") return;
    setExpandedSprintKey((current) => {
      if (current === null) return null;
      if (current && state.sprints.some((sprint) => sprint.identity === current)) return current;
      return getDefaultOpenMeegleSprint(state.sprints);
    });
  }, [state.sprints, state.status]);
  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="meegle-sprints" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page sprint-history-page">
      <header className="list-page__header">
        <div><h1>Sprint 历史</h1><p>按起止日期区分 Past、Current 和 Upcoming；默认展开 Current Sprint。</p></div>
      </header>
      {state.status === "loading" ? <p className="list-message">正在加载 Sprint 历史…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">Sprint 历史暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" && !state.sprints.length ? <p className="list-message">暂无已同步 Sprint。</p> : null}
      {state.status === "ready" && state.sprints.length ? <div className="sprint-history-groups"><SprintHistoryList sprints={state.sprints} expandedSprintKey={expandedSprintKey} onToggleSprint={(identity) => setExpandedSprintKey((current) => current === identity ? null : identity)} idPrefix="sprint-history" /></div> : null}
    </section>
  </WorkspaceShell>;
}

export function MeegleSprintDetailPage({ profile, sprintName, apiBaseUrl, onLogout, isBusy, breadcrumbs }) {
  const state = useMeegleSprintHistory(apiBaseUrl);
  const [panelOpen, setPanelOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewConfigOpen, setViewConfigOpen] = useState(false);
  const [activeFilterFieldKey, setActiveFilterFieldKey] = useState("status");
  const [selectedWorkitemFilters, setSelectedWorkitemFilters] = useState({});
  const [groupBy, setGroupBy] = useState(() => normalizeSprintWorkitemGroupBy());
  const [subGroupBy, setSubGroupBy] = useState(() => normalizeSprintWorkitemSubGroupBy(undefined, normalizeSprintWorkitemGroupBy()));
  const [sort, setSort] = useState(() => normalizeSprintWorkitemSort());
  const [visibleColumns, setVisibleColumns] = useState(() => normalizeSprintWorkitemVisibleColumns());
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [collapsedSubgroups, setCollapsedSubgroups] = useState([]);
  const sprint = state.sprints.find((item) => item.sprintId === sprintName || item.name === sprintName);
  const filterFields = sprint ? SPRINT_WORKITEM_FILTER_FIELDS.map((field) => ({
    ...field,
    values: countFilterValues(sprint.items, field.getValues),
    selectedValues: selectedWorkitemFilters[field.key] || [],
  })) : [];
  const visibleItems = sprint ? filterMeegleSprintItems(sprint.items, selectedWorkitemFilters) : [];
  const sortedItems = sortSprintWorkitems(visibleItems, sort);
  const workitemGroups = groupSprintWorkitems(sortedItems, groupBy, { subGroupBy });
  useKeyboardShortcut({
    key: "Escape",
    enabled: filterOpen || viewConfigOpen,
    allowInEditableTarget: true,
    handler: (event) => {
      event.preventDefault();
      setFilterOpen(false);
      setViewConfigOpen(false);
    },
  });
  function toggleWorkitemFilter(fieldKey, value) {
    setSelectedWorkitemFilters((current) => ({ ...current, [fieldKey]: toggleFilterValue(current[fieldKey] || [], value) }));
  }
  function toggleColumn(key) {
    setVisibleColumns((current) => normalizeSprintWorkitemVisibleColumns(current.includes(key)
      ? current.filter((columnKey) => columnKey !== key)
      : [...current, key]));
  }
  function updateSort(nextSort) {
    setSort(normalizeSprintWorkitemSort(nextSort));
  }
  function updateGroupBy(value) {
    const nextGroupBy = normalizeSprintWorkitemGroupBy(value);
    setGroupBy(nextGroupBy);
    setSubGroupBy((current) => normalizeSprintWorkitemSubGroupBy(current, nextGroupBy));
    setCollapsedGroups([]);
    setCollapsedSubgroups([]);
  }
  function updateSubGroupBy(value) {
    setSubGroupBy(normalizeSprintWorkitemSubGroupBy(value, groupBy));
    setCollapsedGroups([]);
    setCollapsedSubgroups([]);
  }
  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage="meegle-sprints" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page sprint-detail-page">
      {state.status === "loading" ? <p className="list-message">正在加载 Sprint 详情…</p> : null}
      {state.status === "error" ? <p className="list-message list-message--error">Sprint 详情暂时无法读取，请稍后重试。</p> : null}
      {state.status === "ready" && !sprint ? <p className="list-message">没有找到该 Sprint 的已同步工作项。<br /><a className="table-link" href="#meegle-sprints">返回 Sprint 历史</a></p> : null}
      {state.status === "ready" && sprint ? <>
        <div className="sprint-detail-toolbar">
          <div><strong>{sprint.items.length} 个工作项</strong>{visibleItems.length !== sprint.items.length ? <span> · 当前显示 {visibleItems.length}</span> : null}</div>
          <div className="list-toolbar__actions">
          <div className="list-view-menu"><button className={`list-filter-button ${viewConfigOpen ? "list-filter-button--active" : ""}`.trim()} type="button" aria-label="配置 Sprint 工作项视图" aria-expanded={viewConfigOpen} title="视图配置" onClick={() => { setFilterOpen(false); setViewConfigOpen((open) => !open); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1a1 1 0 0 1 1 1v1h10a1 1 0 1 1 0 2H4v1a1 1 0 1 1-2 0V5H1a1 1 0 1 1 0-2h1V2a1 1 0 0 1 1-1Zm10 8a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1H1a1 1 0 1 1 0-2h11v-1a1 1 0 0 1 1-1ZM8 5a1 1 0 0 1 1 1v1h6a1 1 0 1 1 0 2H9v1a1 1 0 1 1-2 0V9H1a1 1 0 1 1 0-2h6V6a1 1 0 0 1 1-1Z" /></svg></button>{viewConfigOpen ? <SprintWorkitemViewConfigPanel groupBy={groupBy} subGroupBy={subGroupBy} sort={sort} visibleColumns={visibleColumns} onGroupByChange={updateGroupBy} onSubGroupByChange={updateSubGroupBy} onSortChange={updateSort} onToggleColumn={toggleColumn} onReset={() => { setGroupBy("none"); setSubGroupBy("none"); setSort(normalizeSprintWorkitemSort()); setVisibleColumns([...DEFAULT_SPRINT_WORKITEM_VISIBLE_COLUMNS]); setCollapsedGroups([]); setCollapsedSubgroups([]); }} /> : null}</div>
          <div className="list-filter-menu"><button className={`list-filter-button ${filterOpen ? "list-filter-button--active" : ""}`.trim()} type="button" aria-label="筛选 Sprint 工作项" aria-expanded={filterOpen} title="筛选" onClick={() => { setViewConfigOpen(false); setFilterOpen((open) => !open); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2H1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm4 4a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" /></svg></button>{filterOpen ? <SprintWorkitemFilterPanel fields={filterFields} activeFieldKey={activeFilterFieldKey} onActiveFieldChange={setActiveFilterFieldKey} onToggle={toggleWorkitemFilter} onReset={() => setSelectedWorkitemFilters({})} /> : null}</div>
          <button
            className={`list-filter-button ${panelOpen ? "list-filter-button--active" : ""}`.trim()}
            type="button"
            aria-label="显示 Sprint 详情"
            aria-expanded={panelOpen}
            title="显示 Sprint 详情"
            onClick={() => setPanelOpen((open) => !open)}
          ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2V2Zm2 2v8h6V4H4Zm8 0v8h1V4h-1Z" /></svg></button>
          </div>
        </div>
        <div className={`sprint-detail-layout ${panelOpen ? "sprint-detail-layout--with-panel" : ""}`.trim()}>
          <div className="sprint-detail-layout__main">
            {sortedItems.length ? groupBy === "none" ? <SprintWorkitemList items={sortedItems} sort={sort} visibleColumns={visibleColumns} onSort={(key) => updateSort({ key, direction: sort.key === key && sort.direction === "asc" ? "desc" : "asc" })} /> : <SprintWorkitemGroupedList groups={workitemGroups} collapsedGroups={collapsedGroups} collapsedSubgroups={collapsedSubgroups} onToggleGroup={(key) => setCollapsedGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} onToggleSubgroup={(key) => setCollapsedSubgroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} sort={sort} visibleColumns={visibleColumns} onSort={(key) => updateSort({ key, direction: sort.key === key && sort.direction === "asc" ? "desc" : "asc" })} /> : <p className="list-message">当前筛选条件下没有工作项。</p>}
          </div>
          {panelOpen ? <SprintPanel sprint={sprint} /> : null}
        </div>
      </> : null}
    </section>
  </WorkspaceShell>;
}
