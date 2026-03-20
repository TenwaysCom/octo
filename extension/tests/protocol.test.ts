import { describe, expect, it } from "vitest";
import { protocolActions } from "../src/types/protocol";

describe("protocolActions", () => {
  it("includes the Meegle auth ensure action", () => {
    expect(protocolActions).toContain("itdog.meegle.auth.ensure");
  });
});
