import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/index.js";

test("prints the command overview", async () => {
  const messages: string[] = [];
  await run(["help"], (message) => messages.push(message));
  assert.match(messages.join("\n"), /sprint burndown/);
  assert.match(messages.join("\n"), /agent install/);
  assert.match(messages.join("\n"), /odoo branches/);
  assert.match(messages.join("\n"), /doctor/);
  assert.match(messages.join("\n"), /profile/);
});

test("supports the conventional help flag", async () => {
  const messages: string[] = [];
  await run(["--help"], (message) => messages.push(message));
  assert.match(messages.join("\n"), /local agent CLI/);
});

test("prints Agent API schemas in the standard success envelope", async () => {
  const messages: string[] = [];
  await run(["schema", "sprint.tasks"], (message) => messages.push(message));
  assert.deepEqual(JSON.parse(messages[0]), {
    ok: true,
    data: {
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
  });
});
