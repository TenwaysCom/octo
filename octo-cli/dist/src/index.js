#!/usr/bin/env node
import { parseArgs, requiredFlag } from "./args.js";
import { getActiveProfile, getConfigPath, listProfiles, loadConfig, redactConfig, removeProfile, saveConfig, setActiveProfile, } from "./config.js";
import { createDemoServer, DEMO_API_TOKEN, DEMO_SPRINT_ID } from "./demo.js";
import { runDoctor } from "./doctor.js";
import { OctoApiClient } from "./http.js";
import { failure, success } from "./output.js";
import { getApiSchema, listApiSchemas } from "./schema.js";
import { defaultCodexSkillsRoot, installBundledSkills, listBundledSkills, readBundledSkill } from "./skills.js";
const HELP = `octo-cli — local agent CLI for read-only Octo platform data.

AGENT QUICKSTART:
  Discover a workflow: octo-cli skills list
  Read its rules:     octo-cli skills read <skill>
  Inspect an API:     octo-cli schema [<name>]
  Check readiness:    octo-cli doctor [--offline]
  Prefer task commands below. This CLI has no raw HTTP or SQL escape hatch.

Usage:
  octo-cli config set [--server-url <url>] [--api-token <token>]
  octo-cli config show
  octo-cli profile list | add --name <name> | use --name <name> | remove --name <name>
  octo-cli doctor [--offline]
  octo-cli schema [<name>]
  octo-cli sprint burndown --project-key <key> --sprint-id <id>
  octo-cli sprint tasks --project-key <key> --sprint-id <id>
  octo-cli github pr --owner <owner> --repo <repo> --number <number>
  octo-cli lark ticket --base-id <id> --table-id <id> --record-id <id>
  octo-cli odoo branches --environment <eu|uk|us>
  octo-cli demo serve [--port <port>] [--token <token>]
  octo-cli skills list | read <skill>
  octo-cli agent install [--agent codex] [--destination <skills-dir>] [--force yes]

Global flags:
  --profile <name>  Use a named local profile for this command.

The data commands require an Octo agent API token. The CLI never stores browser cookies or platform tokens.
All data commands are risk: read. JSON success uses { ok: true, data, meta }; failures use { ok: false, error } on stderr.`;
export async function run(argv, stdout = console.log) {
    if (argv.includes("--help") || argv.includes("-h")) {
        stdout(HELP);
        return;
    }
    const { positionals, flags } = parseArgs(argv, ["offline"]);
    const [command, subcommand] = positionals;
    if (!command || command === "help" || command === "--help") {
        stdout(HELP);
        return;
    }
    const profile = flags.get("profile") || process.env.OCTO_CLI_PROFILE || await getActiveProfile();
    if (command === "config")
        return runConfig(subcommand, flags, profile, stdout);
    if (command === "profile")
        return runProfile(subcommand, flags, stdout);
    if (command === "schema")
        return runSchema(subcommand, stdout);
    if (command === "doctor")
        return runDoctorCommand(profile, flags, stdout);
    if (command === "skills")
        return runSkills(subcommand, positionals[2], stdout);
    if (command === "agent" && subcommand === "install")
        return runAgentInstall(flags, stdout);
    if (command === "demo" && subcommand === "serve")
        return runDemoServer(flags, stdout);
    const api = new OctoApiClient(await loadConfig(undefined, profile));
    if (command === "sprint" && subcommand === "burndown") {
        const projectKey = requiredFlag(flags, "project-key");
        const sprintId = requiredFlag(flags, "sprint-id");
        return printApiResult(api.get(`/api/agent/v1/projects/${encodeURIComponent(projectKey)}/sprints/${encodeURIComponent(sprintId)}/burndown`), profile, stdout);
    }
    if (command === "sprint" && subcommand === "tasks") {
        const projectKey = requiredFlag(flags, "project-key");
        const sprintId = requiredFlag(flags, "sprint-id");
        return printApiResult(api.get(`/api/agent/v1/projects/${encodeURIComponent(projectKey)}/sprints/${encodeURIComponent(sprintId)}/tasks`), profile, stdout);
    }
    if (command === "github" && subcommand === "pr") {
        const owner = requiredFlag(flags, "owner");
        const repo = requiredFlag(flags, "repo");
        const number = requiredFlag(flags, "number");
        return printApiResult(api.get(`/api/agent/v1/github/pull-requests/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(number)}`), profile, stdout);
    }
    if (command === "lark" && subcommand === "ticket") {
        const baseId = requiredFlag(flags, "base-id");
        const tableId = requiredFlag(flags, "table-id");
        const recordId = requiredFlag(flags, "record-id");
        return printApiResult(api.get(`/api/agent/v1/lark-tickets/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`), profile, stdout);
    }
    if (command === "odoo" && subcommand === "branches") {
        const environment = requiredFlag(flags, "environment");
        if (!new Set(["eu", "uk", "us"]).has(environment)) {
            throw new Error("--environment must be one of: eu, uk, us.");
        }
        return printApiResult(api.get("/api/agent/v1/odoo/branches", { environment }), profile, stdout);
    }
    throw new Error(`Unsupported command.\n\n${HELP}`);
}
async function printApiResult(result, profile, stdout) {
    printSuccess(await result, stdout, { profile });
}
async function runConfig(subcommand, flags, profile, stdout) {
    if (subcommand === "show") {
        printSuccess({ configPath: getConfigPath(), profile, ...redactConfig(await loadConfig(undefined, profile)) }, stdout, { profile });
        return;
    }
    if (subcommand !== "set")
        throw new Error(`Unsupported config command.\n\n${HELP}`);
    const current = await loadConfig(undefined, profile);
    const serverUrl = flags.get("server-url")?.replace(/\/$/, "") || current.serverUrl;
    const apiToken = flags.get("api-token") || current.apiToken;
    if (!serverUrl && !apiToken)
        throw new Error("Provide --server-url and/or --api-token.");
    await saveConfig({ serverUrl, apiToken }, undefined, profile);
    printSuccess({ configPath: getConfigPath(), profile, serverUrl, apiToken: apiToken ? "********" : undefined }, stdout, { profile });
}
async function runProfile(subcommand, flags, stdout) {
    if (subcommand === "list") {
        const profiles = await listProfiles();
        printSuccess(profiles, stdout, { count: profiles.length });
        return;
    }
    const name = requiredFlag(flags, "name");
    if (subcommand === "add") {
        await saveConfig({
            serverUrl: flags.get("server-url")?.replace(/\/$/, ""),
            apiToken: flags.get("api-token"),
        }, undefined, name);
        printSuccess({ name, created: true }, stdout);
        return;
    }
    if (subcommand === "use") {
        await setActiveProfile(name);
        printSuccess({ name, active: true }, stdout);
        return;
    }
    if (subcommand === "remove") {
        await removeProfile(name);
        printSuccess({ name, removed: true }, stdout);
        return;
    }
    throw new Error(`Unsupported profile command.\n\n${HELP}`);
}
function runSchema(name, stdout) {
    if (name) {
        printSuccess(getApiSchema(name), stdout);
        return;
    }
    const schemas = listApiSchemas();
    printSuccess(schemas, stdout, { count: schemas.length });
}
async function runDoctorCommand(profile, flags, stdout) {
    const report = await runDoctor(await loadConfig(undefined, profile), { offline: flags.get("offline") === "true" });
    printSuccess({ profile, ...report }, stdout, { profile });
}
async function runSkills(subcommand, name, stdout) {
    if (subcommand === "list") {
        const skills = await listBundledSkills();
        printSuccess(skills, stdout, { count: skills.length });
        return;
    }
    if (subcommand === "read" && name) {
        stdout(await readBundledSkill(name));
        return;
    }
    throw new Error(`Unsupported skills command.\n\n${HELP}`);
}
async function runAgentInstall(flags, stdout) {
    const agent = flags.get("agent") || "codex";
    if (agent !== "codex")
        throw new Error("Only the Codex skill target is supported in v0.1.");
    const destination = flags.get("destination") || defaultCodexSkillsRoot();
    const installed = await installBundledSkills(destination, flags.get("force") === "yes");
    printSuccess({ installed, destination }, stdout, { count: installed.length });
}
async function runDemoServer(flags, stdout) {
    const port = Number(flags.get("port") || "8787");
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("--port must be an integer between 1 and 65535.");
    const token = flags.get("token") || DEMO_API_TOKEN;
    const server = createDemoServer(token);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
    printSuccess({
        serverUrl: `http://127.0.0.1:${port}`,
        apiToken: token,
        projectKey: "demo-project",
        sprintId: DEMO_SPRINT_ID,
        commands: [
            `OCTO_SERVER_URL=http://127.0.0.1:${port} OCTO_API_TOKEN=${token} octo-cli sprint burndown --project-key demo-project --sprint-id ${DEMO_SPRINT_ID}`,
            `OCTO_SERVER_URL=http://127.0.0.1:${port} OCTO_API_TOKEN=${token} octo-cli sprint tasks --project-key demo-project --sprint-id ${DEMO_SPRINT_ID}`,
        ],
    }, stdout);
    await new Promise((resolve) => server.once("close", resolve));
}
function printSuccess(data, stdout, meta) {
    stdout(JSON.stringify(success(data, meta), null, 2));
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    run(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`${JSON.stringify(failure(error))}\n`);
        process.exitCode = 1;
    });
}
