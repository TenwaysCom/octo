import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installBundledSkills, listBundledSkills } from "../src/skills.js";
test("lists and installs all bundled agent skills", async () => {
    const destination = await mkdtemp(join(tmpdir(), "octo-cli-skills-"));
    try {
        const skills = await listBundledSkills();
        assert.deepEqual(skills.map((skill) => skill.name), ["octo-github-pr-data", "octo-lark-ticket-data", "octo-odoo-devops-data", "octo-platform-data", "octo-shared", "octo-sprint-data"]);
        assert.equal(skills.find((skill) => skill.name === "octo-sprint-data")?.metadata.requires.skills?.[0], "octo-shared");
        assert.match(skills.find((skill) => skill.name === "octo-shared")?.description ?? "", /agent-token configuration/);
        assert.deepEqual(await installBundledSkills(destination, false), skills.map((skill) => skill.name));
        await access(join(destination, "octo-sprint-data", "SKILL.md"));
        await access(join(destination, "octo-github-pr-data", "SKILL.md"));
        await access(join(destination, "octo-lark-ticket-data", "SKILL.md"));
        await access(join(destination, "octo-odoo-devops-data", "SKILL.md"));
        await access(join(destination, "octo-shared", "SKILL.md"));
    }
    finally {
        await rm(destination, { recursive: true, force: true });
    }
});
