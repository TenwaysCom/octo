import { LARK_TICKET_FIELD_CANDIDATES } from "../../domain/lark-ticket-fields.js";
import { PostgresLarkContactStore } from "../../adapters/postgres/lark-contact-store.js";
import { logger } from "../../logger.js";

export interface LarkTicketPerson {
  name: string;
  userId?: string;
  avatarUrl?: string;
}

export interface LarkTicketPeopleProjection {
  requesterPeople: LarkTicketPerson[];
  responsiblePeople: LarkTicketPerson[];
}

export interface LarkTicketPeopleDeps {
  contactStore?: Pick<PostgresLarkContactStore, "listAvatarsByOpenIds">;
}

export async function loadLarkTicketAvatarUrls(openIds: string[], deps: LarkTicketPeopleDeps = {}): Promise<Map<string, string>> {
  const ids = [...new Set(openIds.filter((id) => /^ou_[A-Za-z0-9_-]+$/.test(id)))];
  if (!ids.length) return new Map();
  try {
    const avatars = await (deps.contactStore ?? new PostgresLarkContactStore()).listAvatarsByOpenIds(ids);
    return new Map(avatars.flatMap(({ openId, avatarUrl }) => avatarUrl && /^https?:\/\//i.test(avatarUrl) ? [[openId, avatarUrl]] : []));
  } catch {
    logger.warn({ layer: "server", module: "lark-ticket-people", stage: "server.ticket.people", errorCode: "LARK_CONTACT_AVATAR_LOOKUP_FAILED" }, "LARK_CONTACT_AVATAR_LOOKUP_FAILED");
    return new Map();
  }
}

function readPeople(fields: Record<string, unknown> | undefined, semantic: "requester" | "responsible"): LarkTicketPerson[] {
  const raw = LARK_TICKET_FIELD_CANDIDATES[semantic].map((key) => fields?.[key])
    .find((value) => value !== undefined && value !== null && value !== "");
  const entries = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const userId = typeof record.id === "string" && /^ou_[A-Za-z0-9_-]+$/.test(record.id.trim()) ? record.id.trim() : undefined;
    const key = userId || name;
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [{ name, ...(userId ? { userId } : {}) }];
  });
}

/** One lookup per batch; Ticket identity comes from source people, avatars from the contact cache. */
export async function resolveLarkTicketPeople(
  fields: Array<Record<string, unknown> | undefined>,
  deps: LarkTicketPeopleDeps = {},
): Promise<LarkTicketPeopleProjection[]> {
  const projections = fields.map((source) => ({ requesterPeople: readPeople(source, "requester"), responsiblePeople: readPeople(source, "responsible") }));
  const people = projections.flatMap((projection) => [...projection.requesterPeople, ...projection.responsiblePeople]);
  const byId = await loadLarkTicketAvatarUrls(people.flatMap((person) => person.userId ? [person.userId] : []), deps);
  for (const person of people) {
    const avatarUrl = person.userId ? byId.get(person.userId) : undefined;
    if (avatarUrl) person.avatarUrl = avatarUrl;
  }
  return projections;
}
