// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  clearResolvedIdentity: vi.fn(),
  clearResolvedIdentityForTab: vi.fn(),
  deleteKimiChatSession: vi.fn(),
  deleteKimiChatTranscriptSnapshot: vi.fn(),
  fetchLarkUserInfo: vi.fn(),
  getConfig: vi.fn(),
  getLarkAuthStatus: vi.fn(),
  refreshLarkAuthStatus: vi.fn(),
  listKimiChatSessions: vi.fn(),
  loadKimiChatSession: vi.fn(),
  renameKimiChatSession: vi.fn(),
  loadKimiChatTranscriptSnapshot: vi.fn(),
  loadPopupSettings: vi.fn(),
  loadResolvedIdentity: vi.fn(),
  postClientDebugLog: vi.fn(),
  queryActiveTabContext: vi.fn(),
  requestLarkUserId: vi.fn(),
  requestMeegleUserIdentity: vi.fn(),
  resolveIdentityRequest: vi.fn(),
  runLarkAuthRequest: vi.fn(),
  runLarkBaseBulkCreateRequest: vi.fn(),
  runLarkBaseBulkPreviewRequest: vi.fn(),
  runMeegleAuthRequest: vi.fn(),
  runMeegleLarkPushRequest: vi.fn(),
  saveKimiChatTranscriptSnapshot: vi.fn(),
  savePopupSettings: vi.fn(),
  saveResolvedIdentity: vi.fn(),
  saveResolvedIdentityForTab: vi.fn(),
  watchLarkAuthCallbackResult: vi.fn((_listener?: unknown) => () => {}),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  getLastAuth: vi.fn(),
  run: vi.fn(),
}));

const kimiChatClientMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock("../popup/runtime.js", () => runtimeMock);

vi.mock("../popup/meegle-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../popup/meegle-auth.js")>(
    "../popup/meegle-auth.js",
  );

  return {
    ...actual,
    createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
  };
});

vi.mock("../popup/kimi-chat-client.js", () => ({
  createKimiChatClient: vi.fn(() => kimiChatClientMock),
}));

import { createPopupController } from "./popup-controller";

