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
});
