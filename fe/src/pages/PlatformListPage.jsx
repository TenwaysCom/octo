import { useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { LarkTicketBadge } from "../components/lark-ticket/LarkTicketBadge.jsx";
import { LarkTicketResponsible } from "../components/lark-ticket/LarkTicketResponsible.jsx";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut.js";
import { formatDateTime } from "../lib/formatters.js";
import { countMyOpenGitHubPullRequests, matchesGitHubPullRequestQuickFilter } from "../lib/github-pull-request-filters.js";
import {
  DEFAULT_GITHUB_PULL_REQUEST_SORT,
  DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS,
  GITHUB_PULL_REQUEST_GROUP_OPTIONS,
  GITHUB_PULL_REQUEST_VIEW_COLUMNS,
  groupGitHubPullRequests,
  normalizeGitHubPullRequestGroupBy,
  normalizeGitHubPullRequestSort,
  normalizeGitHubPullRequestSubGroupBy,
  normalizeGitHubPullRequestViewMode,
  normalizeGitHubPullRequestVisibleColumns,
  sortGitHubPullRequests,
} from "../lib/github-pull-request-view-config.js";
import { DATE_FILTERS, countFilterValues, normalizeFilterValues, toggleFilterValue } from "../lib/platform-list-filters.js";
import {
  DEFAULT_LARK_TICKET_SORT,
  DEFAULT_LARK_TICKET_VISIBLE_COLUMNS,
  groupLarkTickets,
  LARK_TICKET_GROUP_OPTIONS,
  LARK_TICKET_VIEW_COLUMNS,
  normalizeLarkTicketGroupBy,
  normalizeLarkTicketSort,
  normalizeLarkTicketSubGroupBy,
  normalizeLarkTicketVisibleColumns,
  normalizeLarkTicketViewMode,
  sortLarkTickets,
} from "../lib/lark-ticket-view-config.js";
import {
  DEFAULT_MEEGLE_VISIBLE_COLUMNS,
  groupMeegleWorkitems,
  MEEGLE_GROUP_OPTIONS,
  MEEGLE_VIEW_COLUMNS,
  normalizeMeegleGroupBy,
  normalizeMeegleSort,
  normalizeMeegleSubGroupBy,
  normalizeMeegleVisibleColumns,
  normalizeMeegleViewMode,
  sortMeegleWorkitems,
} from "../lib/meegle-view-config.js";
import { getOdooShBuildTone } from "../lib/odoo-sh-build-status.js";
import {
  getGitHubPullRequestPreview,
  getPlatformDataListPage,
  resetAllOdooDevopsBranchesCache,
} from "../services/platform-data/platform-data-api.js";
import { getLarkTicketDetailHash } from "../app/routes/workspace-routes.js";

const LIST_PAGE_SIZE = 50;
const MEEGLE_WORKITEM_TYPE_FILTERS = [
  ["all", "全部"],
  ["tech-task", "TechTask"],
  ["story", "Story"],
  ["bug", "Bug"],
];
const DEFAULT_SORT = { key: "updatedAt", direction: "desc" };

function ExternalLink({ href, title, className, children }) {
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return <a className={`table-link ${className || ""}`.trim()} href={url.toString()} target="_blank" rel="noreferrer" title={title}>{children}</a>;
    }
  } catch {
    // Synced fields may be empty or a non-URL value; render plain text in that case.
  }
  return children;
}

function getMeegleStatusTone(status) {
  const normalized = String(status || "").toLocaleLowerCase();
  if (["done", "ended", "fixed", "launched"].includes(normalized)) return "completed";
  if (["fe launch", "server launch"].includes(normalized)) return "release";
  if (normalized.includes("design") || ["feature draft", "new", "to start"].includes(normalized)) return "planning";
  if (normalized.includes("review") || normalized.includes("testing") || normalized.includes("check")) return "review";
  if (normalized.includes("doing") || normalized.includes("ongoing") || normalized.includes("development")) return "active";
  return "default";
}

function MeegleStatusPill({ status }) {
  return <span className={`meegle-workitem-status meegle-workitem-status--${getMeegleStatusTone(status)}`}>{status || "未设置"}</span>;
}

function GitHubPullRequestStatus({ isDraft, state }) {
  const status = isDraft ? "draft" : state || "closed";
  return <span className={`github-pr-status github-pr-status--${status}`}>{status}</span>;
}

function GitHubUser({ login }) {
  if (!login) {
    return "-";
  }
  const encodedLogin = encodeURIComponent(login);
  return <a className="github-user" href={`https://github.com/${encodedLogin}`} target="_blank" rel="noopener noreferrer">
    <img src={`https://github.com/${encodedLogin}.png?size=48`} alt="" loading="lazy" />
    <span>{login}</span>
  </a>;
}

function GitHubPullRequestReviewers({ reviewers }) {
  return reviewers?.length ? <span className="github-user-list">{reviewers.map((reviewer) => <GitHubUser key={reviewer} login={reviewer} />)}</span> : "-";
}

function GitHubPullRequestLabels({ labels }) {
  return labels?.length ? <div className="github-pr-labels">{labels.map((label) => <span className="github-pr-label" key={label}>{label}</span>)}</div> : "-";
}

function GitHubMeegleWorkitems({ pullRequest }) {
  if (!pullRequest.meegleIds?.length) return "-";
  return <div className="meegle-link-list">
    {pullRequest.meegleIds.map((workItemId) => <div className="meegle-link-list__item" key={workItemId}>
      <span>{workItemId}</span>
    </div>)}
  </div>;
}

function OdooShBuildDots({ builds }) {
  if (!builds?.length) {
    return null;
  }

  return <span className="odoo-sh-build-dots" aria-label="Odoo.sh build 状态">{builds.map((build) => {
    const tone = getOdooShBuildTone(build.result);
    const environment = build.environment.toUpperCase();
    return <span
      aria-label={`${build.environment.toUpperCase()} Odoo.sh build：${build.result || build.status || "unknown"}`}
      className="odoo-sh-build-indicator"
      key={build.environment}
      title={`${environment}：${build.result || build.status || "unknown"}`}
    ><span className="odoo-sh-build-indicator__environment">{environment}</span><span aria-hidden="true" className={`odoo-sh-build-dot odoo-sh-build-dot--${tone}`} /></span>;
  })}</span>;
}

function OdooShBuildStatusList({ builds }) {
  if (!builds?.length) return <p className="pr-preview-empty">暂无关联的 Odoo.sh 构建状态。</p>;
  return <div className="pr-preview-builds">{builds.map((build) => <div key={build.environment}>
    <strong>{build.environment.toUpperCase()}</strong>
    <span className={`odoo-sh-build-dot odoo-sh-build-dot--${getOdooShBuildTone(build.result)}`} aria-hidden="true" />
    <span>{build.status || "unknown"}{build.result ? ` · ${build.result}` : ""}</span>
  </div>)}</div>;
}

function GitHubPullRequestLinks({ pullRequests }) {
  if (!pullRequests?.length) {
    return "-";
  }
  return <div className="github-pr-links">{pullRequests.map((pullRequest) => <div className="github-pr-links__item" key={`${pullRequest.owner}-${pullRequest.repo}-${pullRequest.pullNumber}`}>
    <ExternalLink className={`github-pr-link-badge github-pr-link-badge--${pullRequest.state}`} href={pullRequest.htmlUrl} title={`${pullRequest.owner}/${pullRequest.repo} #${pullRequest.pullNumber}\n${pullRequest.title}\n${pullRequest.state}`}>#{pullRequest.pullNumber}-{pullRequest.baseRef || "-"}</ExternalLink>
    <GitHubPullRequestStatus state={pullRequest.state} />
    <OdooShBuildDots builds={pullRequest.odooShBuilds} />
  </div>)}</div>;
}

function getPlatformItemStatus(kind, item) {
  if (kind === "lark-tickets") {
    return item.ticketStatus || "未设置";
  }
  if (kind === "meegle-workitems") {
    return item.status || "未设置";
  }
  return item.isDraft ? "Draft" : item.state || "未设置";
}

function getMeegleWorkitemCategory(item) {
  if (item.workItemTypeKey === "story") {
    return "story";
  }
  const type = `${item.workItemType || ""} ${item.workItemTypeKey || ""}`.toLocaleLowerCase();
  if (type.includes("tech task")) {
    return "tech-task";
  }
  if (type.includes("bug")) {
    return "bug";
  }
  return "other";
}

function getPlatformListFilters({
  page,
  selectedStatuses,
  selectedDateFilters,
  selectedSprints,
  selectedTagFilters,
  larkTicketQuickFilter,
  workitemTypeFilter,
  noSprintFilter,
}) {
  const sourceUpdatedAtAfter = getEarliestSelectedDate(selectedDateFilters);
  if (page === "lark-tickets") {
    return {
      ...(selectedStatuses ? { status: selectedStatuses } : {}),
      ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
      ...(selectedTagFilters.issueType?.length ? { issueType: selectedTagFilters.issueType } : {}),
      ...(selectedTagFilters.priority?.length ? { priority: selectedTagFilters.priority } : {}),
      ...(selectedTagFilters.responsible?.length ? { responsible: selectedTagFilters.responsible } : {}),
      ...(larkTicketQuickFilter !== "all" ? { quickFilter: larkTicketQuickFilter } : {}),
    };
  }
  if (page === "meegle-workitems") {
    const sprints = noSprintFilter ? [] : [...new Set([
      ...selectedSprints,
      ...(selectedTagFilters.sprint || []),
    ])];
    return {
      ...(selectedStatuses ? { status: selectedStatuses } : {}),
      ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
      ...(sprints.length ? { sprint: sprints } : {}),
      ...(selectedTagFilters.project?.length ? { project: selectedTagFilters.project } : {}),
      ...(selectedTagFilters.priority?.length ? { priority: selectedTagFilters.priority } : {}),
      ...(workitemTypeFilter !== "all" ? { workitemType: workitemTypeFilter } : {}),
      ...(noSprintFilter ? { withoutSprint: true } : {}),
    };
  }
  return {
    ...(selectedStatuses ? { status: selectedStatuses } : {}),
    ...(sourceUpdatedAtAfter ? { sourceUpdatedAtAfter } : {}),
    ...(selectedTagFilters.repo?.length ? { repo: selectedTagFilters.repo } : {}),
    ...(selectedTagFilters.label?.length ? { label: selectedTagFilters.label } : {}),
    ...(selectedTagFilters.reviewer?.length ? { reviewer: selectedTagFilters.reviewer } : {}),
  };
}

