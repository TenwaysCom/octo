import { createWebLarkTicketController } from "./lark-ticket.controller.js";

const pmSession = { ok: true as const, masterUserId: "user_1", baseUrl: "https://open.larksuite.com", role: "pm", user: {} };
function createFieldUpdateService() {
  return {
    update: vi.fn().mockResolvedValue({
      ok: true as const,
      actionRunId: "run_1",
      larkBaseUpdated: true as const,
      recordId: "rec_1",
      field: "status",
      ticket: { baseId: "app_1", tableId: "tbl_1", recordId: "rec_1", title: "t", ticketStatus: "Done" },
    }),
    loadOptions: vi.fn().mockResolvedValue({
      baseId: "app_1",
      tableId: "tbl_1",
      fields: [{ field: "status", kind: "select", options: [{ label: "Done" }] }],
    }),
  };
}

describe("web Lark Ticket field actions authorization", () => {
  it("updates a ticket field through the server-side workflow with the session identity", async () => {
    const fieldUpdateService = createFieldUpdateService();
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      fieldUpdateService,
    });

    await expect(controller.updateTicketField({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", field: "status", value: "Done", actionRunId: "run_1" },
    })).resolves.toMatchObject({ statusCode: 200, body: { ok: true, data: { larkBaseUpdated: true, ticket: { ticketStatus: "Done" } } } });
    expect(fieldUpdateService.update).toHaveBeenCalledWith({
      masterUserId: "user_1",
      larkBaseUrl: "https://open.larksuite.com",
      baseId: "app_1",
      tableId: "tbl_1",
      recordId: "rec_1",
      field: "status",
      value: "Done",
      optionUserId: undefined,
      actionRunId: "run_1",
    });
  });

  it("rejects ticket writes for roles without platformSync access", async () => {
    const fieldUpdateService = createFieldUpdateService();
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue({ ...pmSession, role: "dev" }),
      fieldUpdateService,
    });

    await expect(controller.updateTicketField({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", field: "status", value: "Done", actionRunId: "run_1" },
    })).resolves.toEqual({
      statusCode: 403,
      body: { ok: false, error: { errorCode: "WORKSPACE_ACCESS_DENIED", errorMessage: "当前角色无权操作平台数据。" } },
    });
    expect(fieldUpdateService.update).not.toHaveBeenCalled();
  });

  it("requires the web session for ticket writes", async () => {
    const fieldUpdateService = createFieldUpdateService();
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." }),
      fieldUpdateService,
    });

    await expect(controller.loadTicketFieldOptions({
      cookieHeader: undefined,
      query: { baseId: "app_1", tableId: "tbl_1" },
    })).resolves.toEqual({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHENTICATED", errorMessage: "Missing web session." } },
    });
  });

  it("rejects invalid field update payloads", async () => {
    const fieldUpdateService = createFieldUpdateService();
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      fieldUpdateService,
    });

    await expect(controller.updateTicketField({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", field: "status", value: "Done" },
    })).resolves.toMatchObject({ statusCode: 400, body: { ok: false, error: { errorCode: "INVALID_REQUEST" } } });
  });

  it("maps typed field update failures to status codes", async () => {
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      fieldUpdateService: {
        ...createFieldUpdateService(),
        update: vi.fn().mockResolvedValue({
          ok: false,
          error: { layer: "server", module: "lark-ticket-field-update", stage: "server.workflow.failed", errorCode: "LARK_TICKET_FIELD_NOT_FOUND", errorMessage: "missing" },
        }),
      },
    });

    await expect(controller.updateTicketField({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", field: "status", value: "Done", actionRunId: "run_1" },
    })).resolves.toMatchObject({ statusCode: 404, body: { ok: false, error: { errorCode: "LARK_TICKET_FIELD_NOT_FOUND" } } });
  });

  it("returns field options for allowed roles", async () => {
    const fieldUpdateService = createFieldUpdateService();
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      fieldUpdateService,
    });

    await expect(controller.loadTicketFieldOptions({
      cookieHeader: "octo_web_session=session_1",
      query: { baseId: "app_1", tableId: "tbl_1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: { baseId: "app_1", tableId: "tbl_1", fields: [{ field: "status", kind: "select", options: [{ label: "Done" }] }] } },
    });
  });
});

describe("web Lark Ticket create Meegle workitem", () => {
  it("creates the workitem through the shared Lark Base workflow", async () => {
    const createMeegleWorkflow = vi.fn().mockResolvedValue({
      ok: true as const,
      workitemId: "wi_1",
      meegleLink: "https://project.larksuite.com/4c3fv6/production_bug/detail/wi_1",
      recordId: "rec_1",
      workitems: [{ workitemId: "wi_1", meegleLink: "https://project.larksuite.com/4c3fv6/production_bug/detail/wi_1" }],
    });
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      createMeegleWorkflow,
      syncLarkBaseTicket: vi.fn().mockResolvedValue({ synced: 1 }),
    });

    await expect(controller.createTicketMeegleWorkitem({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1" },
    })).resolves.toEqual({
      statusCode: 200,
      body: { ok: true, data: {
        actionRunId: "run_1",
        syncFailed: false,
        workitemId: "wi_1",
        meegleLink: "https://project.larksuite.com/4c3fv6/production_bug/detail/wi_1",
        workitems: [{ workitemId: "wi_1", meegleLink: "https://project.larksuite.com/4c3fv6/production_bug/detail/wi_1" }],
      } },
    });
    expect(createMeegleWorkflow).toHaveBeenCalledWith({
      recordId: "rec_1",
      masterUserId: "user_1",
      baseId: "app_1",
      tableId: "tbl_1",
      actionRunId: "run_1",
    });
  });

  it("maps an existing Meegle link to HTTP 409", async () => {
    const controller = createWebLarkTicketController({
      resolveSession: vi.fn().mockResolvedValue(pmSession),
      createMeegleWorkflow: vi.fn().mockResolvedValue({
        ok: false,
        error: { layer: "server", module: "lark-base-workflow", stage: "server.workflow.skipped", errorCode: "MEEGLE_LINK_ALREADY_EXISTS", errorMessage: "Meegle 链接已经有记录。" },
      }),
    });

    await expect(controller.createTicketMeegleWorkitem({
      cookieHeader: "octo_web_session=session_1",
      recordId: "rec_1",
      body: { baseId: "app_1", tableId: "tbl_1", actionRunId: "run_1" },
    })).resolves.toMatchObject({ statusCode: 409, body: { ok: false, error: { errorCode: "MEEGLE_LINK_ALREADY_EXISTS" } } });
  });
});
