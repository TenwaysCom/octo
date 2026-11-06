import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketMeegleWorkitem, loadLarkTicketFieldOptions, updateLarkTicketField, markLarkTicketDeleted,
  submitLarkTicketFields, getLarkTicketFieldSubmission, reconcileLarkTicketFields, retryLarkTicketFieldsSync, loadLarkTicketEditableFields } from "./lark-ticket-actions-api.js";

test("batch submission sends only changed fields, expected values, account guard and stable IDs", async () => {
  const changes = [{ field: "priority", value: "P3", expected: { value: "P1" } }, { field: "responsible", value: "Lin", optionUserId: "ou_lin", expected: { value: "Ada", userIds: ["ou_ada"] } }];
  const input = { apiBaseUrl: "/api", ticket: { baseId: "base", tableId: "table", recordId: "rec/1", solution: "never send" },
    expectedUserId: "user", submissionId: "submission", actionRunId: "action", changes };
  const result = await submitLarkTicketFields({ ...input, fetchImpl: async (url, options) => {
    assert.equal(url, "/api/web/lark-tickets/rec%2F1/field-submissions");
    assert.equal(options.credentials, "include"); assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { baseId: "base", tableId: "table", expectedUserId: "user", submissionId: "submission", actionRunId: "action", changes });
    return { ok: true, json: async () => ({ ok: true, data: { state: "saved_pending_sync", larkBaseUpdated: true, syncFailed: true } }) };
  } });
  assert.equal(result.state, "saved_pending_sync");
});

test("recovery and sync calls reference the submission without replaying field values", async () => {
  const input = { apiBaseUrl: "/api", ticket: { baseId: "base", tableId: "table", recordId: "record" }, expectedUserId: "user", submissionId: "id" };
  for (const [call, path, method] of [[getLarkTicketFieldSubmission, "field-submissions/id", "GET"],
    [reconcileLarkTicketFields, "field-submissions/id/reconcile", "POST"], [retryLarkTicketFieldsSync, "field-submissions/id/sync", "POST"],
    [loadLarkTicketEditableFields, "editable-fields", "GET"]]) {
    await call({ ...input, fetchImpl: async (url, options) => {
      assert.equal(options.method, method);
      assert.equal(url, `/api/web/lark-tickets/record/${path}${method === "GET" ? "?baseId=base&tableId=table&expectedUserId=user" : ""}`);
      if (method === "POST") assert.deepEqual(JSON.parse(options.body), { baseId: "base", tableId: "table", expectedUserId: "user" });
      return { ok: true, json: async () => ({ ok: true, data: { state: "unknown" } }) };
    } });
  }
});

test("transport timeout remains ambiguous and never automatically retries a POST", async () => {
  let calls = 0;
  await assert.rejects(submitLarkTicketFields({ apiBaseUrl: "/api", ticket: { baseId: "b", tableId: "t", recordId: "r" }, timeoutMs: 1,
    fetchImpl: async (_url, options) => { calls++; return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout")))); },
  }), /timeout/);
  assert.equal(calls, 1);
});

test("loads ticket field options with the browser session", async () => {
  let request;
  const fields = await loadLarkTicketFieldOptions({
    apiBaseUrl: "/api",
    baseId: "app_1",
    tableId: "tbl_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { fields: [{ field: "status", kind: "select", options: [{ label: "Done" }] }] } }) };
    },
  });

  assert.equal(request.url, "/api/web/lark-tickets/field-options?baseId=app_1&tableId=tbl_1");
  assert.equal(request.options.credentials, "include");
  assert.deepEqual(fields, [{ field: "status", kind: "select", options: [{ label: "Done" }] }]);
});

test("updates a ticket field and keeps the option userId for person fields", async () => {
  let request;
  const data = await updateLarkTicketField({
    apiBaseUrl: "/api",
    ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    field: "responsible",
    value: "Lin",
    optionUserId: "ou_lin",
    actionRunId: "run_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { larkBaseUpdated: true, recordId: "rec_1", field: "responsible", ticket: { ticketStatus: "In Progress", responsible: "Lin" } } }) };
    },
  });

  assert.equal(request.url, "/api/web/lark-tickets/rec_1/fields");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    baseId: "app_1",
    tableId: "tbl_1",
    field: "responsible",
    value: "Lin",
    optionUserId: "ou_lin",
    actionRunId: "run_1",
  });
  assert.equal(data.ticket.responsible, "Lin");
});

test("surfaces server error codes from a failed field update", async () => {
  await assert.rejects(updateLarkTicketField({
    apiBaseUrl: "/api",
    ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    field: "status",
    value: "Done",
    actionRunId: "run_1",
    fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: { errorCode: "LARK_TICKET_FIELD_NOT_FOUND", errorMessage: "missing" } }) }),
  }), (error) => error.code === "LARK_TICKET_FIELD_NOT_FOUND");
});

test("marks a local deletion using the session, full Ticket reference and action id", async () => {
  const result = await markLarkTicketDeleted({ apiBaseUrl: "/api", ticket: { baseId: "b", tableId: "t", recordId: "rec/1" }, actionRunId: "delete-run",
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/web/lark-tickets/rec%2F1/mark-deleted");
      assert.equal(options.credentials, "include");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { baseId: "b", tableId: "t", actionRunId: "delete-run" });
      return { ok: true, json: async () => ({ ok: true, data: { deletedAt: "2026-11-06T00:00:00Z" } }) };
    } });
  assert.equal(result.deletedAt, "2026-11-06T00:00:00Z");
  await assert.rejects(markLarkTicketDeleted({ apiBaseUrl: "/api", ticket: { baseId: "b", tableId: "t", recordId: "rec" }, actionRunId: "delete-run",
    fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "无权删除" } }) }),
  }), (error) => error.code === "WORKSPACE_ACCESS_DENIED");
});

test("sends multiline or empty solution text and preserves partial sync results", async () => {
  for (const value of ["修复配置\n验证通过", ""]) {
    for (const syncFailed of [false, true]) {
      let body;
      const result = await updateLarkTicketField({ apiBaseUrl: "/api",
        ticket: { baseId: "base", tableId: "table", recordId: "rec" }, field: "solution", value, actionRunId: "run",
        fetchImpl: async (_url, options) => {
          assert.equal(options.credentials, "include");
          body = JSON.parse(options.body);
          return { ok: true, json: async () => ({ ok: true, data: { larkBaseUpdated: true, syncFailed,
            ...(!syncFailed ? { ticket: { solution: value } } : {}) } }) };
        } });
      assert.deepEqual(body, { baseId: "base", tableId: "table", field: "solution", value, actionRunId: "run" });
      assert.equal(result.syncFailed, syncFailed);
      if (!syncFailed) assert.equal(result.ticket.solution, value);
    }
  }
});

test("creates a Meegle work item from a ticket", async () => {
  let request;
  const data = await createLarkTicketMeegleWorkitem({
    apiBaseUrl: "/api",
    ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1" },
    actionRunId: "run_1",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { workitemId: "wi_1", meegleLink: "https://project.larksuite.com/4c3fv6/bug/detail/wi_1", workitems: [] } }) };
    },
  });

  assert.equal(request.url, "/api/web/lark-tickets/rec_1/create-meegle-workitem");
  assert.deepEqual(JSON.parse(request.options.body), { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1" });
  assert.equal(data.workitemId, "wi_1");
});
