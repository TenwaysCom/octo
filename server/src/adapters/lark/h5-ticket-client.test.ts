import { createLarkH5TicketClient } from "./h5-ticket-client.js";

describe("Lark H5 ticket cache", () => {
  it("uses tenant token, shares concurrent requests and refreshes before expiry", async () => {
    let time = 1000;
    const fetchImpl = vi.fn().mockImplementation(async (url: URL, init: RequestInit) => {
      if (url.pathname.endsWith("tenant_access_token/internal")) return Response.json({ code: 0, tenant_access_token: "tenant-token", expire: 7200 });
      expect(url.toString()).toBe("https://open.larksuite.com/open-apis/jssdk/ticket/get");
      expect(init.headers).toMatchObject({ Authorization: "Bearer tenant-token" });
      return Response.json({ code: 0, data: { ticket: "private-ticket", expire_in: 120 } });
    });
    const client = createLarkH5TicketClient({ appId: "cli_test", appSecret: "secret", baseUrl: "https://open.larksuite.com", fetchImpl, now: () => time });
    expect(await Promise.all([client.getTicket(), client.getTicket()])).toEqual(["private-ticket", "private-ticket"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await client.getTicket();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    time += 109000;
    await client.getTicket();
    expect(fetchImpl).toHaveBeenCalledTimes(3); // ticket refresh reuses valid tenant token
    time += 7200000;
    await client.getTicket();
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("failed refresh is not cached and never exposes provider error data", async () => {
    let failure = true;
    const fetchImpl = vi.fn().mockImplementation(async (url: URL) => url.pathname.endsWith("tenant_access_token/internal")
      ? Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      : Response.json(failure ? { code: 999, msg: "secret-provider-error" } : { code: 0, data: { ticket: "ticket", expire_in: 7200 } }));
    const client = createLarkH5TicketClient({ appId: "cli", appSecret: "secret", baseUrl: "https://open.larksuite.com", fetchImpl });
    await expect(client.getTicket()).rejects.toThrow("H5_TICKET_FETCH_FAILED");
    failure = false;
    expect(await client.getTicket()).toBe("ticket");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
