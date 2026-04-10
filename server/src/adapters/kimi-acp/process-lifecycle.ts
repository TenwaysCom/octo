import type { ChildProcessWithoutNullStreams } from "node:child_process";

type ManagedAgentProcess = Pick<
  ChildProcessWithoutNullStreams,
  "exitCode" | "signalCode" | "kill" | "once" | "off"
>;

export async function cleanupAgentProcess(
  agentProcess: ManagedAgentProcess,
): Promise<void> {
  if (hasAgentProcessExited(agentProcess)) {
    return;
  }

  agentProcess.kill("SIGTERM");
  await waitForAgentProcessExit(agentProcess);
}

function hasAgentProcessExited(agentProcess: ManagedAgentProcess): boolean {
  return agentProcess.exitCode !== null || agentProcess.signalCode !== null;
}

function waitForAgentProcessExit(agentProcess: ManagedAgentProcess): Promise<void> {
  if (hasAgentProcessExited(agentProcess)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    agentProcess.once("exit", () => resolve());
  });
}