function getEarliestSelectedDate(selectedDateFilters, now = new Date()) {
  if (!selectedDateFilters.length) return undefined;
  const dates = selectedDateFilters.flatMap((dateFilter) => {
    const threshold = new Date(now);
    if (dateFilter === "today") threshold.setHours(0, 0, 0, 0);
    else if (dateFilter === "last-7-days") threshold.setDate(now.getDate() - 7);
    else if (dateFilter === "last-month") threshold.setMonth(now.getMonth() - 1);
    else if (dateFilter === "last-12-months") threshold.setFullYear(now.getFullYear() - 1);
    else return [];
    return [threshold];
  });
  if (!dates.length) return undefined;
  return new Date(Math.min(...dates.map((value) => value.getTime()))).toISOString();
}

function mergeKnownFilterValues(values, knownValues) {
  const merged = new Map(values.map((value) => [value.value, value]));
  for (const value of knownValues) {
    if (!merged.has(value.value)) merged.set(value.value, { ...value, count: 0 });
  }
  return [...merged.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN", { numeric: true }));
}

function getMeegleWorkitemDetailUrl(item) {
  const urlSlugByCategory = {
    story: "story",
    "tech-task": "techtask",
    bug: "production_bug",
  };
  const urlSlug = urlSlugByCategory[getMeegleWorkitemCategory(item)] || item.workItemTypeKey;
  return `https://project.larksuite.com/${encodeURIComponent(item.projectKey)}/${encodeURIComponent(urlSlug)}/detail/${encodeURIComponent(item.workItemId)}`;
}

function SortableColumnHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return <button className="sortable-column-header" type="button" onClick={() => onSort(sortKey)}>
    {label}
    <span className="sortable-column-header__arrows" aria-hidden="true">
      <svg className={active && sort.direction === "asc" ? "sortable-column-header__arrow--active" : ""} viewBox="0 0 8 5"><path d="M4 0 8 5H0z" /></svg>
      <svg className={active && sort.direction === "desc" ? "sortable-column-header__arrow--active" : ""} viewBox="0 0 8 5"><path d="M4 5 0 0h8z" /></svg>
    </span>
  </button>;
}

function LarkTicketCell({ columnKey, item }) {
  if (columnKey === "title") {
    return <><a className="table-link" href={getLarkTicketDetailHash(item.recordId)}>{item.title}</a><small>{item.ticketNumber || item.recordId}</small></>;
  }
  if (columnKey === "status") {
    return <LarkTicketBadge kind="status" value={item.ticketStatus} />;
  }
  if (columnKey === "issueType") {
    return <LarkTicketBadge kind="type" value={item.issueType} />;
  }
  if (columnKey === "requester") {
    return <LarkTicketResponsible responsible={item.requester} />;
  }
  if (columnKey === "responsible") {
    return <LarkTicketResponsible responsible={item.responsible} />;
  }
  if (columnKey === "priority") {
    return <LarkTicketBadge kind="priority" value={item.priority} />;
  }
  return formatDateTime(item.sourceUpdatedAt || item.syncedAt);
}

function LarkTicketsTable({ items, sort, onSort, visibleColumns }) {
  const columns = LARK_TICKET_VIEW_COLUMNS.filter(({ key }) => visibleColumns.includes(key));
  return <table className="data-table" style={{ minWidth: Math.max(360, columns.length * 145) }}><thead><tr>
    {columns.map((column) => <th key={column.key}><SortableColumnHeader label={column.label} sortKey={column.sortKey} sort={sort} onSort={onSort} /></th>)}
  </tr></thead><tbody>
    {items.map((item, index) => <tr key={item.recordId || `${item.baseId || "base"}-${item.tableId || "table"}-${index}`}>
      {columns.map((column) => <td key={column.key}><LarkTicketCell columnKey={column.key} item={item} /></td>)}
    </tr>)}
  </tbody></table>;
}

function MeegleWorkitemCell({ columnKey, item }) {
  if (columnKey === "workitem") {
    return <><ExternalLink href={getMeegleWorkitemDetailUrl(item)}>{item.workItemKey || item.workItemId}</ExternalLink><small>{item.title}</small></>;
  }
  if (columnKey === "workitemType") {
    return <span className={`workitem-type-badge workitem-type-badge--${getMeegleWorkitemCategory(item)}`}>{item.workItemType || item.workItemTypeKey || "-"}</span>;
  }
  if (columnKey === "status") {
    return <><MeegleStatusPill status={item.status} /><small>{item.subStage || ""}</small></>;
  }
  if (columnKey === "pullRequests") {
    return <GitHubPullRequestLinks pullRequests={item.githubPullRequests} />;
  }
  if (columnKey === "sprint") {
    return item.sprint || "-";
  }
  if (columnKey === "version") {
    return item.version || "-";
  }
  if (columnKey === "system") {
    return item.system || "-";
  }
  if (columnKey === "assignee") {
    return item.assignee || "-";
  }
  return formatDateTime(item.sourceUpdatedAt || item.syncedAt);
}

