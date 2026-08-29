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

export function OdooShBuildStatus({ apiBaseUrl, pullRequest }) {
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

  if (status === "ready" || status === "stale") {
    return <span className="odoo-sh-build-status"><BuildDots builds={builds} />{status === "stale" ? <small>旧数据</small> : null}</span>;
  }
  if (status === "loading" || status === "refreshing") {
    return <span className="odoo-sh-build-status odoo-sh-build-status--loading">构建状态加载中…</span>;
  }
  return <span className="odoo-sh-build-status odoo-sh-build-status--loading">构建状态暂不可用</span>;
}
