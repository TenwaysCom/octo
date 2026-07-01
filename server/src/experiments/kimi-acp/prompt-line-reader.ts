import type { Interface } from "node:readline";

export function createPromptLineReader(
  inputLoop: Interface,
): AsyncIterable<string> {
  const lineIterator = inputLoop[Symbol.asyncIterator]();

  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          inputLoop.prompt();
          return await lineIterator.next();
        },
      };
    },
  };
}
