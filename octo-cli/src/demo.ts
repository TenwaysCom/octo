import { createServer, type Server, type ServerResponse } from "node:http";

export const DEMO_API_TOKEN = "octo-demo-token";
export const DEMO_PROJECT_KEY = "demo-project";
export const DEMO_SPRINT_ID = "demo-sprint-202608";

const demoResponses: Record<string, unknown> = {
  [`/api/agent/v1/projects/${DEMO_PROJECT_KEY}/sprints/${DEMO_SPRINT_ID}/burndown`]: {
    projectKey: DEMO_PROJECT_KEY,
    sprintId: DEMO_SPRINT_ID,
    name: "Demo Sprint 202608",
    source: "octo_snapshot",
    syncedAt: "2026-08-29T09:00:00.000Z",
    historyQuality: "observed",
    points: [
      { date: "2026-08-25", scope: 8, started: 2, completed: 0 },
      { date: "2026-08-26", scope: 8, started: 4, completed: 1 },
      { date: "2026-08-27", scope: 8, started: 5, completed: 3 },
      { date: "2026-08-28", scope: 8, started: 4, completed: 4 },
    ],
  },
  [`/api/agent/v1/projects/${DEMO_PROJECT_KEY}/sprints/${DEMO_SPRINT_ID}/tasks`]: {
    projectKey: DEMO_PROJECT_KEY,
    sprintId: DEMO_SPRINT_ID,
    source: "octo_snapshot",
    syncedAt: "2026-08-29T09:00:00.000Z",
    items: [
      { workItemId: "M-101", title: "Improve Sprint snapshot", status: "In progress", taskStatus: "Doing", githubPullRequests: [42] },
      { workItemId: "M-102", title: "Add CLI skills", status: "Done", taskStatus: "Completed", githubPullRequests: [] },
    ],
  },
  "/api/agent/v1/github/pull-requests/TenwaysCom/octo/42": {
    owner: "TenwaysCom",
    repo: "octo",
    pullNumber: 42,
    title: "Add Octo client demo",
    state: "open",
    source: "octo_snapshot",
    syncedAt: "2026-08-29T09:00:00.000Z",
    meegleWorkitems: [
      { workItemId: "M-101", title: "Improve Sprint snapshot", status: "In progress", sprint: "Demo Sprint 202608" },
    ],
  },
  "/api/agent/v1/lark-tickets/base-demo/table-tickets/rec-demo-1001": {
    baseId: "base-demo",
    tableId: "table-tickets",
    recordId: "rec-demo-1001",
    title: "CLI demo ticket",
    status: "In progress",
    requester: "Demo PM",
    source: "octo_snapshot",
    syncedAt: "2026-08-29T09:00:00.000Z",
  },
};

const demoOdooBranches: Record<string, unknown> = {
  eu: {
    environment: "eu",
    projectName: "Odoo EU",
    cached: false,
    source: "octo_odoo_devops",
    fetchedAt: "2026-08-29T09:00:00.000Z",
    items: [
      { branch: "main", stage: "production", lastBuildStatus: "done", lastBuildResult: "success", odooBranch: "17.0" },
      { branch: "feat/octo-cli", stage: "dev", lastBuildStatus: "done", lastBuildResult: "warning", odooBranch: "17.0" },
    ],
  },
  uk: {
    environment: "uk",
    projectName: "Odoo UK",
    cached: true,
    source: "octo_odoo_devops",
    fetchedAt: "2026-08-29T09:00:00.000Z",
    items: [
      { branch: "main", stage: "production", lastBuildStatus: "done", lastBuildResult: "success", odooBranch: "17.0" },
    ],
  },
  us: {
    environment: "us",
    projectName: "Odoo US",
    cached: false,
    source: "octo_odoo_devops",
    fetchedAt: "2026-08-29T09:00:00.000Z",
    items: [
      { branch: "main", stage: "staging", lastBuildStatus: "running", lastBuildResult: "unknown", odooBranch: "18.0" },
    ],
  },
};

export function createDemoServer(token = DEMO_API_TOKEN): Server {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    if (request.method !== "GET") {
      send(response, 405, { ok: false, error: { errorCode: "METHOD_NOT_ALLOWED" } });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      send(response, 401, { ok: false, error: { errorCode: "UNAUTHORIZED" } });
      return;
    }
    if (path === "/api/agent/v1/odoo/branches") {
      const data = demoOdooBranches[url.searchParams.get("environment") || ""];
      if (!data) {
        send(response, 400, { ok: false, error: { errorCode: "INVALID_REQUEST" } });
        return;
      }
      send(response, 200, { ok: true, data });
      return;
    }
    const data = demoResponses[path];
    if (!data) {
      send(response, 404, { ok: false, error: { errorCode: "SNAPSHOT_NOT_FOUND" } });
      return;
    }
    send(response, 200, { ok: true, data });
  });
}

function send(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
