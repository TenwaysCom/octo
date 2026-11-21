export interface CompletionDiagnostics {
  responseHeadersMs: number; totalMs: number;
  httpStatus?: number;
  promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number;
  reasoningEffort?: "low" | "high" | "max";
}

export interface JsonCompletionClient {
  createJsonCompletion(input: {
    prompt: string;
    actionRunId: string;
    signal?: AbortSignal;
    reasoningEffort?: "low" | "high" | "max";
    collectDiagnostics?: boolean;
  }): Promise<{ content: string; model: string; diagnostics?: CompletionDiagnostics }>;
}
