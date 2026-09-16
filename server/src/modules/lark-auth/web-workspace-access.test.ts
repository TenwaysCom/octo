import { describe, expect, it } from "vitest";
import { getWebWorkspaceAccess } from "./web-workspace-access.js";

describe("web workspace access", () => {
  it("lets dev roles view the platform lists but not run synchronization", () => {
    expect(getWebWorkspaceAccess("dev")).toEqual({ platformLists: true, platformSync: false });
  });

  it("lets devops roles view platform lists and run synchronization", () => {
    expect(getWebWorkspaceAccess("DevOps, release")).toEqual({ platformLists: true, platformSync: true });
  });

  it("lets PM roles view platform lists and run synchronization", () => {
    expect(getWebWorkspaceAccess("pm")).toEqual({ platformLists: true, platformSync: true });
  });

  it("lets admin roles view every workspace feature", () => {
    expect(getWebWorkspaceAccess("workspace-admin")).toEqual({ platformLists: true, platformSync: true });
  });

  it("hides restricted workspace features when no matching role exists", () => {
    expect(getWebWorkspaceAccess("viewer")).toEqual({ platformLists: false, platformSync: false });
  });
});
