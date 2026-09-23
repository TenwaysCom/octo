import { useEffect, useState } from "react";
import { getPlatformDataList } from "../services/platform-data/platform-data-api.js";
import { findLarkAppTicket, getLarkAppAnalysis, getLarkTicketAppHash, parseLarkTicketAppHash } from "../lib/lark-ticket-app.js";
import { formatDateTime } from "../lib/formatters.js";
import { getShadowStageDetails, getShadowStatusLabel } from "../lib/lark-ticket-shadow-ai.js";
import { getTicketAiShadowNotice } from "../lib/ticket-ai-sections.js";
import { getLarkTicketDetailHash } from "../app/routes/workspace-routes.js";
import { LarkTicketBadge } from "../components/lark-ticket/LarkTicketBadge.jsx";
import { LarkTicketResponsible } from "../components/lark-ticket/LarkTicketResponsible.jsx";
import "../styles/lark-ticket-app.css";

function CopyButton({ text, children = "复制", primary = false }) {
  const [status, setStatus] = useState("");
  useEffect(() => { setStatus(""); }, [text]);
  return <button type="button" className={primary ? "lark-app__primary" : ""} disabled={!text} onClick={async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("已复制");
    } catch { setStatus("复制失败，请手动选择文本"); }
  }}>{status || children}</button>;
}

function SafeLink({ href, children }) {
  try {
    const url = new URL(href);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return <a href={url.toString()} target="_blank" rel="noreferrer">{children} ↗</a>;
  } catch { return null; }
}

function AnalysisCard({ item }) {
  return <section className={`lark-app__card lark-app__card--${item.id}`}>
    <div className="lark-app__section-title"><h2>{item.title}</h2>{item.source && <span className={`lark-app__badge ${item.source === "Shadow AI" ? "lark-app__badge--shadow" : ""}`}>{item.source}</span>}</div>
    <p className={item.text ? "lark-app__text" : "lark-app__muted"}>{item.text || "暂无已有分析"}</p>
    {item.formalText && item.shadowText && item.formalText !== item.shadowText && <details>
      <summary>查看 Shadow AI 分析</summary><p className="lark-app__text">{item.shadowText}</p>
    </details>}
  </section>;
}

function ReplyReference({ answer }) {
  const [draft, setDraft] = useState(answer.text);
  return <section className="lark-app__card lark-app__reply">
    <div className="lark-app__section-title"><h2>可能的回复</h2><span className="lark-app__badge">人工整理</span></div>
    <p className="lark-app__muted">{answer.text ? `以 ${answer.source} 已有答案为参考，确认适用后再回复。` : "暂无已有答案可供引用。可自行填写回复。"}此处编辑仅保留在当前页面。</p>
    <label className="lark-app__field-label" htmlFor="lark-app-reply">回复草稿</label>
    <textarea id="lark-app-reply" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="填写或整理你准备发送的回复…" rows={5} />
    <div className="lark-app__actions"><CopyButton text={draft} primary>复制回复</CopyButton><span className="lark-app__muted">复制后自行粘贴到 thread</span></div>
  </section>;
}

function Roadmap() {
  return <details className="lark-app__card lark-app__roadmap">
    <summary>后续能力规划 <span className="lark-app__badge">未实现</span></summary>
    <p className="lark-app__muted">以下判断尚无数据支持，本版不生成结论。</p>
    <dl>
      {[
        ["对方真实意图", "结合上下文推断诉求，展示依据与不确定性，不能把推断当作事实。"],
        ["危险等级（1–9）", "需定义业务风险分级及依据；不使用答案置信度换算风险。"],
        ["对方要什么", "明确期望结果、交付物和仍需确认的信息。"],
        ["该不该马上回", "结合时限、消息状态和影响判断回复时机。"],
        ["最佳动作", "根据证据给出回复、澄清、排查或升级等下一步建议。"],
      ].map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd></div>)}
    </dl>
  </details>;
}

