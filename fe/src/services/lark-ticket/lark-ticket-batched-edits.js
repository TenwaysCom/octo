import { submitLarkTicketFields, getLarkTicketFieldSubmission, reconcileLarkTicketFields,
  retryLarkTicketFieldsSync, loadLarkTicketEditableFields } from "./lark-ticket-actions-api.js";

export const BATCH_FIELDS = { status: "ticketStatus", priority: "priority", requester: "requester", responsible: "responsible", issueType: "issueType", businessLine: "businessLine" };
const person = (field) => field === "requester" || field === "responsible";
const keyOf = (ticket) => JSON.stringify([ticket.baseId, ticket.tableId, ticket.recordId]);
const identity = ({ baseId, tableId, recordId }) => ({ baseId, tableId, recordId });
const selected = (change) => ({ value: change.value, ...(person(change.field) && change.optionUserId ? { userIds: [change.optionUserId] } : {}) });
const equal = (field, a, b) => person(field) && a?.userIds && b?.userIds
  ? JSON.stringify([...a.userIds].sort()) === JSON.stringify([...b.userIds].sort()) : (a?.value || "") === (b?.value || "");
const ticketValue = (ticket, field) => ({ value: ticket[BATCH_FIELDS[field]] || "", ...(person(field) && Array.isArray(ticket[`${field}People`])
  && ticket[`${field}People`].every((entry) => entry.userId) ? { userIds: ticket[`${field}People`].map((entry) => entry.userId) } : {}) });
const patchChange = (change) => ({ [BATCH_FIELDS[change.field]]: change.value,
  ...(person(change.field) ? { [`${change.field}People`]: [{ name: change.value, userId: change.optionUserId }] } : {}) });
const uncertain = (state) => ["preparing", "writing", "unknown"].includes(state);
function defaultStorage() { try { return globalThis.sessionStorage; } catch { return undefined; } }

