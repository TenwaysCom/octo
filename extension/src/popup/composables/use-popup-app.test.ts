// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getLarkAuthStatus: vi.fn(),
  clearResolvedIdentity: vi.fn(),
  clearResolvedIdentityForTab: vi.fn(),
  loadPopupSettings: vi.fn(),
  loadResolvedIdentity: vi.fn(),
  queryActiveTabContext: vi.fn(),
  requestLarkUserId: vi.fn(),
  requestMeegleUserIdentity: vi.fn(),
  resolveIdentityRequest: vi.fn(),
  runLarkAuthRequest: vi.fn(),
  runMeegleAuthRequest: vi.fn(),
  saveResolvedIdentityForTab: vi.fn(),
  watchLarkAuthCallbackResult: vi.fn(),
  saveResolvedIdentity: vi.fn(),
  savePopupSettings: vi.fn(),
}));

const meegleAuthControllerMock = vi.hoisted(() => ({
  run: vi.fn(),
  getLastAuth: vi.fn(),
}));

const kimiChatClientMock = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock("../runtime.js", () => runtimeMock);

vi.mock("../meegle-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../meegle-auth.js")>(
    "../meegle-auth.js",
  );

  return {
    ...actual,
    createMeegleAuthController: vi.fn(() => meegleAuthControllerMock),
  };
});

vi.mock("../kimi-chat.js", async () => {
  const actual = await vi.importActual<typeof import("../kimi-chat.js")>(
    "../kimi-chat.js",
  );

  return {
    ...actual,
    createKimiChatClient: vi.fn(() => kimiChatClientMock),
  };
});

import { usePopupApp } from "./use-popup-app";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function stubAnimationFrames() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((handle: number) => {
      callbacks.delete(handle);
    }),
  );

  return {
    requestAnimationFrameMock: vi.mocked(globalThis.requestAnimationFrame),
    flushNextFrame() {
      const next = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!next) {
        return;
      }

      callbacks.delete(next[0]);
      next[1](0);
    },
  };
}

