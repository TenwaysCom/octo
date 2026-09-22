import { EventEmitter } from "node:events";
import { createWikiQaExtractLog } from "./wiki-qa-extract-log.js";
import type { createFileLogger } from "../../logger.js";

function fixture(enabled?: string) {
  const sink = Object.assign(new EventEmitter(), { info: vi.fn() });
  const createLogger = vi.fn().mockReturnValue(sink);
  const env = { WIKI_QA_EXTRACT_LOG_ENABLED: enabled };
  const write = createWikiQaExtractLog({ env, createLogger: createLogger as unknown as typeof createFileLogger });
  return { write, sink, env, createLogger };
}

describe("wiki extraction diagnostic log", () => {
  it.each([undefined, "false", "0", "yes"])("does not create a file when disabled: %s", (enabled) => {
    const f = fixture(enabled);
    f.write({ event: "input", actionRunId: "run", prompt: "private context" });
    expect(f.createLogger).not.toHaveBeenCalled();
  });

  it("uses a separate info-level sink and redacts embedded data on both sides", () => {
    const f = fixture("true");
    const text = 'person@example.com order ABCD1234 Bearer abc.def api_key=key123 {"token":"secret123"} https://user:pass@example.com';
    f.write({ event: "input", actionRunId: "run", prompt: text });
    f.write({ event: "output", actionRunId: "run", model: "test", output: text, valid: false, durationMs: 5 });
    expect(f.createLogger).toHaveBeenCalledExactlyOnceWith("./logs/wiki-qa-extract.log", "info", expect.any(Function));
    for (const [record] of f.sink.info.mock.calls) {
      expect(record).toMatchObject({ actionRunId: "run", stage: "server.wiki_qa.extract" });
      const serialized = JSON.stringify(record);
      for (const secret of ["person@example.com", "ABCD1234", "abc.def", "key123", "secret123", "user:pass"]) expect(serialized).not.toContain(secret);
    }
    expect(f.sink.info.mock.calls[1][0]).toMatchObject({ valid: false, durationMs: 5 });
    f.env.WIKI_QA_EXTRACT_LOG_ENABLED = "false";
    f.write({ event: "input", actionRunId: "other", prompt: "disabled" });
    expect(f.sink.info).toHaveBeenCalledTimes(2);
  });

  it("isolates synchronous and asynchronous logger failures", () => {
    const f = fixture("true");
    f.createLogger.mockImplementationOnce(() => { throw new Error("disk unavailable"); });
    expect(() => f.write({ event: "input", actionRunId: "run", prompt: "test" })).not.toThrow();
    const g = fixture("true");
    g.write({ event: "failed", actionRunId: "run", errorCode: "TIMEOUT" });
    expect(() => g.createLogger.mock.calls[0][2](new Error("disk unavailable"))).not.toThrow();
    g.write({ event: "input", actionRunId: "run", prompt: "test" });
    expect(g.sink.info).toHaveBeenCalledTimes(1);
  });
});
