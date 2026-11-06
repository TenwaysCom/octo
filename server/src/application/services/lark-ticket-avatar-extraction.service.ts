import { z } from "zod";
import { normalizeLarkTimestamp } from "../../adapters/lark/lark-timestamp.js";
import type {
  LarkContactAvatarInput,
  LarkTicketAvatarRange,
  LarkTicketAvatarSource,
  PostgresLarkContactStore,
} from "../../adapters/postgres/lark-contact-store.js";

const personAvatarSchema = z.object({
  id: z.string().trim().regex(/^ou_[A-Za-z0-9_-]+$/),
  avatar_url: z.string().trim().url().refine((url) => /^https?:\/\//i.test(url)),
});

export function collectLarkTicketAvatars(sources: LarkTicketAvatarSource[]) {
  const avatars = new Map<string, LarkContactAvatarInput>();
  const counts = { scannedTickets: sources.length, invalidFieldsJson: 0, invalidSourceTimes: 0, avatarCandidates: 0, skippedAvatars: 0 };
  // Equal observations use a deterministic record/field/URL order, independent of SQL order.
  const ordered = [...sources].sort((a, b) => a.recordId.localeCompare(b.recordId));
  for (const source of ordered) {
    const sourceSyncedAt = normalizeLarkTimestamp(source.syncedAt);
    if (!sourceSyncedAt) { counts.invalidSourceTimes++; continue; }
    let fields: unknown;
    try { fields = JSON.parse(source.fieldsJson); } catch { counts.invalidFieldsJson++; continue; }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) { counts.invalidFieldsJson++; continue; }
    for (const [, value] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
      const people = Array.isArray(value) ? value : [value];
      const candidates = people.filter((person) => person && typeof person === "object" && "avatar_url" in person);
      const valid: Array<z.infer<typeof personAvatarSchema>> = [];
      for (const candidate of candidates) {
        counts.avatarCandidates++;
        const parsed = personAvatarSchema.safeParse(candidate);
        if (!parsed.success) { counts.skippedAvatars++; continue; }
        valid.push(parsed.data);
      }
      for (const { id: openId, avatar_url: avatarUrl } of valid.sort((a, b) => a.avatar_url.localeCompare(b.avatar_url))) {
        const existing = avatars.get(openId);
        if (!existing || sourceSyncedAt > existing.sourceSyncedAt) {
          avatars.set(openId, { openId, avatarUrl, sourceSyncedAt });
        }
      }
    }
  }
  return { avatars: [...avatars.values()].sort((a, b) => a.openId.localeCompare(b.openId)), ...counts };
}

export async function extractLarkTicketAvatars(
  request: LarkTicketAvatarRange & { apply: boolean },
  deps: {
    store: Pick<PostgresLarkContactStore, "listTicketAvatarSources" | "upsertAvatars">;
    now?: () => Date;
  },
) {
  const { avatars, ...counts } = collectLarkTicketAvatars(await deps.store.listTicketAvatarSources(request));
  const written = request.apply ? await deps.store.upsertAvatars(avatars, (deps.now?.() ?? new Date()).toISOString()) : 0;
  return { ...counts, uniqueUsers: avatars.length, written, unchangedOrOlder: request.apply ? avatars.length - written : 0 };
}
