import assert from "node:assert/strict";
import test from "node:test";
import { createLarkTicketMeegleWorkitem, loadLarkTicketFieldOptions, updateLarkTicketField } from "./lark-ticket-actions-api.js";

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
