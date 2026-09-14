import { spawn, type SpawnOptions } from "node:child_process";
import { createServer, Socket } from "node:net";

import { logger } from "../../logger.js";

const DEFAULT_SSH_PORT = 22;
const DEFAULT_POSTGRES_PORT = 5432;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_SERVER_ALIVE_INTERVAL_SECONDS = 30;
const DEFAULT_SERVER_ALIVE_COUNT_MAX = 3;
const LOOPBACK_HOST = "127.0.0.1";

const tunnelLogger = logger.child({ module: "postgres-ssh-tunnel" });

export interface DatabaseSshConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  user?: string;
  identityFile?: string;
  authSocket?: string;
  knownHostsFile?: string;
  remoteHost?: string;
  remotePort?: number;
  connectTimeoutMs?: number;
  serverAliveIntervalSeconds?: number;
  serverAliveCountMax?: number;
}

export interface PreparedPostgresConnection {
  postgresUri: string;
  close(): Promise<void>;
}

export interface SshChildProcess {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export interface SshTunnelDeps {
  allocatePort?: () => Promise<number>;
  spawn?: (command: string, args: string[], options: SpawnOptions) => SshChildProcess;
  waitForReady?: (port: number, timeoutMs: number) => Promise<void>;
  logger?: Pick<typeof tunnelLogger, "info" | "warn">;
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when DATABASE_SSH_ENABLED=true`);
  }
  return value;
}

function readPositiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return parsed;
}

function readTimeout(value: string | undefined): number {
  if (!value) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("DATABASE_SSH_CONNECT_TIMEOUT_MS must be a positive integer");
  }
  return parsed;
}

function readNonNegativeInteger(value: string | undefined, name: string, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`${name} must be an integer from 0 to 65535`);
  }
  return parsed;
}

function readBoolean(value: string | undefined, name: string): boolean {
  if (!value) {
    return false;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

export function readDatabaseSshConfig(env: NodeJS.ProcessEnv = process.env): DatabaseSshConfig {
  const enabled = readBoolean(env.DATABASE_SSH_ENABLED, "DATABASE_SSH_ENABLED");
  if (!enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    host: readRequired(env, "DATABASE_SSH_HOST"),
    port: readPositiveInteger(env.DATABASE_SSH_PORT, "DATABASE_SSH_PORT", DEFAULT_SSH_PORT),
    user: readRequired(env, "DATABASE_SSH_USER"),
    identityFile: readRequired(env, "DATABASE_SSH_IDENTITY_FILE"),
    authSocket: (env.DATABASE_SSH_AUTH_SOCK || env.SSH_AUTH_SOCK || "").trim() || undefined,
    knownHostsFile: readRequired(env, "DATABASE_SSH_KNOWN_HOSTS_FILE"),
    remoteHost: readRequired(env, "DATABASE_SSH_REMOTE_HOST"),
    remotePort: readPositiveInteger(
      env.DATABASE_SSH_REMOTE_PORT,
      "DATABASE_SSH_REMOTE_PORT",
      DEFAULT_POSTGRES_PORT,
    ),
    connectTimeoutMs: readTimeout(env.DATABASE_SSH_CONNECT_TIMEOUT_MS),
    serverAliveIntervalSeconds: readNonNegativeInteger(
      env.DATABASE_SSH_SERVER_ALIVE_INTERVAL_SECONDS,
      "DATABASE_SSH_SERVER_ALIVE_INTERVAL_SECONDS",
      DEFAULT_SERVER_ALIVE_INTERVAL_SECONDS,
    ),
    serverAliveCountMax: readNonNegativeInteger(
      env.DATABASE_SSH_SERVER_ALIVE_COUNT_MAX,
      "DATABASE_SSH_SERVER_ALIVE_COUNT_MAX",
      DEFAULT_SERVER_ALIVE_COUNT_MAX,
    ),
  };
}

function requireEnabledConfig(config: DatabaseSshConfig): Required<Omit<DatabaseSshConfig, "enabled">> {
  if (!config.enabled) {
    throw new Error("SSH tunnel configuration is disabled");
  }

  for (const [name, value] of Object.entries({
    DATABASE_SSH_HOST: config.host,
    DATABASE_SSH_USER: config.user,
    DATABASE_SSH_IDENTITY_FILE: config.identityFile,
    DATABASE_SSH_AUTH_SOCK: config.authSocket,
    DATABASE_SSH_KNOWN_HOSTS_FILE: config.knownHostsFile,
    DATABASE_SSH_REMOTE_HOST: config.remoteHost,
  })) {
    if (!value) {
      throw new Error(`${name} is required when DATABASE_SSH_ENABLED=true`);
    }
  }

  return {
    host: config.host!,
    port: config.port ?? DEFAULT_SSH_PORT,
    user: config.user!,
    identityFile: config.identityFile!,
    authSocket: config.authSocket!,
    knownHostsFile: config.knownHostsFile!,
    remoteHost: config.remoteHost!,
    remotePort: config.remotePort ?? DEFAULT_POSTGRES_PORT,
    connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    serverAliveIntervalSeconds: config.serverAliveIntervalSeconds ?? DEFAULT_SERVER_ALIVE_INTERVAL_SECONDS,
    serverAliveCountMax: config.serverAliveCountMax ?? DEFAULT_SERVER_ALIVE_COUNT_MAX,
  };
}

export function buildSshTunnelArgs(config: DatabaseSshConfig, localPort: number): string[] {
  const enabled = requireEnabledConfig(config);
  return [
    "-N",
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${enabled.knownHostsFile}`,
    "-o", "IdentitiesOnly=yes",
    "-o", `ConnectTimeout=${Math.max(1, Math.ceil(enabled.connectTimeoutMs / 1000))}`,
    "-o", `ServerAliveInterval=${enabled.serverAliveIntervalSeconds}`,
    "-o", `ServerAliveCountMax=${enabled.serverAliveCountMax}`,
    "-i", enabled.identityFile,
    "-p", String(enabled.port),
    "-L", `${LOOPBACK_HOST}:${localPort}:${enabled.remoteHost}:${enabled.remotePort}`,
    `${enabled.user}@${enabled.host}`,
  ];
}

