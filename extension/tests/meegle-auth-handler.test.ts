import { describe, expect, it } from "vitest";
import { ensureMeegleAuth } from "../src/background/handlers/meegle-auth";

describe("ensureMeegleAuth", () => {
  it("returns require_auth_code when no reusable token exists", async () => {
    await expect(ensureMeegleAuth()).resolves.toMatchObject({
      status: "require_auth_code",
    });
  });
});
