import { describe, expect, it, vi } from "vitest";

import { createServerRequestHeaders, fetchServerJson } from "./server-request.js";

describe("createServerRequestHeaders", () => {
  it("adds master-user-id when masterUserId is provided", () => {
    expect(createServerRequestHeaders({ masterUserId: "usr_123" })).toEqual({
      "Content-Type": "application/json",
      "master-user-id": "usr_123",
    });
  });
});

describe("fetchServerJson", () => {
  it("posts JSON with shared headers and returns the parsed payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { value: 1 } }),
    } as Response);

    await expect(
      fetchServerJson<{ ok: boolean; data: { value: number } }>({
        url: "http://localhost:3000/api/example",
        masterUserId: "usr_123",
        body: { hello: "world" },
      }),
    ).resolves.toEqual({
      response: expect.objectContaining({ ok: true }),
      payload: { ok: true, data: { value: 1 } },
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/example",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "master-user-id": "usr_123",
        },
        body: JSON.stringify({ hello: "world" }),
      },
    );
  });

  it("supports requests without a body and forwards extra fetch options", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await fetchServerJson<{ ok: boolean }>({
      url: "http://localhost:3000/api/example",
      method: "GET",
      signal: controller.signal,
      keepalive: true,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/example",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        keepalive: true,
        signal: controller.signal,
      },
    );
  });
});
