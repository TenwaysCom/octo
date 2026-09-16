import { describe, expect, it } from "vitest";
import { buildKimiAcpSpawnConfig } from "./config.js";

describe("buildKimiAcpSpawnConfig proxy compatibility", () => {
  it("normalizes inherited socks proxy values to socks5 for kimi acp", () => {
    const config = buildKimiAcpSpawnConfig({
      ALL_PROXY: "socks://127.0.0.1:7890/",
      all_proxy: "socks://127.0.0.1:7890/",
      HTTPS_PROXY: "socks://127.0.0.1:7890/",
      https_proxy: "socks://127.0.0.1:7890/",
    });

    expect(config.env.ALL_PROXY).toBe("socks5://127.0.0.1:7890/");
    expect(config.env.all_proxy).toBe("socks5://127.0.0.1:7890/");
    expect(config.env.HTTPS_PROXY).toBe("socks5://127.0.0.1:7890/");
    expect(config.env.https_proxy).toBe("socks5://127.0.0.1:7890/");
  });
});
