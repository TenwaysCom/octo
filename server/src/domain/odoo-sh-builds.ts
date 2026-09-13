/** Odoo.sh /builds observations; failure notifications address the linked head commit author. */

export type OdooShEnvironment = "eu" | "uk" | "us";

/** Live /builds results include success, failed and warning; only failed alerts. */
export const ODOO_SH_FAILURE_RESULTS = new Set(["failed"]);

export interface OdooShBuildObservation {
  buildId: number;
  branch: string;
  stage: string;
  odooBranch: string;
  lastBuildStatus: string;
  lastBuildResult: string;
  buildUrl: string | null;
}

export function hasObservedBuild(lastBuildStatus: string, lastBuildResult: string): boolean {
  return lastBuildStatus.trim() !== "" || lastBuildResult.trim() !== "";
}

export function isConfirmedBuildFailure(lastBuildResult: string): boolean {
  return ODOO_SH_FAILURE_RESULTS.has(lastBuildResult.trim().toLowerCase());
}

export function formatOdooShEnvironment(environment: OdooShEnvironment): string {
  return environment.toUpperCase();
}

export function formatOdooShBuildResult(lastBuildResult: string): string {
  const normalized = lastBuildResult.trim().toLowerCase();
  if (normalized === "failed") {
    return "失败";
  }
  if (normalized === "success") {
    return "成功";
  }
  return lastBuildResult;
}

export interface OdooShFailureMessageInput {
  environment: OdooShEnvironment;
  branch: string;
  buildId: number;
  lastBuildResult: string;
  commitSha?: string | null;
  headCommitAuthor?: string | null;
  headCommitUrl?: string | null;
  buildUrl?: string | null;
  mention?: { openId: string; label: string } | null;
}

export function buildOdooShFailureMessage(input: OdooShFailureMessageInput): string {
  const lines: string[] = [];
  const mentionPrefix = input.mention
    ? `<at user_id="${escapeLarkText(input.mention.openId)}">${escapeLarkText(input.mention.label)}</at> `
    : "";
  lines.push(`${mentionPrefix}Odoo.sh build 失败`);
  lines.push(`环境：${formatOdooShEnvironment(input.environment)}｜分支：${escapeLarkText(input.branch)}`);
  const buildLine = `Build：${input.buildId}`;
  lines.push(input.commitSha ? `${buildLine}｜Commit：${input.commitSha}` : buildLine);
  lines.push(`Commit 作者：${escapeLarkText(input.headCommitAuthor || "未知")}`);
  if (input.headCommitUrl) lines.push(`查看 commit：${escapeLarkText(input.headCommitUrl)}`);
  lines.push(`结果：${formatOdooShBuildResult(input.lastBuildResult)}`);
  if (input.buildUrl) {
    lines.push(`查看 build：${escapeLarkText(input.buildUrl)}`);
  }
  return lines.join("\n");
}

function escapeLarkText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
