import type { ChildProcessWithoutNullStreams } from "node:child_process";

type ManagedAgentProcess = Pick<
  ChildProcessWithoutNullStreams,
  "exitCode" | "signalCode" | "kill" | "once" | "off"
>;

export async function runWithAgentProcessGuard<T>(
  agentProcess: ManagedAgentProcess,
  work: () => Promise<T>,
): Promise<T> {
  if (hasAgentProcessExited(agentProcess)) {
    throw buildUnexpectedExitError(agentProcess.exitCode, agentProcess.signalCode);
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      agentProcess.off("error", handleError);
      agentProcess.off("exit", handleExit);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const handleError = (error: Error) => {
      settle(() => {
        reject(new Error(`failed to start subprocess: ${error.message}`));
      });
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        reject(buildUnexpectedExitError(code, signal));
      });
    };

    agentProcess.once("error", handleError);
    agentProcess.once("exit", handleExit);

    void work().then(
      (result) => {
        settle(() => {
          resolve(result);
        });
      },
      (error) => {
        settle(() => {
          reject(error);
        });
      },
    );
  });
}

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

function buildUnexpectedExitError(
  code: number | null,
  signal: NodeJS.Signals | null,
): Error {
  return new Error(
    `subprocess exited during ACP validation (code=${code ?? "null"}, signal=${signal ?? "null"})`,
  );
}
