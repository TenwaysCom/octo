export interface AgentApiSchema {
  name: string;
  description: string;
  method: "GET";
  path: string;
  risk: "read";
  scope: string;
  parameters: Array<{ name: string; location: "path" | "query"; required: boolean; description: string }>;
}

const SCHEMAS: AgentApiSchema[] = [
  {
    name: "sprint.burndown",
    description: "Observed and inferred Sprint burn-down points.",
    method: "GET",
    path: "/api/agent/v1/projects/:projectKey/sprints/:sprintId/burndown",
    risk: "read",
    scope: "platform_data:read",
    parameters: [
      { name: "projectKey", location: "path", required: true, description: "Octo project key." },
      { name: "sprintId", location: "path", required: true, description: "Sprint identifier within the project." },
    ],
  },
  {
    name: "sprint.tasks",
    description: "Sprint work-item and task status projection.",
    method: "GET",
    path: "/api/agent/v1/projects/:projectKey/sprints/:sprintId/tasks",
    risk: "read",
    scope: "platform_data:read",
    parameters: [
      { name: "projectKey", location: "path", required: true, description: "Octo project key." },
      { name: "sprintId", location: "path", required: true, description: "Sprint identifier within the project." },
    ],
  },
  {
    name: "github.pull-request",
    description: "GitHub pull request snapshot with linked Meegle work items.",
    method: "GET",
    path: "/api/agent/v1/github/pull-requests/:owner/:repo/:number",
    risk: "read",
    scope: "platform_data:read",
    parameters: [
      { name: "owner", location: "path", required: true, description: "GitHub organization or account." },
      { name: "repo", location: "path", required: true, description: "GitHub repository." },
      { name: "number", location: "path", required: true, description: "Pull request number." },
    ],
  },
  {
    name: "lark.ticket",
    description: "Lark Ticket snapshot identified by its composite key.",
    method: "GET",
    path: "/api/agent/v1/lark-tickets/:baseId/:tableId/:recordId",
    risk: "read",
    scope: "platform_data:read",
    parameters: [
      { name: "baseId", location: "path", required: true, description: "Lark Base identifier." },
      { name: "tableId", location: "path", required: true, description: "Lark table identifier." },
      { name: "recordId", location: "path", required: true, description: "Lark record identifier." },
    ],
  },
  {
    name: "odoo.branches",
    description: "Odoo DevOps branch and build status; not Odoo business database data.",
    method: "GET",
    path: "/api/agent/v1/odoo/branches?environment=:environment",
    risk: "read",
    scope: "odoo_devops:read",
    parameters: [
      { name: "environment", location: "query", required: true, description: "One of eu, uk, or us." },
    ],
  },
];

export function listApiSchemas(): AgentApiSchema[] {
  return SCHEMAS;
}

export function getApiSchema(name: string): AgentApiSchema {
  const schema = SCHEMAS.find((candidate) => candidate.name === name);
  if (!schema) throw new Error(`Unknown API schema \"${name}\". Run: octo-cli schema`);
  return schema;
}
