import type { MeegleWorkitem } from "../../adapters/meegle/meegle-client.js";
import { buildMeegleWorkitemLifecycle, getMeegleWorkitemLifecycleFieldKeys } from "./meegle-workitem-lifecycle.js";

function makeWorkitem(workItemFields: unknown[], currentNodes: unknown[] = []): MeegleWorkitem {
  return {
    id: "10",
    key: "TEN-10",
    name: "Lifecycle",
    type: "66700acbf297a8f821b4b860",
    status: "Done",
    fields: {
      work_item_fields: workItemFields,
      work_item_current_node: currentNodes,
    },
  };
}

describe("Meegle work item lifecycle", () => {
  it("leaves standard Bugs outside the current implementation scope", () => {
    expect(getMeegleWorkitemLifecycleFieldKeys("issue")).toEqual([]);
  });

  it("projects start and finish directly as calendar dates", () => {
    const lifecycle = buildMeegleWorkitemLifecycle({
      workitem: makeWorkitem([
        { key: "start_time", value: { iso_time: "2026-08-20T08:30:45Z" } },
        { key: "finish_time", value: { iso_time: "2026-08-24T19:20:10Z" } },
      ]),
      sprintStartAt: "2026-08-21T00:00:00.000Z",
    });

    expect(lifecycle).toEqual({
      addToCycleTime: "2026-08-21T00:00:00.000Z",
      currentNodeStartTime: null,
      itemStartTime: "2026-08-20",
      itemFinishTime: "2026-08-24",
      warnings: [],
    });
  });

  it("does not infer item dates from workflow nodes or status", () => {
    const lifecycle = buildMeegleWorkitemLifecycle({
      workitem: makeWorkitem([], [{
        basic: { name: "Done" },
        schedule: {
          actual_begin_time: "2026-08-24T08:00:00Z",
          actual_finish_time: "2026-08-24T09:00:00Z",
        },
      }]),
    });

    expect(lifecycle).toMatchObject({
      currentNodeStartTime: "2026-08-24T08:00:00.000Z",
      itemStartTime: null,
      itemFinishTime: null,
    });
  });

  it("clears source-empty dates so reopened items do not retain a finish", () => {
    expect(buildMeegleWorkitemLifecycle({
      workitem: makeWorkitem([
        { key: "start_time", value: null },
        { key: "finish_time", value: "" },
      ]),
    })).toMatchObject({ itemStartTime: null, itemFinishTime: null, warnings: [] });
  });

  it("clears invalid dates and reports field-level warnings", () => {
    const lifecycle = buildMeegleWorkitemLifecycle({
      workitem: makeWorkitem([
        { key: "start_time", value: "2026-02-31" },
        { key: "finish_time", value: "not-a-date" },
      ]),
    });

    expect(lifecycle.itemStartTime).toBeNull();
    expect(lifecycle.itemFinishTime).toBeNull();
    expect(lifecycle.warnings).toEqual([
      { errorCode: "MEEGLE_TIME_INVALID", fieldKey: "start_time", rawValue: "2026-02-31" },
      { errorCode: "MEEGLE_TIME_INVALID", fieldKey: "finish_time", rawValue: "not-a-date" },
    ]);
  });

  it.each(["story", "66700acbf297a8f821b4b860", "6932e40429d1cd8aac635c82"])(
    "keeps the %s current-node timestamp precise",
    (type) => {
      const lifecycle = buildMeegleWorkitemLifecycle({
        workitem: {
          ...makeWorkitem([]),
          type,
          fields: {
            work_item_fields: [],
            work_item_current_node: [{
              name: "Doing",
              actual_begin_time: "2026-08-25T08:00:00Z",
            }],
          },
        },
      });
      expect(lifecycle.currentNodeStartTime).toBe("2026-08-25T08:00:00.000Z");
    },
  );
});
