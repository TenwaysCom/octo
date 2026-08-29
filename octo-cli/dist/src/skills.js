import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundledSkillsRoot = join(packageRoot, "skills");
export async function listBundledSkills() {
    const names = await listBundledSkillNames();
    return Promise.all(names.map(async (name) => parseSkillMetadata(name, await readBundledSkill(name))));
}
export async function readBundledSkill(name) {
    assertSkillName(name);
    return readFile(join(bundledSkillsRoot, name, "SKILL.md"), "utf8");
}
export async function installBundledSkills(destinationRoot, force) {
    const skills = await listBundledSkillNames();
    const destinations = skills.map((name) => join(destinationRoot, name));
    if (!force) {
        for (const destination of destinations) {
            try {
                await stat(destination);
                throw new Error(`Destination already exists: ${destination}. Pass --force yes to overwrite skill files.`);
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
        }
    }
    await mkdir(destinationRoot, { recursive: true });
    await Promise.all(skills.map((name) => cp(join(bundledSkillsRoot, name), join(destinationRoot, name), { recursive: true, force })));
    return skills;
}
async function listBundledSkillNames() {
    return (await readdir(bundledSkillsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}
function parseSkillMetadata(name, content) {
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
export function defaultCodexSkillsRoot(environment = process.env) {
    const codexHome = environment.CODEX_HOME?.trim() || (environment.HOME ? join(environment.HOME, ".codex") : "");
    if (!codexHome)
        throw new Error("Unable to resolve the Codex home directory. Pass --destination.");
    return join(codexHome, "skills");
}
function assertSkillName(name) {
    if (!/^[a-z0-9-]+$/.test(name))
        throw new Error("Skill name must contain lowercase letters, digits, and hyphens only.");
}
