import { createLarkTicketMeegleWorkitem, updateLarkTicketField } from "./lark-ticket-actions-api.js";

const FIELDS = {
  status: ["ticketStatus", "状态"], priority: ["priority", "紧急度"],
  requester: ["requester", "需求人"], responsible: ["responsible", "负责人"],
  issueType: ["issueType", "类型"], businessLine: ["businessLine", "Business Line"],
  solution: ["solution", "解决方案"],
};
const identity = ({ baseId, tableId, recordId }) => ({ baseId, tableId, recordId });
const keyOf = (ticket) => JSON.stringify([ticket.baseId, ticket.tableId, ticket.recordId]);

/** Session-owned UI state, not a durable save queue. Only one request per Ticket is sent at a time. */
export function createLarkTicketFieldEdits({ apiBaseUrl, update = updateLarkTicketField, createMeegle = createLarkTicketMeegleWorkitem, onPatch } = {}) {
  const records = new Map();
  const listeners = new Set();
  let revision = 0;
  let disposed = false;
  let owners = 0;
  const readScope = crypto.randomUUID();

  function recordFor(ticket) {
    const key = keyOf(ticket);
    if (!records.has(key)) records.set(key, { ticket: identity(ticket), label: ticket.title || ticket.recordId,
      confirmed: new Map(), pending: [], notices: new Map(), running: false });
    return records.get(key);
  }

  function patch(record) {
    return Object.assign({}, Object.fromEntries([...record.confirmed].map(([key, entry]) => [key, entry.value])),
      ...record.pending.map((op) => ({ [op.key]: op.value })));
  }

  function changed(record) {
    revision += 1;
    if (record) onPatch?.({ ...record.ticket, ...patch(record) });
    for (const listener of listeners) listener();
  }

  async function drain(record) {
    if (record.running) return;
    record.running = true;
    while (!disposed && record.pending.length) {
      const op = record.pending[0];
      try {
        const result = await update({ apiBaseUrl, ticket: record.ticket, field: op.field,
          value: op.value, optionUserId: op.optionUserId, actionRunId: op.actionRunId });
        if (!disposed) {
          const value = result.ticket && Object.hasOwn(result.ticket, op.key) ? result.ticket[op.key] : op.value;
          record.confirmed.set(op.key, { value, settledAt: revision + 1, syncFailed: Boolean(result.syncFailed) });
          if (op.field === "status" && result.ticket && Object.hasOwn(result.ticket, "closedAt")) {
            record.confirmed.set("closedAt", { value: result.ticket.closedAt, settledAt: revision + 1, syncFailed: false });
          }
          if (result.syncFailed) record.notices.set(op.key, `${record.label}：${FIELDS[op.field][1]}已写入 Lark Base，但 Octo 同步失败，请稍后同步 Ticket。`);
          else record.notices.delete(op.key);
        }
        op.resolve(result);
      } catch (error) {
        if (!disposed) {
          // Keep the last confirmed value, not the previous optimistic value (which may also have failed).
          record.confirmed.get(op.key).settledAt = revision + 1;
          record.notices.set(op.key, `${record.label}：${FIELDS[op.field][1]}保存失败：${error.message || "请重试。"}`);
        }
        op.reject(error);
      } finally {
        record.pending.shift();
        if (!disposed) changed(record);
      }
    }
    record.running = false;
  }

  const edits = {
    retain() {
      owners += 1;
      return () => {
        owners -= 1;
        // React StrictMode replays effect setup/cleanup without replacing memoized state.
        queueMicrotask(() => { if (!owners) edits.dispose(); });
      };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getVersion: () => revision,
    getReadScope: () => `${readScope}:${revision}`,
    project(ticket) {
      const record = ticket && records.get(keyOf(ticket));
      return record ? { ...ticket, ...patch(record) } : ticket;
    },
    // Only a read started after settlement may supersede a confirmed patch. Navigation snapshots
    // and reads already in flight when the user edited are deliberately not fresh-read evidence.
    accept(tickets, readVersion) {
      let accepted = false;
      for (const ticket of tickets) {
        const record = records.get(keyOf(ticket));
        if (!record) continue;
        const freshPatch = {};
        for (const [key, entry] of record.confirmed) {
          if (entry.settledAt > readVersion || record.pending.some((op) => op.key === key || (key === "closedAt" && op.field === "status"))) continue;
          if (entry.syncFailed && ticket[key] !== entry.value) continue;
          record.confirmed.delete(key);
          if (entry.syncFailed) record.notices.delete(key);
          freshPatch[key] = ticket[key];
          accepted = true;
        }
        if (Object.keys(freshPatch).length) onPatch?.({ ...record.ticket, ...freshPatch });
        if (!record.pending.length && !record.confirmed.size && !record.notices.size && !record.creation) records.delete(keyOf(ticket));
      }
      if (accepted) changed();
    },
    status(ticket) {
      const selected = ticket ? [records.get(keyOf(ticket))].filter(Boolean) : [...records.values()];
      return { pending: selected.reduce((count, record) => count + record.pending.length, 0),
        notices: selected.flatMap((record) => [...record.notices.values()]) };
    },
    creationStatus(ticket) { return records.get(keyOf(ticket))?.creation ?? { status: "idle" }; },
    createMeegle({ ticket, actionRunId = crypto.randomUUID() }) {
      if (disposed) return Promise.reject(new Error("登录状态已变化，请重新打开页面。"));
      const record = recordFor(ticket);
      if (record.creation?.status === "running") return record.creation.completion;
      if (record.creation?.status === "done") return Promise.resolve(record.creation.result);
      if (ticket.meegleLink?.trim() || record.creation?.errorCode === "MEEGLE_LINK_ALREADY_EXISTS") {
        return Promise.reject(new Error("该 Ticket 已有 Meegle 链接，无需重复创建。"));
      }
      if (record.pending.length) return Promise.reject(new Error("请等待属性保存完成后再创建。"));
      const creation = { status: "running", actionRunId };
      record.creation = creation;
      // Install the shared promise before dispatch, including synchronous transport failures.
      creation.completion = Promise.resolve().then(() => {
        if (disposed) throw new Error("登录状态已变化，未发送创建请求。");
        return createMeegle({ apiBaseUrl, ticket: record.ticket, actionRunId });
      }).then((result) => {
        if (!disposed) {
          record.creation = { status: "done", result };
          const links = Array.isArray(result.workitems) && result.workitems.length ? result.workitems.map((item) => item.meegleLink).filter(Boolean) : [result.meegleLink].filter(Boolean);
          if (links.length) record.confirmed.set("meegleLink", { value: links.join("\n"), settledAt: revision + 1, syncFailed: Boolean(result.syncFailed) });
          changed(record);
        }
        return result;
      }, (error) => {
        if (!disposed) {
          record.creation = { status: "error", errorCode: error.code,
            message: error.code === "MEEGLE_LINK_ALREADY_EXISTS" ? "该 Ticket 已有 Meegle 链接，无需重复创建。请重新读取 Ticket 查看。"
              : error.message || "创建失败，请稍后重试。" };
          changed(record);
        }
        throw error;
      });
      changed(record);
      return creation.completion;
    },
    submit({ ticket, field, value, optionUserId, actionRunId = crypto.randomUUID() }) {
      if (disposed) return Promise.reject(new Error("登录状态已变化，请重新打开页面。"));
      const [key] = FIELDS[field];
      const record = recordFor(ticket);
      if (record.creation?.status === "running") {
        const message = "Meegle 创建期间未发送本次属性修改，请完成后重新选择。";
        record.notices.set(key, `${record.label}：${message}`);
        changed(record);
        return Promise.reject(new Error(message));
      }
      if (!record.confirmed.has(key)) record.confirmed.set(key, { value: ticket[key], settledAt: Infinity, syncFailed: false });
      record.notices.delete(key);
      const completion = new Promise((resolve, reject) => {
        record.pending.push({ field, key, value, optionUserId, actionRunId, resolve, reject });
      });
      changed(record);
      void drain(record);
      return completion;
    },
    dispose() {
      disposed = true;
      for (const record of records.values()) {
        const unsent = record.pending.splice(record.running ? 1 : 0);
        for (const op of unsent) op.reject(new Error("登录状态已变化，未发送此修改。"));
      }
      listeners.clear();
      records.clear();
    },
  };
  return edits;
}
