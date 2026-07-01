import { delimiter } from "node:path";
import { ACP_CONFIG_DEFAULTS, buildKimiAcpSpawnConfig } from "./spawn-config.js";

describe("buildKimiAcpSpawnConfig", () => {
  it("prepends the default Kimi Code bin path for the default kimi command", () => {
    const config = buildKimiAcpSpawnConfig({
      HOME: "/Users/tester",
      PATH: "/usr/bin:/bin",
    });

    expect(config.command).toBe(ACP_CONFIG_DEFAULTS.command);
    expect(config.env.PATH?.split(delimiter).slice(0, 3)).toEqual([
      "/Users/tester/.kimi-code/bin",
      "/usr/bin",
      "/bin",
    ]);
  });

  it("does not mutate PATH when an explicit kimi command is configured", () => {
    const config = buildKimiAcpSpawnConfig({
      HOME: "/Users/tester",
      PATH: "/usr/bin:/bin",
      KIMI_ACP_COMMAND: "/opt/kimi/bin/kimi",
    });

    expect(config.command).toBe("/opt/kimi/bin/kimi");
    expect(config.env.PATH).toBe("/usr/bin:/bin");
  });

  it("does not duplicate the default Kimi Code bin path", () => {
    const config = buildKimiAcpSpawnConfig({
      HOME: "/Users/tester",
      PATH: "/Users/tester/.kimi-code/bin:/usr/bin:/bin",
    });

    expect(config.env.PATH).toBe("/Users/tester/.kimi-code/bin:/usr/bin:/bin");
  });
});
