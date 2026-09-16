import type {
  ValidationCapabilities,
  ValidationConnection,
} from "./run-validation.js";

export interface InteractiveSessionReady {
  sessionId: string;
  protocolVersion: number;
  capabilities: ValidationCapabilities;
}

export interface InteractiveTurnComplete {
  stopReason: string;
}

export interface RunInteractiveSessionInput {
  connection: ValidationConnection;
  cwd: string;
  lines: AsyncIterable<string>;
  onReady?: (ready: InteractiveSessionReady) => void;
  onTurnComplete?: (turn: InteractiveTurnComplete) => void;
}

export interface RunInteractiveSessionResult {
  sessionId: string;
  promptCount: number;
  protocolVersion: number;
  capabilities: ValidationCapabilities;
  exitReason: "user_exit";
}

export async function runInteractiveSession(
  input: RunInteractiveSessionInput,
): Promise<RunInteractiveSessionResult> {
  const initialization = await input.connection.initialize();
  const session = await input.connection.createSession({ cwd: input.cwd });
  const capabilities = initialization.agentCapabilities || {};

  input.onReady?.({
    sessionId: session.sessionId,
    protocolVersion: initialization.protocolVersion,
    capabilities,
  });

  let promptCount = 0;

  for await (const rawLine of input.lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (isExitCommand(line)) {
      break;
    }

    const promptResult = await input.connection.prompt({
      sessionId: session.sessionId,
      prompt: rawLine,
    });

    promptCount += 1;
    input.onTurnComplete?.({
      stopReason: promptResult.stopReason,
    });
  }

  return {
    sessionId: session.sessionId,
    promptCount,
    protocolVersion: initialization.protocolVersion,
    capabilities,
    exitReason: "user_exit",
  };
}

function isExitCommand(line: string): boolean {
  return line === "/exit" || line === "/quit";
}
