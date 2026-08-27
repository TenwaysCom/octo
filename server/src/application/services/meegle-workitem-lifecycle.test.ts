import type { MeegleWorkitem, MeegleWorkitemOperationRecord } from "../../adapters/meegle/meegle-client.js";
import { buildMeegleWorkitemLifecycle, classifyMeegleLifecycleStatus } from "./meegle-workitem-lifecycle.js";

const workitem: MeegleWorkitem = {
  id: "10",
  key: "TEN-10",
  name: "Lifecycle",
  type: "66700acbf297a8f821b4b860",
  status: "Done",
  fields: { work_item_fields: [{ key: "field_ecd063", value: [{ id: "cycle-1", name: "Sprint 1" }] }] },
};

function record(time: string, statusKey: string, oldStatusKey: string): MeegleWorkitemOperationRecord {
  return {
    workItemId: "10",
    workItemTypeKey: workitem.type,
    operationType: "modify",
    operationTime: time,
    module: "field_mod",
    recordContents: [{
      objectType: "field",
      objectValue: "work_item_status",
      objectProperty: "workitem_status",
      oldValues: [oldStatusKey],
      newValues: [statusKey],
    }],
  };
}

describe("Meegle work item lifecycle", () => {
  it("classifies New and successful terminal states without treating Terminated as completed", () => {
    expect(classifyMeegleLifecycleStatus("New")).toBe("new");
    expect(classifyMeegleLifecycleStatus("In Progress")).toBe("started");
    expect(classifyMeegleLifecycleStatus("Done")).toBe("finished");
    expect(classifyMeegleLifecycleStatus("Terminated")).toBe("started");
  });

  it("projects add, start and finish timestamps and deduplicates mirrored status records", () => {
    const create: MeegleWorkitemOperationRecord = {
      workItemId: "10", workItemTypeKey: workitem.type, operationType: "create",
      operationTime: "2026-08-20T08:00:00.000Z", module: "work_item_mod", recordContents: [],
    };
    const cycle: MeegleWorkitemOperationRecord = {
      workItemId: "10", workItemTypeKey: workitem.type, operationType: "modify",
      operationTime: "2026-08-21T08:00:00.000Z", module: "field_mod",
      recordContents: [{ objectType: "field", objectValue: "field_ecd063", oldValues: [], newValues: ["cycle-1"] }],
    };
    const start = record("2026-08-22T08:00:00.000Z", "doing", "started");
    const finish = record("2026-08-24T08:00:00.000Z", "done", "doing");
    expect(buildMeegleWorkitemLifecycle({
      workitem,
      operationRecords: [create, cycle, start, { ...start, module: "work_item_mod" }, finish],
      statusLabels: new Map([["started", "Start"], ["doing", "In Progress"], ["done", "Done"]]),
    })).toEqual({
      itemCycleTag: "cycle-1",
      addToCycleTime: "2026-08-21T08:00:00.000Z",
      itemStartTime: "2026-08-22T08:00:00.000Z",
      itemFinishTime: "2026-08-24T08:00:00.000Z",
    });
  });

  it("uses creation time when a work item is created with the current cycle", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, status: "Start" },
      operationRecords: [{
        workItemId: "10", workItemTypeKey: workitem.type, operationType: "create",
        operationTime: "2026-08-20T08:00:00.000Z", module: "work_item_mod", recordContents: [],
      }],
    })).toEqual({ itemCycleTag: "cycle-1", addToCycleTime: "2026-08-20T08:00:00.000Z", itemStartTime: undefined, itemFinishTime: undefined });
  });

  it("resets finish time when a finished item is reopened", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, status: "In Progress" },
      operationRecords: [
        record("2026-08-22T08:00:00.000Z", "doing", "started"),
        record("2026-08-24T08:00:00.000Z", "done", "doing"),
        record("2026-08-25T08:00:00.000Z", "doing", "done"),
      ],
      statusLabels: new Map([["started", "Start"], ["doing", "In Progress"], ["done", "Done"]]),
    })).toMatchObject({ itemStartTime: "2026-08-25T08:00:00.000Z", itemFinishTime: undefined });
  });
});
