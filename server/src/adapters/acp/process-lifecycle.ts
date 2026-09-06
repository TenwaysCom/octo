import type { ChildProcessWithoutNullStreams } from "node:child_process";

type ManagedAgentProcess = Pick<
  ChildProcessWithoutNullStreams,
  "exitCode" | "signalCode" | "kill" | "once" | "off"
>;

const DEFAULT_AGENT_PROCESS_CLEANUP_TIMEOUT_MS = 2_000;

export async function cleanupAgentProcess(
  agentProcess: ManagedAgentProcess,
  options: {
    timeoutMs?: number;
  } = {},
): Promise<void> {
  if (hasAgentProcessExited(agentProcess)) {
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_PROCESS_CLEANUP_TIMEOUT_MS;
  const terminated = waitForAgentProcessExit(agentProcess);
  agentProcess.kill("SIGTERM");
  if (await waitForCleanup(terminated, timeoutMs)) {
    return;
  }

  if (hasAgentProcessExited(agentProcess)) {
    return;
  }

  const killed = waitForAgentProcessExit(agentProcess);
  agentProcess.kill("SIGKILL");
  await waitForCleanup(killed, timeoutMs);
}

function hasAgentProcessExited(agentProcess: ManagedAgentProcess): boolean {
  return agentProcess.exitCode !== null || agentProcess.signalCode !== null;
}

function waitForAgentProcessExit(agentProcess: ManagedAgentProcess): Promise<void> {
  if (hasAgentProcessExited(agentProcess)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      agentProcess.off("exit", handleExit);
      agentProcess.off("close", handleExit);
    };
    const handleExit = () => {
      cleanup();
      resolve();
    };

    agentProcess.once("exit", handleExit);
    agentProcess.once("close", handleExit);
  });
}

async function waitForCleanup(
  exited: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
