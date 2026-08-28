import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import { buildMeegleWorkitemLifecycle, classifyMeegleLifecycleStatus } from "./meegle-workitem-lifecycle.js";

const workitemFields = [
  { key: "field_ecd063", value: [{ id: "cycle-1", name: "Sprint 1" }] },
  { key: "start_time", value: { iso_time: "2026-08-20T00:00:00Z" } },
  { key: "finish_time", value: { iso_time: "2026-08-24T08:00:00Z" } },
];

const workitem: MeegleWorkitem = {
  id: "10",
  key: "TEN-10",
  name: "Lifecycle",
  type: "66700acbf297a8f821b4b860",
  status: "Done",
  fields: {
    work_item_fields: workitemFields,
    workflow_nodes: [{
      basic: { name: "Doing" },
      schedule: { actual_begin_time: "2026-08-22T08:00:00Z", actual_finish_time: "2026-08-24T07:59:59Z" },
    }, {
      basic: { name: "Done" },
      schedule: { actual_begin_time: "2026-08-24T08:00:00Z", actual_finish_time: "2026-08-24T08:00:00Z" },
    }, {
      basic: { name: "To Start" },
      schedule: { actual_begin_time: "2026-08-20T08:00:00Z", actual_finish_time: "2026-08-22T08:00:00Z" },
    }],
  },
};

describe("Meegle work item lifecycle", () => {
  it("classifies New and successful terminal states without treating Terminated as completed", () => {
    expect(classifyMeegleLifecycleStatus("New")).toBe("new");
    expect(classifyMeegleLifecycleStatus("In Progress")).toBe("started");
    expect(classifyMeegleLifecycleStatus("Done")).toBe("finished");
    expect(classifyMeegleLifecycleStatus("Launched")).toBe("started");
    expect(classifyMeegleLifecycleStatus("Terminated")).toBe("started");
  });

  it("projects historical times from Sprint dates and nodes already stored in the workitem payload", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem,
      sprintStartAt: "2026-08-21T00:00:00.000Z",
    })).toEqual({
      phase: "finished",
      addToCycleTime: "2026-08-21T00:00:00.000Z",
      currentNodeStartTime: null,
      itemStartTime: "2026-08-22T08:00:00.000Z",
      itemFinishTime: "2026-08-24T08:00:00.000Z",
    });
  });

  it("uses creation time for an item created after the Sprint started", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, status: "Start", fields: {
        ...workitem.fields,
        work_item_current_node: [{ name: "Start" }],
      } },
      sprintStartAt: "2026-08-19T00:00:00.000Z",
    })).toEqual({
      phase: "new",
      addToCycleTime: "2026-08-20T00:00:00.000Z",
      currentNodeStartTime: null,
      itemStartTime: null,
      itemFinishTime: null,
    });
  });

  it("uses current-node evidence from the stored payload without fetching all nodes", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, status: "Launched", subStage: "Go-Live check", fields: {
        work_item_fields: workitemFields,
        work_item_current_node: [{
          name: "Go-Live check",
          schedule: { actual_begin_time: "2026-08-25T08:00:00Z" },
        }],
      } },
    })).toMatchObject({
      currentNodeStartTime: "2026-08-25T08:00:00.000Z",
      itemStartTime: "2026-08-25T08:00:00.000Z",
      itemFinishTime: null,
    });
  });

  it.each([
    ["Feature", "story"],
    ["Tech Task", "66700acbf297a8f821b4b860"],
    ["Production Bug", "6932e40429d1cd8aac635c82"],
  ])("projects the %s current node's direct actual_begin_time", (_workItemType, type) => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: {
        ...workitem,
        type,
        status: "In Progress",
        fields: {
          work_item_fields: workitemFields,
          work_item_current_node: [{
            name: "Doing",
            actual_begin_time: "2026-08-25T08:00:00Z",
          }],
        },
      },
    })).toMatchObject({
      currentNodeStartTime: "2026-08-25T08:00:00.000Z",
    });
  });

  it("uses a terminal node start when the stored history contains no separate active node", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, fields: {
        work_item_fields: workitemFields.slice(0, 2),
        work_item_current_node: [{
          name: "Done",
          schedule: {
            actual_begin_time: "2026-08-24T08:00:00Z",
            actual_finish_time: "2026-08-24T09:00:00Z",
          },
        }],
      } },
    })).toMatchObject({
      phase: "finished",
      itemStartTime: "2026-08-24T08:00:00.000Z",
      itemFinishTime: "2026-08-24T09:00:00.000Z",
    });
  });

  it("leaves lifecycle times empty when the PostgreSQL snapshot has no node or finish evidence", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: { ...workitem, status: "In Progress", fields: {
        work_item_fields: workitemFields.slice(0, 2),
      } },
    })).toMatchObject({ itemStartTime: null, itemFinishTime: null });
  });
});
