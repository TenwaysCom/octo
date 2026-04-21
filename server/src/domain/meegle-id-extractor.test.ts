import { describe, it, expect } from "vitest";
import { extractMeegleIds } from "./meegle-id-extractor.js";

describe("extractMeegleIds", () => {
  it("should extract pure numeric IDs (6+ digits)", () => {
    const result = extractMeegleIds("Fix bug #123456 and #789012");
    expect(result).toEqual(["123456", "789012"]);
  });

  it("should extract m- prefixed IDs", () => {
    const result = extractMeegleIds("Related to m-49545");
    expect(result).toContain("49545");
  });

  it("should extract f- prefixed IDs", () => {
    const result = extractMeegleIds("Fixes f-123456");
    expect(result).toContain("123456");
  });

  it("should deduplicate IDs", () => {
    const result = extractMeegleIds("m-123 and f-123 and #123123");
    expect(result).toEqual(["123123", "123"]);
  });

  it("should extract from multiple sources", () => {
    const sources = {
      title: "Fix m-123",
      description: "See #456789",
      commits: [{ message: "fix: bug f-100" }],
      comments: [{ body: "Check m-200" }],
    };
    const result = extractMeegleIds(sources);
    expect(result).toEqual(["123", "456789", "100", "200"]);
  });

  it("should return empty array for no matches", () => {
    const result = extractMeegleIds("No IDs here");
    expect(result).toEqual([]);
  });
});
