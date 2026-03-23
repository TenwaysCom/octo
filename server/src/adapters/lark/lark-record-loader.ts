/**
 * Lark Record Loader Service
 *
 * Loads A1 tickets and A2 requirements from Lark Bitable
 */

import {
  LarkClient,
  parseA1Ticket,
  parseA2Requirement,
  type A1Ticket,
  type A2Requirement,
} from "./lark-client.js";

export interface LarkRecordLoaderDeps {
  client: LarkClient;
}

export interface LarkRecordConfig {
  baseId: string;
  tableId: string;
  fieldMapping?: Record<string, string>;
}

/**
 * Load an A1 ticket from Lark Bitable
 */
export async function loadA1Ticket(
  recordId: string,
  config: LarkRecordConfig,
  deps: LarkRecordLoaderDeps,
): Promise<A1Ticket> {
  const { client } = deps;
  const { baseId, tableId, fieldMapping } = config;

  const record = await client.getRecord(baseId, tableId, recordId);
  return parseA1Ticket(record, fieldMapping);
}

/**
 * Load an A2 requirement from Lark Bitable
 */
export async function loadA2Requirement(
  recordId: string,
  config: LarkRecordConfig,
  deps: LarkRecordLoaderDeps,
): Promise<A2Requirement> {
  const { client } = deps;
  const { baseId, tableId, fieldMapping } = config;

  const record = await client.getRecord(baseId, tableId, recordId);
  return parseA2Requirement(record, fieldMapping);
}

/**
 * List A1 tickets with optional filtering
 */
export async function listA1Tickets(
  config: LarkRecordConfig,
  deps: LarkRecordLoaderDeps,
  options?: {
    pageNum?: number;
    pageSize?: number;
    filter?: string;
  },
): Promise<A1Ticket[]> {
  const { client } = deps;
  const { baseId, tableId } = config;

  const { records } = await client.listRecords(baseId, tableId, options);
  return records.map((record) => parseA1Ticket(record, config.fieldMapping));
}

/**
 * List A2 requirements with optional filtering
 */
export async function listA2Requirements(
  config: LarkRecordConfig,
  deps: LarkRecordLoaderDeps,
  options?: {
    pageNum?: number;
    pageSize?: number;
    filter?: string;
  },
): Promise<A2Requirement[]> {
  const { client } = deps;
  const { baseId, tableId } = config;

  const { records } = await client.listRecords(baseId, tableId, options);
  return records.map((record) => parseA2Requirement(record, config.fieldMapping));
}
