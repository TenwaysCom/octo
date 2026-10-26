import type { LarkBitableField } from "../../adapters/lark/lark-client.js";

/** Metadata only. Callers must resolve the current user's authorization first. */
export class LarkTicketFieldMetadataCache {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<LarkBitableField[]> }>();

  constructor(private readonly now = Date.now, private readonly ttlMs = 300_000, private readonly limit = 256) {}

  get(key: string, load: () => Promise<LarkBitableField[]>): Promise<LarkBitableField[]> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > this.now()) return existing.value;
    const entry = { expiresAt: Infinity, value: Promise.resolve().then(load) };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    entry.value = entry.value.then((fields) => {
      entry.expiresAt = this.now() + this.ttlMs;
      return fields;
    }, (error) => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    return entry.value;
  }

  invalidate(key: string): void { this.entries.delete(key); }
}

export const larkTicketFieldMetadataCache = new LarkTicketFieldMetadataCache();
