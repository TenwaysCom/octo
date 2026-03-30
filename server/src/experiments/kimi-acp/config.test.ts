import { describe, expect, it } from "vitest";
import {
  ACP_CONFIG_DEFAULTS,
  buildKimiAcpSpawnConfig,
} from "./config.js";

describe("buildKimiAcpSpawnConfig", () => {
  it("uses the documented defaults", () => {
    const config = buildKimiAcpSpawnConfig({});
    const {
      ALL_PROXY: _allProxy,
      all_proxy: _allProxyLower,
      HTTP_PROXY: _httpProxy,
      http_proxy: _httpProxyLower,
      HTTPS_PROXY: _httpsProxy,
      https_proxy: _httpsProxyLower,
      ...expectedEnv
    } = process.env;
    const {
      ALL_PROXY: _configAllProxy,
      all_proxy: _configAllProxyLower,
      HTTP_PROXY: _configHttpProxy,
      http_proxy: _configHttpProxyLower,
      HTTPS_PROXY: _configHttpsProxy,
      https_proxy: _configHttpsProxyLower,
      ...actualEnv
    } = config.env;

    expect(config.command).toBe(ACP_CONFIG_DEFAULTS.command);
    expect(config.args).toEqual(ACP_CONFIG_DEFAULTS.args);
    expect(actualEnv).toMatchObject(expectedEnv);
  });

  it("accepts JSON overrides for args and env", () => {
    const config = buildKimiAcpSpawnConfig({
      KIMI_ACP_COMMAND: "/opt/kimi/bin/kimi",
      KIMI_ACP_ARGS_JSON: '["acp","--log-level","debug"]',
      KIMI_ACP_ENV_JSON: '{"KIMI_PROFILE":"staging","DEBUG":"1"}',
    });

    expect(config.command).toBe("/opt/kimi/bin/kimi");
    expect(config.args).toEqual(["acp", "--log-level", "debug"]);
    expect(config.env.KIMI_PROFILE).toBe("staging");
    expect(config.env.DEBUG).toBe("1");
  });

  it("allows env overrides to clear inherited proxy values", () => {
    const config = buildKimiAcpSpawnConfig({
      ALL_PROXY: "socks://127.0.0.1:7890/",
      KIMI_ACP_ENV_JSON: '{"ALL_PROXY":"","HTTPS_PROXY":""}',
    });

    expect(config.env.ALL_PROXY).toBe("");
    expect(config.env.HTTPS_PROXY).toBe("");
  });

  it("fails before launch when args json is not a string array", () => {
    expect(() =>
      buildKimiAcpSpawnConfig({
        KIMI_ACP_ARGS_JSON: '{"mode":"acp"}',
      }),
    ).toThrow("KIMI_ACP_ARGS_JSON must be a JSON array of strings");
  });

  it("fails before launch when env json is not a string map", () => {
    expect(() =>
      buildKimiAcpSpawnConfig({
        KIMI_ACP_ENV_JSON: '["DEBUG=1"]',
      }),
    ).toThrow("KIMI_ACP_ENV_JSON must be a JSON object of string pairs");
  });
});
