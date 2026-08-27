import { MeegleShellClient } from "./meegle-shell-client.js";

describe("MeegleShellClient", () => {
  it("lists a configured work item type through the local CLI MQL query", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        projects: [{ name: "Tenways Software R&D", simple_name: "4c3fv6" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        list: [{ name: "Production Bug", type_key: "production_bug" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        data: {
          1: [{
            moql_field_list: [
              { key: "work_item_id", value: { long_value: 123 } },
              { key: "name", value: { string_value: "A bug" } },
              { key: "work_item_type_key", value: { key_label_value: { key: "production_bug" } } },
              { key: "work_item_status", value: { key_label_value_list: [{ label: "New" }] } },
            ],
          }],
        },
      }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.filterWorkitems("4c3fv6", {
      workitemTypeKeys: ["production_bug"],
      pageSize: 100,
      autoPaginate: true,
    })).resolves.toEqual([{
      id: "123",
      key: "",
      name: "A bug",
      type: "production_bug",
      status: "New",
      fields: expect.any(Object),
    }]);
    expect(runCommand).toHaveBeenNthCalledWith(3, [
      "workitem",
      "query",
      "--project-key", "4c3fv6",
      "--mql",
      "SELECT `work_item_id`, `name`, `work_item_type_key`, `work_item_status` FROM `Tenways Software R&D`.`Production Bug` LIMIT 0, 50",
    ]);
  });

  it("filters each work item type by its configured MQL updated-at field before paging", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        projects: [{ name: "Tenways Software R&D", simple_name: "4c3fv6" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        list: [{ name: "Story", type_key: "story" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        data: {
          1: [{
            moql_field_list: [
              { key: "work_item_id", value: { long_value: 123 } },
              { key: "name", value: { string_value: "Changed story" } },
              { key: "work_item_type_key", value: { key_label_value: { key: "story" } } },
              { key: "work_item_status", value: { key_label_value_list: [{ label: "Done" }] } },
              { key: "updated_at", value: { long_value: 1786020656000 } },
            ],
          }],
        },
      }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.filterWorkitems("4c3fv6", {
      workitemTypeKeys: ["story"],
      pageSize: 50,
      autoPaginate: true,
      sourceUpdatedAfter: "2026-08-06T12:45:56.000Z",
      sourceUpdatedAtMqlFieldNames: { story: "updated_at" },
    })).resolves.toMatchObject([{
      id: "123",
      updatedAt: "2026-08-06T12:50:56.000Z",
    }]);
    expect(runCommand).toHaveBeenNthCalledWith(3, [
      "workitem",
      "query",
      "--project-key", "4c3fv6",
      "--mql",
      "SELECT `work_item_id`, `name`, `work_item_type_key`, `work_item_status`, `updated_at` FROM `Tenways Software R&D`.`Story` WHERE `updated_at` >= '2026-08-06T12:45:56.000Z' ORDER BY `updated_at` ASC, `work_item_id` ASC LIMIT 0, 50",
    ]);
  });

  it("rejects incremental MQL retrieval when a configured work item type has no timestamp field", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        projects: [{ name: "Tenways Software R&D", simple_name: "4c3fv6" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        list: [{ name: "Story", type_key: "story" }],
      }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.filterWorkitems("4c3fv6", {
      workitemTypeKeys: ["story"],
      sourceUpdatedAfter: "2026-08-06T12:45:56.000Z",
      sourceUpdatedAtMqlFieldNames: {},
    })).rejects.toThrow("MEEGLE_SHELL_SOURCE_UPDATED_AT_FIELD_REQUIRED:story");
    expect(runCommand).toHaveBeenCalledTimes(2);
  });

  it("fails instead of advancing past the MQL pagination safety limit", async () => {
    const fullPage = JSON.stringify({
      data: {
        1: Array.from({ length: 50 }, () => ({
          moql_field_list: [
            { key: "work_item_id", value: { long_value: 123 } },
            { key: "name", value: { string_value: "Changed story" } },
            { key: "work_item_type_key", value: { key_label_value: { key: "story" } } },
            { key: "work_item_status", value: { key_label_value_list: [{ label: "Done" }] } },
            { key: "updated_at", value: { long_value: 1786020656000 } },
          ],
        })),
      },
    });
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        projects: [{ name: "Tenways Software R&D", simple_name: "4c3fv6" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        list: [{ name: "Story", type_key: "story" }],
      }))
      .mockResolvedValue(fullPage);
    const client = new MeegleShellClient(runCommand);

    await expect(client.filterWorkitems("4c3fv6", {
      workitemTypeKeys: ["story"],
      pageSize: 50,
      autoPaginate: true,
      sourceUpdatedAfter: "2026-08-06T12:45:56.000Z",
      sourceUpdatedAtMqlFieldNames: { story: "updated_at" },
    })).rejects.toThrow("MEEGLE_SHELL_MQL_PAGE_LIMIT_REACHED:story");
    expect(runCommand).toHaveBeenCalledTimes(102);
  });

  it("maps local CLI batch-get details to Meegle work items", async () => {
    const runCommand = vi.fn().mockResolvedValue(JSON.stringify({
      results: [{
        data: {
          work_item_attribute: {
            work_item_id: "123",
            work_item_name: "A bug",
            work_item_type: { key: "production_bug", name: "Production Bug" },
            work_item_status: { name: "QA Review" },
          },
          work_item_current_node: [{ owners: [{ name: "Owner" }] }],
          work_item_fields: [{ key: "description", value: "Details" }],
        },
      }],
    }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.getWorkitemDetails("project", "fallback", ["123"])).resolves.toEqual([{
      id: "123",
      key: "",
      name: "A bug",
      type: "production_bug",
      workItemType: "Production Bug",
      status: "QA Review",
      assignee: "Owner",
      fields: expect.any(Object),
    }]);
    expect(runCommand).toHaveBeenCalledWith([
      "workitem",
      "+batch-get",
      "--project-key", "project",
      "--work-item-ids", "123",
    ]);
  });

  it("uses Production Bug update_time from batch details as the canonical source timestamp", async () => {
    const runCommand = vi.fn().mockResolvedValue(JSON.stringify({
      results: [{
        data: {
          updated_at: 1786020656000,
          work_item_attribute: {
            work_item_id: "123",
            work_item_name: "A bug",
            work_item_type: { key: "6932e40429d1cd8aac635c82", name: "Production Bug" },
            work_item_status: { name: "QA Review" },
            update_time: "1785920000000",
          },
        },
      }],
    }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.getWorkitemDetails("project", "6932e40429d1cd8aac635c82", ["123"])).resolves.toMatchObject([{
      id: "123",
      updatedAt: "2026-08-05T08:53:20.000Z",
    }]);
  });

  it("requests only the specified related fields when enriching batch details", async () => {
    const runCommand = vi.fn().mockResolvedValue(JSON.stringify({ results: [] }));
    const client = new MeegleShellClient(runCommand);

    await client.getWorkitemDetails("project", "story", ["123"], ["field_feb079", "field_1b9eb0"]);

    expect(runCommand).toHaveBeenCalledWith([
      "workitem",
      "+batch-get",
      "--project-key", "project",
      "--work-item-ids", "123",
      "--fields", "field_feb079",
      "--fields", "field_1b9eb0",
    ]);
  });

  it("reads work item type and status mappings from CLI metadata", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        list: [{ name: "Production Bug", type_key: "production_bug" }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        list: [{
          field_key: "work_item_status",
          option: [{ option_id: "status_new", option_name: "New" }],
        }],
      }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.getSyncMappings("project", ["production_bug"])).resolves.toEqual([
      {
        projectKey: "project",
        workItemTypeKey: "production_bug",
        kind: "workitem_type",
        sourceKey: "production_bug",
        displayValue: "Production Bug",
      },
      {
        projectKey: "project",
        workItemTypeKey: "production_bug",
        kind: "status",
        sourceKey: "status_new",
        displayValue: "New",
      },
    ]);
  });

  it("reads and paginates work item operation records", async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        has_more: true,
        start_from: "next",
        op_records: [{
          work_item_id: 123,
          work_item_type_key: "story",
          operation_type: "modify",
          operation_time: 1787815548711,
          op_record_module: "field_mod",
          record_contents: [{ object: { object_type: "field", object_value: "field_cycle" }, old: [], new: ["cycle-1"] }],
        }],
      }))
      .mockResolvedValueOnce(JSON.stringify({ has_more: false, start_from: "", op_records: [] }));
    const client = new MeegleShellClient(runCommand);

    await expect(client.listWorkitemOperationRecords("project", ["123"])).resolves.toMatchObject([
      { workItemId: "123", recordContents: [{ objectValue: "field_cycle", newValues: ["cycle-1"] }] },
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(1, [
      "workitem", "list-op-records", "--project-key", "project", "--work-item-id", "123",
      "--op-record-module", "field_mod", "--op-record-module", "work_item_mod",
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(2, [
      "workitem", "list-op-records", "--project-key", "project", "--work-item-id", "123",
      "--op-record-module", "field_mod", "--op-record-module", "work_item_mod", "--start-from", "next",
    ]);
  });
});
