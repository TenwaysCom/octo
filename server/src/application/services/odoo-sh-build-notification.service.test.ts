import { OdooShBuildNotificationConsumer } from "./odoo-sh-build-notification.service.js";
import type { LarkImNotificationError } from "../../adapters/lark/im-notification-client.js";
import type { OdooShBuildRecord, OdooShClaimedNotification, OdooShBuildStore } from "../../adapters/postgres/odoo-sh-build-store.js";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";

function build(overrides: Partial<OdooShBuildRecord> = {}): OdooShBuildRecord {
  return {
    environment: "eu",
    projectId: 42,
    buildId: 101,
    branch: "feature/example",
    stage: "staging",
    odooBranch: "17.0",
    lastBuildStatus: "done",
    lastBuildResult: "failed",
    buildUrl: "https://eu.dev.odoo.com/web",
    commitSha: null,
    headCommitAuthor: "Jack",
    headCommitUrl: "https://github.com/org/repo/commit/" + "a".repeat(40),
    pusherGithubId: null,
    firstSeenAt: "2026-09-10T07:00:00.000Z",
    lastSeenAt: "2026-09-10T07:00:00.000Z",
    updatedAt: "2026-09-10T07:00:00.000Z",
    ...overrides,
  };
}

function claimed(overrides: Partial<OdooShClaimedNotification> = {}): OdooShClaimedNotification {
  return {
    id: "notification-1",
    environment: "eu",
    projectId: 42,
    buildId: 101,
    status: "sending",
    attempts: 1,
    nextAttemptAt: null,
    claimToken: "claim-1",
    claimExpiresAt: null,
    messageId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

type StoreStub = {
  reclaimExpiredClaims: ReturnType<typeof vi.fn>;
  listDueNotificationIds: ReturnType<typeof vi.fn>;
  claimNotification: ReturnType<typeof vi.fn>;
  listBuildsByProject: ReturnType<typeof vi.fn>;
  markNotificationSent: ReturnType<typeof vi.fn>;
  markNotificationPendingIdentity: ReturnType<typeof vi.fn>;
  markNotificationRetryableFailure: ReturnType<typeof vi.fn>;
  markNotificationFailed: ReturnType<typeof vi.fn>;
  markNotificationOutcomeUnknown: ReturnType<typeof vi.fn>;
};

function createStore(overrides: Partial<StoreStub> = {}): StoreStub {
  return {
    reclaimExpiredClaims: vi.fn().mockResolvedValue(0),
    listDueNotificationIds: vi.fn().mockResolvedValue(["notification-1"]),
    claimNotification: vi.fn().mockResolvedValue(claimed()),
    listBuildsByProject: vi.fn().mockResolvedValue([build()]),
    markNotificationSent: vi.fn().mockResolvedValue(undefined),
    markNotificationPendingIdentity: vi.fn().mockResolvedValue(undefined),
    markNotificationRetryableFailure: vi.fn().mockResolvedValue(undefined),
    markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    markNotificationOutcomeUnknown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function activePusher(overrides: Partial<ResolvedUserRecord> = {}): ResolvedUserRecord {
  return {
    id: "user-1",
    status: "active",
    larkTenantKey: "tenant",
    larkId: "ou_pusher",
    larkEmail: "pusher@example.com",
    larkName: "Pusher",
    larkAvatarUrl: null,
    meegleBaseUrl: null,
    meegleUserKey: null,
    githubId: "1001",
    role: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createConsumer(store: StoreStub, overrides: {
  sender?: ReturnType<typeof vi.fn>;
  resolveCommitAuthor?: (build: { headCommitAuthor?: string | null }) => Promise<ResolvedUserRecord | undefined>;
  maxAttempts?: number;
} = {}) {
  const sender = overrides.sender ?? vi.fn().mockResolvedValue({ messageId: "om_1" });
  const consumer = new OdooShBuildNotificationConsumer({
    store: store as unknown as OdooShBuildStore,
    sender: { sendMessageToChat: sender },
    resolveCommitAuthor: overrides.resolveCommitAuthor ?? vi.fn().mockResolvedValue(activePusher()),
    config: {
      chatId: "oc_target",
      maxAttempts: overrides.maxAttempts ?? 3,
      retryDelayMs: 60_000,
      claimDurationMs: 60_000,
      batchSize: 5,
    },
  });
  return { consumer, sender };
}

describe("OdooShBuildNotificationConsumer", () => {
  it("sends the failure message with the commit author mention and records the message id", async () => {
    const store = createStore({
      listBuildsByProject: vi.fn().mockResolvedValue([build({ pusherGithubId: "1001" })]),
    });
    const { consumer, sender } = createConsumer(store, {
      resolveCommitAuthor: vi.fn().mockResolvedValue(activePusher()),
    });

    const result = await consumer.runCycle();

    expect(result).toMatchObject({ sent: 1, reclaimed: 0 });
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "oc_target",
      idempotencyKey: "odoo-sh-build-notify:notification-1",
    }));
    const message = sender.mock.calls[0][0].text as string;
    expect(message).toContain('<at user_id="ou_pusher">Pusher</at>');
    expect(message).toContain("环境：EU｜分支：feature/example");
    expect(message).toContain("Build：101");
    expect(message).toContain("查看 build：https://eu.dev.odoo.com/web");
    expect(store.markNotificationSent).toHaveBeenCalledWith("notification-1", "om_1", expect.any(String));
  });

  it.each([null, "Jack"])("sends without mention when author %s has no reliable binding", async (headCommitAuthor) => {
    const store = createStore({ listBuildsByProject: vi.fn().mockResolvedValue([build({ headCommitAuthor })]) });
    const { consumer, sender } = createConsumer(store, { resolveCommitAuthor: vi.fn().mockResolvedValue(undefined) });
    expect(await consumer.runCycle()).toMatchObject({ sent: 1, pendingIdentity: 0 });
    expect(sender.mock.calls[0][0].text).not.toContain("<at ");
    expect(sender.mock.calls[0][0].text).toContain(`Commit 作者：${headCommitAuthor || "未知"}`);
    expect(store.markNotificationPendingIdentity).not.toHaveBeenCalled();
  });

  it("retries binding store outages before sending rather than silently losing the mention", async () => {
    const store = createStore();
    const { consumer, sender } = createConsumer(store, { resolveCommitAuthor: vi.fn().mockRejectedValue(new Error("lookup timeout")) });
    expect(await consumer.runCycle()).toMatchObject({ retried: 1, sent: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("schedules a bounded retry after a definitive send failure and fails once retries are exhausted", async () => {
    const failure = new Error("Lark rejected") as LarkImNotificationError & Error;
    (failure as { kind: string }).kind = "retryable";
    (failure as { errorCode: string }).errorCode = "LARK_IM_SEND_REJECTED";
    const store = createStore({
      listBuildsByProject: vi.fn().mockResolvedValue([build({ pusherGithubId: "1001" })]),
    });
    const { consumer, sender } = createConsumer(store, {
      sender: vi.fn().mockRejectedValue(failure),
    });

    const first = await consumer.runCycle();
    expect(first).toMatchObject({ retried: 1 });
    expect(store.markNotificationRetryableFailure).toHaveBeenCalledWith("notification-1", expect.objectContaining({
      errorCode: "LARK_IM_SEND_REJECTED",
      nextAttemptAt: expect.any(String),
    }));

    const exhaustedStore = createStore({
      claimNotification: vi.fn().mockResolvedValue(claimed({ attempts: 3 })),
      listBuildsByProject: vi.fn().mockResolvedValue([build({ pusherGithubId: "1001" })]),
    });
    const { consumer: exhaustedConsumer } = createConsumer(exhaustedStore, {
      sender: vi.fn().mockRejectedValue(failure),
    });
    const second = await exhaustedConsumer.runCycle();
    expect(second).toMatchObject({ failed: 1 });
    expect(exhaustedStore.markNotificationFailed).toHaveBeenCalledWith("notification-1", expect.objectContaining({
      errorCode: "LARK_IM_SEND_REJECTED",
    }));
  });

  it("keeps an uncertain send outcome out of automatic retries", async () => {
    const failure = new Error("timeout") as LarkImNotificationError & Error;
    (failure as { kind: string }).kind = "uncertain";
    (failure as { errorCode: string }).errorCode = "LARK_IM_SEND_UNCERTAIN";
    const store = createStore({
      listBuildsByProject: vi.fn().mockResolvedValue([build({ pusherGithubId: "1001" })]),
    });
    const { consumer } = createConsumer(store, {
      sender: vi.fn().mockRejectedValue(failure),
    });

    const result = await consumer.runCycle();

    expect(result).toMatchObject({ outcomeUnknown: 1 });
    expect(store.markNotificationOutcomeUnknown).toHaveBeenCalledOnce();
    expect(store.markNotificationRetryableFailure).not.toHaveBeenCalled();
    expect(store.markNotificationFailed).not.toHaveBeenCalled();
  });

  it("fails the notification instead of retrying when the build record vanished", async () => {
    const store = createStore({
      listBuildsByProject: vi.fn().mockResolvedValue([]),
    });
    const { consumer } = createConsumer(store);

    const result = await consumer.runCycle();

    expect(result).toMatchObject({ failed: 1 });
    expect(store.markNotificationFailed).toHaveBeenCalledWith("notification-1", expect.objectContaining({
      errorCode: "ODOO_SH_NOTIFY_BUILD_MISSING",
    }));
  });

  it("reclaims expired claims before claiming due notifications", async () => {
    const store = createStore();
    const { consumer } = createConsumer(store);

    await consumer.runCycle();

    expect(store.reclaimExpiredClaims).toHaveBeenCalledWith({ now: expect.any(String) });
  });

  it("skips the cycle while a previous cycle is still running", async () => {
    const store = createStore();
    const { consumer } = createConsumer(store);
    let releaseClaim: ((value: ReturnType<typeof claimed>) => void) | undefined;
    store.claimNotification.mockImplementation(() => new Promise<ReturnType<typeof claimed>>((resolve) => {
      releaseClaim = resolve;
    }));

    const firstCycle = consumer.runCycle();
    await vi.waitFor(() => expect(store.claimNotification).toHaveBeenCalled());

    const secondCycle = await consumer.runCycle();
    expect(secondCycle).toMatchObject({ sent: 0, pendingIdentity: 0, retried: 0, failed: 0, outcomeUnknown: 0 });

    releaseClaim?.(claimed());
    await expect(firstCycle).resolves.toMatchObject({ sent: 1 });
  });
});

it("does not send a queued failure once the persisted build result has recovered", async () => {
  const store = createStore({ listBuildsByProject: vi.fn().mockResolvedValue([build({ lastBuildResult: "success" })]) });
  const { consumer, sender } = createConsumer(store);
  expect(await consumer.runCycle()).toMatchObject({ sent: 0, failed: 1 });
  expect(sender).not.toHaveBeenCalled();
});

it("retains permanent membership failures without scheduling automatic retries", async () => {
  const failure = Object.assign(new Error("not in chat"), { kind: "permanent", errorCode: "LARK_IM_NOT_IN_CHAT" });
  const store = createStore();
  const { consumer } = createConsumer(store, { sender: vi.fn().mockRejectedValue(failure) });
  expect(await consumer.runCycle()).toMatchObject({ failed: 1, retried: 0, sent: 0 });
  expect(store.markNotificationRetryableFailure).not.toHaveBeenCalled();
});


it.each(["reclaimExpiredClaims", "listDueNotificationIds", "claimNotification"] as const)(
  "survives a %s outage in the timer and processes the next tick", async (method) => {
    vi.useFakeTimers();
    const store = createStore();
    store[method].mockRejectedValueOnce(new Error("temporary database outage"));
    const { consumer, sender } = createConsumer(store);
    try {
      consumer.start(100);
      await vi.advanceTimersByTimeAsync(100);
      expect(sender).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(sender).toHaveBeenCalledOnce();
      expect(store.markNotificationSent).toHaveBeenCalledOnce();
    } finally { consumer.stop(); vi.useRealTimers(); }
  },
);

it("retains the delivered message id and never retries when the sent-state write fails", async () => {
  const store = createStore({ markNotificationSent: vi.fn().mockRejectedValue(new Error("database write failed")) });
  const { consumer, sender } = createConsumer(store);
  expect(await consumer.runCycle()).toMatchObject({ sent: 0, outcomeUnknown: 1, retried: 0 });
  expect(sender).toHaveBeenCalledOnce();
  expect(store.markNotificationOutcomeUnknown).toHaveBeenCalledWith("notification-1", expect.objectContaining({
    messageId: "om_1", errorCode: "ODOO_SH_NOTIFY_ACK_FAILED",
  }));
  expect(store.markNotificationRetryableFailure).not.toHaveBeenCalled();
});

it("contains persistence failures after delivery without an unhandled timer rejection", async () => {
  vi.useFakeTimers();
  const store = createStore({
    markNotificationSent: vi.fn().mockRejectedValue(new Error("database down")),
    markNotificationOutcomeUnknown: vi.fn().mockRejectedValue(new Error("database down")),
  });
  const { consumer } = createConsumer(store);
  try {
    consumer.start(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.markNotificationOutcomeUnknown).toHaveBeenCalledOnce();
    expect(store.markNotificationRetryableFailure).not.toHaveBeenCalled();
  } finally { consumer.stop(); vi.useRealTimers(); }
});
