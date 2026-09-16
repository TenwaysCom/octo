import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupAgentProcess,
  runWithAgentProcessGuard,
} from "./process-lifecycle.js";

class FakeAgentProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  });
}

describe("runWithAgentProcessGuard", () => {
  it("rejects when the subprocess exits before the guarded work finishes", async () => {
    const agentProcess = new FakeAgentProcess();
    let resolveWork!: (value: string) => void;
    const guarded = runWithAgentProcessGuard(agentProcess as never, () => {
      return new Promise<string>((resolve) => {
        resolveWork = resolve;
      });
    });

    await Promise.resolve();
    agentProcess.signalCode = "SIGTERM";
    agentProcess.emit("exit", null, "SIGTERM");

    await expect(guarded).rejects.toThrow(
      "subprocess exited during ACP validation (code=null, signal=SIGTERM)",
    );

    resolveWork("ok");
  });
});

describe("cleanupAgentProcess", () => {
  it("returns immediately when the subprocess already exited by signal", async () => {
    const agentProcess = new FakeAgentProcess();
    agentProcess.signalCode = "SIGTERM";

    await expect(
      Promise.race([
        cleanupAgentProcess(agentProcess as never),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("cleanup timed out")), 50);
        }),
      ]),
    ).resolves.toBeUndefined();

    expect(agentProcess.kill).not.toHaveBeenCalled();
  });
});
