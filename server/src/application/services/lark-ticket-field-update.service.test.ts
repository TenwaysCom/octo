import {
  createLarkTicketMeegleWorkitem,
  getLarkTicketFieldOptions,
  LarkTicketFieldUpdateError,
  updateLarkTicketField,
} from "./lark-ticket-field-update.service.js";

const authDeps = {
  getLarkTokenStore: (() => ({
    get: vi.fn().mockResolvedValue({
      masterUserId: "user_1",
      baseUrl: "https://open.larksuite.com",
      userToken: "token",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    }),
  })) as never,
};

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    getRecord: vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: {
        "Status": "In Progress",
        "Issue 类型": "Bug",
        "Business line": "B2B sales",
        "紧急度": "P1",
        "需求人": [{ name: "Ada", id: "ou_ada" }],
        "负责人": [{ name: "Lin", id: "ou_lin" }],
        "Issue Description": "ticket title line\nmore",
      },
    }),
    getFields: vi.fn().mockResolvedValue([
      { field_id: "f1", field_name: "Status", type: 3, options: [{ id: "opt1", name: "In Progress" }, { id: "opt2", name: "Done" }] },
      { field_id: "f2", field_name: "紧急度", type: 3, options: [{ name: "P0" }, { name: "P1" }, { name: "P2" }] },
      { field_id: "f3", field_name: "Issue 类型", type: 4, options: [{ name: "Bug" }, { name: "feature" }] },
      { field_id: "f4", field_name: "Business line", type: 3, options: [{ name: "B2B sales" }, { name: "Retail" }] },
      { field_id: "f5", field_name: "需求人", type: 11, ui_type: "User" },
      { field_id: "f6", field_name: "负责人", type: 11, ui_type: "User" },
    ]),
    updateRecord: vi.fn().mockResolvedValue({
      record_id: "rec_1",
      fields: { "Status": "Done" },
    }),
    ...overrides,
  };
}

describe("lark-ticket-field-update service", () => {
  it("writes a select field by candidate field name and returns the refreshed projection", async () => {
    const client = createClient();
    const syncLarkBaseTicket = vi.fn().mockResolvedValue({ synced: 1 });
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      larkBaseUrl: "https://open.larksuite.com",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "status",
      value: "Done",
      actionRunId: "run_1",
    }, { ...authDeps, createLarkClient: () => client as never, syncLarkBaseTicket });

    expect(result).toMatchObject({
      ok: true,
      actionRunId: "run_1",
      larkBaseUpdated: true,
      recordId: "rec_1",
      field: "status",
      ticket: {
        baseId: "app_1",
        tableId: "tbl_1",
        recordId: "rec_1",
        title: "ticket title line\nmore",
        ticketStatus: "Done",
        issueType: "Bug",
        businessLine: "B2B sales",
        requester: "Ada",
        responsible: "Lin",
        priority: "P1",
      },
    });
    expect(client.updateRecord).toHaveBeenCalledWith("app_1", "tbl_1", "rec_1", { "Status": "Done" });
    expect(syncLarkBaseTicket).toHaveBeenCalledWith({
      cleanAfterSync: true,
      masterUserId: "user_1",
      larkBaseUrl: "https://open.larksuite.com",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      actionRunId: "run_1",
    });
  });

  it("writes user fields with the option openId payload", async () => {
    const client = createClient();
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "responsible",
      value: "New Owner",
      optionUserId: "ou_new_owner",
    }, { ...authDeps, createLarkClient: () => client as never, syncLarkBaseTicket: vi.fn() });

    expect(result).toMatchObject({ ok: true, field: "responsible" });
    expect(client.updateRecord).toHaveBeenCalledWith("app_1", "tbl_1", "rec_1", {
      "负责人": [{ id: "ou_new_owner" }],
    });
  });

  it("writes multi select fields as a single-element array", async () => {
    const client = createClient();
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "issueType",
      value: "feature",
    }, { ...authDeps, createLarkClient: () => client as never, syncLarkBaseTicket: vi.fn() });

    expect(result).toMatchObject({ ok: true, field: "issueType" });
    expect(client.updateRecord).toHaveBeenCalledWith("app_1", "tbl_1", "rec_1", { "Issue 类型": ["feature"] });
  });

  it("fails with a typed error when a user field is written without an openId", async () => {
    const client = createClient();
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "requester",
      value: "Ada",
    }, { ...authDeps, createLarkClient: () => client as never, syncLarkBaseTicket: vi.fn() });

    expect(result).toMatchObject({
      ok: false,
      error: { errorCode: "LARK_TICKET_USER_ID_REQUIRED", module: "lark-ticket-field-update" },
    });
    expect(client.updateRecord).not.toHaveBeenCalled();
  });

  it("reports a field error when the ticket table has none of the candidate fields", async () => {
    const client = createClient({
      getRecord: vi.fn().mockResolvedValue({ record_id: "rec_1", fields: { unrelated: "x" } }),
      getFields: vi.fn().mockResolvedValue([{ field_id: "f9", field_name: "unrelated" }]),
    });
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "status",
      value: "Done",
    }, { ...authDeps, createLarkClient: () => client as never, syncLarkBaseTicket: vi.fn() });

    expect(result).toMatchObject({
      ok: false,
      error: { errorCode: "LARK_TICKET_FIELD_NOT_FOUND" },
    });
    expect(client.updateRecord).not.toHaveBeenCalled();
  });

  it("keeps partial success when the Lark write lands but the projection re-sync fails", async () => {
    const client = createClient();
    const result = await updateLarkTicketField({
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "priority",
      value: "P0",
      actionRunId: "run_2",
    }, {
      ...authDeps,
      createLarkClient: () => client as never,
      syncLarkBaseTicket: vi.fn().mockRejectedValue(new Error("SYNC_DOWN")),
    });

    expect(result).toEqual({
      ok: true,
      actionRunId: "run_2",
      larkBaseUpdated: true,
      recordId: "rec_1",
      field: "priority",
      syncFailed: true,
    });
    expect(client.updateRecord).toHaveBeenCalledWith("app_1", "tbl_1", "rec_1", { "紧急度": "P0" });
  });

  it("exposes typed LarkTicketFieldUpdateError codes", () => {
    const error = new LarkTicketFieldUpdateError("LARK_API_ERROR", "boom");
    expect(error.code).toBe("LARK_API_ERROR");
  });
});

