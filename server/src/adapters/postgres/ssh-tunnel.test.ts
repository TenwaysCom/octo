import { EventEmitter } from "node:events";

import {
  buildSshTunnelArgs,
  preparePostgresConnection,
  readDatabaseSshConfig,
  rewritePostgresUriForTunnel,
} from "./ssh-tunnel.js";

class FakeSshProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killedWith: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killedWith.push(signal);
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
}

const enabledEnv = {
  DATABASE_SSH_ENABLED: "true",
  DATABASE_SSH_HOST: "bastion.example.com",
  DATABASE_SSH_USER: "octo",
  DATABASE_SSH_IDENTITY_FILE: "/run/secrets/octo-db",
  DATABASE_SSH_AUTH_SOCK: "/run/ssh-agent.sock",
  DATABASE_SSH_KNOWN_HOSTS_FILE: "/etc/octo/known_hosts",
  DATABASE_SSH_REMOTE_HOST: "postgres.internal",
};

describe("PostgreSQL SSH tunnel", () => {
  it("keeps direct PostgreSQL connections unchanged when SSH is disabled", async () => {
    const prepare = await preparePostgresConnection("postgres://user:secret@db.example.com:5432/octo");

    expect(prepare.postgresUri).toBe("postgres://user:secret@db.example.com:5432/octo");
    await expect(prepare.close()).resolves.toBeUndefined();
  });

  it("validates the complete SSH configuration", () => {
    expect(() => readDatabaseSshConfig({ DATABASE_SSH_ENABLED: "true" })).toThrow(
      "DATABASE_SSH_HOST is required",
    );
    expect(readDatabaseSshConfig(enabledEnv)).toMatchObject({
      enabled: true,
      host: "bastion.example.com",
      port: 22,
      remotePort: 5432,
      connectTimeoutMs: 10_000,
      serverAliveIntervalSeconds: 30,
      serverAliveCountMax: 3,
    });
  });

  it("builds a strict SSH command and rewrites only the database endpoint", () => {
    const config = readDatabaseSshConfig({
      ...enabledEnv,
      DATABASE_SSH_PORT: "2202",
      DATABASE_SSH_REMOTE_PORT: "15432",
      DATABASE_SSH_CONNECT_TIMEOUT_MS: "1500",
      DATABASE_SSH_SERVER_ALIVE_INTERVAL_SECONDS: "15",
      DATABASE_SSH_SERVER_ALIVE_COUNT_MAX: "4",
    });

    expect(buildSshTunnelArgs(config, 43123)).toEqual(expect.arrayContaining([
      "-N",
      "BatchMode=yes",
      "ExitOnForwardFailure=yes",
      "StrictHostKeyChecking=yes",
      "UserKnownHostsFile=/etc/octo/known_hosts",
      "IdentitiesOnly=yes",
      "ServerAliveInterval=15",
      "ServerAliveCountMax=4",
      "-i",
      "/run/secrets/octo-db",
      "-p",
      "2202",
      "127.0.0.1:43123:postgres.internal:15432",
      "octo@bastion.example.com",
    ]));
    expect(rewritePostgresUriForTunnel(
      "postgres://user:secret@db.example.com:5432/octo?sslmode=require",
      43123,
    )).toBe("postgres://user:secret@127.0.0.1:43123/octo?sslmode=require");
  });

  it("rejects invalid SSH keepalive configuration", () => {
    expect(() => readDatabaseSshConfig({
      ...enabledEnv,
      DATABASE_SSH_SERVER_ALIVE_INTERVAL_SECONDS: "-1",
    })).toThrow("DATABASE_SSH_SERVER_ALIVE_INTERVAL_SECONDS must be an integer from 0 to 65535");
    expect(() => readDatabaseSshConfig({
      ...enabledEnv,
      DATABASE_SSH_SERVER_ALIVE_COUNT_MAX: "1.5",
    })).toThrow("DATABASE_SSH_SERVER_ALIVE_COUNT_MAX must be an integer from 0 to 65535");
  });

  it("waits for the tunnel and terminates it during cleanup", async () => {
    const child = new FakeSshProcess();
    const spawn = vi.fn(() => child);
    const waitForReady = vi.fn().mockResolvedValue(undefined);
    const tunnelLogger = { info: vi.fn(), warn: vi.fn() };

    const prepared = await preparePostgresConnection("postgres://user:secret@db.example.com:5432/octo", {
      config: readDatabaseSshConfig(enabledEnv),
      deps: {
        allocatePort: async () => 43123,
        spawn,
        waitForReady,
        logger: tunnelLogger,
      },
    });

    expect(waitForReady).toHaveBeenCalledWith(43123, 10_000);
    expect(spawn).toHaveBeenCalledWith("ssh", expect.any(Array), expect.objectContaining({
      env: expect.objectContaining({ SSH_AUTH_SOCK: "/run/ssh-agent.sock" }),
    }));
    expect(prepared.postgresUri).toContain("@127.0.0.1:43123/");

    await prepared.close();
    expect(child.killedWith).toEqual(["SIGTERM"]);
  });

  it("cleans up when the tunnel cannot become ready", async () => {
    const child = new FakeSshProcess();

    await expect(preparePostgresConnection("postgres://user:secret@db.example.com:5432/octo", {
      config: readDatabaseSshConfig(enabledEnv),
      deps: {
        allocatePort: async () => 43123,
        spawn: () => child,
        waitForReady: async () => {
          throw new Error("SSH tunnel did not become ready within 10000ms");
        },
        logger: { info: vi.fn(), warn: vi.fn() },
      },
    })).rejects.toThrow("SSH tunnel did not become ready");

    expect(child.killedWith).toEqual(["SIGTERM"]);
  });

  it("fails when SSH exits before the local forward is ready", async () => {
    const child = new FakeSshProcess();

    await expect(preparePostgresConnection("postgres://user:secret@db.example.com:5432/octo", {
      config: readDatabaseSshConfig(enabledEnv),
      deps: {
        allocatePort: async () => 43123,
        spawn: () => {
          queueMicrotask(() => {
            child.exitCode = 255;
            child.emit("exit", 255, null);
          });
          return child;
        },
        waitForReady: () => new Promise(() => undefined),
        logger: { info: vi.fn(), warn: vi.fn() },
      },
    })).rejects.toThrow("SSH tunnel exited before becoming ready");
  });
});
