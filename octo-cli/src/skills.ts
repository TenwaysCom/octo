import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundledSkillsRoot = join(packageRoot, "skills");

export interface BundledSkill {
  name: string;
  description: string;
  metadata: {
    cliHelp: string;
    requires: { bins: ["octo-cli"]; skills?: string[] };
  };
}

export async function listBundledSkills(): Promise<BundledSkill[]> {
  const names = await listBundledSkillNames();
  return Promise.all(names.map(async (name) => parseSkillMetadata(name, await readBundledSkill(name))));
}

export async function readBundledSkill(name: string): Promise<string> {
  assertSkillName(name);
  return readFile(join(bundledSkillsRoot, name, "SKILL.md"), "utf8");
}

export async function installBundledSkills(destinationRoot: string, force: boolean): Promise<string[]> {
  const skills = await listBundledSkillNames();
  const destinations = skills.map((name) => join(destinationRoot, name));
  if (!force) {
    for (const destination of destinations) {
      try {
        await stat(destination);
        throw new Error(`Destination already exists: ${destination}. Pass --force yes to overwrite skill files.`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  await mkdir(destinationRoot, { recursive: true });
  await Promise.all(skills.map((name) => cp(join(bundledSkillsRoot, name), join(destinationRoot, name), { recursive: true, force })));
  return skills;
}

async function listBundledSkillNames(): Promise<string[]> {
  return (await readdir(bundledSkillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function parseSkillMetadata(name: string, content: string): BundledSkill {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1] ?? "";
  const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter)?.[1] ?? "";
  return {
    name,
    description,
    metadata: {
      cliHelp: `octo-cli skills read ${name}`,
      requires: {
        bins: ["octo-cli"],
        ...(name === "octo-shared" ? {} : { skills: ["octo-shared"] }),
      },
    },
  };
}

export function defaultCodexSkillsRoot(environment: NodeJS.ProcessEnv = process.env): string {
  const codexHome = environment.CODEX_HOME?.trim() || (environment.HOME ? join(environment.HOME, ".codex") : "");
  if (!codexHome) throw new Error("Unable to resolve the Codex home directory. Pass --destination.");
  return join(codexHome, "skills");
}

function assertSkillName(name: string): void {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Skill name must contain lowercase letters, digits, and hyphens only.");
}
