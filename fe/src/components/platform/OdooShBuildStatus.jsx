import { useEffect, useRef, useState } from "react";
import { getOdooShBuildTone } from "../../lib/odoo-sh-build-status.js";
import { getGitHubPullRequestOdooShBuild } from "../../services/platform-data/platform-data-api.js";

function BuildDots({ builds }) {
  if (!builds.length) return <span className="odoo-sh-build-status__empty">无构建</span>;
  return <span className="odoo-sh-build-dots" aria-label="Odoo.sh build 状态">{builds.map((build) => <span
    aria-label={`${build.environment.toUpperCase()} Odoo.sh build：${build.result || build.status || "unknown"}`}
    className="odoo-sh-build-indicator"
    key={build.environment}
    title={`${build.environment.toUpperCase()}：${build.result || build.status || "unknown"}`}
  ><span className="odoo-sh-build-indicator__environment">{build.environment.toUpperCase()}</span><span aria-hidden="true" className={`odoo-sh-build-dot odoo-sh-build-dot--${getOdooShBuildTone(build.result)}`} /></span>)}</span>;
}

function BuildGearIcon() {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}

const BUILD_GEAR_TONE_RANK = { failed: 0, warning: 1, unknown: 2, success: 3 };

// Compact build indicator: a single gear colored by the worst build result;
// the per-environment details (EU, UK, …) are merged into the tooltip.
export function OdooShBuildGears({ builds, note = "" }) {
  const entries = (builds || []).map((build) => ({
    environment: String(build.environment || "").toUpperCase(),
    result: build.result || build.status || "unknown",
    tone: getOdooShBuildTone(build.result),
  }));
  if (!entries.length) return null;
  const summary = entries.map(({ environment, result }) => `${environment}：${result}`).join("\n");
  const tone = entries.map(({ tone }) => tone).sort((left, right) => BUILD_GEAR_TONE_RANK[left] - BUILD_GEAR_TONE_RANK[right])[0];
  return <span
    aria-label={`Odoo.sh build 状态${note ? `（${note}）` : ""}：${entries.map(({ environment, result }) => `${environment} ${result}`).join("，")}`}
    className={`odoo-sh-build-gear odoo-sh-build-gear--${tone}`}
    title={note ? `${summary}\n${note}` : summary}
  ><BuildGearIcon /></span>;
}

function CompactBuildGear({ label, tone = "unknown", note = "" }) {
  return <span aria-label={label} className="odoo-sh-build-status" title={note ? `${label}\n${note}` : label}>
    <span className={`odoo-sh-build-gear odoo-sh-build-gear--${tone}`}><BuildGearIcon /></span>
  </span>;
}

export function OdooShBuildStatus({ apiBaseUrl, pullRequest, compact = false }) {
  const [status, setStatus] = useState("loading");
  const [builds, setBuilds] = useState([]);
  const retryTimerRef = useRef();

  useEffect(() => {
    let active = true;
    async function load() {
      clearTimeout(retryTimerRef.current);
      if (active) setStatus("loading");
      try {
        const result = await getGitHubPullRequestOdooShBuild({
          apiBaseUrl,
          owner: pullRequest.owner,
          repo: pullRequest.repo,
          pullNumber: pullRequest.pullNumber,
          headRef: pullRequest.headRef,
        });
        if (!active) return;
        if (result.state === "refreshing") {
          setStatus("refreshing");
          retryTimerRef.current = setTimeout(() => { void load(); }, result.retryAfterMs || 1_000);
          return;
        }
        setBuilds(result.build ? [{
          environment: result.environment,
          status: result.build.status,
          result: result.build.result,
        }] : []);
        setStatus(result.stale ? "stale" : "ready");
      } catch {
        if (active) setStatus("unavailable");
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(retryTimerRef.current);
    };
  }, [apiBaseUrl, pullRequest.headRef, pullRequest.owner, pullRequest.pullNumber, pullRequest.repo]);

  if (compact) {
    if (status === "ready" || status === "stale") {
      if (!builds.length) return <CompactBuildGear label="无 Odoo.sh 构建" />;
      return <OdooShBuildGears builds={builds} note={status === "stale" ? "旧数据" : ""} />;
    }
    if (status === "loading" || status === "refreshing") {
      return <CompactBuildGear label="构建状态加载中…" />;
    }
    return <CompactBuildGear label="构建状态暂不可用" />;
  }
  if (status === "ready" || status === "stale") {
    return <span className="odoo-sh-build-status"><BuildDots builds={builds} />{status === "stale" ? <small>旧数据</small> : null}</span>;
  }
  if (status === "loading" || status === "refreshing") {
    return <span className="odoo-sh-build-status odoo-sh-build-status--loading">构建状态加载中…</span>;
  }
  return <span className="odoo-sh-build-status odoo-sh-build-status--loading">构建状态暂不可用</span>;
}
