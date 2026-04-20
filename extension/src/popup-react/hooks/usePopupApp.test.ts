// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  clearResolvedIdentity: vi.fn(),
  clearResolvedIdentityForTab: vi.fn(),
  deleteKimiChatSession: vi.fn(),
  deleteKimiChatTranscriptSnapshot: vi.fn(),
  fetchLarkUserInfo: vi.fn(),
  getConfig: vi.fn(),
  getLarkAuthStatus: vi.fn(),
  listKimiChatSessions: vi.fn(),
  loadKimiChatSession: vi.fn(),
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
  watchLarkAuthCallbackResult: vi.fn(() => () => {}),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  getLastAuth: vi.fn(),
  run: vi.fn(),
}));

const kimiChatClientMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock("../../popup/runtime.js", () => runtimeMock);

vi.mock("../../popup/meegle-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../../popup/meegle-auth.js")>(
    "../../popup/meegle-auth.js",
  );

  return {
    ...actual,
    createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
  };
});

vi.mock("../../popup/kimi-chat-client.js", () => ({
  createKimiChatClient: vi.fn(() => kimiChatClientMock),
}));

import { usePopupApp } from "./usePopupApp";

describe("usePopupApp React hook", () => {
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
      skippedRecords: [],
    });
    runtimeMock.runLarkBaseBulkCreateRequest.mockResolvedValue({
      ok: true,
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      totalRecordsInView: 2,
      summary: {
        created: 1,
        failed: 0,
        skipped: 0,
      },
      createdRecords: [],
      failedRecords: [],
      skippedRecords: [],
    });
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

    kimiChatClientMock.sendMessage.mockImplementation(
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
            sessionId: "sess_1",
          },
        });
        handlers?.onEvent?.({
          event: "acp.session.update",
          data: {
            sessionId: "sess_1",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "reply",
              },
            },
          },
        });
        handlers?.onEvent?.({
          event: "done",
          data: {
            sessionId: "sess_1",
            stopReason: "end_turn",
          },
        });
      },
    );

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

  it("initializes tab, auth, and identity state for React consumers", async () => {
    const { result } = renderHook(() => usePopupApp());

    await act(async () => {
      await result.current.initialize();
    });

    expect(result.current.state.pageType).toBe("lark");
    expect(result.current.state.currentTabId).toBe(12);
    expect(result.current.state.identity.masterUserId).toBe("usr_resolved");
    expect(result.current.state.identity.larkId).toBe("ou_user");
    expect(result.current.state.identity.larkEmail).toBe("user@example.com");
    expect(result.current.state.isAuthed.lark).toBe(true);
    expect(result.current.state.isAuthed.meegle).toBe(true);
    expect(result.current.activePage).toBe("automation");
    expect(result.current.larkStatus.text).toContain("已授权");
  });

  it("opens Kimi chat on analyze and resets the active chat on a second analyze", async () => {
    const { result } = renderHook(() => usePopupApp());

    await act(async () => {
      await result.current.initialize();
    });

    act(() => {
      void result.current.runFeatureAction("analyze");
    });

    expect(result.current.showKimiChat).toBe(true);
    expect(result.current.activePage).toBe("chat");

    await act(async () => {
      await result.current.sendKimiChatMessage("请介绍一下会话状态");
    });

    expect(result.current.kimiChatSessionId).toBe("sess_1");
    expect(
      result.current.kimiChatTranscript.some((entry) => entry.kind === "assistant"),
    ).toBe(true);

    act(() => {
      void result.current.runFeatureAction("analyze");
    });

    expect(result.current.showKimiChat).toBe(true);
    expect(result.current.kimiChatSessionId).toBeNull();
    expect(result.current.kimiChatTranscript).toEqual([]);
  });

  it("opens the bulk-create preview modal on the target Lark base view", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValueOnce({
      id: 12,
      url: "https://nsghpcq7ar4z.sg.larksuite.com/base/XO0cbnxMIaralRsbBEolboEFgZc?table=tblUfu71xwdul3NH&view=vewMs17Tqk",
      origin: "https://nsghpcq7ar4z.sg.larksuite.com",
      pageType: "lark",
    });

    const { result } = renderHook(() => usePopupApp());

    await act(async () => {
      await result.current.initialize();
    });

    await act(async () => {
      await result.current.runFeatureAction("bulk-create-meegle-tickets");
    });

    expect(runtimeMock.runLarkBaseBulkPreviewRequest).toHaveBeenCalledWith({
      baseId: "XO0cbnxMIaralRsbBEolboEFgZc",
      tableId: "tblUfu71xwdul3NH",
      viewId: "vewMs17Tqk",
      masterUserId: "usr_resolved",
    });
    expect(result.current.larkBulkCreateModal.visible).toBe(true);
    expect(result.current.larkBulkCreateModal.stage).toBe("preview");
    expect(result.current.larkBulkCreateModal.preview?.eligibleRecords).toEqual([
      {
        recordId: "rec_1",
        issueNumber: "N-1",
        issueType: "User Story",
        title: "Record one",
        priority: "P0",
      },
    ]);
  });
});
