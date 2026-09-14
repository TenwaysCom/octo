import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pollTrackedAsyncActions,
  trackAsyncAction,
} from "./async-action-notifier.js";

describe("async action notifier", () => {
  const storage: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
    vi.mocked(chrome.storage.local.get).mockImplementation((key, callback) => {
      callback?.({ [key as string]: storage[key as string] });
    });
    vi.mocked(chrome.storage.local.set).mockImplementation((value, callback) => {
      Object.assign(storage, value);
      callback?.();
    });
  });

  it("keeps a submitted action in background storage and notifies once it succeeds", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { status: "succeeded" } }),
    } as Response);

    await trackAsyncAction({
      actionRunId: "run_async_1",
      masterUserId: "ou_user",
      serverUrl: "http://localhost:3000",
      statusRoute: "/api/github/pr/review/:actionRunId",
      notification: {
        title: "Quick scan 已完成",
        message: "结果已回写到 GitHub",
      },
    });

    await vi.waitFor(() => {
      expect(chrome.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
        title: "Quick scan 已完成",
        message: "结果已回写到 GitHub",
      }));
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/github/pr/review/run_async_1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(storage.asyncActionNotifications).toEqual([]);
  });

  it("retains queued actions for the next background poll", async () => {
    storage.asyncActionNotifications = [{
      actionRunId: "run_async_2",
      masterUserId: "ou_user",
      serverUrl: "http://localhost:3000",
      statusRoute: "/api/github/pr/review/:actionRunId",
      notification: { title: "Deep review 已完成", message: "结果已回写到 GitHub" },
    }];
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { status: "running" } }),
    } as Response);

    await pollTrackedAsyncActions();

    expect(storage.asyncActionNotifications).toEqual([expect.objectContaining({ actionRunId: "run_async_2" })]);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});
