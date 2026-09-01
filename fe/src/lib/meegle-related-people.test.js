import assert from "node:assert/strict";
import test from "node:test";
import { flattenMeegleRelatedPeople, formatMeegleRelatedPeopleLabel } from "./meegle-related-people.js";

const relatedPeople = [
  { roleKey: "developer", roleName: "Developer", members: [{ memberKey: "u-1", name: "Ada" }, { memberKey: "u-2", name: "Bob" }] },
  { roleKey: "reviewer", roleName: "Reviewer", members: [{ memberKey: "u-1", name: "Ada" }] },
];

test("flattens role memberships without merging a person across roles", () => {
  assert.deepEqual(flattenMeegleRelatedPeople(relatedPeople), [
    { roleKey: "developer", roleName: "Developer", memberKey: "u-1", name: "Ada" },
    { roleKey: "developer", roleName: "Developer", memberKey: "u-2", name: "Bob" },
    { roleKey: "reviewer", roleName: "Reviewer", memberKey: "u-1", name: "Ada" },
  ]);
});

test("formats an accessible role-grouped label", () => {
  assert.equal(formatMeegleRelatedPeopleLabel(relatedPeople), "Developer：Ada、Bob；Reviewer：Ada");
  assert.equal(formatMeegleRelatedPeopleLabel([]), "");
});