describe("popup controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtimeMock.getConfig.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_APP_ID: "cli_test",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    });
    runtimeMock.loadPopupSettings.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    runtimeMock.loadResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "lark",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue("ou_user");
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue(undefined);
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_resolved",
        identityStatus: "active",
        operatorLarkId: "ou_resolved",
        larkEmail: "user@example.com",
      },
    });
    runtimeMock.getLarkAuthStatus.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      expiresAt: "2026-04-02T21:01:00.000Z",
    });
    runtimeMock.refreshLarkAuthStatus.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      expiresAt: "2026-04-02T21:01:00.000Z",
    });
    runtimeMock.fetchLarkUserInfo.mockResolvedValue({
      ok: true,
      data: {
        userId: "ou_user",
        tenantKey: "tenant_123",
        email: "user@example.com",
        name: "Test User",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
    runtimeMock.postClientDebugLog.mockResolvedValue(true);
    runtimeMock.listKimiChatSessions.mockResolvedValue({
      ok: true,
      data: {
        sessions: [],
      },
    });
    runtimeMock.loadKimiChatSession.mockResolvedValue({
      ok: true,
      data: {
        sessionId: "sess_loaded",
        events: [],
      },
    });
    runtimeMock.deleteKimiChatSession.mockResolvedValue({
      ok: true,
    });
    runtimeMock.loadKimiChatTranscriptSnapshot.mockResolvedValue(undefined);
    runtimeMock.saveKimiChatTranscriptSnapshot.mockResolvedValue(undefined);
    runtimeMock.deleteKimiChatTranscriptSnapshot.mockResolvedValue(undefined);
    runtimeMock.runLarkBaseBulkPreviewRequest.mockResolvedValue({
      ok: true,
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      totalRecordsInView: 2,
      eligibleRecords: [
        {
          recordId: "rec_1",
          issueNumber: "N-1",
          issueType: "User Story",
          title: "Record one",
          priority: "P0",
        },
      ],
      skippedRecords: [
        {
          recordId: "rec_2",
          issueNumber: "N-2",
          issueType: "Bug",
          title: "Record two",
          priority: "P1",
          reason: "ALREADY_LINKED",
        },
      ],
    });
    runtimeMock.runLarkBaseBulkCreateRequest.mockImplementation(async () => ({
      ok: true,
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      totalRecordsInView: 2,
      summary: {
        created: 1,
        failed: 0,
        skipped: 1,
      },
      createdRecords: [
        {
          recordId: "rec_1",
          issueNumber: "N-1",
          issueType: "User Story",
          title: "Record one",
          priority: "P0",
          workitemId: "WI-1",
          meegleLink: "https://project.larksuite.com/OPS/story/detail/WI-1",
        },
      ],
      failedRecords: [],
      skippedRecords: [
        {
          recordId: "rec_2",
          issueNumber: "N-2",
          issueType: "Bug",
          title: "Record two",
          priority: "P1",
          reason: "ALREADY_LINKED",
        },
      ],
    }));
    runtimeMock.runMeegleAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://project.larksuite.com",
      credentialStatus: "active",
    });
    runtimeMock.runMeegleLarkPushRequest.mockResolvedValue({
      ok: true,
      alreadyUpdated: false,
      larkBaseUpdated: true,
      messageSent: true,
      reactionAdded: false,
      meegleStatusUpdated: true,
    });
    runtimeMock.saveResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.saveResolvedIdentityForTab.mockResolvedValue(undefined);
    runtimeMock.savePopupSettings.mockResolvedValue(undefined);

    meegleAuthControllerMock.run.mockResolvedValue(true);
    meegleAuthControllerMock.getLastAuth.mockReturnValue(undefined);
    kimiChatClientMock.sendMessage.mockReset();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: "ready",
          baseUrl: "https://project.larksuite.com",
          credentialStatus: "active",
        },
      }),
    } as Response);
  });

  it("transitions bulk-create modal from preview to executing to result", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValueOnce({
      id: 12,
      url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
      origin: "https://nsghpcq7ar4z.sg.larksuite.com",
      pageType: "lark",
    });
    const delayedResult = {
      ok: true as const,
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      totalRecordsInView: 2,
      summary: {
        created: 1,
        failed: 0,
        skipped: 1,
      },
      createdRecords: [
        {
          recordId: "rec_1",
          issueNumber: "N-1",
          issueType: "User Story",
          title: "Record one",
          priority: "P0",
          workitemId: "WI-1",
          meegleLink: "https://project.larksuite.com/OPS/story/detail/WI-1",
        },
      ],
      failedRecords: [],
      skippedRecords: [
        {
          recordId: "rec_2",
          issueNumber: "N-2",
          issueType: "Bug",
          title: "Record two",
          priority: "P1",
          reason: "ALREADY_LINKED",
        },
      ],
    };
    let resolveCreate:
      | ((value: typeof delayedResult) => void)
      | null = null;
    runtimeMock.runLarkBaseBulkCreateRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const controller = createPopupController();
    await controller.initialize();
    await controller.runFeatureAction("bulk-create-meegle-tickets");

    const confirmPromise = controller.confirmLarkBulkCreate();
    await vi.waitFor(() => {
      expect(controller.getState().larkBulkCreateModal.stage).toBe("executing");
    });
    expect(resolveCreate).not.toBeNull();
    resolveCreate!(delayedResult);
    await confirmPromise;

    expect(runtimeMock.runLarkBaseBulkCreateRequest).toHaveBeenCalledWith({
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      masterUserId: "usr_resolved",
    });
    expect(controller.getState().larkBulkCreateModal.stage).toBe("result");
    expect(controller.getState().larkBulkCreateModal.result?.ok).toBe(true);
    controller.dispose();
  });

  it("ignores repeated confirm requests while bulk create is already in flight", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValueOnce({
      id: 12,
      url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
      origin: "https://nsghpcq7ar4z.sg.larksuite.com",
      pageType: "lark",
    });
    let resolveCreate: (() => void) | null = null;
    runtimeMock.runLarkBaseBulkCreateRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => {
            resolve({
              ok: true,
              baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
              tableId: "tblUfu71xwdul3NH",
              viewId: "vewMs17Tqk",
              totalRecordsInView: 2,
              summary: {
                created: 1,
                failed: 0,
                skipped: 1,
              },
              createdRecords: [
                {
                  recordId: "rec_1",
                  issueNumber: "N-1",
                  issueType: "User Story",
                  title: "Record one",
                  priority: "P0",
                  workitemId: "WI-1",
                  meegleLink: "https://project.larksuite.com/OPS/story/detail/WI-1",
                },
              ],
              failedRecords: [],
              skippedRecords: [
                {
                  recordId: "rec_2",
                  issueNumber: "N-2",
                  issueType: "Bug",
                  title: "Record two",
                  priority: "P1",
                  reason: "ALREADY_LINKED",
                },
              ],
            });
          };
        }),
    );

    const controller = createPopupController();
    await controller.initialize();
    await controller.runFeatureAction("bulk-create-meegle-tickets");

    const firstConfirm = controller.confirmLarkBulkCreate();
    const secondConfirm = controller.confirmLarkBulkCreate();

    await vi.waitFor(() => {
      expect(controller.getState().larkBulkCreateModal.stage).toBe("executing");
    });

    expect(runtimeMock.runLarkBaseBulkCreateRequest).toHaveBeenCalledTimes(1);
    expect(resolveCreate).not.toBeNull();
    resolveCreate!();
    await Promise.all([firstConfirm, secondConfirm]);

    expect(runtimeMock.runLarkBaseBulkCreateRequest).toHaveBeenCalledTimes(1);
    expect(controller.getState().larkBulkCreateModal.stage).toBe("result");
    controller.dispose();
  });

  it("ignores confirm requests after bulk create has already reached result state", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValueOnce({
      id: 12,
      url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
      origin: "https://nsghpcq7ar4z.sg.larksuite.com",
      pageType: "lark",
    });

    const controller = createPopupController();
    await controller.initialize();
    await controller.runFeatureAction("bulk-create-meegle-tickets");

    await controller.confirmLarkBulkCreate();

    expect(runtimeMock.runLarkBaseBulkCreateRequest).toHaveBeenCalledTimes(1);
    expect(controller.getState().larkBulkCreateModal.stage).toBe("result");

    await controller.confirmLarkBulkCreate();

    expect(runtimeMock.runLarkBaseBulkCreateRequest).toHaveBeenCalledTimes(1);
    expect(controller.getState().larkBulkCreateModal.stage).toBe("result");
    controller.dispose();
  });

  it("refreshes auth state when the Lark auth callback reports completion", async () => {
    let callbackListener:
      | ((result: {
          state: string;
          status: "ready" | "failed";
          masterUserId?: string;
          reason?: string;
        }) => void | Promise<void>)
      | undefined;
    runtimeMock.watchLarkAuthCallbackResult.mockImplementation((listener) => {
      callbackListener = listener as typeof callbackListener;
      return () => {};
    });

    const controller = createPopupController();
    await controller.initialize();
    runtimeMock.saveResolvedIdentity.mockClear();
    runtimeMock.getLarkAuthStatus.mockResolvedValueOnce({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_callback",
    });

    await callbackListener?.({
      state: "state_123",
      status: "ready",
      masterUserId: "usr_callback",
    });

    expect(runtimeMock.saveResolvedIdentity).toHaveBeenCalledWith("usr_callback");
    expect(runtimeMock.saveResolvedIdentityForTab).toHaveBeenCalledWith(
      12,
      "usr_callback",
    );
    expect(controller.getState().state.identity.masterUserId).toBe("usr_callback");
    expect(controller.getState().state.isAuthed.lark).toBe(true);
    controller.dispose();
  });

  it("refreshes lark token during initialize when auth status requires refresh", async () => {
    runtimeMock.getLarkAuthStatus.mockResolvedValueOnce({
      status: "require_refresh",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      reason: "Lark token expired, refresh available",
    });
    runtimeMock.refreshLarkAuthStatus.mockResolvedValueOnce({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      masterUserId: "usr_resolved",
      reason: "Lark token refreshed successfully",
      credentialStatus: "active",
      expiresAt: "2026-04-21T06:19:51.218Z",
    });

    const controller = createPopupController();
    await controller.initialize();

    expect(runtimeMock.refreshLarkAuthStatus).toHaveBeenCalledWith({
      masterUserId: "usr_resolved",
      baseUrl: "https://open.larksuite.com",
    });
    expect(controller.getState().state.larkAuth).toEqual(
      expect.objectContaining({
        status: "ready",
        reason: "Lark token refreshed successfully",
      }),
    );
    expect(controller.getState().state.isAuthed.lark).toBe(true);
    controller.dispose();
  });

  it("keeps snapshots detached and updates settings only through controller methods", () => {
    const controller = createPopupController();
    const firstSnapshot = controller.getState();

    expect(() => {
      firstSnapshot.settingsForm.SERVER_URL = "http://mutated.invalid";
    }).toThrow();
    expect(() => {
      firstSnapshot.state.identity.larkId = "ou_mutated";
    }).toThrow();

    controller.updateSettingsFormField("SERVER_URL", "http://field-update.local");
    controller.setSettingsForm({
      ...controller.getState().settingsForm,
      larkUserId: "ou_changed",
    });

    const nextSnapshot = controller.getState();
    expect(nextSnapshot.settingsForm.SERVER_URL).toBe("http://field-update.local");
    expect(nextSnapshot.settingsForm.larkUserId).toBe("ou_changed");
    expect(firstSnapshot.settingsForm.SERVER_URL).toBe(
      "https://octo.odoo.tenways.it:18443",
    );
    controller.dispose();
  });

  it("restores the saved settings snapshot when settings are closed without saving", async () => {
    const controller = createPopupController();
    await controller.initialize();

    controller.openSettings();
    controller.updateSettingsFormField("SERVER_URL", "http://unsaved.local");
    expect(controller.getState().settingsForm.SERVER_URL).toBe("http://unsaved.local");

    controller.closeSettings();

    expect(controller.getState().activePage).toBe("chat");
    expect(controller.getState().settingsForm.SERVER_URL).toBe("http://localhost:3000");
    controller.dispose();
  });

  it("clears a stale kimi session and restores the draft after a failed follow-up", async () => {
    kimiChatClientMock.sendMessage
      .mockImplementationOnce(
        async (
          _input: { operatorLarkId: string; message: string; sessionId?: string },
          handlers?: {
            onEvent?: (event: {
              event: string;
              data: Record<string, unknown>;
            }) => void;
          },
        ) => {
          handlers?.onEvent?.({
            event: "session.created",
            data: {
              sessionId: "sess_stale",
            },
          });
        },
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("session expired"), {
          code: "SESSION_NOT_FOUND",
        }),
      );

    const controller = createPopupController();
    controller.updateSettingsFormField("larkUserId", "ou_test");
    controller.syncLegacyIdentityState({
      masterUserId: "usr_resolved",
    });
    await controller.runFeatureAction("analyze");
    await controller.sendKimiChatMessage("first turn");
    controller.updateKimiChatDraftMessage("follow up");

    await controller.sendKimiChatMessage("follow up");

    expect(controller.getState().kimiChatSessionId).toBeNull();
    expect(controller.getState().kimiChatDraftMessage).toBe("follow up");
    expect(
      controller.getState().logs.some((entry) =>
        entry.message.includes("session expired"),
      ),
    ).toBe(true);
    controller.dispose();
  });
});
