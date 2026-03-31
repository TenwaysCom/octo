import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const popupDir = dirname(fileURLToPath(import.meta.url));
const stylesPath = resolve(popupDir, "styles.css");

describe("popup styles", () => {
  it("keeps the app root in block flow so the popup fills the available width", async () => {
    const styles = await readFile(stylesPath, "utf8");

    expect(styles).toMatch(/#app\s*{[^}]*display:\s*block;/s);
    expect(styles).not.toMatch(/#app\s*{[^}]*display:\s*flex;/s);
  });
});
