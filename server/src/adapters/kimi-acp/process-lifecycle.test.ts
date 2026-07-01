import { EventEmitter } from "node:events";
import { cleanupAgentProcess } from "./process-lifecycle.js";

class FakeAgentProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  });
}

describe("cleanupAgentProcess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately when the subprocess already exited", async () => {
    const agentProcess = new FakeAgentProcess();
    agentProcess.exitCode = 0;

    await cleanupAgentProcess(agentProcess as never, { timeoutMs: 1 });

    expect(agentProcess.kill).not.toHaveBeenCalled();
  });

  it("falls back to SIGKILL when the subprocess ignores SIGTERM", async () => {
    vi.useFakeTimers();
    const agentProcess = new FakeAgentProcess();
    agentProcess.kill.mockImplementation((signal: NodeJS.Signals = "SIGTERM") => {
      if (signal === "SIGKILL") {
        agentProcess.signalCode = signal;
        agentProcess.emit("exit", null, signal);
      }
      return true;
    });

    const cleanup = cleanupAgentProcess(agentProcess as never, { timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    await cleanup;

    expect(agentProcess.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(agentProcess.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });
});
