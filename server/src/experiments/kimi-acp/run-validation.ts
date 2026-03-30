export interface ValidationCapabilities {
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
}

export interface ValidationConnection {
  initialize: () => Promise<{
    protocolVersion: number;
    agentCapabilities?: ValidationCapabilities;
  }>;
  createSession: (input: { cwd: string }) => Promise<{ sessionId: string }>;
  prompt: (input: {
    sessionId: string;
    prompt: string;
  }) => Promise<{ stopReason: string }>;
}

export interface ValidationUpdate {
  kind: string;
  text?: string;
}

export interface RunValidationTurnInput {
  connection: ValidationConnection;
  cwd: string;
  prompt: string;
  onUpdate?: (update: ValidationUpdate) => void;
}

export interface RunValidationTurnResult {
  sessionId: string;
  stopReason: string;
  protocolVersion: number;
  capabilities: ValidationCapabilities;
}

export async function runValidationTurn(
  input: RunValidationTurnInput,
): Promise<RunValidationTurnResult> {
  const initialization = await input.connection.initialize();
  const session = await input.connection.createSession({ cwd: input.cwd });
  const promptResult = await input.connection.prompt({
    sessionId: session.sessionId,
    prompt: input.prompt,
  });

  if (input.onUpdate) {
    input.onUpdate({
      kind: "stop",
      text: promptResult.stopReason,
    });
  }

  return {
    sessionId: session.sessionId,
    stopReason: promptResult.stopReason,
    protocolVersion: initialization.protocolVersion,
    capabilities: initialization.agentCapabilities || {},
  };
}
