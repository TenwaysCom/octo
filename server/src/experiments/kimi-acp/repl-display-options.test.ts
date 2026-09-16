import { describe, expect, it } from "vitest";
import { parseReplDisplayOptions } from "./repl-display-options.js";

describe("parseReplDisplayOptions", () => {
  it("uses disabled display flags by default", () => {
    expect(parseReplDisplayOptions([], {})).toEqual({
      rawEvents: false,
      showThoughts: false,
    });
  });

  it("reads display flags from the environment", () => {
    expect(
      parseReplDisplayOptions([], {
        KIMI_ACP_REPL_SHOW_THOUGHTS: "1",
        KIMI_ACP_REPL_RAW: "true",
      }),
    ).toEqual({
      rawEvents: true,
      showThoughts: true,
    });
  });

  it("reads display flags from command-line switches", () => {
    expect(
      parseReplDisplayOptions(["--", "--show-thoughts", "--raw-events"], {}),
    ).toEqual({
      rawEvents: true,
      showThoughts: true,
    });
  });

  it("rejects unknown command-line switches", () => {
    expect(() => parseReplDisplayOptions(["--nope"], {})).toThrow(
      "Unknown REPL option: --nope",
    );
  });
});
