import { Client } from "undici";

// The caller's AbortSignal owns the full request deadline, including body reads.
// Disable Undici's independent 300s parser deadlines for this request only.
// Each request owns its client so concurrent requests cannot cancel one another.
export function createModelRequestClient(origin: string): Client {
  return new Client(origin, { headersTimeout: 0, bodyTimeout: 0 });
}
