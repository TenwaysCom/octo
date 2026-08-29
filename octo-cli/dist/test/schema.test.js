import assert from "node:assert/strict";
import test from "node:test";
import { getApiSchema, listApiSchemas } from "../src/schema.js";
test("lists the stable read-only Agent API catalogue", () => {
    assert.deepEqual(listApiSchemas().map((schema) => schema.name), [
        "sprint.burndown",
        "sprint.tasks",
        "github.pull-request",
        "lark.ticket",
        "odoo.branches",
    ]);
    assert.equal(getApiSchema("odoo.branches").scope, "odoo_devops:read");
});
test("rejects unknown schema names", () => {
    assert.throws(() => getApiSchema("api.raw"), /Unknown API schema/);
});
