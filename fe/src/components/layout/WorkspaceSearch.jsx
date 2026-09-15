import { createContext, useContext, useEffect, useRef, useState } from "react";
import { searchPlatformData } from "../../services/platform-data/platform-search-api.js";
import { getPlatformSearchKey, getPlatformSearchTarget, PLATFORM_SEARCH_TYPES } from "../../lib/platform-search.js";
import { getLarkTicketBadgeTone } from "../../lib/lark-ticket-badges.js";
import { getMeegleStatusTone } from "../../lib/platform-list-rows.js";

const SearchContext = createContext(null);

function SearchIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>;
}

function SearchStatusIcon({ item }) {
  const normalized = item.status?.trim().toLowerCase();
  let tone = normalized === "merged" ? "completed" : getLarkTicketBadgeTone("status", item.status);
  if (tone === "default" && item.kind === "meegle-workitems") tone = getMeegleStatusTone(item.status);
  return <span className={`workspace-search-status-icon workspace-search-status-icon--${tone}`} title={item.status || "未设置"}>
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" />
      {tone === "completed" ? <path className="workspace-search-status-icon__check" d="m5.2 8 1.8 1.9 3.8-4" />
        : ["cancelled", "blocked"].includes(tone) ? <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" />
          : <path d="M8 4.5V8l2.2 1.3" />}
    </svg>
  </span>;
}

export function WorkspaceSearchTrigger() {
  const open = useContext(SearchContext);
  if (!open) return null;
  return <button className="workspace-search-trigger" type="button" onClick={open} aria-haspopup="dialog">
    <SearchIcon /><span>全局搜索…</span>
  </button>;
}

export function WorkspaceSearchProvider({ apiBaseUrl, enabled, children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: "idle", items: [], hasMore: false });
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const searchQuery = query.trim();
  const matchesCurrentSearch = state.query === searchQuery && state.kind === selectedKind;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (enabled && open) { dialog.showModal(); inputRef.current?.focus(); }
    else if (dialog?.open) dialog.close();
  }, [enabled, open]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    if (!open || !enabled || !searchQuery) {
      setState({ status: "idle", items: [], hasMore: false });
      return undefined;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading", items: [], hasMore: false });
    const timer = setTimeout(() => {
      void searchPlatformData({ apiBaseUrl, query: searchQuery, kind: selectedKind || undefined, signal: controller.signal }).then(
        (data) => { if (requestRef.current === requestId) setState({ ...data, query: searchQuery, kind: selectedKind, status: "ready" }); },
        (error) => { if (requestRef.current === requestId && error.name !== "AbortError") setState({ status: "error", items: [], hasMore: false }); },
      );
    }, 300);
    return () => { clearTimeout(timer); abortRef.current?.abort(); ++requestRef.current; };
  }, [apiBaseUrl, enabled, open, searchQuery, selectedKind, retry]);

  async function loadMore() {
    if (state.status !== "ready" || !state.hasMore || !matchesCurrentSearch) return;
    const requestId = requestRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setState((current) => ({ ...current, status: "loading-more", moreError: false }));
    try {
      const data = await searchPlatformData({ apiBaseUrl, query: searchQuery, kind: selectedKind || undefined, offset: state.nextOffset, signal: controller.signal });
      if (requestRef.current === requestId) setState((current) => ({ ...data, query: searchQuery, kind: selectedKind, status: "ready", items: [...current.items, ...data.items] }));
    } catch (error) {
      if (requestRef.current === requestId && error.name !== "AbortError") setState((current) => ({ ...current, status: "ready", moreError: true }));
    }
  }

  return <SearchContext.Provider value={enabled ? () => setOpen(true) : null}>
    {children}
    {enabled ? <dialog ref={dialogRef} className="workspace-search-dialog" aria-labelledby="workspace-search-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDownCapture={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    }} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="workspace-search-panel">
        <h2 id="workspace-search-title" className="visually-hidden">全局搜索</h2>
        <header className="workspace-search-header">
          <label className="workspace-search-input"><SearchIcon /><span className="visually-hidden">搜索标题或编号</span><input ref={inputRef} type="search" maxLength={200} placeholder="搜索标题或编号…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="workspace-search-close" type="button" aria-label="关闭全局搜索" title="关闭 · Esc" onClick={() => setOpen(false)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" /></svg></button>
        </header>
        <div className="workspace-search-types" role="group" aria-label="搜索类型">
          {[["", "全部"], ...Object.entries(PLATFORM_SEARCH_TYPES)].map(([kind, label]) => <button type="button" key={kind} className="workspace-search-type-filter" aria-pressed={selectedKind === kind} onClick={() => setSelectedKind(kind)}>{label}</button>)}
        </div>
        <div className="workspace-search-results" aria-busy={state.status === "loading" || state.status === "loading-more"}>
          {!searchQuery ? <p>搜索 Lark Ticket、Meegle Workitem 和 GitHub PR。</p> : null}
          {searchQuery && (state.status === "loading" || (!matchesCurrentSearch && state.status !== "error")) ? <p role="status">正在搜索…</p> : null}
          {state.status === "error" ? <p role="alert">搜索暂时不可用。<button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></p> : null}
          {matchesCurrentSearch && state.status === "ready" && !state.items.length ? <p role="status">未找到匹配结果，请换个关键词或编号。</p> : null}
          {matchesCurrentSearch && state.items.length ? <>
            <ul aria-label="搜索结果">{state.items.map((item) => {
              const target = getPlatformSearchTarget(item);
              const number = item.number ? (item.kind === "github-pull-requests" ? `#${item.number}` : item.number) : "—";
              const title = item.title || "未命名";
              const content = <>
                <span className="workspace-search-result__number" title={number}>{number}</span>
                <SearchStatusIcon item={item} />
                <span className="workspace-search-result__main"><span className="workspace-search-result__title" title={title}>{title}</span>{item.kind === "github-pull-requests" ? <small title={item.scope}>{item.scope}</small> : null}</span>
                <span className="workspace-search-result__type">{PLATFORM_SEARCH_TYPES[item.kind]}</span>
                <span className="workspace-search-result__status" title={item.status || "未设置"}>{item.status || "未设置"}</span>
              </>;
              return <li key={getPlatformSearchKey(item)}>{target ? <a className="workspace-search-result" href={target.href} target={target.external ? "_blank" : undefined} rel={target.external ? "noreferrer" : undefined} onClick={() => setOpen(false)}>{content}</a> : <div className="workspace-search-result">{content}</div>}</li>;
            })}</ul>
            {state.moreError ? <p role="alert">加载更多失败，请重试。</p> : null}
            {state.hasMore ? <button className="secondary-button workspace-search-more" type="button" disabled={state.status === "loading-more"} onClick={() => void loadMore()}>{state.status === "loading-more" ? "加载中…" : "加载更多"}</button> : null}
          </> : null}
        </div>
      </section>
    </dialog> : null}
  </SearchContext.Provider>;
}
