import { LarkContactClient } from "./contact-client.js";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("lark contact client", () => {
  it("uses a tenant access token and lists child departments", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(url), init });

      if (String(url).includes("/open-apis/auth/v3/tenant_access_token/internal")) {
        return jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token-123",
          expire: 7200,
        });
      }

      return jsonResponse({
        code: 0,
        data: {
          items: [
            {
              open_department_id: "od_a",
              name: "Dept A",
            },
          ],
          has_more: true,
          page_token: "next-department-page",
        },
      });
    };

    const client = new LarkContactClient({
      appId: "cli_a",
      appSecret: "secret_a",
      baseUrl: "https://open.larksuite.com",
      fetchImpl,
    });

    await expect(
      client.listChildDepartments({
        departmentId: "0",
        pageToken: "current-page",
      }),
    ).resolves.toEqual({
      departments: [{ openDepartmentId: "od_a", name: "Dept A" }],
      hasMore: true,
      nextPageToken: "next-department-page",
    });

    expect(requests[1]).toMatchObject({
      url: "https://open.larksuite.com/open-apis/contact/v3/departments/0/children?department_id_type=open_department_id&fetch_child=true&page_size=50&page_token=current-page",
      init: {
        method: "GET",
        headers: {
          Authorization: "Bearer tenant-token-123",
        },
      },
    });
  });

  it("lists users by department and maps open id, email, and name", async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (String(url).includes("/open-apis/auth/v3/tenant_access_token/internal")) {
        return jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token-123",
          expire: 7200,
        });
      }

      expect(init?.headers).toMatchObject({
        Authorization: "Bearer tenant-token-123",
      });
      expect(String(url)).toBe(
        "https://open.larksuite.com/open-apis/contact/v3/users/find_by_department?department_id_type=open_department_id&department_id=od_a&user_id_type=open_id&page_size=50&page_token=user-page",
      );

      return jsonResponse({
        code: 0,
        data: {
          items: [
            {
              open_id: "ou_1",
              email: "one@example.com",
              name: "One",
            },
            {
              open_id: "ou_2",
              enterprise_email: "two@example.com",
              en_name: "Two EN",
            },
          ],
          has_more: false,
        },
      });
    };

    const client = new LarkContactClient({
      appId: "cli_a",
      appSecret: "secret_a",
      baseUrl: "https://open.larksuite.com",
      fetchImpl,
    });

    await expect(
      client.listUsersByDepartment({
        departmentId: "od_a",
        pageToken: "user-page",
      }),
    ).resolves.toEqual({
      users: [
        { openId: "ou_1", email: "one@example.com", name: "One" },
        { openId: "ou_2", email: "two@example.com", name: "Two EN" },
      ],
      hasMore: false,
      nextPageToken: undefined,
    });
  });

  it("gets open ids by user emails", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(url), init });

      if (String(url).includes("/open-apis/auth/v3/tenant_access_token/internal")) {
        return jsonResponse({
          code: 0,
          tenant_access_token: "tenant-token-123",
          expire: 7200,
        });
      }

      return jsonResponse({
        code: 0,
        data: {
          user_list: [
            {
              user_id: "ou_1",
              email: "one@example.com",
            },
            {
              user_id: "ou_2",
              email: "two@example.com",
            },
          ],
        },
      });
    };

    const client = new LarkContactClient({
      appId: "cli_a",
      appSecret: "secret_a",
      baseUrl: "https://open.larksuite.com",
      fetchImpl,
    });

    await expect(
      client.getUserIdsByEmails({
        emails: ["one@example.com", "two@example.com"],
      }),
    ).resolves.toEqual([
      { openId: "ou_1", email: "one@example.com", name: null },
      { openId: "ou_2", email: "two@example.com", name: null },
    ]);

    expect(requests[1].url).toBe(
      "https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id",
    );
    expect(requests[1].init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer tenant-token-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emails: ["one@example.com", "two@example.com"],
      }),
    });
  });
});
