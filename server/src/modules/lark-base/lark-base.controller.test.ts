import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateLarkBaseMeegleLinkController } from "./lark-base.controller.js";

const updateLarkBaseMeegleLinkMock = vi.fn();

vi.mock("./lark-base.service.js", () => ({
  updateLarkBaseMeegleLink: (...args: unknown[]) =>
    updateLarkBaseMeegleLinkMock(...args),
}));

describe("lark-base.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the meegle link field successfully", async () => {
    updateLarkBaseMeegleLinkMock.mockResolvedValueOnce({
      ok: true,
      recordId: "rec_123",
    });

    const result = await updateLarkBaseMeegleLinkController({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_123",
      meegleLink: "https://meego.feishu.cn/issue/123",
      masterUserId: "usr_xxx",
    });

    expect(result).toEqual({
      ok: true,
      recordId: "rec_123",
    });
    expect(updateLarkBaseMeegleLinkMock).toHaveBeenCalledWith({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_123",
      meegleLink: "https://meego.feishu.cn/issue/123",
      masterUserId: "usr_xxx",
    });
  });

  it("returns invalid request for missing fields", async () => {
    const result = await updateLarkBaseMeegleLinkController({
      baseId: "app_xxx",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "INVALID_REQUEST",
        errorMessage: expect.any(String),
      },
    });
  });

  it("returns update failed when service throws", async () => {
    updateLarkBaseMeegleLinkMock.mockRejectedValueOnce(
      new Error("Lark token not found for user"),
    );

    const result = await updateLarkBaseMeegleLinkController({
      baseId: "app_xxx",
      tableId: "tbl_xxx",
      recordId: "rec_123",
      meegleLink: "https://meego.feishu.cn/issue/123",
      masterUserId: "usr_xxx",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        errorCode: "UPDATE_FAILED",
        errorMessage: "Lark token not found for user",
      },
    });
  });
});