describe("usePopupApp notebook state", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtimeMock.getConfig.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      MEEGLE_BASE_URL: "https://project.larksuite.com",
      LARK_APP_ID: "cli_test",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
    });
    runtimeMock.getLarkAuthStatus.mockResolvedValue({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
      expiresAt: "2026-04-02T21:01:00.000Z",
    });
    runtimeMock.loadPopupSettings.mockResolvedValue({
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "lark",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue("ou_user");
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue(undefined);
    runtimeMock.loadResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_resolved",
        identityStatus: "active",
        operatorLarkId: "ou_resolved",
        larkEmail: "user@example.com",
      },
    });
    runtimeMock.runLarkAuthRequest.mockResolvedValue({
      status: "in_progress",
      baseUrl: "https://open.larksuite.com",
      state: "state_123",
    });
    runtimeMock.runMeegleAuthRequest.mockResolvedValue({
      status: "ready",
      baseUrl: "https://project.larksuite.com",
      credentialStatus: "active",
    });
    runtimeMock.clearResolvedIdentity.mockResolvedValue(undefined);
    runtimeMock.clearResolvedIdentityForTab.mockResolvedValue(undefined);
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

  it("does not auto-start lark oauth during initialization", async () => {
    const popup = usePopupApp();

    await popup.initialize();

    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(1);
    expect(runtimeMock.runLarkAuthRequest).not.toHaveBeenCalled();
    expect(popup.larkStatus.value.text).toContain("已授权");
    expect(popup.larkStatus.value.text).toMatch(/已授权 · \d{2}-\d{2} \d{2}:\d{2}/);
  });

  it("starts lark oauth only after the user clicks authorize", async () => {
    runtimeMock.getLarkAuthStatus
      .mockResolvedValueOnce({
        status: "require_auth",
        baseUrl: "https://open.larksuite.com",
        reason: "No stored Lark token found",
      })
      .mockResolvedValueOnce({
        status: "require_auth",
        baseUrl: "https://open.larksuite.com",
        reason: "No stored Lark token found",
      });

    const popup = usePopupApp();

    await popup.initialize();
    await popup.authorizeLark();

    expect(runtimeMock.runLarkAuthRequest).toHaveBeenCalledTimes(1);
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已打开 Lark 授权页")),
    ).toBe(true);
  });

  it("switches to settings and restores the saved snapshot on cancel", async () => {
    const popup = usePopupApp();

    await popup.initialize();
    expect(popup.headerSubtitle.value).toBe("Lark");
    popup.openSettings();
    expect(popup.headerSubtitle.value).toBe("Settings");
    popup.settingsForm.SERVER_URL = "http://changed.local";

    popup.closeSettings();

    expect(popup.activePage.value).toBe("home");
    expect(popup.headerSubtitle.value).toBe("Lark");
    expect(popup.settingsForm.SERVER_URL).toBe("http://localhost:3000");
  });

  it("returns to home after save and refreshes auth state", async () => {
    const popup = usePopupApp();

    await popup.initialize();
    popup.openSettings();
    popup.settingsForm.SERVER_URL = "http://saved.local";

    await popup.saveSettingsForm();

    expect(runtimeMock.savePopupSettings).toHaveBeenCalledWith({
      SERVER_URL: "http://saved.local",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
      meegleUserKey: "7538275242901291040",
      larkUserId: "ou_user",
    });
    expect(popup.activePage.value).toBe("home");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(2);
  });

  it("reloads the latest server callback url from settings", async () => {
    runtimeMock.loadPopupSettings
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      })
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      })
      .mockResolvedValueOnce({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "https://example.ngrok-free.app/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_user",
      });

    const popup = usePopupApp();

    await popup.initialize();
    popup.openSettings();
    await popup.refreshServerConfig();

    expect(popup.settingsForm.LARK_OAUTH_CALLBACK_URL).toBe(
      "https://example.ngrok-free.app/api/lark/auth/callback",
    );
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已刷新服务端配置")),
    ).toBe(true);
  });

  it("shows the resolved platform while auth checks are still loading", async () => {
    const meegleStatusRequest = createDeferred<Response>();
    vi.mocked(globalThis.fetch).mockReturnValue(meegleStatusRequest.promise);

    const popup = usePopupApp();
    const initializePromise = popup.initialize();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(popup.state.pageType).toBe("lark");
    expect(popup.headerSubtitle.value).toBe("Lark");

    meegleStatusRequest.resolve({
      ok: true,
      json: async () => ({
        data: {
          status: "ready",
          baseUrl: "https://project.larksuite.com",
          credentialStatus: "active",
        },
      }),
    } as Response);

    await initializePromise;
  });

  it("updates meegle auth state before lark auth finishes", async () => {
    const larkAuthRequest = createDeferred<{
      status: "ready";
      baseUrl: string;
    }>();
    runtimeMock.getLarkAuthStatus.mockReturnValueOnce(larkAuthRequest.promise);

    const popup = usePopupApp();
    const initializePromise = popup.initialize();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(popup.topMeegleButtonText.value).toBe("授权");
    await vi.waitFor(() => {
      expect(popup.state.meegleAuth?.status).toBe("ready");
      expect(popup.state.isAuthed.meegle).toBe(true);
      expect(popup.topMeegleButtonText.value).toBe("已授权");
      expect(popup.meegleStatus.value.text).toContain("已授权");
    });

    larkAuthRequest.resolve({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
    });

    await initializePromise;
  });

  it("clears the scanning state when initialization fails", async () => {
    runtimeMock.getLarkAuthStatus.mockRejectedValueOnce(
      new Error("background offline"),
    );

    const popup = usePopupApp();

    await popup.initialize();

    expect(popup.isLoading.value).toBe(false);
    expect(popup.headerSubtitle.value).toBe("Lark");
    expect(
      popup.logs.value.some((entry) => entry.message.includes("background offline")),
    ).toBe(true);
  });

  it("refreshes Lark auth and logs success when callback completion arrives", async () => {
    let callbackListener:
      | ((result: {
          state: string;
          status: "ready" | "failed";
          masterUserId?: string;
          reason?: string;
        }) => void)
      | undefined;
    runtimeMock.watchLarkAuthCallbackResult.mockImplementation((listener) => {
      callbackListener = listener;
      return () => {};
    });

    const popup = usePopupApp();
    await popup.initialize();
    runtimeMock.saveResolvedIdentity.mockClear();

    runtimeMock.getLarkAuthStatus.mockResolvedValueOnce({
      status: "ready",
      baseUrl: "https://open.larksuite.com",
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
    expect(popup.state.identity.masterUserId).toBe("usr_callback");
    expect(runtimeMock.getLarkAuthStatus).toHaveBeenCalledTimes(2);
    expect(
      popup.logs.value.some((entry) => entry.message.includes("Lark 授权完成")),
    ).toBe(true);
  });

  it("resolves and caches masterUserId during initialization", async () => {
    const popup = usePopupApp();

    await popup.initialize();

    expect(runtimeMock.resolveIdentityRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorLarkId: "ou_user",
        meegleUserKey: "7538275242901291040",
      }),
    );
    expect(runtimeMock.saveResolvedIdentity).toHaveBeenCalledWith(
      "usr_resolved",
    );
    expect(runtimeMock.saveResolvedIdentityForTab).toHaveBeenCalledWith(
      12,
      "usr_resolved",
    );
    expect(popup.state.identity.masterUserId).toBe("usr_resolved");
    expect(popup.state.identity.larkId).toBe("ou_resolved");
    expect(popup.state.identity.larkEmail).toBe("user@example.com");
  });

  it("resolves masterUserId before running meegle auth", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue({
      userKey: "user_from_page",
    });

    const popup = usePopupApp();
    await popup.initialize();

    meegleAuthControllerMock.run.mockClear();
    runtimeMock.resolveIdentityRequest.mockClear();

    await popup.authorizeMeegle();

    expect(runtimeMock.resolveIdentityRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        meegleUserKey: "user_from_page",
      }),
    );
    expect(meegleAuthControllerMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        masterUserId: "usr_resolved",
        meegleUserKey: "user_from_page",
      }),
    );
  });

  it("fills the settings form from the current meegle page when requested manually", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/4c3fv6/overview",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        userKey: "user_from_cookie",
      });

    const popup = usePopupApp();
    await popup.initialize();

    popup.openSettings();
    popup.settingsForm.meegleUserKey = "";

    await popup.fetchMeegleUserKey();

    expect(runtimeMock.requestMeegleUserIdentity).toHaveBeenLastCalledWith(
      12,
      "https://project.larksuite.com/4c3fv6/overview",
    );
    expect(popup.settingsForm.meegleUserKey).toBe("user_from_cookie");
    expect(popup.state.identity.meegleUserKey).toBe("user_from_cookie");
    expect(
      popup.logs.value.some((entry) => entry.message.includes("已获取 Meegle User Key")),
    ).toBe(true);
  });

  it("blocks meegle auth when resolve reports an identity conflict", async () => {
    runtimeMock.queryActiveTabContext.mockResolvedValue({
      id: 12,
      url: "https://project.larksuite.com/wiki/test",
      origin: "https://project.larksuite.com",
      pageType: "meegle",
    });
    runtimeMock.requestLarkUserId.mockResolvedValue(undefined);
    runtimeMock.requestMeegleUserIdentity.mockResolvedValue({
      userKey: "user_from_page",
    });

    const popup = usePopupApp();
    await popup.initialize();

    meegleAuthControllerMock.run.mockClear();
    runtimeMock.resolveIdentityRequest.mockClear();
    runtimeMock.resolveIdentityRequest.mockResolvedValue({
      ok: true,
      data: {
        masterUserId: "usr_conflict",
        identityStatus: "conflict",
      },
    });

    await popup.authorizeMeegle();

    expect(meegleAuthControllerMock.run).not.toHaveBeenCalled();
    expect(popup.state.identity.masterUserId).toBeNull();
    expect(runtimeMock.clearResolvedIdentity).toHaveBeenCalledTimes(1);
    expect(runtimeMock.clearResolvedIdentityForTab).toHaveBeenCalledWith(12);
    expect(popup.logs.value.some((entry) => entry.message.includes("账号冲突"))).toBe(true);
  });

  it("opens the Kimi chat panel from analyze", async () => {
    const popup = usePopupApp();

    popup.runFeatureAction("analyze");

    expect(popup.showKimiChat.value).toBe(true);
    expect(
      popup.logs.value.some((entry) =>
        entry.message.includes("已打开 Kimi ACP 聊天面板"),
      ),
    ).toBe(true);
  });

  it("resets the Kimi chat session when analyze is triggered again", async () => {
    const popup = usePopupApp();

    popup.runFeatureAction("analyze");
    popup.kimiChatSessionId.value = "sess_1";
    popup.kimiChatTranscript.value = [
      {
        id: "user-1",
        kind: "user",
        text: "first turn",
      },
    ];

    popup.runFeatureAction("analyze");

    expect(popup.kimiChatSessionId.value).toBeNull();
    expect(popup.kimiChatTranscript.value).toEqual([]);
    expect(
      popup.logs.value.some((entry) =>
        entry.message.includes("已重置 Kimi ACP 会话"),
      ),
    ).toBe(true);
  });

  it("appends Kimi transcript entries before the request finishes", async () => {
    const deferred = createDeferred<void>();
    let onEvent:
      | ((event: {
          event: string;
          data: Record<string, unknown>;
        }) => void)
      | undefined;
    kimiChatClientMock.sendMessage.mockImplementationOnce(
      async (
        _input: { operatorLarkId: string; message: string },
        handlers?: {
          onEvent?: (event: {
            event: string;
            data: Record<string, unknown>;
          }) => void;
        },
      ) => {
        onEvent = handlers?.onEvent;
        await deferred.promise;
      },
    );

    const popup = usePopupApp();
    popup.state.identity.larkId = "ou_test";

    const sendPromise = popup.sendKimiChatMessage("请介绍一下会话状态");

    expect(popup.showKimiChat.value).toBe(true);
    await vi.waitFor(() => {
      expect(kimiChatClientMock.sendMessage).toHaveBeenCalledTimes(1);
    });

    onEvent?.({
      event: "session.created",
      data: {
        sessionId: "sess_1",
      },
    });

    await vi.waitFor(() => {
      expect(
        popup.kimiChatTranscript.value.some((entry) =>
          entry.kind === "status" && entry.text?.includes("会话已创建 · sess_1"),
        ),
      ).toBe(true);
    });

    expect(kimiChatClientMock.sendMessage).toHaveBeenCalledWith(
      {
        operatorLarkId: "ou_test",
        message: "请介绍一下会话状态",
      },
      expect.objectContaining({
        onEvent: expect.any(Function),
      }),
    );

    onEvent?.({
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "你",
          },
        },
      },
    });

    await vi.waitFor(() => {
      const assistantEntries = popup.kimiChatTranscript.value.filter((entry) =>
        entry.kind === "assistant",
      );
      expect(assistantEntries).toHaveLength(1);
      expect(assistantEntries[0].text).toBe("你");
    });

    onEvent?.({
      event: "acp.session.update",
      data: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "好",
          },
        },
      },
    });
    onEvent?.({
      event: "done",
      data: {
        sessionId: "sess_1",
        stopReason: "end_turn",
      },
    });

    deferred.resolve();
    await sendPromise;

    const assistantEntries = popup.kimiChatTranscript.value.filter((entry) =>
      entry.kind === "assistant",
    );
    expect(assistantEntries).toHaveLength(1);
    expect(assistantEntries[0].text).toBe("你好");
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "status" && entry.text?.includes("本轮已完成 · end_turn"),
      ),
    ).toBe(true);
    expect(popup.kimiChatBusy.value).toBe(false);
  });

  it("allows stopping an in-flight response and ignores stale chunks after abort", async () => {
    const animationFrames = stubAnimationFrames();
    let onEvent:
      | ((event: {
          event: string;
          data: Record<string, unknown>;
        }) => void)
      | undefined;
    let signal: AbortSignal | undefined;

    kimiChatClientMock.sendMessage.mockImplementationOnce(
      async (
        _input: { operatorLarkId: string; sessionId?: string; message: string },
        handlers?: {
          onEvent?: (event: {
            event: string;
            data: Record<string, unknown>;
          }) => void;
          signal?: AbortSignal;
        },
      ) =>
        new Promise<void>((_resolve, reject) => {
          onEvent = handlers?.onEvent;
          signal = handlers?.signal;
          signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            },
            { once: true },
          );
        }),
    );

    const popup = usePopupApp();
    popup.state.identity.larkId = "ou_test";
    popup.runFeatureAction("analyze");

    const sendPromise = popup.sendKimiChatMessage("请先开始，然后我会停止");

    await vi.waitFor(() => {
      expect(kimiChatClientMock.sendMessage).toHaveBeenCalledWith(
        {
          operatorLarkId: "ou_test",
          message: "请先开始，然后我会停止",
        },
        expect.objectContaining({
          onEvent: expect.any(Function),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    onEvent?.({
      event: "session.created",
      data: {
        sessionId: "sess_abort",
      },
    });
    onEvent?.({
      event: "acp.session.update",
      data: {
        sessionId: "sess_abort",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "这段在停止前已经到了",
          },
        },
      },
    });

    popup.stopKimiChatGeneration();
    await sendPromise;

    expect(signal?.aborted).toBe(true);
    expect(popup.kimiChatBusy.value).toBe(false);
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.text?.includes("这段在停止前已经到了"),
      ),
    ).toBe(true);
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "status" && entry.text?.includes("已停止生成"),
      ),
    ).toBe(true);

    const transcriptBeforeLateChunk = popup.kimiChatTranscript.value.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      text: entry.text,
    }));

    onEvent?.({
      event: "acp.session.update",
      data: {
        sessionId: "sess_abort",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "这段不应该再出现",
          },
        },
      },
    });
    animationFrames.flushNextFrame();

    expect(
      popup.kimiChatTranscript.value.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        text: entry.text,
      })),
    ).toEqual(transcriptBeforeLateChunk);
  });

  it("batches high-frequency streaming events until the animation frame flushes", async () => {
    const animationFrames = stubAnimationFrames();
    const deferred = createDeferred<void>();

    kimiChatClientMock.sendMessage.mockImplementationOnce(
      async (
        _input: { operatorLarkId: string; sessionId?: string; message: string },
        handlers?: {
          onEvent?: (event: {
            event: string;
            data: Record<string, unknown>;
          }) => void;
          signal?: AbortSignal;
        },
      ) => {
        handlers?.onEvent?.({
          event: "session.created",
          data: {
            sessionId: "sess_burst",
          },
        });
        handlers?.onEvent?.({
          event: "acp.session.update",
          data: {
            sessionId: "sess_burst",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "你",
              },
            },
          },
        });
        handlers?.onEvent?.({
          event: "acp.session.update",
          data: {
            sessionId: "sess_burst",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: "好",
              },
            },
          },
        });
        await deferred.promise;
      },
    );

    const popup = usePopupApp();
    popup.state.identity.larkId = "ou_test";
    popup.runFeatureAction("analyze");

    const sendPromise = popup.sendKimiChatMessage("高频流式更新");

    await vi.waitFor(() => {
      expect(kimiChatClientMock.sendMessage).toHaveBeenCalledTimes(1);
    });

    expect(animationFrames.requestAnimationFrameMock).toHaveBeenCalled();
    expect(
      popup.kimiChatTranscript.value.some((entry) => entry.kind === "assistant"),
    ).toBe(false);

    animationFrames.flushNextFrame();

    const assistantEntries = popup.kimiChatTranscript.value.filter((entry) =>
      entry.kind === "assistant",
    );
    expect(assistantEntries).toHaveLength(1);
    expect(assistantEntries[0]?.text).toBe("你好");

    deferred.resolve();
    await sendPromise;
  });

  it("reuses the current sessionId on a second send while keeping transcript history", async () => {
    kimiChatClientMock.sendMessage
      .mockImplementationOnce(
        async (
          _input: { operatorLarkId: string; sessionId?: string; message: string },
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
                  text: "first reply",
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
      )
      .mockImplementationOnce(
        async (
          _input: { operatorLarkId: string; sessionId?: string; message: string },
          handlers?: {
            onEvent?: (event: {
              event: string;
              data: Record<string, unknown>;
            }) => void;
          },
        ) => {
          handlers?.onEvent?.({
            event: "acp.session.update",
            data: {
              sessionId: "sess_1",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: "follow up reply",
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

    const popup = usePopupApp();
    popup.state.identity.larkId = "ou_test";

    popup.runFeatureAction("analyze");
    await popup.sendKimiChatMessage("first turn");

    expect(popup.kimiChatSessionId.value).toBe("sess_1");
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "assistant" && entry.text?.includes("first reply"),
      ),
    ).toBe(true);

    popup.updateKimiChatDraftMessage("follow up");
    await popup.sendKimiChatMessage("follow up");

    expect(kimiChatClientMock.sendMessage).toHaveBeenNthCalledWith(
      1,
      {
        operatorLarkId: "ou_test",
        message: "first turn",
      },
      expect.objectContaining({
        onEvent: expect.any(Function),
      }),
    );
    expect(kimiChatClientMock.sendMessage).toHaveBeenNthCalledWith(
      2,
      {
        operatorLarkId: "ou_test",
        sessionId: "sess_1",
        message: "follow up",
      },
      expect.objectContaining({
        onEvent: expect.any(Function),
      }),
    );
    expect(
      popup.kimiChatTranscript.value.filter((entry) =>
        entry.kind === "status" && entry.text?.includes("会话已创建"),
      ),
    ).toHaveLength(1);
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "assistant" && entry.text?.includes("first reply"),
      ),
    ).toBe(true);
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "assistant" && entry.text?.includes("follow up reply"),
      ),
    ).toBe(true);
    expect(
      popup.kimiChatTranscript.value.filter((entry) =>
        entry.kind === "assistant",
      ),
    ).toHaveLength(2);
    expect(popup.kimiChatDraftMessage.value).toBe("");
  });

  it("clears a stale sessionId and restores the draft when a follow-up fails", async () => {
    const staleSessionError = Object.assign(
      new Error("session expired"),
      {
        code: "SESSION_NOT_FOUND",
      },
    );
    kimiChatClientMock.sendMessage.mockRejectedValueOnce(staleSessionError);

    const popup = usePopupApp();
    popup.state.identity.larkId = "ou_test";
    popup.runFeatureAction("analyze");
    popup.kimiChatSessionId.value = "sess_stale";
    popup.updateKimiChatDraftMessage("follow up");

    await popup.sendKimiChatMessage("follow up");

    expect(popup.kimiChatSessionId.value).toBeNull();
    expect(popup.kimiChatDraftMessage.value).toBe("follow up");
    expect(
      popup.logs.value.some((entry) =>
        entry.message.includes("session expired"),
      ),
    ).toBe(true);
    expect(
      popup.kimiChatTranscript.value.some((entry) =>
        entry.kind === "user" && entry.text?.includes("follow up"),
      ),
    ).toBe(false);
  });
});
