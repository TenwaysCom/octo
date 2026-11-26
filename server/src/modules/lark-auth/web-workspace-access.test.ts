import { describe, expect, it } from "vitest";
import { getWebWorkspaceAccess } from "./web-workspace-access.js";

describe("web workspace access", () => {
  it("lets dev roles view the platform lists but not run synchronization", () => {
    expect(getWebWorkspaceAccess("dev")).toEqual({ platformLists: true, platformSync: false, dataQuery: false });
  });

  it("lets devops roles view platform lists and run synchronization", () => {
    expect(getWebWorkspaceAccess("DevOps, release")).toEqual({ platformLists: true, platformSync: true, dataQuery: false });
  });

  it("lets PM roles view platform lists and run synchronization", () => {
    expect(getWebWorkspaceAccess("pm")).toEqual({ platformLists: true, platformSync: true, dataQuery: false });
  });

  it("lets admin roles view existing platform features", () => {
    expect(getWebWorkspaceAccess("workspace-admin")).toEqual({ platformLists: true, platformSync: true, dataQuery: false });
  });

  it("hides restricted workspace features when no matching role exists", () => {
    expect(getWebWorkspaceAccess("viewer")).toEqual({ platformLists: false, platformSync: false, dataQuery: false });
  });

  it.each(["it", "IT", " iT ", "dev, IT", "pm\tit", "viewer, it, release"])(
    "grants data queries only for an exact IT role token: %j",
    (role) => {
      expect(getWebWorkspaceAccess(role).dataQuery).toBe(true);
    },
  );

  it.each([undefined, null, "", "admin", "dev", "devops", "pm", "audit", "with", "non-it", "it-support", "it_admin", "ITAdmin", "security"])(
    "does not infer IT access from another or missing role: %j",
    (role) => {
      expect(getWebWorkspaceAccess(role).dataQuery).toBe(false);
    },
  );

  it("keeps a standalone IT role independent from platform lists and sync", () => {
    expect(getWebWorkspaceAccess("IT")).toEqual({
      platformLists: false,
      platformSync: false,
      dataQuery: true,
    });
  });
});
