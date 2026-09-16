import { UiCard } from "./UiCard.js";
import { UiBadge } from "./UiBadge.js";
import { Skeleton } from "./ui/skeleton.js";
import type { GitHubLookupState } from "../../popup-shared/popup-github-lookup-controller.js";

interface GithubLookupResultProps {
  state: GitHubLookupState;
}

export function GithubLookupResult({ state }: GithubLookupResultProps) {
  const { isLoading, error, result } = state;

  if (isLoading) {
    return (
      <UiCard title="查询中...">
        <div className="grid gap-3" data-test="github-lookup-loading">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </UiCard>
    );
  }

  if (error) {
    return (
      <UiCard title="查询失败">
        <div className="github-lookup-error" data-test="github-lookup-error">
          <div className="error-message text-red-500">{error.errorMessage}</div>
        </div>
      </UiCard>
    );
  }

  if (!result) {
    return null;
  }

  const { extractedIds, workitems, notFound } = result;

  return (
    <UiCard title="PR 关联的 Meegle 工作项">
      <div className="github-lookup-result" data-test="github-lookup-result">
        {/* Extracted IDs summary */}
        <div className="github-lookup-summary mb-4">
          <div className="summary-row flex items-center gap-2 text-sm">
            <span>提取到 {extractedIds.length} 个 Meegle ID:</span>
            <span className="extracted-ids text-muted-foreground">
              {extractedIds.map(id => `m-${id}`).join(", ")}
            </span>
          </div>
        </div>

        {/* Found workitems */}
        {workitems.length > 0 && (
          <div className="github-lookup-workitems mb-4">
            <h4 className="text-sm font-medium mb-2">
              找到的工作项 ({workitems.length})
            </h4>
            <div className="workitem-list space-y-2">
              {workitems.map((workitem) => (
                <div
                  key={workitem.id}
                  className="workitem-card p-3 border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="workitem-header flex items-center justify-between mb-1">
                    <a
                      href={workitem.url || `#${workitem.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="workitem-id font-mono text-sm text-primary hover:underline"
                    >
                      {workitem.id}
                    </a>
                    <UiBadge tone="processing">{workitem.status}</UiBadge>
                  </div>
                  <div className="workitem-name text-sm font-medium">{workitem.name}</div>
                  <div className="workitem-meta text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div className="workitem-type">类型: {workitem.type}</div>
                    {workitem.plannedVersion && (
                      <div className="workitem-planned-version">计划版本: {workitem.plannedVersion}</div>
                    )}
                    {workitem.plannedSprint && (
                      <div className="workitem-planned-sprint">计划迭代: {workitem.plannedSprint}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Not found IDs */}
        {notFound.length > 0 && (
          <div className="github-lookup-notfound">
            <h4 className="text-sm font-medium mb-2 text-amber-600">
              未找到的工作项 ({notFound.length})
            </h4>
            <div className="notfound-list flex flex-wrap gap-2">
              {notFound.map((id) => (
                <span
                  key={id}
                  className="notfound-id px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-mono"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </UiCard>
  );
}