function MeegleWorkitemsTable({ items, sort, onSort, visibleColumns }) {
  const columns = MEEGLE_VIEW_COLUMNS.filter(({ key }) => visibleColumns.includes(key));
  return <table className="data-table data-table--meegle" style={{ minWidth: Math.max(360, columns.length * 145) }}><thead><tr>
    {columns.map((column) => <th key={column.key}>{column.sortKey
      ? <SortableColumnHeader label={column.label} sortKey={column.sortKey} sort={sort} onSort={onSort} />
      : column.label}</th>)}
  </tr></thead><tbody>
    {items.map((item) => <tr key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`}>
      {columns.map((column) => <td key={column.key}><MeegleWorkitemCell columnKey={column.key} item={item} /></td>)}
    </tr>)}
  </tbody></table>;
}

function GitHubPullRequestCell({ columnKey, item }) {
  if (columnKey === "pullRequest") {
    return <><ExternalLink href={item.htmlUrl}>{item.title}</ExternalLink><small>#{item.pullNumber}</small></>;
  }
  if (columnKey === "repo") {
    return `${item.owner} / ${item.repo}`;
  }
  if (columnKey === "status") {
    return <GitHubPullRequestStatus isDraft={item.isDraft} state={item.state} />;
  }
  if (columnKey === "branch") {
    return <><span className="github-pr-branch">{item.headRef || "-"}<OdooShBuildDots builds={item.odooShBuilds} /></span><small>{item.baseRef ? `→ ${item.baseRef}` : ""}</small></>;
  }
  if (columnKey === "author") {
    return <GitHubUser login={item.authorLogin} />;
  }
  if (columnKey === "mergedBy") {
    return <GitHubUser login={item.mergedBy} />;
  }
  if (columnKey === "reviewers") {
    return <GitHubPullRequestReviewers reviewers={item.reviewers} />;
  }
  if (columnKey === "labels") {
    return <GitHubPullRequestLabels labels={item.labels} />;
  }
  if (columnKey === "meegleWorkitems") {
    return <GitHubMeegleWorkitems pullRequest={item} />;
  }
  return formatDateTime(item.sourceUpdatedAt || item.syncedAt);
}

function GitHubPullRequestsTable({ items, sort, onSort, visibleColumns, onPreviewCandidateChange }) {
  const columns = GITHUB_PULL_REQUEST_VIEW_COLUMNS.filter(({ key }) => visibleColumns.includes(key));
  return <table className="data-table" style={{ minWidth: Math.max(360, columns.length * 145) }}><thead><tr>
    {columns.map((column) => <th key={column.key}>{column.sortKey
      ? <SortableColumnHeader label={column.label} sortKey={column.sortKey} sort={sort} onSort={onSort} />
      : column.label}</th>)}
  </tr></thead><tbody>
    {items.map((item) => <tr
      aria-label={`${item.title}，按空格预览`}
      key={`${item.owner}-${item.repo}-${item.pullNumber}`}
      tabIndex={0}
      onMouseEnter={() => onPreviewCandidateChange?.(item)}
      onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) onPreviewCandidateChange?.(null); }}
      onFocusCapture={() => onPreviewCandidateChange?.(item)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPreviewCandidateChange?.(null); }}
    >
      {columns.map((column) => <td key={column.key}><GitHubPullRequestCell columnKey={column.key} item={item} /></td>)}
    </tr>)}
  </tbody></table>;
}

function ListFilterPanel({ fields, activeFieldKey, onActiveFieldChange, fieldQuery, onFieldQueryChange, valueQuery, onValueQueryChange, onReset }) {
  const activeField = fields.find(({ key }) => key === activeFieldKey);
  const visibleFields = fields.filter(({ label }) => label.toLocaleLowerCase().includes(fieldQuery.trim().toLocaleLowerCase()));
  const visibleValues = activeField?.values.filter(({ label }) => label.toLocaleLowerCase().includes(valueQuery.trim().toLocaleLowerCase())) || [];

  return <div className="list-filter-menu__panel" onMouseLeave={() => onActiveFieldChange(null)}>
    <header className="list-filter-menu__header">
      <strong>筛选</strong>
      <button type="button" onClick={onReset}>清空</button>
    </header>
    <div className="list-filter-menu__columns">
      <nav className="list-filter-fields" aria-label="过滤字段">
        <label className="list-filter-menu__field-search">
          <span className="visually-hidden">筛选字段</span>
          <input type="search" value={fieldQuery} onChange={(event) => onFieldQueryChange(event.target.value)} placeholder="添加筛选条件…" />
        </label>
        <div className="list-filter-menu__field-list">
          {visibleFields.map((field) => <button
            className={field.key === activeField?.key ? "list-filter-field--active" : ""}
            type="button"
            key={field.key}
            onMouseEnter={() => {
              onActiveFieldChange(field.key);
              onValueQueryChange("");
            }}
            onFocus={() => {
              onActiveFieldChange(field.key);
              onValueQueryChange("");
            }}
            onClick={() => {
              onActiveFieldChange(field.key);
              onValueQueryChange("");
            }}
          >
            <span>{field.label}</span>
            {field.isFiltered ? <small>{field.selectedValues.length}</small> : null}
            <span aria-hidden="true">›</span>
          </button>)}
          {!visibleFields.length ? <p>没有匹配的字段</p> : null}
        </div>
      </nav>
      {activeField ? <section className="list-filter-values" aria-label={`${activeField.label} 的可选值`}>
        <label className="list-filter-menu__value-search">
          <span className="visually-hidden">筛选 {activeField.label} 的值</span>
          <input type="search" value={valueQuery} onChange={(event) => onValueQueryChange(event.target.value)} placeholder="筛选值…" />
        </label>
        <div className="list-filter-menu__value-list">
          {visibleValues.map(({ value, label }) => <label key={value}>
            <input type="checkbox" checked={activeField.selectedValues.includes(value)} onChange={() => activeField.onToggle(value)} />
            <span>{label}</span>
          </label>)}
          {!visibleValues.length ? <p>没有匹配的值</p> : null}
        </div>
      </section> : null}
    </div>
  </div>;
}

function TagFilterSidebar({ fields, activeFieldKey, selectedValues, onActiveFieldChange, onToggle, onReset }) {
  const activeField = fields.find(({ key }) => key === activeFieldKey) || fields[0];
  return <aside className="list-tag-sidebar" aria-label="标签筛选">
    <header>
      <strong>标签筛选</strong>
      <button type="button" onClick={onReset}>清空</button>
    </header>
    <div className="list-tag-sidebar__tabs" role="tablist" aria-label="标签字段">
      {fields.map((field) => <button
        type="button"
        role="tab"
        aria-selected={field.key === activeField?.key}
        className={field.key === activeField?.key ? "list-tag-sidebar__tab--active" : ""}
        key={field.key}
        onClick={() => onActiveFieldChange(field.key)}
      >{field.label}</button>)}
    </div>
    <div className="list-tag-sidebar__values" role="group" aria-label={activeField?.label}>
      {activeField?.values.map((tag) => <button
        type="button"
        aria-pressed={selectedValues[activeField.key]?.includes(tag.value) || false}
        className={selectedValues[activeField.key]?.includes(tag.value) ? "list-tag-sidebar__value--active" : ""}
        key={tag.value}
        onClick={() => onToggle(activeField.key, tag.value)}
      ><span><i aria-hidden="true" />{tag.label}</span><small>{tag.count}</small></button>)}
      {!activeField?.values.length ? <p>暂无可筛选的标签</p> : null}
    </div>
  </aside>;
}

function ListViewConfigPanel({ idPrefix, columns, groupOptions, viewMode, onViewModeChange, groupBy, onGroupByChange, subGroupBy, onSubGroupByChange, showEmptyGroups, onShowEmptyGroupsChange, sort, onSortChange, visibleColumns, onToggleColumn, onReset }) {
  return <div className="list-view-config-panel">
    <header className="list-view-config-panel__header">
      <strong>视图配置</strong>
      <button type="button" onClick={onReset}>重置</button>
    </header>
    <div className="list-view-mode" role="group" aria-label="视图类型">
      <button className={viewMode === "list" ? "list-view-mode--active" : ""} type="button" onClick={() => onViewModeChange("list")}>☰ 列表</button>
      <button className={viewMode === "board" ? "list-view-mode--active" : ""} type="button" onClick={() => onViewModeChange("board")}>▦ 看板</button>
    </div>
    <div className="list-view-config-section">
      <label htmlFor={`${idPrefix}-group-by`}>分组</label>
      <select id={`${idPrefix}-group-by`} value={groupBy} onChange={(event) => onGroupByChange(event.target.value)}>
        {groupOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="list-view-config-section">
      <label htmlFor={`${idPrefix}-sub-group-by`}>子分组</label>
      <select id={`${idPrefix}-sub-group-by`} value={subGroupBy} disabled={groupBy === "none"} onChange={(event) => onSubGroupByChange(event.target.value)}>
        {groupOptions.filter(([value]) => value === "none" || value !== groupBy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="list-view-config-section list-view-config-section--ordering">
      <label htmlFor={`${idPrefix}-order-by`}>排序</label>
      <select id={`${idPrefix}-order-by`} value={sort.key} onChange={(event) => onSortChange({ ...sort, key: event.target.value })}>
        {columns.filter(({ sortKey }) => sortKey).map(({ label, sortKey }) => <option key={sortKey} value={sortKey}>{label}</option>)}
      </select>
      <div className="list-view-direction" role="group" aria-label="排序方向">
        <button className={sort.direction === "asc" ? "list-view-direction--active" : ""} type="button" aria-label="升序" title="升序" onClick={() => onSortChange({ ...sort, direction: "asc" })}>↑</button>
        <button className={sort.direction === "desc" ? "list-view-direction--active" : ""} type="button" aria-label="降序" title="降序" onClick={() => onSortChange({ ...sort, direction: "desc" })}>↓</button>
      </div>
    </div>
    <label className="list-view-toggle">
      <span>显示空分组</span>
      <input type="checkbox" checked={showEmptyGroups} disabled={groupBy === "none"} onChange={(event) => onShowEmptyGroupsChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
    <fieldset className="list-view-fields">
      <legend>显示字段</legend>
      <div>
        {columns.map((column) => <label className={visibleColumns.includes(column.key) ? "list-view-field--active" : ""} key={column.key}>
          <input
            type="checkbox"
            checked={visibleColumns.includes(column.key)}
            disabled={column.required}
            onChange={() => onToggleColumn(column.key)}
          />
          {column.label}
        </label>)}
      </div>
    </fieldset>
  </div>;
}

function GroupedList({ groups, collapsedGroups, onToggleGroup, collapsedSubgroups, onToggleSubgroup, renderTable }) {
  return <div className="grouped-list">{groups.map((group) => {
    const collapsed = collapsedGroups.includes(group.key);
    return <section className="grouped-list__section" key={group.key}>
      <button className="grouped-list__header" type="button" aria-expanded={!collapsed} onClick={() => onToggleGroup(group.key)}>
        <svg className={collapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
        <strong>{group.label}</strong>
        <span>{group.items.length} 条</span>
      </button>
      {!collapsed ? group.subgroups?.length ? <div className="grouped-list__subgroups">{group.subgroups.map((subgroup) => <section className="grouped-list__subgroup" key={subgroup.key}>
        <button className="grouped-list__subgroup-header" type="button" aria-expanded={!collapsedSubgroups.includes(subgroup.key)} onClick={() => onToggleSubgroup(subgroup.key)}>
          <svg className={collapsedSubgroups.includes(subgroup.key) ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
          <strong>{subgroup.label}</strong>
          <span>{subgroup.items.length} 条</span>
        </button>
        {!collapsedSubgroups.includes(subgroup.key) ? <div className="data-table-wrap">{renderTable(subgroup.items)}</div> : null}
      </section>)}</div> : <div className="data-table-wrap">{renderTable(group.items)}</div> : null}
    </section>;
  })}</div>;
}

function LarkTicketCard({ item, visibleColumns }) {
  const columns = LARK_TICKET_VIEW_COLUMNS.filter(({ key }) => key !== "title" && visibleColumns.includes(key));
  return <article className="kanban-card">
    <a className="table-link kanban-card__title" href={getLarkTicketDetailHash(item.recordId)}>{item.title || item.ticketNumber || item.recordId}</a>
    <small>{item.ticketNumber || item.recordId}</small>
    {columns.length ? <dl>{columns.map((column) => <div key={column.key}><dt>{column.label}</dt><dd><LarkTicketCell columnKey={column.key} item={item} /></dd></div>)}</dl> : null}
  </article>;
}

function MeegleWorkitemCard({ item, visibleColumns }) {
  const columns = MEEGLE_VIEW_COLUMNS.filter(({ key }) => key !== "workitem" && visibleColumns.includes(key));
  return <article className="kanban-card">
    <ExternalLink className="table-link kanban-card__title" href={getMeegleWorkitemDetailUrl(item)}>{item.workItemKey || item.workItemId || item.title}</ExternalLink>
    <small>{item.title}</small>
    {columns.length ? <dl>{columns.map((column) => <div key={column.key}><dt>{column.label}</dt><dd><MeegleWorkitemCell columnKey={column.key} item={item} /></dd></div>)}</dl> : null}
  </article>;
}

function GitHubPullRequestCard({ item, visibleColumns, onPreviewCandidateChange }) {
  const columns = GITHUB_PULL_REQUEST_VIEW_COLUMNS.filter(({ key }) => key !== "pullRequest" && visibleColumns.includes(key));
  return <article
    aria-label={`${item.title}，按空格预览`}
    className="kanban-card"
    tabIndex={0}
    onMouseEnter={() => onPreviewCandidateChange?.(item)}
    onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) onPreviewCandidateChange?.(null); }}
    onFocusCapture={() => onPreviewCandidateChange?.(item)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onPreviewCandidateChange?.(null); }}
  >
    <ExternalLink className="table-link kanban-card__title" href={item.htmlUrl}>{item.title || `#${item.pullNumber}`}</ExternalLink>
    <small>#{item.pullNumber}</small>
    {columns.length ? <dl>{columns.map((column) => <div key={column.key}><dt>{column.label}</dt><dd><GitHubPullRequestCell columnKey={column.key} item={item} /></dd></div>)}</dl> : null}
  </article>;
}

function KanbanBoard({ groups, collapsedSubgroups, onToggleSubgroup, renderCard }) {
  const hasSubgroups = groups.some((group) => group.subgroups?.length);
  if (!hasSubgroups) {
    return <div className="kanban-board">{groups.map((group) => <section className="kanban-board__column" key={group.key}>
      <header><strong>{group.label}</strong><span>{group.items.length} 条</span></header>
      <div>{group.items.map(renderCard)}</div>
    </section>)}</div>;
  }

  const swimlanes = [];
  const seen = new Set();
  for (const group of groups) {
    for (const subgroup of group.subgroups || []) {
      const key = subgroup.subgroupKey || subgroup.key;
      if (!seen.has(key)) {
        seen.add(key);
        swimlanes.push({ key, label: subgroup.label });
      }
    }
  }
  const gridStyle = { gridTemplateColumns: `repeat(${groups.length}, minmax(220px, 260px))` };

  return <div className="kanban-board kanban-board--swimlanes">
    <div className="kanban-board__group-headers" style={gridStyle}>{groups.map((group) => <header key={group.key}><strong>{group.label}</strong><span>{group.items.length} 条</span></header>)}</div>
    {swimlanes.map((lane) => {
      const collapseKey = `kanban:${lane.key}`;
      const collapsed = collapsedSubgroups.includes(collapseKey);
      return <section className="kanban-swimlane" key={lane.key}>
        <button className="kanban-swimlane__header" type="button" aria-expanded={!collapsed} onClick={() => onToggleSubgroup(collapseKey)}>
          <svg className={collapsed ? "grouped-list__chevron--collapsed" : ""} viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4 3 3 3-3" /></svg>
          <strong>{lane.label}</strong>
          <span>{groups.reduce((count, group) => count + ((group.subgroups || []).find((subgroup) => (subgroup.subgroupKey || subgroup.key) === lane.key)?.items.length || 0), 0)} 条</span>
        </button>
        {!collapsed ? <div className="kanban-swimlane__content" style={gridStyle}>{groups.map((group) => {
          const subgroup = (group.subgroups || []).find((candidate) => (candidate.subgroupKey || candidate.key) === lane.key);
          return <div className="kanban-swimlane__cell" key={group.key}>{subgroup?.items.map(renderCard)}</div>;
        })}</div> : null}
      </section>;
    })}
  </div>;
}

function getDefaultCollapsedSubgroupKeys(groups) {
  return [...new Set(groups.flatMap((group) => (group.subgroups || []).flatMap((subgroup) => [
    subgroup.key,
    `kanban:${subgroup.subgroupKey || subgroup.key}`,
  ])))];
}

function SyncedListTable({ kind, items, sort, onSort, larkVisibleColumns = DEFAULT_LARK_TICKET_VISIBLE_COLUMNS, meegleVisibleColumns = DEFAULT_MEEGLE_VISIBLE_COLUMNS, githubVisibleColumns = DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS, onGitHubPreviewCandidateChange }) {
  if (kind === "lark-tickets") {
    return <LarkTicketsTable items={items} sort={sort} onSort={onSort} visibleColumns={larkVisibleColumns} />;
  }

  if (kind === "meegle-workitems") {
    return <MeegleWorkitemsTable items={items} sort={sort} onSort={onSort} visibleColumns={meegleVisibleColumns} />;
  }

  return <GitHubPullRequestsTable items={items} sort={sort} onSort={onSort} visibleColumns={githubVisibleColumns} onPreviewCandidateChange={onGitHubPreviewCandidateChange} />;
}

function LoadMoreResults({ pager, loaded, isLoading, onLoadMore }) {
  if (!pager?.hasMore) return null;
  return <footer className="list-load-more">
    <p>已加载 <strong>{loaded}</strong> / {pager.total} 条结果 · 还有 {pager.total - loaded} 条</p>
    <button type="button" disabled={isLoading} onClick={onLoadMore}>{isLoading ? "加载中…" : "加载更多"}</button>
  </footer>;
}

function GitHubPullRequestPreviewModal({ preview, onClose, onRetry }) {
  const { pullRequest } = preview;
  const linkedIds = new Set((pullRequest.meegleWorkitems || []).map((workitem) => workitem.workItemId));
  const unresolvedIds = (pullRequest.meegleIds || []).filter((workItemId) => !linkedIds.has(workItemId));
  return <div className="pr-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-busy={preview.status === "loading"} aria-labelledby="github-pr-preview-title" aria-modal="true" className="pr-preview-modal" role="dialog">
      <header>
        <div>
          <small>{pullRequest.owner} / {pullRequest.repo} · #{pullRequest.pullNumber}</small>
          <h2 id="github-pr-preview-title"><ExternalLink href={pullRequest.htmlUrl}>{pullRequest.title}</ExternalLink></h2>
        </div>
        <button aria-label="关闭 PR 预览" autoFocus type="button" onClick={onClose}>×</button>
      </header>
      {preview.status === "loading" ? <div className="pr-preview-section"><p className="pr-preview-empty">正在获取 PR 与关联 Meegle 工作项信息…</p></div> : null}
      {preview.status === "error" ? <div className="pr-preview-section pr-preview-error">
        <p>预览信息暂时无法读取，请稍后重试。</p>
        <button type="button" onClick={onRetry}>重新获取</button>
      </div> : null}
      {preview.status === "ready" ? <>
      <div className="pr-preview-section">
        <h3>Odoo.sh 状态</h3>
        <OdooShBuildStatusList builds={pullRequest.odooShBuilds} />
      </div>
      <div className="pr-preview-section">
        <h3>描述</h3>
        <p className="pr-preview-description">{pullRequest.description || "暂无描述。"}</p>
      </div>
      <div className="pr-preview-section">
        <h3>关联 Meegle Work Item</h3>
        {pullRequest.meegleWorkitems?.length ? <div className="pr-preview-workitems">{pullRequest.meegleWorkitems.map((workitem) => <article key={`${workitem.projectKey}-${workitem.workItemTypeKey}-${workitem.workItemId}`}>
          <div className="pr-preview-workitem__identity">
            <ExternalLink href={getMeegleWorkitemDetailUrl(workitem)}>{workitem.workItemId}</ExternalLink>
            <span title={workitem.title}>{workitem.title}</span>
          </div>
          <div className="pr-preview-workitem__badges">
            <span className={`pr-preview-workitem-badge pr-preview-workitem-badge--${getMeegleStatusTone(workitem.status)}`} title={`Status: ${workitem.status || "-"}`}><small>Status</small><span>{workitem.status || "-"}</span></span>
            <span className="pr-preview-workitem-badge pr-preview-workitem-badge--sprint" title={`Sprint: ${workitem.sprint || "-"}`}><small>Sprint</small><span>{workitem.sprint || "-"}</span></span>
            <span className="pr-preview-workitem-badge pr-preview-workitem-badge--version" title={`Version: ${workitem.version || "-"}`}><small>Version</small><span>{workitem.version || "-"}</span></span>
          </div>
        </article>)}</div> : null}
        {unresolvedIds.length ? <div className="pr-preview-unresolved"><strong>尚未同步到 Octo</strong>{unresolvedIds.map((workItemId) => <span key={workItemId}>{workItemId}</span>)}</div> : null}
        {!pullRequest.meegleWorkitems?.length && !unresolvedIds.length ? <p className="pr-preview-empty">暂无关联的 Meegle 工作项。</p> : null}
      </div>
      </> : null}
    </section>
  </div>;
}

export function PlatformListPage({ profile, page, apiBaseUrl, onLogout, isBusy, breadcrumbs, platformListFilterState, onPlatformListFilterStateChange }) {
  const restoredFilters = platformListFilterState || {};
  const [state, setState] = useState({ status: "loading", items: [], filterItems: [], filterItemsPage: page, sprints: [], pager: null, isLoadingMore: false });
  const [selectedStatuses, setSelectedStatuses] = useState(() => restoredFilters.selectedStatuses || null);
  const [selectedDateFilters, setSelectedDateFilters] = useState(() => normalizeFilterValues(
    restoredFilters.selectedDateFilters,
    restoredFilters.dateFilter && restoredFilters.dateFilter !== "all-time" ? [restoredFilters.dateFilter] : [],
  ));
  const [selectedSprints, setSelectedSprints] = useState(() => normalizeFilterValues(
    restoredFilters.selectedSprints,
    restoredFilters.sprintFilter ? [restoredFilters.sprintFilter] : [],
  ));
  const [noSprintFilter, setNoSprintFilter] = useState(() => Boolean(restoredFilters.noSprintFilter));
  const [selectedTagFilters, setSelectedTagFilters] = useState(() => Object.fromEntries(Object.entries(restoredFilters.selectedTagFilters || {})
    .filter(([, values]) => Array.isArray(values))
    .map(([key, values]) => [key, normalizeFilterValues(values)])));
  const [githubQuickFilter, setGithubQuickFilter] = useState(() => restoredFilters.githubQuickFilter || "all");
  const [larkTicketQuickFilter, setLarkTicketQuickFilter] = useState(() => restoredFilters.larkTicketQuickFilter || "all");
  const [workitemTypeFilter, setWorkitemTypeFilter] = useState(() => restoredFilters.workitemTypeFilter || "all");
  const [sort, setSort] = useState(() => {
    if (page === "lark-tickets") return normalizeLarkTicketSort(restoredFilters.sort);
    if (page === "meegle-workitems") return normalizeMeegleSort(restoredFilters.sort);
    return normalizeGitHubPullRequestSort(restoredFilters.sort);
  });
  const [larkGroupBy, setLarkGroupBy] = useState(() => normalizeLarkTicketGroupBy(restoredFilters.larkGroupBy));
  const [larkSubGroupBy, setLarkSubGroupBy] = useState(() => normalizeLarkTicketSubGroupBy(restoredFilters.larkSubGroupBy, normalizeLarkTicketGroupBy(restoredFilters.larkGroupBy)));
  const [larkViewMode, setLarkViewMode] = useState(() => normalizeLarkTicketViewMode(restoredFilters.larkViewMode));
  const [larkShowEmptyGroups, setLarkShowEmptyGroups] = useState(() => Boolean(restoredFilters.larkShowEmptyGroups));
  const [larkVisibleColumns, setLarkVisibleColumns] = useState(() => normalizeLarkTicketVisibleColumns(restoredFilters.larkVisibleColumns));
  const [collapsedLarkGroups, setCollapsedLarkGroups] = useState(() => Array.isArray(restoredFilters.collapsedLarkGroups)
    ? [...new Set(restoredFilters.collapsedLarkGroups.filter((key) => typeof key === "string"))]
    : []);
  const [collapsedLarkSubgroups, setCollapsedLarkSubgroups] = useState(() => Array.isArray(restoredFilters.collapsedLarkSubgroups)
    ? [...new Set(restoredFilters.collapsedLarkSubgroups.filter((key) => typeof key === "string"))]
    : []);
  const [meegleGroupBy, setMeegleGroupBy] = useState(() => normalizeMeegleGroupBy(restoredFilters.meegleGroupBy));
  const [meegleSubGroupBy, setMeegleSubGroupBy] = useState(() => normalizeMeegleSubGroupBy(restoredFilters.meegleSubGroupBy, normalizeMeegleGroupBy(restoredFilters.meegleGroupBy)));
  const [meegleViewMode, setMeegleViewMode] = useState(() => normalizeMeegleViewMode(restoredFilters.meegleViewMode));
  const [meegleShowEmptyGroups, setMeegleShowEmptyGroups] = useState(() => Boolean(restoredFilters.meegleShowEmptyGroups));
  const [meegleVisibleColumns, setMeegleVisibleColumns] = useState(() => normalizeMeegleVisibleColumns(restoredFilters.meegleVisibleColumns));
  const [collapsedMeegleGroups, setCollapsedMeegleGroups] = useState(() => Array.isArray(restoredFilters.collapsedMeegleGroups)
    ? [...new Set(restoredFilters.collapsedMeegleGroups.filter((key) => typeof key === "string"))]
    : []);
  const [collapsedMeegleSubgroups, setCollapsedMeegleSubgroups] = useState(() => Array.isArray(restoredFilters.collapsedMeegleSubgroups)
    ? [...new Set(restoredFilters.collapsedMeegleSubgroups.filter((key) => typeof key === "string"))]
    : []);
  const [githubGroupBy, setGitHubGroupBy] = useState(() => normalizeGitHubPullRequestGroupBy(restoredFilters.githubGroupBy));
  const [githubSubGroupBy, setGitHubSubGroupBy] = useState(() => normalizeGitHubPullRequestSubGroupBy(restoredFilters.githubSubGroupBy, normalizeGitHubPullRequestGroupBy(restoredFilters.githubGroupBy)));
  const [githubViewMode, setGitHubViewMode] = useState(() => normalizeGitHubPullRequestViewMode(restoredFilters.githubViewMode));
  const [githubShowEmptyGroups, setGitHubShowEmptyGroups] = useState(() => Boolean(restoredFilters.githubShowEmptyGroups));
  const [githubVisibleColumns, setGitHubVisibleColumns] = useState(() => normalizeGitHubPullRequestVisibleColumns(restoredFilters.githubVisibleColumns));
  const [collapsedGitHubGroups, setCollapsedGitHubGroups] = useState(() => Array.isArray(restoredFilters.collapsedGitHubGroups)
    ? [...new Set(restoredFilters.collapsedGitHubGroups.filter((key) => typeof key === "string"))]
    : []);
  const [collapsedGitHubSubgroups, setCollapsedGitHubSubgroups] = useState(() => Array.isArray(restoredFilters.collapsedGitHubSubgroups)
    ? [...new Set(restoredFilters.collapsedGitHubSubgroups.filter((key) => typeof key === "string"))]
    : []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterField, setActiveFilterField] = useState(null);
  const [filterFieldQuery, setFilterFieldQuery] = useState("");
  const [filterValueQuery, setFilterValueQuery] = useState("");
  const [activeTagFilterField, setActiveTagFilterField] = useState(null);
  const [tagSidebarOpen, setTagSidebarOpen] = useState(() => restoredFilters.tagSidebarOpen !== false);
  const [viewConfigOpen, setViewConfigOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(() => restoredFilters.pageIndex || 0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [resetError, setResetError] = useState("");
  const [isResettingDevopsCache, setIsResettingDevopsCache] = useState(false);
  const [githubPreviewCandidate, setGitHubPreviewCandidate] = useState(null);
  const [githubPreview, setGitHubPreview] = useState(null);
  const githubPreviewCacheRef = useRef(new Map());
  const githubPreviewRequestVersionRef = useRef(0);
  const filterStateRef = useRef(null);
  const dataRequestVersionRef = useRef(0);
  const larkSubgroupDefaultsRef = useRef(Array.isArray(restoredFilters.collapsedLarkSubgroups) ? "restored" : null);
  const meegleSubgroupDefaultsRef = useRef(Array.isArray(restoredFilters.collapsedMeegleSubgroups) ? "restored" : null);
  const githubSubgroupDefaultsRef = useRef(Array.isArray(restoredFilters.collapsedGitHubSubgroups) ? "restored" : null);
  const statusFilters = [...new Set(state.filterItems.map((item) => getPlatformItemStatus(page, item)))].sort((left, right) => left.localeCompare(right));
  const itemsBeforeTypeFilter = state.items;
  const workitemTypeCounts = Object.fromEntries(MEEGLE_WORKITEM_TYPE_FILTERS.map(([value]) => [value, value === "all" ? state.items.length : state.items.filter((item) => getMeegleWorkitemCategory(item) === value).length]));
  const githubId = profile.user?.githubId;
  const myOpenPullRequestCount = page === "github-pull-requests"
    ? countMyOpenGitHubPullRequests(state.items, githubId)
    : 0;
  const itemsAfterQuickFilters = page === "github-pull-requests"
    ? state.items.filter((item) => matchesGitHubPullRequestQuickFilter(item, githubQuickFilter, githubId))
    : state.items;
  const tagFilterFields = page === "lark-tickets" ? [
    { key: "issueType", label: "Issue 类型", getValues: (item) => [item.issueType] },
    { key: "priority", label: "紧急度", getValues: (item) => [item.priority] },
    { key: "responsible", label: "负责人", getValues: (item) => String(item.responsible || "").split(/[,，]/) },
  ] : page === "meegle-workitems" ? [
    { key: "sprint", label: "Sprint", getValues: (item) => [item.sprint] },
    { key: "project", label: "项目", getValues: (item) => [item.projectName || item.projectKey] },
    { key: "priority", label: "优先级", getValues: (item) => [item.priority] },
  ] : [
    { key: "repo", label: "仓库", getValues: (item) => [[item.owner, item.repo].filter(Boolean).join(" / ")] },
    { key: "label", label: "Label", getValues: (item) => item.labels || [] },
    { key: "reviewer", label: "Reviewer", getValues: (item) => item.reviewers || [] },
  ];
  const tagFilterFieldsWithCounts = tagFilterFields.map((field) => ({
    ...field,
    values: mergeKnownFilterValues(
      countFilterValues(itemsAfterQuickFilters, field.getValues),
      countFilterValues(state.filterItems, field.getValues),
    ),
  }));
  const filteredItems = itemsAfterQuickFilters;
  const sortedItems = page === "lark-tickets"
    ? sortLarkTickets(filteredItems, sort)
    : page === "meegle-workitems"
      ? sortMeegleWorkitems(filteredItems, sort)
      : sortGitHubPullRequests(filteredItems, sort);
  const larkGroups = page === "lark-tickets" ? groupLarkTickets(sortedItems, larkGroupBy, {
    subGroupBy: larkSubGroupBy,
    showEmptyGroups: larkShowEmptyGroups,
    groupValues: state.items,
    subGroupValues: state.items,
  }) : [];
  const meegleGroups = page === "meegle-workitems" ? groupMeegleWorkitems(sortedItems, meegleGroupBy, {
    subGroupBy: meegleSubGroupBy,
    showEmptyGroups: meegleShowEmptyGroups,
    groupValues: state.items,
    subGroupValues: state.items,
  }) : [];
  const githubGroups = page === "github-pull-requests" ? groupGitHubPullRequests(sortedItems, githubGroupBy, {
    subGroupBy: githubSubGroupBy,
    showEmptyGroups: githubShowEmptyGroups,
    groupValues: state.items,
    subGroupValues: state.items,
  }) : [];
  const isLarkBoard = page === "lark-tickets" && larkViewMode === "board";
  const isMeegleBoard = page === "meegle-workitems" && meegleViewMode === "board";
  const isGitHubBoard = page === "github-pull-requests" && githubViewMode === "board";
  const isLarkGrouped = page === "lark-tickets" && larkViewMode === "list" && larkGroupBy !== "none";
  const isMeegleGrouped = page === "meegle-workitems" && meegleViewMode === "list" && meegleGroupBy !== "none";
  const isGitHubGrouped = page === "github-pull-requests" && githubViewMode === "list" && githubGroupBy !== "none";
  const canShowConfiguredEmptyGroups = (page === "lark-tickets" && larkShowEmptyGroups && larkGroupBy !== "none" && larkGroups.length > 0)
    || (page === "meegle-workitems" && meegleShowEmptyGroups && meegleGroupBy !== "none" && meegleGroups.length > 0)
    || (page === "github-pull-requests" && githubShowEmptyGroups && githubGroupBy !== "none" && githubGroups.length > 0);
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / LIST_PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = sortedItems.slice(currentPageIndex * LIST_PAGE_SIZE, (currentPageIndex + 1) * LIST_PAGE_SIZE);
  const firstResult = sortedItems.length === 0 ? 0 : currentPageIndex * LIST_PAGE_SIZE + 1;
  const lastResult = Math.min((currentPageIndex + 1) * LIST_PAGE_SIZE, sortedItems.length);
  const totalItems = state.pager?.total ?? sortedItems.length;
  const hasActiveServerFilters = Object.keys(getPlatformListFilters({
    page,
    selectedStatuses,
    selectedDateFilters,
    selectedSprints,
    selectedTagFilters,
    larkTicketQuickFilter,
    workitemTypeFilter,
    noSprintFilter,
  })).length > 0;

  filterStateRef.current = {
    selectedStatuses,
    selectedDateFilters,
    selectedSprints,
    noSprintFilter,
    selectedTagFilters,
    tagSidebarOpen,
    githubQuickFilter,
    larkTicketQuickFilter,
    workitemTypeFilter,
    sort,
    larkGroupBy,
    larkSubGroupBy,
    larkViewMode,
    larkShowEmptyGroups,
    larkVisibleColumns,
    collapsedLarkGroups,
    collapsedLarkSubgroups,
    meegleGroupBy,
    meegleSubGroupBy,
    meegleViewMode,
    meegleShowEmptyGroups,
    meegleVisibleColumns,
    collapsedMeegleGroups,
    collapsedMeegleSubgroups,
    githubGroupBy,
    githubSubGroupBy,
    githubViewMode,
    githubShowEmptyGroups,
    githubVisibleColumns,
    collapsedGitHubGroups,
    collapsedGitHubSubgroups,
    pageIndex,
  };

  useEffect(() => () => onPlatformListFilterStateChange?.(page, filterStateRef.current), [onPlatformListFilterStateChange, page]);

  useEffect(() => {
    let active = true;
    const requestVersion = ++dataRequestVersionRef.current;
    setState((current) => ({
      status: "loading",
      items: [],
      filterItems: current.filterItemsPage === page ? current.filterItems : [],
      filterItemsPage: page,
      sprints: current.sprints,
      pager: null,
      isLoadingMore: false,
    }));
    const filters = getPlatformListFilters({
      page,
      selectedStatuses,
      selectedDateFilters,
      selectedSprints,
      selectedTagFilters,
      larkTicketQuickFilter,
      workitemTypeFilter,
      noSprintFilter,
    });
    const isFiltered = Object.keys(filters).length > 0;
    void getPlatformDataListPage({ apiBaseUrl, kind: page, filters }).then(
      (result) => {
        if (!active || dataRequestVersionRef.current !== requestVersion) return;
        setState((current) => ({
          status: "ready",
          items: result.items,
          filterItems: isFiltered && current.filterItemsPage === page && current.filterItems.length ? current.filterItems : result.items,
          filterItemsPage: page,
          sprints: result.sprints || [],
          pager: result.pager,
          isLoadingMore: false,
        }));
      },
      () => { if (active && dataRequestVersionRef.current === requestVersion) setState((current) => ({ status: "error", items: [], filterItems: current.filterItems, filterItemsPage: current.filterItemsPage, sprints: [], pager: null, isLoadingMore: false })); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, larkTicketQuickFilter, noSprintFilter, page, reloadVersion, selectedDateFilters, selectedSprints, selectedStatuses, selectedTagFilters, workitemTypeFilter]);

  async function loadMorePlatformItems() {
    const pager = state.pager;
    if (!pager?.hasMore || state.isLoadingMore || !Number.isInteger(pager.nextOffset)) return;
    const requestVersion = dataRequestVersionRef.current;
    const nextOffset = pager.nextOffset;
    setState((current) => ({ ...current, isLoadingMore: true }));
    const filters = getPlatformListFilters({
      page,
      selectedStatuses,
      selectedDateFilters,
      selectedSprints,
      selectedTagFilters,
      larkTicketQuickFilter,
      workitemTypeFilter,
      noSprintFilter,
    });
    try {
      const result = await getPlatformDataListPage({ apiBaseUrl, kind: page, filters, offset: nextOffset });
      if (dataRequestVersionRef.current !== requestVersion) return;
      setState((current) => current.pager?.nextOffset !== nextOffset ? current : {
        ...current,
        items: [...current.items, ...result.items],
        sprints: result.sprints || current.sprints,
        pager: result.pager,
        isLoadingMore: false,
      });
    } catch {
      if (dataRequestVersionRef.current === requestVersion) {
        setState((current) => ({ ...current, isLoadingMore: false }));
      }
    }
  }

  useEffect(() => {
    if (page !== "lark-tickets" || !larkGroups.some((group) => group.subgroups?.length)) {
      return;
    }
    const configKey = `${larkGroupBy}:${larkSubGroupBy}:${larkShowEmptyGroups}`;
    if (larkSubgroupDefaultsRef.current === "restored") {
      larkSubgroupDefaultsRef.current = configKey;
      return;
    }
    if (larkSubgroupDefaultsRef.current === configKey) {
      return;
    }
    larkSubgroupDefaultsRef.current = configKey;
    setCollapsedLarkSubgroups(getDefaultCollapsedSubgroupKeys(larkGroups));
  }, [larkGroupBy, larkGroups, larkShowEmptyGroups, larkSubGroupBy, page]);

  useEffect(() => {
    if (page !== "meegle-workitems" || !meegleGroups.some((group) => group.subgroups?.length)) {
      return;
    }
    const configKey = `${meegleGroupBy}:${meegleSubGroupBy}:${meegleShowEmptyGroups}`;
    if (meegleSubgroupDefaultsRef.current === "restored") {
      meegleSubgroupDefaultsRef.current = configKey;
      return;
    }
    if (meegleSubgroupDefaultsRef.current === configKey) {
      return;
    }
    meegleSubgroupDefaultsRef.current = configKey;
    setCollapsedMeegleSubgroups(getDefaultCollapsedSubgroupKeys(meegleGroups));
  }, [meegleGroupBy, meegleGroups, meegleShowEmptyGroups, meegleSubGroupBy, page]);

  useEffect(() => {
    if (page !== "github-pull-requests" || !githubGroups.some((group) => group.subgroups?.length)) {
      return;
    }
    const configKey = `${githubGroupBy}:${githubSubGroupBy}:${githubShowEmptyGroups}`;
    if (githubSubgroupDefaultsRef.current === "restored") {
      githubSubgroupDefaultsRef.current = configKey;
      return;
    }
    if (githubSubgroupDefaultsRef.current === configKey) {
      return;
    }
    githubSubgroupDefaultsRef.current = configKey;
    setCollapsedGitHubSubgroups(getDefaultCollapsedSubgroupKeys(githubGroups));
  }, [githubGroupBy, githubGroups, githubShowEmptyGroups, githubSubGroupBy, page]);

  async function resetAllDevopsCache() {
    setResetError("");
    setIsResettingDevopsCache(true);
    try {
      await resetAllOdooDevopsBranchesCache({
        apiBaseUrl,
        actionRunId: crypto.randomUUID(),
      });
      setReloadVersion((version) => version + 1);
    } catch {
      setResetError("DevOps 缓存重置失败，请稍后重试。");
    } finally {
      setIsResettingDevopsCache(false);
    }
  }

  async function openGitHubPullRequestPreview(candidate, { force = false } = {}) {
    const key = `${apiBaseUrl}:${candidate.owner}/${candidate.repo}#${candidate.pullNumber}`;
    const cached = force ? undefined : githubPreviewCacheRef.current.get(key);
    if (cached) {
      setGitHubPreview({ key, status: "ready", pullRequest: cached });
      return;
    }

    const requestVersion = ++githubPreviewRequestVersionRef.current;
    setGitHubPreview({ key, status: "loading", pullRequest: candidate });
    try {
      const pullRequest = await getGitHubPullRequestPreview({
        apiBaseUrl,
        owner: candidate.owner,
        repo: candidate.repo,
        pullNumber: candidate.pullNumber,
      });
      githubPreviewCacheRef.current.set(key, pullRequest);
      if (requestVersion === githubPreviewRequestVersionRef.current) {
        setGitHubPreview({ key, status: "ready", pullRequest });
      }
    } catch {
      if (requestVersion === githubPreviewRequestVersionRef.current) {
        setGitHubPreview({ key, status: "error", pullRequest: candidate });
      }
    }
  }

  function closeGitHubPullRequestPreview() {
    githubPreviewRequestVersionRef.current += 1;
    setGitHubPreview(null);
  }

  useKeyboardShortcut({
    key: "Escape",
    enabled: filterOpen || viewConfigOpen || Boolean(githubPreview),
    allowInEditableTarget: true,
    handler: (event) => {
      event.preventDefault();
      setFilterOpen(false);
      setActiveFilterField(null);
      setViewConfigOpen(false);
      closeGitHubPullRequestPreview();
    },
  });

  useKeyboardShortcut({
    key: " ",
    enabled: page === "github-pull-requests" && Boolean(githubPreviewCandidate) && !githubPreview,
    handler: (event) => {
      event.preventDefault();
      void openGitHubPullRequestPreview(githubPreviewCandidate);
    },
  });

  function updateSort(key) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPageIndex(0);
  }

  function updateMeegleViewSort(nextSort) {
    setSort(normalizeMeegleSort(nextSort));
    setPageIndex(0);
  }

  function updateLarkViewSort(nextSort) {
    setSort(normalizeLarkTicketSort(nextSort));
    setPageIndex(0);
  }

  function updateGitHubViewSort(nextSort) {
    setSort(normalizeGitHubPullRequestSort(nextSort));
    setPageIndex(0);
  }

  function toggleLarkColumn(key) {
    setLarkVisibleColumns((current) => normalizeLarkTicketVisibleColumns(current.includes(key)
      ? current.filter((columnKey) => columnKey !== key)
      : [...current, key]));
  }

  function toggleMeegleColumn(key) {
    setMeegleVisibleColumns((current) => normalizeMeegleVisibleColumns(current.includes(key)
      ? current.filter((columnKey) => columnKey !== key)
      : [...current, key]));
  }

  function toggleGitHubColumn(key) {
    setGitHubVisibleColumns((current) => normalizeGitHubPullRequestVisibleColumns(current.includes(key)
      ? current.filter((columnKey) => columnKey !== key)
      : [...current, key]));
  }

  function toggleStatusFilter(status) {
    setSelectedStatuses((current) => {
      const selected = current ?? statusFilters;
      return selected.includes(status) ? selected.filter((item) => item !== status) : [...selected, status];
    });
    setPageIndex(0);
  }

  function resetListFilters() {
    setSelectedStatuses(null);
    setSelectedDateFilters([]);
    setSelectedSprints([]);
    setNoSprintFilter(false);
    setSelectedTagFilters({});
    setGithubQuickFilter("all");
    setLarkTicketQuickFilter("all");
    setWorkitemTypeFilter("all");
    setPageIndex(0);
  }

  function toggleTagFilter(fieldKey, value) {
    setSelectedTagFilters((current) => ({
      ...current,
      [fieldKey]: toggleFilterValue(current[fieldKey] || [], value),
    }));
    setPageIndex(0);
  }

  const listFilterFields = [
    {
      key: "status",
      label: "状态",
      values: statusFilters.map((status) => ({ value: status, label: status })),
      selectedValues: selectedStatuses ?? statusFilters,
      isFiltered: selectedStatuses !== null,
      onToggle: toggleStatusFilter,
    },
    {
      key: "updated-at",
      label: "更新时间",
      values: DATE_FILTERS.map(([value, label]) => ({ value, label })),
      selectedValues: selectedDateFilters,
      isFiltered: selectedDateFilters.length > 0,
      onToggle: (value) => {
        setSelectedDateFilters((current) => toggleFilterValue(current, value));
        setPageIndex(0);
      },
    },
    ...(page === "meegle-workitems" ? [{
      key: "sprint",
      label: "Sprint",
      values: state.sprints.map((sprint) => ({ value: sprint, label: sprint })),
      selectedValues: selectedSprints,
      isFiltered: selectedSprints.length > 0,
      onToggle: (value) => {
        setSelectedSprints((current) => toggleFilterValue(current, value));
        setNoSprintFilter(false);
        setSelectedStatuses(null);
        setPageIndex(0);
      },
    }] : []),
  ];

  return <WorkspaceShell user={profile.user ?? {}} workspaceAccess={profile.workspaceAccess} activePage={page} onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main list-page">
      <section className="list-section">
        {state.status === "loading" ? <p className="list-message">正在加载同步数据…</p> : null}
        {state.status === "error" ? <p className="list-message list-message--error">同步数据暂时无法读取，请稍后重试。</p> : null}
        {resetError ? <p className="list-message list-message--error">{resetError}</p> : null}
        {state.status === "ready" && state.items.length === 0 ? <p className="list-message">{hasActiveServerFilters ? "未找到匹配的数据，请调整筛选条件。" : "暂无已同步的数据。"}</p> : null}
        {state.status === "ready" ? <div className="list-toolbar">
          {page === "meegle-workitems" ? <div className="list-filter-tabs" role="group" aria-label="按工作项类型筛选">
            {MEEGLE_WORKITEM_TYPE_FILTERS.map(([value, label]) => <button
              className={`list-filter-tab ${workitemTypeFilter === value ? "list-filter-tab--active" : ""}`.trim()}
              type="button"
              key={value}
              onClick={() => { setWorkitemTypeFilter(value); setPageIndex(0); }}
            >{label} {workitemTypeCounts[value]}</button>)}
            <button
              className={`list-filter-tab ${noSprintFilter ? "list-filter-tab--active" : ""}`.trim()}
              type="button"
              onClick={() => {
                setNoSprintFilter((enabled) => !enabled);
                setSelectedSprints([]);
                setPageIndex(0);
              }}
            >No Sprint</button>
          </div> : null}
          {page === "github-pull-requests" ? <div className="list-filter-tabs" role="group" aria-label="GitHub PR 快速筛选">
            {["open", "mine", "my-open"].map((filter) => <button
              className={`list-filter-tab ${githubQuickFilter === filter ? "list-filter-tab--active" : ""}`.trim()}
              type="button"
              key={filter}
              disabled={filter !== "open" && !githubId}
              title={filter !== "open" && !githubId ? "请先在 Integrations 关联 GitHub ID" : undefined}
              onClick={() => { setGithubQuickFilter((current) => current === filter ? "all" : filter); setPageIndex(0); }}
            >{filter === "open" ? "Open" : filter === "mine" ? "Mine" : `My Open ${myOpenPullRequestCount}`}</button>)}
          </div> : null}
          {page === "lark-tickets" ? <div className="list-filter-tabs" role="group" aria-label="Lark Ticket 快速筛选">
            {["in-progress", "unclassified", "unsynced"].map((filter) => <button
              className={`list-filter-tab ${larkTicketQuickFilter === filter ? "list-filter-tab--active" : ""}`.trim()}
              type="button"
              key={filter}
              onClick={() => { setLarkTicketQuickFilter((current) => current === filter ? "all" : filter); setPageIndex(0); }}
            >{filter === "in-progress" ? "进行中" : filter === "unclassified" ? "未分类" : "未同步"}</button>)}
          </div> : null}
          <div className="list-toolbar__actions">
            {page === "github-pull-requests" ? <button className="secondary-button" type="button" disabled={isResettingDevopsCache} onClick={resetAllDevopsCache}>{isResettingDevopsCache ? "清除中…" : "清除 DevOps 缓存"}</button> : null}
            <div className="list-view-menu">
              <button
                className={`list-filter-button ${viewConfigOpen ? "list-filter-button--active" : ""}`.trim()}
                type="button"
                aria-label={`配置${page === "lark-tickets" ? " Lark Ticket" : page === "meegle-workitems" ? " Meegle" : " GitHub PR"}列表视图`}
                aria-expanded={viewConfigOpen}
                onClick={() => {
                  setFilterOpen(false);
                  setViewConfigOpen((open) => !open);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1a1 1 0 0 1 1 1v1h10a1 1 0 1 1 0 2H4v1a1 1 0 1 1-2 0V5H1a1 1 0 1 1 0-2h1V2a1 1 0 0 1 1-1Zm10 8a1 1 0 0 1 1 1v1h1a1 1 0 1 1 0 2h-1v1a1 1 0 1 1-2 0v-1H1a1 1 0 1 1 0-2h11v-1a1 1 0 0 1 1-1ZM8 5a1 1 0 0 1 1 1v1h6a1 1 0 1 1 0 2H9v1a1 1 0 1 1-2 0V9H1a1 1 0 1 1 0-2h6V6a1 1 0 0 1 1-1Z" /></svg>
              </button>
              {viewConfigOpen ? page === "lark-tickets" ? <ListViewConfigPanel
                idPrefix="lark-ticket"
                columns={LARK_TICKET_VIEW_COLUMNS}
                groupOptions={LARK_TICKET_GROUP_OPTIONS}
                viewMode={larkViewMode}
                onViewModeChange={setLarkViewMode}
                groupBy={larkGroupBy}
                onGroupByChange={(value) => {
                  const nextGroupBy = normalizeLarkTicketGroupBy(value);
                  setLarkGroupBy(nextGroupBy);
                  setLarkSubGroupBy((current) => normalizeLarkTicketSubGroupBy(current, nextGroupBy));
                  setCollapsedLarkGroups([]);
                  setCollapsedLarkSubgroups([]);
                  setPageIndex(0);
                }}
                subGroupBy={larkSubGroupBy}
                onSubGroupByChange={(value) => {
                  setLarkSubGroupBy(normalizeLarkTicketSubGroupBy(value, larkGroupBy));
                  setCollapsedLarkGroups([]);
                  setCollapsedLarkSubgroups([]);
                }}
                showEmptyGroups={larkShowEmptyGroups}
                onShowEmptyGroupsChange={setLarkShowEmptyGroups}
                sort={sort}
                onSortChange={updateLarkViewSort}
                visibleColumns={larkVisibleColumns}
                onToggleColumn={toggleLarkColumn}
                onReset={() => {
                  setLarkViewMode("list");
                  setLarkGroupBy("status");
                  setLarkSubGroupBy("none");
                  setLarkShowEmptyGroups(false);
                  setSort({ ...DEFAULT_LARK_TICKET_SORT });
                  setLarkVisibleColumns([...DEFAULT_LARK_TICKET_VISIBLE_COLUMNS]);
                  setCollapsedLarkGroups([]);
                  setCollapsedLarkSubgroups([]);
                  setPageIndex(0);
                }}
              /> : page === "meegle-workitems" ? <ListViewConfigPanel
                idPrefix="meegle"
                columns={MEEGLE_VIEW_COLUMNS}
                groupOptions={MEEGLE_GROUP_OPTIONS}
                viewMode={meegleViewMode}
                onViewModeChange={setMeegleViewMode}
                groupBy={meegleGroupBy}
                onGroupByChange={(value) => {
                  const nextGroupBy = normalizeMeegleGroupBy(value);
                  setMeegleGroupBy(nextGroupBy);
                  setMeegleSubGroupBy((current) => normalizeMeegleSubGroupBy(current, nextGroupBy));
                  setCollapsedMeegleGroups([]);
                  setCollapsedMeegleSubgroups([]);
                  setPageIndex(0);
                }}
                subGroupBy={meegleSubGroupBy}
                onSubGroupByChange={(value) => {
                  setMeegleSubGroupBy(normalizeMeegleSubGroupBy(value, meegleGroupBy));
                  setCollapsedMeegleGroups([]);
                  setCollapsedMeegleSubgroups([]);
                }}
                showEmptyGroups={meegleShowEmptyGroups}
                onShowEmptyGroupsChange={setMeegleShowEmptyGroups}
                sort={sort}
                onSortChange={updateMeegleViewSort}
                visibleColumns={meegleVisibleColumns}
                onToggleColumn={toggleMeegleColumn}
                onReset={() => {
                  setMeegleViewMode("list");
                  setMeegleGroupBy("status");
                  setMeegleSubGroupBy("none");
                  setMeegleShowEmptyGroups(false);
                  setSort(DEFAULT_SORT);
                  setMeegleVisibleColumns([...DEFAULT_MEEGLE_VISIBLE_COLUMNS]);
                  setCollapsedMeegleGroups([]);
                  setCollapsedMeegleSubgroups([]);
                  setPageIndex(0);
                }}
              /> : <ListViewConfigPanel
                idPrefix="github-pull-request"
                columns={GITHUB_PULL_REQUEST_VIEW_COLUMNS}
                groupOptions={GITHUB_PULL_REQUEST_GROUP_OPTIONS}
                viewMode={githubViewMode}
                onViewModeChange={setGitHubViewMode}
                groupBy={githubGroupBy}
                onGroupByChange={(value) => {
                  const nextGroupBy = normalizeGitHubPullRequestGroupBy(value);
                  setGitHubGroupBy(nextGroupBy);
                  setGitHubSubGroupBy((current) => normalizeGitHubPullRequestSubGroupBy(current, nextGroupBy));
                  setCollapsedGitHubGroups([]);
                  setCollapsedGitHubSubgroups([]);
                  setPageIndex(0);
                }}
                subGroupBy={githubSubGroupBy}
                onSubGroupByChange={(value) => {
                  setGitHubSubGroupBy(normalizeGitHubPullRequestSubGroupBy(value, githubGroupBy));
                  setCollapsedGitHubGroups([]);
                  setCollapsedGitHubSubgroups([]);
                }}
                showEmptyGroups={githubShowEmptyGroups}
                onShowEmptyGroupsChange={setGitHubShowEmptyGroups}
                sort={sort}
                onSortChange={updateGitHubViewSort}
                visibleColumns={githubVisibleColumns}
                onToggleColumn={toggleGitHubColumn}
                onReset={() => {
                  setGitHubViewMode("list");
                  setGitHubGroupBy("status");
                  setGitHubSubGroupBy("none");
                  setGitHubShowEmptyGroups(false);
                  setSort({ ...DEFAULT_GITHUB_PULL_REQUEST_SORT });
                  setGitHubVisibleColumns([...DEFAULT_GITHUB_PULL_REQUEST_VISIBLE_COLUMNS]);
                  setCollapsedGitHubGroups([]);
                  setCollapsedGitHubSubgroups([]);
                  setPageIndex(0);
                }}
              /> : null}
            </div>
            <div className="list-filter-menu">
              <button className={`list-filter-button ${filterOpen ? "list-filter-button--active" : ""}`.trim()} type="button" aria-label="筛选" aria-expanded={filterOpen} onClick={() => {
                setViewConfigOpen(false);
                setFilterOpen((open) => {
                  const next = !open;
                  if (next) setActiveFilterField(null);
                  return next;
                });
              }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2H1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm4 4a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" /></svg>
              </button>
              {filterOpen ? <ListFilterPanel
                fields={listFilterFields}
                activeFieldKey={activeFilterField}
                onActiveFieldChange={setActiveFilterField}
                fieldQuery={filterFieldQuery}
                onFieldQueryChange={setFilterFieldQuery}
                valueQuery={filterValueQuery}
                onValueQueryChange={setFilterValueQuery}
                onReset={resetListFilters}
              /> : null}
            </div>
            {tagFilterFields.length ? <button
              className={`list-filter-button ${tagSidebarOpen ? "list-filter-button--active" : ""}`.trim()}
              type="button"
              aria-label="显示标签筛选侧栏"
              aria-expanded={tagSidebarOpen}
              title="显示标签筛选侧栏"
              onClick={() => setTagSidebarOpen((open) => !open)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2V2Zm2 2v8h4V4H4Zm6 0v8h2V4h-2Z" /></svg>
            </button> : null}
          </div>
        </div> : null}
        {state.status === "ready" && state.items.length > 0 && filteredItems.length === 0 && !canShowConfiguredEmptyGroups ? <p className="list-message">未找到匹配的数据。</p> : null}
        {state.status === "ready" && state.items.length > 0 ? <div className={`list-results-layout ${tagSidebarOpen && tagFilterFieldsWithCounts.length ? "list-results-layout--with-sidebar" : ""}`.trim()}>
          <div className="list-results-layout__main">
          {filteredItems.length > 0 || canShowConfiguredEmptyGroups ? <>
          {isLarkBoard ? <>
            <KanbanBoard
              groups={larkGroups}
              collapsedSubgroups={collapsedLarkSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedLarkSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderCard={(item, index) => <LarkTicketCard item={item} visibleColumns={larkVisibleColumns} key={item.recordId || `${item.baseId || "base"}-${item.tableId || "table"}-${index}`} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {larkGroups.length} 个分组</p>
            </footer>
          </> : isMeegleBoard ? <>
            <KanbanBoard
              groups={meegleGroups}
              collapsedSubgroups={collapsedMeegleSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedMeegleSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderCard={(item) => <MeegleWorkitemCard item={item} visibleColumns={meegleVisibleColumns} key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {meegleGroups.length} 个分组</p>
            </footer>
          </> : isGitHubBoard ? <>
            <KanbanBoard
              groups={githubGroups}
              collapsedSubgroups={collapsedGitHubSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedGitHubSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderCard={(item) => <GitHubPullRequestCard item={item} visibleColumns={githubVisibleColumns} onPreviewCandidateChange={setGitHubPreviewCandidate} key={`${item.owner}-${item.repo}-${item.pullNumber}`} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {githubGroups.length} 个分组</p>
            </footer>
          </> : isLarkGrouped ? <>
            <GroupedList
              groups={larkGroups}
              collapsedGroups={collapsedLarkGroups}
              onToggleGroup={(groupKey) => setCollapsedLarkGroups((current) => current.includes(groupKey)
                ? current.filter((key) => key !== groupKey)
                : [...current, groupKey])}
              collapsedSubgroups={collapsedLarkSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedLarkSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderTable={(items) => <LarkTicketsTable items={items} sort={sort} onSort={updateSort} visibleColumns={larkVisibleColumns} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {larkGroups.length} 个分组</p>
            </footer>
          </> : isMeegleGrouped ? <>
            <GroupedList
              groups={meegleGroups}
              collapsedGroups={collapsedMeegleGroups}
              onToggleGroup={(groupKey) => setCollapsedMeegleGroups((current) => current.includes(groupKey)
                ? current.filter((key) => key !== groupKey)
                : [...current, groupKey])}
              collapsedSubgroups={collapsedMeegleSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedMeegleSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderTable={(items) => <MeegleWorkitemsTable items={items} sort={sort} onSort={updateSort} visibleColumns={meegleVisibleColumns} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {meegleGroups.length} 个分组</p>
            </footer>
          </> : isGitHubGrouped ? <>
            <GroupedList
              groups={githubGroups}
              collapsedGroups={collapsedGitHubGroups}
              onToggleGroup={(groupKey) => setCollapsedGitHubGroups((current) => current.includes(groupKey)
                ? current.filter((key) => key !== groupKey)
                : [...current, groupKey])}
              collapsedSubgroups={collapsedGitHubSubgroups}
              onToggleSubgroup={(subgroupKey) => setCollapsedGitHubSubgroups((current) => current.includes(subgroupKey)
                ? current.filter((key) => key !== subgroupKey)
                : [...current, subgroupKey])}
              renderTable={(items) => <GitHubPullRequestsTable items={items} sort={sort} onSort={updateSort} visibleColumns={githubVisibleColumns} onPreviewCandidateChange={setGitHubPreviewCandidate} />}
            />
            <footer className="list-pagination">
              <p className="list-results">已加载 <strong>{sortedItems.length}</strong> / {totalItems} 条结果 · {githubGroups.length} 个分组</p>
            </footer>
          </> : <>
            <div className="data-table-wrap"><SyncedListTable kind={page} items={pageItems} sort={sort} onSort={updateSort} larkVisibleColumns={larkVisibleColumns} meegleVisibleColumns={meegleVisibleColumns} githubVisibleColumns={githubVisibleColumns} onGitHubPreviewCandidateChange={setGitHubPreviewCandidate} /></div>
            <footer className="list-pagination">
              <p className="list-results">显示 <strong>{firstResult}–{lastResult}</strong> / 已加载 {sortedItems.length}（共 {totalItems}）条结果</p>
              <div className="list-pagination__controls">
                <button type="button" disabled={currentPageIndex === 0} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>上一页</button>
                <span>{currentPageIndex + 1} / {pageCount}</span>
                <button type="button" disabled={currentPageIndex >= pageCount - 1} onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}>下一页</button>
              </div>
            </footer>
          </>}
          </> : null}
          <LoadMoreResults pager={state.pager} loaded={state.items.length} isLoading={state.isLoadingMore} onLoadMore={loadMorePlatformItems} />
          </div>
          {tagSidebarOpen && tagFilterFieldsWithCounts.length ? <TagFilterSidebar
            fields={tagFilterFieldsWithCounts}
            activeFieldKey={activeTagFilterField}
            selectedValues={selectedTagFilters}
            onActiveFieldChange={setActiveTagFilterField}
            onToggle={toggleTagFilter}
            onReset={() => {
              setSelectedTagFilters({});
              setPageIndex(0);
            }}
          /> : null}
        </div> : null}
      </section>
      {githubPreview ? <GitHubPullRequestPreviewModal
        preview={githubPreview}
        onClose={closeGitHubPullRequestPreview}
        onRetry={() => { void openGitHubPullRequestPreview(githubPreview.pullRequest, { force: true }); }}
      /> : null}
    </section>
  </WorkspaceShell>;
}