/** UI drafts and immutable submitted batches have separate lifetimes. No unknown write is replayed with a new ID. */
export function createLarkTicketBatchedEdits({ apiBaseUrl, masterUserId, changed, getVersion,
  update = submitLarkTicketFields, getSubmission = getLarkTicketFieldSubmission, reconcile = reconcileLarkTicketFields,
  retrySync = retryLarkTicketFieldsSync, loadSnapshot = loadLarkTicketEditableFields,
  storage = defaultStorage(), events = globalThis.window, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = 1000, maxWaitMs = 3000 } = {}) {
  const records = new Map();
  const storageKey = masterUserId ? `octo:ticket-drafts:v1:${apiBaseUrl}:${masterUserId}` : null;
  let disposed = false;
  let started = false;
  let storageWarning = false;
  function recordFor(ticket) {
    const key = keyOf(ticket);
    if (!records.has(key)) records.set(key, { ticket: identity(ticket), label: ticket.title || ticket.recordId,
      base: Object.fromEntries(Object.keys(BATCH_FIELDS).map((field) => [field, ticketValue(ticket, field)])),
      confirmed: {}, draft: new Map(), waiters: [], active: null, syncJobs: [], phase: "idle", firstAt: null });
    return records.get(key);
  }
  function persist() {
    if (!storageKey || disposed) return;
    try {
      const rows = [...records.values()].filter((r) => r.draft.size || r.active || r.syncJobs.length).map((r) => ({
        ticket: r.ticket, base: r.base, confirmed: r.confirmed, draft: [...r.draft], phase: r.phase,
        active: r.active ? { submissionId: r.active.submissionId, actionRunId: r.active.actionRunId, changes: r.active.changes } : null,
        syncJobs: r.syncJobs, remote: r.remote, remotePeople: r.remotePeople, conflicts: r.conflicts, message: r.message, sourceBlocked: r.sourceBlocked,
      }));
      if (rows.length && !storage) throw new Error("Draft storage unavailable");
      if (rows.length) storage?.setItem(storageKey, JSON.stringify({ version: 1, rows }));
      else storage?.removeItem(storageKey);
      storageWarning = false;
    } catch { storageWarning = true; }
  }
  function patch(r) {
    return Object.assign({}, Object.fromEntries(Object.entries(r.confirmed).map(([key, entry]) => [key, entry.value])),
      ...(r.active?.changes || []).map(patchChange), ...[...r.draft.values()].map(patchChange));
  }
  function notify(r) { if (!disposed) { persist(); changed(r ? { ...r.ticket, ...patch(r) } : undefined); } }
  function cancelTimer(r) { if (r.timer != null) clearTimer(r.timer); r.timer = null; }
  function settle(waiters, result, error) { for (const waiter of waiters || []) error ? waiter.reject(error) : waiter.resolve(result); }
  function confirm(r, changes, result) {
    for (const change of changes) {
      const key = BATCH_FIELDS[change.field];
      const value = result.ticket?.[key] || change.value;
      r.base[change.field] = result.values?.[change.field] || selected(change);
      r.confirmed[key] = { value, settledAt: getVersion() + 1, syncFailed: Boolean(result.syncFailed) };
      if (person(change.field)) r.confirmed[`${change.field}People`] = {
        value: result.ticket?.[`${change.field}People`]?.length ? result.ticket[`${change.field}People`] : patchChange(change)[`${change.field}People`],
        settledAt: getVersion() + 1, syncFailed: Boolean(result.syncFailed),
      };
      if (change.field === "status" && result.ticket?.closedAt) r.confirmed.closedAt = { value: result.ticket.closedAt, settledAt: getVersion() + 1 };
    }
  }
  function schedule(r) {
    cancelTimer(r);
    if (disposed || r.sourceBlocked || r.active || !r.draft.size || !["idle", "waiting", "saved"].includes(r.phase)) return;
    r.firstAt ??= now();
    r.phase = "waiting";
    r.timer = setTimer(() => { r.timer = null; void send(r); }, Math.max(0, Math.min(debounceMs, maxWaitMs - (now() - r.firstAt))));
  }
  function applyResult(r, result) {
    const active = r.active;
    if (!active || disposed) return;
    if (uncertain(result.state)) {
      r.phase = "unknown";
      r.message = result.errorMessage || "提交仍在处理中，已暂停后续发送。可继续编辑草稿，稍后重新核对。";
      settle(active.waiters, null, new Error(r.message)); active.waiters = [];
      notify(r); return;
    }
    if (result.larkBaseUpdated) {
      confirm(r, active.changes, result);
      if (result.syncFailed && !r.syncJobs.includes(active.submissionId)) r.syncJobs.push(active.submissionId);
      r.active = null; r.phase = "saved"; r.message = null; r.remote = null; r.conflicts = [];
      // Remove next-batch no-ops only after this batch has established its baseline.
      for (const [field, change] of r.draft) if (equal(field, selected(change), r.base[field])) r.draft.delete(field);
      settle(active.waiters, { ...result, ticket: { ...r.ticket, ...patch(r), ...Object.fromEntries(active.changes.map((c) => [BATCH_FIELDS[c.field], r.confirmed[BATCH_FIELDS[c.field]].value])) } });
      if (!r.draft.size) { settle(r.waiters, { cancelled: true }); r.waiters = []; r.firstAt = null; }
      schedule(r); notify(r); return;
    }
    for (const change of active.changes) if (!r.draft.has(change.field)) r.draft.set(change.field, change);
    r.active = null;
    r.phase = result.state === "conflict" ? "conflict" : "error";
    r.remote = result.values; r.conflicts = result.conflicts || [];
    r.remotePeople = Object.fromEntries(["requester", "responsible"].map((field) => [field, result.ticket?.[`${field}People`]]));
    r.message = result.errorMessage || "未保存，草稿已保留，请重新核对。";
    settle(active.waiters, null, Object.assign(new Error(r.message), { code: result.errorCode }));
    notify(r);
  }
  async function send(r) {
    if (disposed || r.sourceBlocked || r.active || !r.draft.size || !["idle", "waiting", "saved"].includes(r.phase)) return;
    const changes = [...r.draft.values()].map((change) => ({ ...change, expected: r.base[change.field] }));
    r.active = { submissionId: crypto.randomUUID(), actionRunId: crypto.randomUUID(), changes, waiters: r.waiters };
    r.draft.clear(); r.waiters = []; r.firstAt = null; r.phase = "saving";
    notify(r); // Persist the submission ID before dispatch.
    try {
      const result = await update({ apiBaseUrl, expectedUserId: masterUserId, ticket: r.ticket, ...r.active });
      applyResult(r, result);
    } catch (error) {
      if (disposed) return;
      // Only structured HTTP rejections prove the command was not accepted. Transport failures remain unknown.
      if (["INVALID_REQUEST", "TICKET_ACCOUNT_CHANGED", "WORKSPACE_ACCESS_DENIED", "WEB_SESSION_REQUIRED", "TICKET_SUBMISSION_BUSY", "TICKET_SUBMISSION_REUSED"].includes(error.code)) {
        applyResult(r, { state: "rejected", errorCode: error.code, errorMessage: error.message });
      } else {
        r.phase = "unknown"; r.message = "请求结果未知，已暂停后续发送；草稿已保留，请重新核对。";
        settle(r.active.waiters, null, error); r.active.waiters = []; notify(r);
        void recheck(r); // One bounded query/read-back attempt, never a blind replay.
      }
    }
  }
  async function refreshDraft(r) {
    const fresh = await loadSnapshot({ apiBaseUrl, expectedUserId: masterUserId, ticket: r.ticket });
    if (disposed) return;
    r.sourceBlocked = false;
    const conflicts = [];
    for (const [field, change] of r.draft) {
      if (equal(field, selected(change), fresh.values[field])) { r.draft.delete(field); confirm(r, [change], { ...fresh, syncFailed: false }); }
      else if (!equal(field, r.base[field], fresh.values[field])) conflicts.push(field);
    }
    if (conflicts.length) {
      r.phase = "conflict"; r.conflicts = conflicts; r.remote = fresh.values;
      r.remotePeople = Object.fromEntries(["requester", "responsible"].map((field) => [field, fresh.ticket?.[`${field}People`]]));
      r.message = "这些属性已被其他人修改，请选择保留草稿或采用最新值。";
    } else {
      r.phase = "idle"; r.message = null;
      if (!r.draft.size) { settle(r.waiters, { cancelled: true }); r.waiters = []; }
      schedule(r);
    }
    notify(r);
  }
  async function recheck(r) {
    if (disposed || r.checking) return;
    r.checking = true; notify(r);
    try {
      if (r.active) {
        const request = { apiBaseUrl, expectedUserId: masterUserId, ticket: r.ticket, submissionId: r.active.submissionId };
        let result;
        try { result = await getSubmission(request); }
        catch (error) {
          if (error.code !== "TICKET_SUBMISSION_NOT_FOUND") throw error;
          // Reusing the exact same immutable ID is safe even if the original HTTP request arrives late.
          result = await update({ ...request, ...r.active });
        }
        if (disposed) return;
        if (uncertain(result.state)) result = await reconcile(request);
        if (disposed) return;
        if (result.state === "not_applied") {
          for (const change of r.active.changes) if (!r.draft.has(change.field)) r.draft.set(change.field, change);
          r.active = null; await refreshDraft(r);
        } else applyResult(r, result);
      } else await refreshDraft(r);
    } catch (error) {
      if (!disposed) { r.phase = r.active ? "unknown" : "error"; r.message = error.message || "核对失败，请稍后重试。"; notify(r); }
    } finally { r.checking = false; notify(r); }
  }
  const api = {
    start() {
      if (started || disposed) return;
      started = true;
      events?.addEventListener("pagehide", persist);
      events?.addEventListener("beforeunload", persist);
      if (!storageKey) return;
      try {
        const previousKey = storage?.getItem(`octo:ticket-drafts:active:${apiBaseUrl}`);
        if (previousKey && previousKey !== storageKey) storage?.removeItem(previousKey);
        storage?.setItem(`octo:ticket-drafts:active:${apiBaseUrl}`, storageKey);
        const saved = JSON.parse(storage?.getItem(storageKey) || "null");
        if (saved?.version !== 1 || !Array.isArray(saved.rows)) return;
        for (const row of saved.rows) {
          if (!row.ticket?.baseId || !row.ticket?.tableId || !row.ticket?.recordId || !Array.isArray(row.draft)) continue;
          const r = recordFor(row.ticket);
          Object.assign(r, row, { draft: new Map(row.draft), waiters: [], active: row.active ? { ...row.active, waiters: [] } : null, phase: "restoring" });
          // Old browser revision numbers cannot authorize fresh snapshot replacement after a reload.
          for (const entry of Object.values(r.confirmed)) entry.settledAt = Infinity;
          void recheck(r);
        }
      } catch { storageWarning = true; }
    },
    project(ticket) { const r = ticket && records.get(keyOf(ticket)); return r ? { ...ticket, ...patch(r) } : ticket; },
    accept(tickets, readVersion) {
      for (const ticket of tickets) {
        const r = records.get(keyOf(ticket));
        if (!r) continue;
        const freshPatch = {};
        for (const [key, entry] of Object.entries(r.confirmed)) {
          const field = Object.keys(BATCH_FIELDS).find((f) => BATCH_FIELDS[f] === key || `${f}People` === key || (key === "closedAt" && f === "status"));
          if (entry.settledAt > readVersion || r.draft.has(field) || r.active?.changes.some((c) => c.field === field) || entry.syncFailed) continue;
          delete r.confirmed[key]; freshPatch[key] = ticket[key];
          if (field && !key.endsWith("People")) r.base[field] = ticketValue(ticket, field);
        }
        for (const field of Object.keys(BATCH_FIELDS)) {
          if (!r.confirmed[BATCH_FIELDS[field]] && !r.draft.has(field) && !r.active?.changes.some((c) => c.field === field)) r.base[field] = ticketValue(ticket, field);
        }
        if (Object.keys(freshPatch).length) { persist(); changed({ ...r.ticket, ...freshPatch, ...patch(r) }); }
      }
    },
    submit({ ticket, field, value, optionUserId }) {
      if (disposed) return Promise.reject(new Error("登录状态已变化，请重新打开页面。"));
      const r = recordFor(ticket);
      const change = { field, value: value.trim(), ...(optionUserId ? { optionUserId } : {}) };
      const key = BATCH_FIELDS[field];
      r.confirmed[key] ??= { value: r.base[field].value, settledAt: Infinity };
      if (person(field)) r.confirmed[`${field}People`] ??= { value: ticket[`${field}People`] || [], settledAt: Infinity };
      const current = r.active?.changes.find((item) => item.field === field);
      if (!(r.phase === "conflict" && r.conflicts.includes(field)) && equal(field, selected(change), current ? selected(current) : r.base[field])) r.draft.delete(field);
      else r.draft.set(field, change);
      const completion = new Promise((resolve, reject) => r.waiters.push({ resolve, reject }));
      if (!r.draft.size) {
        cancelTimer(r); r.firstAt = null; settle(r.waiters, { cancelled: true }); r.waiters = [];
        if (r.phase === "waiting") r.phase = "idle";
        if (r.phase === "error" && !r.sourceBlocked && !r.active) { r.phase = "idle"; r.message = null; }
        if (!r.active) for (const entry of Object.values(r.confirmed)) entry.settledAt = getVersion() + 1;
      } else { r.firstAt ??= now(); schedule(r); }
      notify(r); return completion;
    },
    status(ticket) {
      const selectedRecords = ticket ? [records.get(keyOf(ticket))].filter(Boolean) : [...records.values()];
      const entries = selectedRecords.filter((r) => r.draft.size || r.active || r.syncJobs.length || r.phase === "saved").map((r) => ({
        ticket: r.ticket, label: r.label, phase: r.phase, checking: r.checking, syncing: r.syncing, canDiscard: !r.active && !r.checking, message: r.message, conflicts: r.conflicts || [], remote: r.remote,
        local: Object.fromEntries([...r.draft].map(([field, change]) => [field, selected(change)])), syncCount: r.syncJobs.length,
        pending: r.draft.size + (r.active?.changes.length || 0),
      }));
      return { pending: entries.reduce((n, r) => n + r.pending, 0), entries, notices: storageWarning ? ["浏览器草稿暂存失败，刷新前请等待保存或保留修改内容。"] : [] };
    },
    recheck(ticket) { return recheck(recordFor(ticket)); },
    discardDraft(ticket) {
      const r = recordFor(ticket);
      if (r.active || r.checking) return;
      cancelTimer(r);
      for (const field of r.draft.keys()) {
        r.confirmed[BATCH_FIELDS[field]] = { value: r.base[field].value, settledAt: getVersion() + 1 };
        // Keep the original confirmed person projection, including its avatar.
      }
      r.draft.clear(); r.phase = "idle"; r.firstAt = null; r.message = null;
      settle(r.waiters, null, new Error("已放弃未保存修改。")); r.waiters = [];
      notify(r);
    },
    resolveConflict(ticket, choice) {
      const r = recordFor(ticket);
      if (r.phase !== "conflict" || !r.remote) return;
      for (const field of r.conflicts) {
        r.base[field] = r.remote[field];
        r.confirmed[BATCH_FIELDS[field]] = { value: r.remote[field].value, settledAt: getVersion() + 1 };
        if (person(field)) r.confirmed[`${field}People`] = { value: r.remotePeople?.[field] || r.remote[field].userIds?.map((userId) => ({ userId, name: r.remote[field].value })) || [], settledAt: getVersion() + 1 };
        if (choice === "remote" || (r.draft.has(field) && equal(field, selected(r.draft.get(field)), r.base[field]))) r.draft.delete(field);
      }
      r.phase = "idle"; r.conflicts = []; r.message = null;
      if (!r.draft.size) { settle(r.waiters, { cancelled: true }); r.waiters = []; }
      schedule(r); notify(r);
    },
    async retrySync(ticket) {
      const r = recordFor(ticket);
      if (r.syncing || disposed) return;
      r.syncing = true; notify(r);
      try {
        for (const submissionId of [...r.syncJobs]) {
          const result = await retrySync({ apiBaseUrl, expectedUserId: masterUserId, ticket: r.ticket, submissionId });
          if (disposed) return;
          if (result.state === "saved") r.syncJobs = r.syncJobs.filter((id) => id !== submissionId);
        }
        if (!r.syncJobs.length) for (const entry of Object.values(r.confirmed)) { entry.syncFailed = false; entry.settledAt = getVersion() + 1; }
      } catch (error) { if (!disposed) r.message = error.message; }
      finally { r.syncing = false; notify(r); }
    },
    block(ticket, error) {
      const r = recordFor(ticket); cancelTimer(r); r.sourceBlocked = true; r.phase = "error"; r.message = error.message;
      settle(r.waiters, null, error); r.waiters = []; notify(r);
    },
    dispose({ discardDrafts = false } = {}) {
      if (disposed) return;
      persist(); disposed = true;
      events?.removeEventListener("pagehide", persist); events?.removeEventListener("beforeunload", persist);
      if (discardDrafts && storageKey) { try { storage?.removeItem(storageKey); } catch {} }
      for (const r of records.values()) { cancelTimer(r); settle(r.waiters, null, new Error("登录状态已变化，未发送此修改。")); settle(r.active?.waiters, null, new Error("登录状态已变化，请重新核对提交结果。")); }
      records.clear();
    },
  };
  return api;
}
