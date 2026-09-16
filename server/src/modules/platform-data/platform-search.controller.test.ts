import type { Request, Response } from "express";
import { createApiAuthMiddleware } from "../../http/api-auth.js";
import { createWebPlatformSearchController } from "./platform-search.controller.js";
import { createWebPlatformDataController } from "./platform-data.controller.js";
import { createPlatformSearchService } from "../../application/services/platform-search.service.js";

describe("web platform search", () => {
  const service = () => ({ search: vi.fn().mockResolvedValue({ items: [], hasMore: false }), listTicketFilterOptions: vi.fn().mockResolvedValue({ requester: [], responsible: [], issueType: [] }) });
  const input = { cookieHeader: "octo_web_session=session-token", query: { q: "  订单 #42  ", actionRunId: "search-1" }, operation: "search" as const };

  it.each(["search", "ticket-filter-options"] as const)("requires a session and platformLists access for %s", async (operation) => {
    const api = service();
    for (const session of [{ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Sign in" }, { ok: true, role: "guest" }]) {
      const controller = createWebPlatformSearchController({ service: api, ensureSession: vi.fn().mockResolvedValue(session) });
      expect((await controller({ ...input, operation })).statusCode).toBe(session.ok ? 403 : 401);
    }
    expect(api.search).not.toHaveBeenCalled();
    expect(api.listTicketFilterOptions).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/web/platform-data/search", "search"],
    ["/api/web/platform-data/lark-ticket-filter-options", "ticket-filter-options"],
  ] as const)("uses Web session authentication after shared middleware for %s", async (path, operation) => {
    for (const role of ["dev", "guest", undefined]) {
      const api = service();
      const ensureSession = vi.fn().mockResolvedValue(role
        ? { ok: true, role }
        : { ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "Sign in" });
      const controller = createWebPlatformSearchController({ service: api, ensureSession });
      const req = {
        method: "GET", path, query: operation === "search" ? { q: "42" } : {},
        headers: role ? { cookie: input.cookieHeader } : {},
      } as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn(async () => {
        const result = await controller({ cookieHeader: req.headers.cookie, query: req.query, operation });
        res.status(result.statusCode).json(result.body);
      });
      createApiAuthMiddleware()(req, res as unknown as Response, next);
      expect(next).toHaveBeenCalledOnce();
      await next.mock.results[0].value;
      expect(ensureSession).toHaveBeenCalledWith(role ? "session-token" : undefined);
      expect(res.status).toHaveBeenCalledWith(role === "dev" ? 200 : role === "guest" ? 403 : 401);
      if (role === "dev") {
        expect(operation === "search" ? api.search : api.listTicketFilterOptions).toHaveBeenCalledOnce();
      } else {
        expect(api.search).not.toHaveBeenCalled();
        expect(api.listTicketFilterOptions).not.toHaveBeenCalled();
      }
    }
  });

  it("keeps adjacent platform-data routes protected by shared middleware", () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    createApiAuthMiddleware()({ method: "GET", path: "/api/web/platform-data/search-admin", headers: {} } as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates the query and passes trimmed text and pagination to the service", async () => {
    const api = service();
    const ensureSession = vi.fn().mockResolvedValue({ ok: true, role: "dev" });
    const controller = createWebPlatformSearchController({ service: api, ensureSession });
    expect((await controller(input)).statusCode).toBe(200);
    expect(ensureSession).toHaveBeenCalledWith("session-token");
    expect(api.search).toHaveBeenCalledWith({ query: "订单 #42", limit: 20, offset: 0 });
    for (const query of [{}, { q: " " }, { q: "x".repeat(201) }, { q: ["one", "two"] }, { q: "x", offset: -1 }, { q: "x", limit: 51 }, { q: "x", extra: true }]) {
      expect((await controller({ ...input, query })).statusCode).toBe(400);
    }
    expect(api.search).toHaveBeenCalledTimes(1);
    expect((await controller({ ...input, query: {}, operation: "ticket-filter-options" })).statusCode).toBe(200);
  });

  it("returns a safe correlated error instead of exposing database failures", async () => {
    const api = service();
    api.search.mockRejectedValue(new Error("private database details"));
    const controller = createWebPlatformSearchController({ service: api, ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "pm" }) });
    const result = await controller(input);
    expect(result).toMatchObject({ statusCode: 500, body: { ok: false, error: { layer: "server", module: "platform-search", stage: "server.search.read", actionRunId: "search-1", errorCode: "PLATFORM_SEARCH_READ_FAILED" } } });
    expect(JSON.stringify(result)).not.toContain("private database");
  });

  it("validates the selected result kind and passes it through with the requested page", async () => {
    const api = service();
    const controller = createWebPlatformSearchController({ service: api, ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev" }) });
    expect((await controller({ ...input, query: { q: "checkout", kind: "github-pull-requests", offset: "20" } })).statusCode).toBe(200);
    expect(api.search).toHaveBeenCalledWith({ query: "checkout", kind: "github-pull-requests", limit: 20, offset: 20 });
    expect((await controller({ ...input, query: { q: "checkout", kind: "documents" } })).statusCode).toBe(400);
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it("uses one extra row for pagination and exposes only the search projection", async () => {
    const row = { kind: "lark-tickets" as const, title: "Ticket", number: "42", status: "Open", scope: "base/table", source_id: "rec-1", item_type_key: null, item_type: "Bug", url: null, fields_json: "private" };
    const store = { search: vi.fn().mockResolvedValue([row, { ...row, source_id: "rec-2" }]), listTicketFilterOptions: vi.fn() };
    const result = await createPlatformSearchService({ store }).search({ query: "42", kind: "lark-tickets", limit: 1, offset: 10 });
    expect(store.search).toHaveBeenCalledWith({ query: "42", kind: "lark-tickets", limit: 2, offset: 10 });
    expect(result).toEqual({ items: [{ kind: "lark-tickets", title: "Ticket", number: "42", status: "Open", scope: "base/table", sourceId: "rec-1", issueType: "Bug" }], hasMore: true, nextOffset: 11 });
  });

  it("passes Ticket query and requester filters together and rejects them for other kinds", async () => {
    const api = { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const controller = createWebPlatformDataController({ service: api, ensureSession: vi.fn().mockResolvedValue({ ok: true, role: "dev" }) });
    const query = { q: " Checkout ", requester: ["Ada", "Bob"], responsible: "Ann", issueType: "Bug", offset: "1000" };
    expect((await controller({ ...input, kind: "lark-tickets", query })).statusCode).toBe(200);
    expect(api.list).toHaveBeenCalledWith("lark-tickets", 1000, { larkTickets: { query: "Checkout", requesters: ["Ada", "Bob"], responsibles: ["Ann"], issueTypes: ["Bug"], offset: 1000 } });
    for (const kind of ["meegle-workitems", "github-pull-requests"] as const) {
      expect((await controller({ ...input, kind, query: { requester: "Ada" } })).statusCode).toBe(400);
      expect((await controller({ ...input, kind, query: { q: "Checkout" } })).statusCode).toBe(400);
    }
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
