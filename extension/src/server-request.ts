export function createServerRequestHeaders(input?: {
  masterUserId?: string;
  accept?: string;
  contentType?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": input?.contentType || "application/json",
  };

  if (input?.accept) {
    headers.Accept = input.accept;
  }

  if (input?.masterUserId) {
    headers["master-user-id"] = input.masterUserId;
  }

  return headers;
}

export async function fetchServerJson<TResponse>(input: {
  url: string;
  masterUserId?: string;
  method?: string;
  body?: unknown;
  accept?: string;
  contentType?: string;
  signal?: AbortSignal;
  keepalive?: boolean;
}): Promise<{ response: Response; payload: TResponse }> {
  const response = await fetch(input.url, {
    method: input.method ?? "POST",
    headers: createServerRequestHeaders({
      masterUserId: input.masterUserId,
      accept: input.accept,
      contentType: input.contentType,
    }),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
    keepalive: input.keepalive,
  });

  const payload = await response.json() as TResponse;
  return { response, payload };
}
