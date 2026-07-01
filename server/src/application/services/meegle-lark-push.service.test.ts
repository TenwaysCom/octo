import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeMeegleLarkPush } from "./meegle-lark-push.service.js";

const mocks = vi.hoisted(() => ({
  getResolvedUserStore: vi.fn(),
  refreshCredential: vi.fn(),
  getConfiguredMeegleAuthServiceDeps: vi.fn(),
  createMeegleClient: vi.fn(),
  buildAuthenticatedLarkClient: vi.fn(),
}));

vi.mock("../../adapters/postgres/resolved-user-store.js", () => ({
  getResolvedUserStore: mocks.getResolvedUserStore,
}));

vi.mock("./meegle-credential.service.js", () => ({
  refreshCredential: mocks.refreshCredential,
}));

vi.mock("../../modules/meegle-auth/meegle-auth.service.js", () => ({
  getConfiguredMeegleAuthServiceDeps: mocks.getConfiguredMeegleAuthServiceDeps,
}));

vi.mock("./meegle-client.factory.js", () => ({
  createMeegleClient: mocks.createMeegleClient,
}));

vi.mock("./lark-auth-client.factory.js", () => ({
  buildAuthenticatedLarkClient: mocks.buildAuthenticatedLarkClient,
}));

describe("executeMeegleLarkPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getResolvedUserStore.mockReturnValue({
      getById: vi.fn().mockResolvedValue({
        id: "master_1",
        meegleUserKey: "meegle_user_1",
      }),
    });
    mocks.getConfiguredMeegleAuthServiceDeps.mockReturnValue({
      authAdapter: {},
      tokenStore: {},
      meegleAuthBaseUrl: "https://project.larksuite.com",
    });
    mocks.refreshCredential.mockResolvedValue({
      tokenStatus: "ready",
      userToken: "user_token",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("mentions Meegle followers by resolving their emails before sending the Lark message", async () => {
    const updateWorkitem = vi.fn().mockResolvedValue(undefined);
    const getUsers = vi.fn().mockResolvedValue([
      {
        user_key: "7538275242901323808",
        email: "rick.hu@tenways.com",
        name: "Rick Hu",
      },
    ]);
    mocks.createMeegleClient.mockResolvedValue({
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "12562490",
          key: "PB-1",
          name: "Production bug",
          type: "production_bug",
          status: "Open",
          fields: {
            field_c22a1a: "回复测试",
            field_8d0341: "https://applink.larksuite.com/client/chat/chatter/add_by_link?chatid=oc_test",
            fields: [
              {
                field_key: "watchers",
                field_alias: "watchers",
                field_name: "Follower",
                field_type_key: "multi_user",
                field_value: ["7538275242901323808"],
              },
            ],
          },
        },
      ]),
      getUsers,
      updateWorkitem,
    });

    const sendMessage = vi.fn().mockResolvedValue({ message_id: "om_sent" });
    mocks.buildAuthenticatedLarkClient.mockResolvedValue({
      baseUrl: "https://open.larksuite.com",
      client: {
        sendMessage,
        addMessageReaction: vi.fn(),
      },
    });

    const larkContactResolver = {
      resolveByEmails: vi.fn().mockResolvedValue([
        { email: "rick.hu@tenways.com", openId: "ou_rick", name: "Rick Hu" },
      ]),
    };

    const result = await executeMeegleLarkPush(
      {
        projectKey: "4c3fv6",
        workItemTypeKey: "production_bug",
        workItemId: "12562490",
        masterUserId: "master_1",
        baseUrl: "https://project.larksuite.com",
      },
      { larkContactResolver } as never,
    );

    expect(result).toMatchObject({ ok: true, messageSent: true });
    expect(getUsers).toHaveBeenCalledWith(["7538275242901323808"]);
    expect(larkContactResolver.resolveByEmails).toHaveBeenCalledWith(
      ["rick.hu@tenways.com"],
      {
        meegleUsers: [
          {
            userKey: "7538275242901323808",
            email: "rick.hu@tenways.com",
            name: "Rick Hu",
          },
        ],
      },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "chat_id",
      "oc_test",
      "text",
      JSON.stringify({
        text: '<at user_id="ou_rick">Rick Hu</at>\n回复测试',
      }),
    );
    expect(updateWorkitem).toHaveBeenCalled();
  });

  it("mentions Meegle followers by existing user key mapping when Meegle has no email", async () => {
    const updateWorkitem = vi.fn().mockResolvedValue(undefined);
    const getUsers = vi.fn().mockResolvedValue([
      {
        user_key: "7538275242901323808",
        email: "",
        name: "Rick Hu",
      },
    ]);
    mocks.createMeegleClient.mockResolvedValue({
      getWorkitemDetails: vi.fn().mockResolvedValue([
        {
          id: "12562490",
          key: "PB-1",
          name: "Production bug",
          type: "production_bug",
          status: "Open",
          fields: {
            field_c22a1a: "回复测试",
            field_8d0341: "https://applink.larksuite.com/client/chat/chatter/add_by_link?chatid=oc_test",
            fields: [
              {
                field_key: "watchers",
                field_alias: "watchers",
                field_name: "Follower",
                field_type_key: "multi_user",
                field_value: ["7538275242901323808"],
              },
            ],
          },
        },
      ]),
      getUsers,
      updateWorkitem,
    });

    const sendMessage = vi.fn().mockResolvedValue({ message_id: "om_sent" });
    mocks.buildAuthenticatedLarkClient.mockResolvedValue({
      baseUrl: "https://open.larksuite.com",
      client: {
        sendMessage,
        addMessageReaction: vi.fn(),
      },
    });

    const larkContactResolver = {
      resolveByEmails: vi.fn().mockResolvedValue([
        { email: null, openId: "ou_rick", name: "Rick Hu" },
      ]),
    };

    const result = await executeMeegleLarkPush(
      {
        projectKey: "4c3fv6",
        workItemTypeKey: "production_bug",
        workItemId: "12562490",
        masterUserId: "master_1",
        baseUrl: "https://project.larksuite.com",
      },
      { larkContactResolver } as never,
    );

    expect(result).toMatchObject({ ok: true, messageSent: true });
    expect(larkContactResolver.resolveByEmails).toHaveBeenCalledWith(
      [],
      {
        meegleUsers: [
          {
            userKey: "7538275242901323808",
            email: null,
            name: "Rick Hu",
          },
        ],
      },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      "chat_id",
      "oc_test",
      "text",
      JSON.stringify({
        text: '<at user_id="ou_rick">Rick Hu</at>\n回复测试',
      }),
    );
  });
});