describe("lark-ticket-field-options service", () => {
  it("returns select options from field metadata and person options from synced tickets", async () => {
    const client = createClient();
    const result = await getLarkTicketFieldOptions({
      masterUserId: "user_1",
      larkBaseUrl: "https://open.larksuite.com",
      baseId: "app_1",
      tableId: "tbl_1",
    }, {
      ...authDeps,
      createLarkClient: () => client as never,
      syncStore: {
        listLarkBaseTickets: vi.fn().mockResolvedValue([
          {
            sourceFields: {
              "需求人": [{ name: "Ada", id: "ou_ada" }, { name: "Zoe", id: "ou_zoe" }],
              "负责人": [{ name: "Lin", id: "ou_lin" }],
            },
          },
          {
            sourceFields: {
              "需求人": [{ name: "Ada", id: "ou_ada" }],
              "负责人": [{ name: "Anonymous", id: "ou_anon" }],
            },
          },
        ]),
      },
    });

    expect(result.baseId).toBe("app_1");
    const byField = Object.fromEntries(result.fields.map((item) => [item.field, item]));
    expect(byField.status).toEqual({ field: "status", kind: "select", options: [{ label: "In Progress" }, { label: "Done" }] });
    expect(byField.businessLine?.options).toEqual([{ label: "B2B sales" }, { label: "Retail" }]);
    expect(byField.requester?.kind).toBe("user");
    expect(byField.requester?.options).toEqual([
      { label: "Ada", userId: "ou_ada" },
      { label: "Anonymous", userId: "ou_anon" },
      { label: "Lin", userId: "ou_lin" },
      { label: "Zoe", userId: "ou_zoe" },
    ]);
    expect(byField.responsible?.options).toEqual(byField.requester?.options);
  });
});


describe("Ticket create and projection refresh", () => {
  const request = { masterUserId: "user_1", baseId: "app_1", tableId: "tbl_1",
    recordId: "rec_1", actionRunId: "run_1", cleanAfterSync: true as const };
  const created = { ok: true as const, workitemId: "wi_1", meegleLink: "https://example.com/wi_1", recordId: "rec_1" };

  it("waits for creation and refresh before completing, and rejects concurrent action runs", async () => {
    let finish!: (value: typeof created) => void;
    const createMeegleWorkflow = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let finishSync!: () => void;
    const syncLarkBaseTicket = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishSync = resolve; }));
    const deps = { createMeegleWorkflow, syncLarkBaseTicket };
    const first = createLarkTicketMeegleWorkitem(request, deps);
    expect(syncLarkBaseTicket).not.toHaveBeenCalled();
    await expect(createLarkTicketMeegleWorkitem({ ...request, actionRunId: "run_2" }, deps))
      .resolves.toMatchObject({ ok: false, error: { errorCode: "LARK_TICKET_CREATE_RUNNING" } });
    expect(createMeegleWorkflow).toHaveBeenCalledTimes(1);
    finish(created);
    await Promise.resolve();
    expect(syncLarkBaseTicket).toHaveBeenCalledWith(request);
    await expect(createLarkTicketMeegleWorkitem({ ...request, actionRunId: "run_3" }, deps))
      .resolves.toMatchObject({ ok: false, error: { errorCode: "LARK_TICKET_CREATE_RUNNING" } });
    finishSync();
    await expect(first).resolves.toMatchObject({ ...created, syncFailed: false });
  });

  it("retains the created link when snapshot refresh fails and releases the guard", async () => {
    const createMeegleWorkflow = vi.fn().mockResolvedValue(created);
    const syncLarkBaseTicket = vi.fn().mockRejectedValue(new Error("SYNC_DOWN"));
    const deps = { createMeegleWorkflow, syncLarkBaseTicket };
    await expect(createLarkTicketMeegleWorkitem(request, deps))
      .resolves.toMatchObject({ ...created, syncFailed: true });
    createMeegleWorkflow.mockResolvedValue({ ok: false, error: { errorCode: "MEEGLE_LINK_ALREADY_EXISTS" } });
    await expect(createLarkTicketMeegleWorkitem(request, deps))
      .resolves.toMatchObject({ ok: false, error: { errorCode: "MEEGLE_LINK_ALREADY_EXISTS" } });
    expect(syncLarkBaseTicket).toHaveBeenCalledTimes(1);
  });

  it("releases the guard after creation throws", async () => {
    const createMeegleWorkflow = vi.fn().mockRejectedValue(new Error("CREATE_DOWN"));
    const deps = { createMeegleWorkflow, syncLarkBaseTicket: vi.fn() };
    await expect(createLarkTicketMeegleWorkitem(request, deps)).rejects.toThrow("CREATE_DOWN");
    await expect(createLarkTicketMeegleWorkitem(request, deps)).rejects.toThrow("CREATE_DOWN");
    expect(createMeegleWorkflow).toHaveBeenCalledTimes(2);
    expect(deps.syncLarkBaseTicket).not.toHaveBeenCalled();
  });
});
