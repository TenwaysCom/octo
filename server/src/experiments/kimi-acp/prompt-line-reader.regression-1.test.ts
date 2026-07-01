import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { createPromptLineReader } from "./prompt-line-reader.js";

describe("createPromptLineReader", () => {
  const resources: Array<{ input: PassThrough; output: PassThrough }> = [];

  afterEach(() => {
    for (const resource of resources) {
      resource.input.destroy();
      resource.output.destroy();
    }
    resources.length = 0;
  });

  it("does not lose queued tty lines that arrive before the next prompt", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    resources.push({ input, output });

    const inputLoop = createInterface({
      input,
      output,
      terminal: true,
    });
    const reader = createPromptLineReader(inputLoop);
    const iterator = reader[Symbol.asyncIterator]();

    const firstLine = iterator.next();
    input.write("first question\n/exit\n");

    await expect(firstLine).resolves.toMatchObject({
      done: false,
      value: "first question",
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: "/exit",
    });

    inputLoop.close();
  });
});
