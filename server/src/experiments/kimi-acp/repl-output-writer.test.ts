import { describe, expect, it } from "vitest";
import { createReplOutputWriter } from "./repl-output-writer.js";

describe("createReplOutputWriter", () => {
  it("merges consecutive thought chunks into one line in merge mode", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writer = createReplOutputWriter({
      mergeThoughts: true,
      stdout: {
        write(chunk: string) {
          stdout.push(chunk);
        },
      },
      stderr: {
        write(chunk: string) {
          stderr.push(chunk);
        },
      },
    });

    writer.write({
      thoughtText: "或者",
    });
    writer.write({
      thoughtText: "如果他们",
    });
    writer.write({
      stderrLine: "[mode] code\n",
    });

    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      "[thought] 或者如果他们\n",
      "[mode] code\n",
    ]);
  });

  it("flushes pending thought text when asked explicitly", () => {
    const stderr: string[] = [];
    const writer = createReplOutputWriter({
      mergeThoughts: true,
      stdout: { write() {} },
      stderr: {
        write(chunk: string) {
          stderr.push(chunk);
        },
      },
    });

    writer.write({
      thoughtText: "Kimi CLI",
    });
    writer.flush();

    expect(stderr).toEqual(["[thought] Kimi CLI\n"]);
  });

  it("keeps one line per thought chunk when merge mode is disabled", () => {
    const stderr: string[] = [];
    const writer = createReplOutputWriter({
      mergeThoughts: false,
      stdout: { write() {} },
      stderr: {
        write(chunk: string) {
          stderr.push(chunk);
        },
      },
    });

    writer.write({
      thoughtText: "Kim",
    });
    writer.write({
      thoughtText: "i",
    });

    expect(stderr).toEqual([
      "[thought] Kim\n",
      "[thought] i\n",
    ]);
  });
});
