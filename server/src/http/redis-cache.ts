import { createClient, type RedisClientType } from "redis";

import { logger } from "../logger.js";

const cacheLogger = logger.child({ module: "api-redis-cache" });

/** Shared server API cache. Feature services own their key namespace and TTL. */
export interface ApiCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  close(): Promise<void>;
}

export function createRedisApiCache(redisUrl: string | undefined): ApiCache {
  const url = redisUrl?.trim();
  if (!url) {
    return noOpCache;
  }
  return new RedisApiCache(url);
}

class RedisApiCache implements ApiCache {
  private client: RedisClientType | undefined;
  private connection: Promise<RedisClientType | undefined> | undefined;

  constructor(private readonly redisUrl: string) {}

  async get(key: string): Promise<string | null> {
    try {
      return await (await this.getClient())?.get(key) ?? null;
    } catch {
      cacheLogger.warn({ operation: "get" }, "API_REDIS_CACHE_UNAVAILABLE");
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await (await this.getClient())?.set(key, value, { EX: ttlSeconds });
    } catch {
      cacheLogger.warn({ operation: "set" }, "API_REDIS_CACHE_UNAVAILABLE");
    }
  }

  async close(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private async getClient(): Promise<RedisClientType | undefined> {
    if (this.client?.isOpen) {
      return this.client;
    }
    if (!this.connection) {
      this.connection = this.connect();
    }
    return this.connection;
  }

  private async connect(): Promise<RedisClientType | undefined> {
    const client = createClient({ url: this.redisUrl });
    client.on("error", () => undefined);
    this.client = client;
    try {
      await client.connect();
      return client;
    } catch {
      cacheLogger.warn({ operation: "connect" }, "API_REDIS_CACHE_UNAVAILABLE");
      this.client = undefined;
      this.connection = undefined;
      return undefined;
    }
  }
}

const noOpCache: ApiCache = {
  async get() {
    return null;
  },
  async set() {},
  async close() {},
};
