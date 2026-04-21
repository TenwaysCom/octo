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
