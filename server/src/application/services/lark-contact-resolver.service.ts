import type { LarkContactStore } from "../../adapters/lark/contact-store.js";
import type { LarkContactEmailLookupClient } from "../../adapters/lark/contact-client.js";

export interface ResolvedLarkContact {
  email: string | null;
  openId: string;
  name: string | null;
}

export interface MeegleContactUser {
  userKey: string;
  email?: string | null;
  name?: string | null;
}

export interface ResolveLarkContactsByEmailsOptions {
  meegleUsers?: MeegleContactUser[];
}

export interface ResolveLarkContactsByEmailsRequest {
  emails: string[];
  store: LarkContactStore;
  lookupClient: LarkContactEmailLookupClient;
  meegleUsers?: MeegleContactUser[];
}

export interface LarkContactResolver {
  resolveByEmails(
    emails: string[],
    options?: ResolveLarkContactsByEmailsOptions,
  ): Promise<ResolvedLarkContact[]>;
}

export async function resolveLarkContactsByEmails(
  request: ResolveLarkContactsByEmailsRequest,
): Promise<ResolvedLarkContact[]> {
  const emails = uniqueNormalizedEmails(request.emails);
  const meegleUsers = uniqueMeegleUsers(request.meegleUsers ?? []);
  const meegleUserKeyByEmail = buildMeegleUserKeyByEmail(meegleUsers);
  const resolvedByEmail = new Map<string, ResolvedLarkContact>();
  const resolvedByUserKey = new Map<string, ResolvedLarkContact>();
  const missingEmails: string[] = [];

  for (const user of meegleUsers) {
    const cached = await request.store.getByMeegleUserKey(user.userKey);
    if (!cached?.openId) {
      continue;
    }

    const email = normalizeEmail(user.email);
    const record = email && cached.email !== email
      ? await request.store.upsert({
        openId: cached.openId,
        email,
        name: cached.name ?? user.name ?? null,
        meegleUserKey: user.userKey,
      })
      : cached;
    const resolved = {
      email: record.email,
      openId: record.openId,
      name: record.name,
    };
    resolvedByUserKey.set(user.userKey, resolved);
    if (email) {
      resolvedByEmail.set(email, resolved);
    }
  }

  for (const email of emails) {
    if (resolvedByEmail.has(email)) {
      continue;
    }

    const cached = await request.store.getByEmail(email);
    if (cached?.openId) {
      const meegleUserKey = meegleUserKeyByEmail.get(email);
      const record = meegleUserKey && cached.meegleUserKey !== meegleUserKey
        ? await request.store.upsert({
          openId: cached.openId,
          email: cached.email ?? email,
          name: cached.name,
          meegleUserKey,
        })
        : cached;
      resolvedByEmail.set(email, {
        email,
        openId: record.openId,
        name: record.name,
      });
    } else {
      missingEmails.push(email);
    }
  }

  if (missingEmails.length > 0) {
    const lookedUp = await request.lookupClient.getUserIdsByEmails({
      emails: missingEmails,
    });

    for (const user of lookedUp) {
      const email = normalizeEmail(user.email);
      if (!email || !user.openId || !missingEmails.includes(email)) {
        continue;
      }

      const record = await request.store.upsert({
        openId: user.openId,
        email,
        name: user.name,
        meegleUserKey: meegleUserKeyByEmail.get(email),
      });
      resolvedByEmail.set(email, {
        email,
        openId: record.openId,
        name: record.name,
      });
    }
  }

  return emails.flatMap((email) => {
    const resolved = resolvedByEmail.get(email);
    return resolved ? [resolved] : [];
  }).concat(
    meegleUsers.flatMap((user) => {
      const resolved = resolvedByUserKey.get(user.userKey);
      if (!resolved) {
        return [];
      }

      return resolved.email && resolvedByEmail.get(resolved.email)?.openId === resolved.openId
        ? []
        : [resolved];
    }),
  );
}

function uniqueMeegleUsers(users: MeegleContactUser[]): MeegleContactUser[] {
  const result: MeegleContactUser[] = [];
  const seen = new Set<string>();

  for (const user of users) {
    const userKey = user.userKey.trim();
    if (!userKey || seen.has(userKey)) {
      continue;
    }

    seen.add(userKey);
    result.push({
      userKey,
      email: normalizeEmail(user.email) ?? null,
      name: user.name ?? null,
    });
  }

  return result;
}

function buildMeegleUserKeyByEmail(users: MeegleContactUser[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const user of users) {
    const email = normalizeEmail(user.email);
    const userKey = user.userKey.trim();
    if (!email || !userKey) {
      continue;
    }

    result.set(email, userKey);
  }

  return result;
}

function uniqueNormalizedEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const email = normalizeEmail(value);
    if (!email || seen.has(email)) {
      continue;
    }

    seen.add(email);
    result.push(email);
  }

  return result;
}

function normalizeEmail(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : undefined;
}