export function LarkTicketAppPage({ apiBaseUrl, appHash }) {
  const context = parseLarkTicketAppHash(appHash);
  const [state, setState] = useState({ status: "loading", items: [] });
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (context.invalid) return undefined;
    let active = true;
    setState({ status: "loading", items: [] });
    void getPlatformDataList({ apiBaseUrl, kind: "lark-tickets" }).then(
      ({ items }) => { if (active) setState({ status: "ready", items }); },
      () => { if (active) setState({ status: "error", items: [] }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, appHash, refresh]);

  const ticket = findLarkAppTicket(state.items, context.ref);
  const analysis = ticket ? getLarkAppAnalysis(ticket) : [];
  const shadowNotice = ticket ? getTicketAiShadowNotice(ticket.shadowAi) : "";
  const search = query.trim().toLowerCase();
  const matches = state.items.filter((item) => `${item.ticketNumber || ""} ${item.title}`.toLowerCase().includes(search));
  return <main className="lark-app">
    <header className="lark-app__header">
      <div className="lark-app__header-row"><div className="lark-app__brand"><span aria-hidden="true">✦</span><div><strong>Ticket AI</strong><small>Octo · 讨论助手</small></div></div>
        <button type="button" disabled={state.status === "loading" || context.invalid} onClick={() => setRefresh((value) => value + 1)}>刷新</button>
      </div>
      <div className="lark-app__search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setQuery(""); }} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}>
        <input id="lark-app-search" type="search" aria-label="搜索 Ticket 标题" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Ticket 标题或编号…" disabled={state.status !== "ready" || context.invalid} />
        {search && state.status === "ready" && <div className="lark-app__search-results">
          <p className="lark-app__muted" role="status">{matches.length ? `找到 ${matches.length} 个 Ticket，点击查看分析` : "没有匹配的 Ticket，请换个标题关键词。"}</p>
          <ul className="lark-app__tickets">{matches.slice(0, 20).map((item) => <li key={getLarkTicketAppHash(item)}><a href={getLarkTicketAppHash(item)} onClick={() => setQuery("")}><small>{item.ticketNumber || "未设置编号"}</small><span>{item.title}</span></a></li>)}</ul>
          {matches.length > 20 && <p className="lark-app__muted">显示前 20 条，请补充关键词缩小范围。</p>}
        </div>}
      </div>
    </header>
    <div className="lark-app__body">
      {context.invalid ? <section className="lark-app__card"><h1>入口链接不完整</h1><p>请返回搜索页选择 Ticket。</p><a href="#lark-app-thread-analysis">搜索 Ticket</a></section>
        : state.status === "loading" ? <p role="status" className="lark-app__notice">正在读取已有分析…</p>
          : state.status === "error" ? <section className="lark-app__card" role="alert"><h1>读取失败</h1><p>请检查网络及 Octo 登录状态后重试。</p><button onClick={() => setRefresh((value) => value + 1)}>重试</button><a href="#integrations">检查登录状态</a></section>
            : context.ref && !ticket ? <section className="lark-app__card"><h1>未找到此 Ticket</h1><p>该记录可能尚未同步，或你没有查看权限。</p><a href="#lark-app-thread-analysis">选择其他 Ticket</a></section>
              : !ticket ? <section className="lark-app__card">
                <h1>查看 Ticket 分析</h1><p className="lark-app__muted">在上方输入标题关键词，选择对应 Ticket 后查看已有 AI 分析。</p>
              </section> : <>
                <section className="lark-app__identity"><div className="lark-app__eyebrow">{ticket.ticketNumber || "Ticket"}</div><h1>{ticket.title}</h1>
                  <div className="lark-app__properties" aria-label="Ticket 信息">
                    <span className="lark-app__property"><span>状态</span><LarkTicketBadge kind="status" value={ticket.ticketStatus} /></span>
                    <span className="lark-app__property"><span>Issue 类型</span><LarkTicketBadge kind="type" value={ticket.issueType} /></span>
                    <span className="lark-app__property"><span>负责人</span>{ticket.responsible?.trim() ? <LarkTicketResponsible responsible={ticket.responsible} /> : <span className="lark-app__badge">未分配</span>}</span>
                    <span className="lark-app__property"><span>Business Line</span><LarkTicketBadge kind="business-line" value={ticket.businessLine} /></span>
                  </div>
                  <div className="lark-app__links"><a href={getLarkTicketDetailHash(ticket.recordId)} target="_blank" rel="noreferrer">完整详情 ↗</a><SafeLink href={ticket.larkMessageLink}>原始讨论</SafeLink></div>
                </section>
                <div className="lark-app__source-note">展示已保存分析，请结合最新讨论核对。{ticket.shadowAi && <span className="lark-app__badge lark-app__badge--shadow">Shadow · {getShadowStatusLabel(ticket.shadowAi.status)}</span>}</div>
                {shadowNotice && <p className="lark-app__notice" role="status">{shadowNotice}</p>}
                {analysis.map((item) => <AnalysisCard key={item.id} item={item} />)}
                {ticket.shadowAi?.status === "ok" && <details className="lark-app__card">
                  <summary>Shadow AI 详情 <span className="lark-app__badge lark-app__badge--shadow">自动分析</span></summary>
                  <dl className="lark-app__shadow-details">{["intent", "summary", "answer"].map((stage) => <div key={stage}>{getShadowStageDetails(ticket.shadowAi, stage).map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</div>)}</dl>
                </details>}
                <ReplyReference key={`${getLarkTicketAppHash(ticket)}:${analysis[2].text}`} answer={analysis[2]} />
                <footer className="lark-app__muted">{ticket.ticketAi?.updatedAt && <div>Ticket AI 更新：{formatDateTime(ticket.ticketAi.updatedAt)}</div>}{ticket.shadowAi?.analyzedAt && <div>Shadow 分析：{formatDateTime(ticket.shadowAi.analyzedAt)}</div>}<div>Ticket 同步：{formatDateTime(ticket.syncedAt)}</div></footer>
              </>}
      <Roadmap />
    </div>
  </main>;
}
