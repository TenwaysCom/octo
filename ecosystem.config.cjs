const fs = require("node:fs");
const path = require("node:path");

const serverCwd = path.join(__dirname, "server");
const environment = readNodeEnvironment(path.join(serverCwd, ".env"));

function readNodeEnvironment(envPath) {
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^\s*NODE_ENV\s*=\s*(.*?)\s*$/m);
  if (!match) {
    throw new Error(`NODE_ENV is required in ${envPath}`);
  }
  const rawValue = match[1].trim();
  const quoted = rawValue.match(/^(?:"([^"]*)"|'([^']*)')$/);
  const value = (quoted?.[1] ?? quoted?.[2] ?? rawValue).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(value)) {
    throw new Error(`NODE_ENV has an invalid value in ${envPath}`);
  }
  return value;
}

module.exports = {
  apps: [
    {
      name: `octo-server-${environment}`,
      cwd: serverCwd,
      script: "dist/index.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: true,
      restart_delay: 3_000,
      kill_timeout: 10_000,
    },
    {
      name: `octo-platform-sync-worker-${environment}`,
      cwd: serverCwd,
      script: "dist/scripts/platform-sync-worker.js",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 5_000,
      kill_timeout: 30_000,
    },
  ],
};
