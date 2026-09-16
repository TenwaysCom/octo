import type { LarkContactStore } from "../../adapters/lark/contact-store.js";
import type {
  LarkContactDirectoryClient,
  LarkContactUser,
} from "../../adapters/lark/contact-client.js";
import { logger } from "../../logger.js";

const syncLogger = logger.child({ module: "lark-contact-sync-service" });

export interface SyncLarkContactsRequest {
  client: LarkContactDirectoryClient;
  store: LarkContactStore;
  rootDepartmentId?: string;
  pageSize?: number;
  includeChildDepartments?: boolean;
}

export interface SyncLarkContactsResult {
  departmentsScanned: number;
  usersScanned: number;
  contactsUpserted: number;
  contactsSkipped: number;
}

export async function syncLarkContacts(request: SyncLarkContactsRequest): Promise<SyncLarkContactsResult> {
  const rootDepartmentId = request.rootDepartmentId ?? "0";
  const departmentIds = request.includeChildDepartments === false
    ? [rootDepartmentId]
    : await listDepartmentIds(request.client, rootDepartmentId, request.pageSize);
  const contactsByOpenId = new Map<string, {
    openId: string;
    email: string | null;
    name: string | null;
  }>();

  const result: SyncLarkContactsResult = {
    departmentsScanned: departmentIds.length,
    usersScanned: 0,
    contactsUpserted: 0,
    contactsSkipped: 0,
  };

  for (const departmentId of departmentIds) {
    let pageToken: string | undefined;
    do {
      const page = await request.client.listUsersByDepartment({
        departmentId,
        pageToken,
        pageSize: request.pageSize,
      });

      for (const user of page.users) {
        result.usersScanned += 1;
        const contact = normalizeContact(user);
        if (!contact) {
          result.contactsSkipped += 1;
          continue;
        }

        if (!contactsByOpenId.has(contact.openId)) {
          contactsByOpenId.set(contact.openId, contact);
        }
      }

      pageToken = requireNextPageToken(page.hasMore, page.nextPageToken, "users", departmentId);
    } while (pageToken);
  }

  for (const contact of contactsByOpenId.values()) {
    await request.store.upsert(contact);
    result.contactsUpserted += 1;
  }

  syncLogger.info(result, "LARK_CONTACT_SYNC_COMPLETED");
  return result;
}

async function listDepartmentIds(
  client: LarkContactDirectoryClient,
  rootDepartmentId: string,
  pageSize?: number,
): Promise<string[]> {
  const seen = new Set<string>([rootDepartmentId]);
  const departmentIds = [rootDepartmentId];
  const pendingDepartmentIds = [rootDepartmentId];

  for (let index = 0; index < pendingDepartmentIds.length; index += 1) {
    const parentDepartmentId = pendingDepartmentIds[index];
    let pageToken: string | undefined;

    do {
      const page = await client.listChildDepartments({
        departmentId: parentDepartmentId,
        pageToken,
        pageSize,
      });

      for (const department of page.departments) {
        const departmentId = normalizeString(department.openDepartmentId);
        if (departmentId && !seen.has(departmentId)) {
          seen.add(departmentId);
          departmentIds.push(departmentId);
          pendingDepartmentIds.push(departmentId);
        }
      }

      pageToken = requireNextPageToken(page.hasMore, page.nextPageToken, "departments", parentDepartmentId);
    } while (pageToken);
  }

  return departmentIds;
}

function normalizeContact(user: LarkContactUser): {
  openId: string;
  email: string | null;
  name: string | null;
} | undefined {
  const openId = normalizeString(user.openId);
  if (!openId) {
    return undefined;
  }

  return {
    openId,
    email: normalizeString(user.email) ?? null,
    name: normalizeString(user.name) ?? null,
  };
}

function normalizeString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requireNextPageToken(
  hasMore: boolean,
  nextPageToken: string | undefined,
  resource: string,
  ownerId: string,
): string | undefined {
  if (!hasMore) {
    return undefined;
  }

  if (!nextPageToken) {
    throw new Error(`Lark contact ${resource} page for ${ownerId} has more data but no next page token`);
  }

  return nextPageToken;
}
