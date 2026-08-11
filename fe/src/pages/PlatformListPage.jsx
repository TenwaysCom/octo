import { useEffect, useState } from "react";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { formatDateTime } from "../lib/formatters.js";
import { getOdooShBuildTone } from "../lib/odoo-sh-build-status.js";
import { getPlatformDataList, resetAllOdooDevopsBranchesCache } from "../services/platform-data/platform-data-api.js";

const LIST_PAGE_SIZE = 50;
const DATE_FILTERS = [
  ["all-time", "全部时间"],
  ["today", "今天"],
  ["last-7-days", "最近 7 天"],
  ["last-month", "最近一个月"],
  ["last-12-months", "最近一年"],
];
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

function StatusPill({ children }) {
  return <span className="list-status">{children || "-"}</span>;
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

function OdooShBuildDots({ builds }) {
  if (!builds?.length) {
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

function GitHubPullRequestLinks({ pullRequests }) {
  if (!pullRequests?.length) {
    return "-";
  }
  return <div className="github-pr-links">{pullRequests.map((pullRequest) => <div className="github-pr-links__item" key={`${pullRequest.owner}-${pullRequest.repo}-${pullRequest.pullNumber}`}>
    <ExternalLink className={`github-pr-link-badge github-pr-link-badge--${pullRequest.state}`} href={pullRequest.htmlUrl} title={`${pullRequest.owner}/${pullRequest.repo} #${pullRequest.pullNumber}\n${pullRequest.title}\n${pullRequest.state}`}>#{pullRequest.pullNumber}-{pullRequest.baseRef || "-"}</ExternalLink>
    <OdooShBuildDots builds={pullRequest.odooShBuilds} />
  </div>)}</div>;
}

function filterPlatformItems(items, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => Object.values(item).some((value) => String(value ?? "")
    .toLocaleLowerCase()
    .includes(normalizedQuery)));
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

function getMeegleWorkitemDetailUrl(item) {
  const urlSlugByCategory = {
    story: "story",
    "tech-task": "techtask",
    bug: "production_bug",
  };
  const urlSlug = urlSlugByCategory[getMeegleWorkitemCategory(item)] || item.workItemTypeKey;
  return `https://project.larksuite.com/${encodeURIComponent(item.projectKey)}/${encodeURIComponent(urlSlug)}/detail/${encodeURIComponent(item.workItemId)}`;
}

function matchesDateFilter(item, dateFilter) {
  if (dateFilter === "all-time") {
    return true;
  }

  const updatedAt = new Date(item.sourceUpdatedAt || item.syncedAt || "");
  if (Number.isNaN(updatedAt.getTime())) {
    return false;
  }

  const now = new Date();
  const threshold = new Date(now);
  if (dateFilter === "today") {
    threshold.setHours(0, 0, 0, 0);
  } else if (dateFilter === "last-7-days") {
    threshold.setDate(now.getDate() - 7);
  } else if (dateFilter === "last-month") {
    threshold.setMonth(now.getMonth() - 1);
  } else {
    threshold.setFullYear(now.getFullYear() - 1);
  }
  return updatedAt >= threshold;
}

function readSortValue(kind, item, key) {
  if (key === "updatedAt") {
    return item.sourceUpdatedAt || item.syncedAt || "";
  }
  if (kind === "lark-tickets") {
    return key === "status" ? item.ticketStatus || "" : key === "source" ? `${item.baseId || ""}/${item.tableId || ""}` : item.title || "";
  }
  if (kind === "meegle-workitems") {
    const values = {
      workitem: item.workItemKey || item.workItemId || item.title || "",
      workitemType: item.workItemType || item.workItemTypeKey || "",
      status: item.status || "",
      sprintVersion: `${item.sprint || ""} ${item.version || ""}`,
      system: item.system || "",
      assignee: item.assignee || "",
    };
    return values[key] || "";
  }
  const values = {
    pullRequest: item.pullNumber || item.title || "",
    repo: `${item.owner || ""}/${item.repo || ""}`,
    status: item.isDraft ? "Draft" : item.state || "",
    branch: item.headRef || "",
  };
  return values[key] || "";
}

function sortPlatformItems(items, kind, sort) {
  return [...items].sort((left, right) => {
    const leftValue = readSortValue(kind, left, sort.key);
    const rightValue = readSortValue(kind, right, sort.key);
    if (!leftValue && rightValue) return 1;
    if (leftValue && !rightValue) return -1;
    const comparison = sort.key === "updatedAt"
      ? new Date(leftValue).getTime() - new Date(rightValue).getTime()
      : String(leftValue).localeCompare(String(rightValue), "zh-CN", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  });
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

function SyncedListTable({ kind, items, sort, onSort }) {
  if (kind === "lark-tickets") {
    return <table className="data-table"><thead><tr><th><SortableColumnHeader label="Ticket" sortKey="title" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="状态" sortKey="status" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="来源" sortKey="source" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="更新时间" sortKey="updatedAt" sort={sort} onSort={onSort} /></th></tr></thead><tbody>
      {items.map((item) => <tr key={`${item.baseId}-${item.tableId}-${item.recordId}`}><td><ExternalLink href={item.sharedUrl}>{item.title}</ExternalLink><small>{item.recordId}</small></td><td><StatusPill>{item.ticketStatus}</StatusPill></td><td>{item.baseId} / {item.tableId}</td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
    </tbody></table>;
  }

  if (kind === "meegle-workitems") {
    return <table className="data-table"><thead><tr><th><SortableColumnHeader label="工作项" sortKey="workitem" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="类型" sortKey="workitemType" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="状态" sortKey="status" sort={sort} onSort={onSort} /></th><th>关联 PR</th><th><SortableColumnHeader label="Sprint / Version" sortKey="sprintVersion" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="System" sortKey="system" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="负责人" sortKey="assignee" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="更新时间" sortKey="updatedAt" sort={sort} onSort={onSort} /></th></tr></thead><tbody>
      {items.map((item) => <tr key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`}><td><ExternalLink href={getMeegleWorkitemDetailUrl(item)}>{item.workItemKey || item.workItemId}</ExternalLink><small>{item.title}</small></td><td><span className={`workitem-type-badge workitem-type-badge--${getMeegleWorkitemCategory(item)}`}>{item.workItemType || item.workItemTypeKey}</span></td><td><MeegleStatusPill status={item.status} /><small>{item.subStage || ""}</small></td><td><GitHubPullRequestLinks pullRequests={item.githubPullRequests} /></td><td>{item.sprint || "-"}<small>{item.version || "-"}</small></td><td>{item.system || "-"}</td><td>{item.assignee || "-"}</td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
    </tbody></table>;
  }

  return <table className="data-table"><thead><tr><th><SortableColumnHeader label="Pull Request" sortKey="pullRequest" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="仓库" sortKey="repo" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="状态" sortKey="status" sort={sort} onSort={onSort} /></th><th><SortableColumnHeader label="分支" sortKey="branch" sort={sort} onSort={onSort} /></th><th>Author</th><th>Merged by</th><th>Reviewer</th><th>Label</th><th><SortableColumnHeader label="更新时间" sortKey="updatedAt" sort={sort} onSort={onSort} /></th></tr></thead><tbody>
    {items.map((item) => <tr key={`${item.owner}-${item.repo}-${item.pullNumber}`}><td><ExternalLink href={item.htmlUrl}>{item.title}</ExternalLink><small>#{item.pullNumber}</small></td><td>{item.owner} / {item.repo}</td><td><GitHubPullRequestStatus isDraft={item.isDraft} state={item.state} /></td><td><span className="github-pr-branch">{item.headRef || "-"}<OdooShBuildDots builds={item.odooShBuilds} /></span><small>{item.baseRef ? `→ ${item.baseRef}` : ""}</small></td><td><GitHubUser login={item.authorLogin} /></td><td><GitHubUser login={item.mergedBy} /></td><td><GitHubPullRequestReviewers reviewers={item.reviewers} /></td><td><GitHubPullRequestLabels labels={item.labels} /></td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
  </tbody></table>;
}

export function PlatformListPage({ profile, page, apiBaseUrl, onLogout, isBusy }) {
  const [state, setState] = useState({ status: "loading", items: [], sprints: [] });
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState(null);
  const [dateFilter, setDateFilter] = useState("all-time");
  const [sprintFilter, setSprintFilter] = useState("");
  const [noSprintFilter, setNoSprintFilter] = useState(false);
  const [workitemTypeFilter, setWorkitemTypeFilter] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [resetError, setResetError] = useState("");
  const [isResettingDevopsCache, setIsResettingDevopsCache] = useState(false);
  const statusFilters = [...new Set(state.items.map((item) => getPlatformItemStatus(page, item)))].sort((left, right) => left.localeCompare(right));
  const itemsBeforeTypeFilter = filterPlatformItems(state.items, query)
    .filter((item) => selectedStatuses === null || selectedStatuses.includes(getPlatformItemStatus(page, item)))
    .filter((item) => matchesDateFilter(item, dateFilter));
  const workitemTypeCounts = Object.fromEntries(MEEGLE_WORKITEM_TYPE_FILTERS.map(([value]) => [value, value === "all" ? itemsBeforeTypeFilter.length : itemsBeforeTypeFilter.filter((item) => getMeegleWorkitemCategory(item) === value).length]));
  const filteredItems = itemsBeforeTypeFilter
    .filter((item) => page !== "meegle-workitems" || !noSprintFilter || !item.sprint)
    .filter((item) => page !== "meegle-workitems" || workitemTypeFilter === "all" || getMeegleWorkitemCategory(item) === workitemTypeFilter);
  const sortedItems = sortPlatformItems(filteredItems, page, sort);
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / LIST_PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = sortedItems.slice(currentPageIndex * LIST_PAGE_SIZE, (currentPageIndex + 1) * LIST_PAGE_SIZE);
  const firstResult = sortedItems.length === 0 ? 0 : currentPageIndex * LIST_PAGE_SIZE + 1;
  const lastResult = Math.min((currentPageIndex + 1) * LIST_PAGE_SIZE, sortedItems.length);

  useEffect(() => {
    setQuery("");
    setSelectedStatuses(null);
    setDateFilter("all-time");
    setSprintFilter("");
    setNoSprintFilter(false);
    setWorkitemTypeFilter("all");
    setSort(DEFAULT_SORT);
    setFilterOpen(false);
    setPageIndex(0);
    setResetError("");
    setIsResettingDevopsCache(false);
  }, [page]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ status: "loading", items: [], sprints: current.sprints }));
    void getPlatformDataList({ apiBaseUrl, kind: page, sprint: sprintFilter || undefined }).then(
      (result) => { if (active) setState({ status: "ready", items: result.items, sprints: result.sprints || [] }); },
      () => { if (active) setState({ status: "error", items: [], sprints: [] }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, page, reloadVersion, sprintFilter]);

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

  return <WorkspaceShell user={profile.user ?? {}} activePage={page} onLogout={onLogout} isBusy={isBusy}>
    <section className="profile-main list-page">
      <section className="list-section">
        {state.status === "loading" ? <p className="list-message">正在加载同步数据…</p> : null}
        {state.status === "error" ? <p className="list-message list-message--error">同步数据暂时无法读取，请稍后重试。</p> : null}
        {state.status === "ready" && state.items.length === 0 ? <p className="list-message">暂无已同步的数据。</p> : null}
        {resetError ? <p className="list-message list-message--error">{resetError}</p> : null}
        {state.status === "ready" && state.items.length > 0 ? <div className="list-toolbar">
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
                setSprintFilter("");
                setPageIndex(0);
              }}
            >No Sprint</button>
          </div> : null}
          <div className="list-toolbar__actions">
            {page === "github-pull-requests" ? <button className="secondary-button" type="button" disabled={isResettingDevopsCache} onClick={resetAllDevopsCache}>{isResettingDevopsCache ? "清除中…" : "清除 DevOps 缓存"}</button> : null}
            {page === "meegle-workitems" ? <label className="list-date-filter list-sprint-filter">
              <span className="visually-hidden">按 Sprint 筛选</span>
              <select value={sprintFilter} onChange={(event) => { setSprintFilter(event.target.value); setNoSprintFilter(false); setSelectedStatuses(null); setPageIndex(0); }}>
                <option value="">全部 Sprint</option>
                {state.sprints.map((sprint) => <option value={sprint} key={sprint}>{sprint}</option>)}
              </select>
              <svg className="list-date-filter__chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg>
            </label> : null}
            <label className="list-date-filter">
              <span className="visually-hidden">按更新时间筛选</span>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1Zm10 6H2v8h12V6ZM2 4v1h12V4H2Z" /></svg>
              <select value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPageIndex(0); }}>
                {DATE_FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <svg className="list-date-filter__chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg>
            </label>
            <div className="list-filter-menu">
              <button className="list-filter-button" type="button" aria-label="筛选" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2H1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm4 4a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" /></svg>
              </button>
              {filterOpen ? <div className="list-filter-menu__panel">
                <label className="list-filter-menu__search">
                  <span className="visually-hidden">搜索当前列表</span>
                  <input type="search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }} placeholder="搜索" />
                </label>
                <fieldset className="list-status-checkboxes">
                  <legend>状态</legend>
                  {statusFilters.map((status) => <label key={status}>
                    <input
                      type="checkbox"
                      checked={selectedStatuses === null || selectedStatuses.includes(status)}
                      onChange={() => {
                        setSelectedStatuses((current) => {
                          const selected = current ?? statusFilters;
                          return selected.includes(status) ? selected.filter((item) => item !== status) : [...selected, status];
                        });
                        setPageIndex(0);
                      }}
                    />
                    {status}
                  </label>)}
                </fieldset>
              </div> : null}
            </div>
          </div>
        </div> : null}
        {state.status === "ready" && state.items.length > 0 && filteredItems.length === 0 ? <p className="list-message">未找到匹配的数据。</p> : null}
        {state.status === "ready" && filteredItems.length > 0 ? <>
          <div className="data-table-wrap"><SyncedListTable kind={page} items={pageItems} sort={sort} onSort={(key) => {
            setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
            setPageIndex(0);
          }} /></div>
          <footer className="list-pagination">
            <p className="list-results">显示 <strong>{firstResult}–{lastResult}</strong> / {sortedItems.length} 条结果</p>
            <div className="list-pagination__controls">
              <button type="button" disabled={currentPageIndex === 0} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>上一页</button>
              <span>{currentPageIndex + 1} / {pageCount}</span>
              <button type="button" disabled={currentPageIndex >= pageCount - 1} onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}>下一页</button>
            </div>
          </footer>
        </> : null}
      </section>
    </section>
  </WorkspaceShell>;
}