export function rewritePostgresUriForTunnel(postgresUri: string, localPort: number): string {
  const url = new URL(postgresUri);
  url.hostname = LOOPBACK_HOST;
  url.port = String(localPort);
  return url.toString();
}

export async function allocateLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => resolve());
  });

  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate a local SSH tunnel port");
  }
  return address.port;
}

export async function waitForLoopbackPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const finish = (value: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(250, () => finish(false));
      socket.connect(port, LOOPBACK_HOST);
    });

    if (connected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`SSH tunnel did not become ready within ${timeoutMs}ms`);
}

function waitForChildExit(child: SshChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

async function closeSshChild(child: SshChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = waitForChildExit(child);
  child.kill("SIGTERM");
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise<true>((resolve) => setTimeout(() => resolve(true), 2_000)),
  ]);

  if (timedOut && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child);
  }
}

export async function preparePostgresConnection(
  postgresUri: string,
  options: {
    config?: DatabaseSshConfig;
    deps?: SshTunnelDeps;
  } = {},
): Promise<PreparedPostgresConnection> {
  const config = options.config ?? readDatabaseSshConfig();
  if (!config.enabled) {
    return { postgresUri, close: async () => undefined };
  }

  const enabled = requireEnabledConfig(config);
  const deps = options.deps ?? {};
  const localPort = await (deps.allocatePort ?? allocateLoopbackPort)();
  const spawnSsh = deps.spawn ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  const child = spawnSsh("ssh", buildSshTunnelArgs(config, localPort), {
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      SSH_AUTH_SOCK: enabled.authSocket,
    },
  });
  const tunnelLoggerForRun = deps.logger ?? tunnelLogger;
  const failed = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`Unable to start SSH tunnel: ${error.message}`)));
    child.once("exit", (code, signal) => reject(new Error(
      `SSH tunnel exited before becoming ready (code=${code ?? "none"}, signal=${signal ?? "none"})`,
    )));
  });

  try {
    await Promise.race([
      (deps.waitForReady ?? waitForLoopbackPort)(localPort, enabled.connectTimeoutMs),
      failed,
    ]);
  } catch (error) {
    await closeSshChild(child);
    throw error;
  }

  tunnelLoggerForRun.info({
    sshHost: enabled.host,
    sshPort: enabled.port,
    databaseHost: enabled.remoteHost,
    databasePort: enabled.remotePort,
    localPort,
  }, "PostgreSQL SSH tunnel ready");

  let closed = false;
  return {
    postgresUri: rewritePostgresUriForTunnel(postgresUri, localPort),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await closeSshChild(child);
      tunnelLoggerForRun.info({ localPort }, "PostgreSQL SSH tunnel closed");
    },
  };
}
