import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformSearchKey, getPlatformSearchTarget } from "./platform-search.js";

test("maps platform results to the existing detail destinations", () => {
  assert.deepEqual(getPlatformSearchTarget({ kind: "lark-tickets", sourceId: "rec 42" }), { href: "#lark-tickets/rec%2042", external: false });
  assert.deepEqual(getPlatformSearchTarget({ kind: "meegle-workitems", sourceId: "900", scope: "project", workItemTypeKey: "story", issueType: "Story" }), { href: "https://project.larksuite.com/project/story/detail/900", external: true });
  assert.equal(getPlatformSearchTarget({ kind: "github-pull-requests", url: "javascript:alert(1)" }), null);
  assert.deepEqual(getPlatformSearchTarget({ kind: "github-pull-requests", url: "https://github.com/acme/app/pull/42" }), { href: "https://github.com/acme/app/pull/42", external: true });
});

test("keeps identical numbers in different repositories and platforms distinct", () => {
  const keys = [
    { kind: "github-pull-requests", scope: "acme/app", sourceId: "42" },
    { kind: "github-pull-requests", scope: "acme/other", sourceId: "42" },
    { kind: "lark-tickets", scope: "base/table", sourceId: "42" },
  ].map(getPlatformSearchKey);
  assert.equal(new Set(keys).size, 3);
});
