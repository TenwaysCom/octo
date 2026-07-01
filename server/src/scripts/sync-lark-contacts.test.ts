import {
  formatSyncLarkContactsError,
  LarkCliUserContactClient,
  parseSyncLarkContactsArgs,
} from "./sync-lark-contacts.js";

describe("sync-lark-contacts script", () => {
  it("parses sync options from argv and env", () => {
    expect(
      parseSyncLarkContactsArgs(
        [
          "--base-url",
          "https://open.feishu.cn",
          "--department-id",
          "od_root",
          "--page-size",
          "20",
          "--direct-only",
          "--postgres-uri",
          "postgres://example/db",
        ],
        {},
      ),
    ).toEqual({
      source: "app",
      baseUrl: "https://open.feishu.cn",
      rootDepartmentId: "od_root",
      pageSize: 20,
      includeChildDepartments: false,
      postgresUri: "postgres://example/db",
      larkCliBin: "lark-cli",
    });
  });

  it("falls back to env and rejects invalid page size", () => {
    expect(
      parseSyncLarkContactsArgs([], {
        LARK_OPENAPI_BASE_URL: "https://open.larksuite.com",
        LARK_CONTACT_SYNC_ROOT_DEPARTMENT_ID: "0",
        LARK_CONTACT_SYNC_PAGE_SIZE: "50",
        POSTGRES_URI: "postgres://env/db",
      }),
    ).toEqual({
      source: "app",
      baseUrl: "https://open.larksuite.com",
      rootDepartmentId: "0",
      pageSize: 50,
      includeChildDepartments: true,
      postgresUri: "postgres://env/db",
      larkCliBin: "lark-cli",
    });

    expect(() => parseSyncLarkContactsArgs(["--page-size", "0"], {})).toThrow("Invalid --page-size");
  });

  it("parses direct department sync aliases", () => {
    expect(parseSyncLarkContactsArgs(["--skip-child-departments"], {}).includeChildDepartments).toBe(false);
  });

  it("parses lark-cli user source options", () => {
    expect(
      parseSyncLarkContactsArgs(
        ["--source", "lark-cli-user", "--lark-cli-bin", "/opt/bin/lark-cli"],
        {},
      ),
    ).toMatchObject({
      source: "lark-cli-user",
      larkCliBin: "/opt/bin/lark-cli",
    });
  });

  it("adds guidance for department authority failures", () => {
    expect(formatSyncLarkContactsError(new Error("no dept authority error"))).toContain("--direct-only");
  });

  it("uses lark-cli user identity to list users by department", async () => {
    const calls: string[][] = [];
    const client = new LarkCliUserContactClient({
      larkCliBin: "lark-cli",
      runLarkCli: async (args) => {
        calls.push(args);
        return JSON.stringify({
          code: 0,
          data: {
            items: [
              {
                open_id: "ou_1",
                email: "one@example.com",
                name: "One",
              },
            ],
            has_more: true,
            page_token: "next-page",
          },
        });
      },
    });

    await expect(
      client.listUsersByDepartment({
        departmentId: "od_root",
        pageToken: "current-page",
        pageSize: 20,
      }),
    ).resolves.toEqual({
      users: [{ openId: "ou_1", email: "one@example.com", name: "One" }],
      hasMore: true,
      nextPageToken: "next-page",
    });

    expect(calls).toEqual([
      [
        "api",
        "GET",
        "/open-apis/contact/v3/users/find_by_department",
        "--as",
        "user",
        "--params",
        JSON.stringify({
          department_id_type: "open_department_id",
          department_id: "od_root",
          user_id_type: "open_id",
          page_size: "20",
          page_token: "current-page",
        }),
        "--format",
        "json",
      ],
    ]);
  });
});
