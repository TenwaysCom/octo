export interface JsonCompletionClient {
  createJsonCompletion(input: {
    prompt: string;
    actionRunId: string;
    signal?: AbortSignal;
  }): Promise<{ content: string; model: string }>;
}
