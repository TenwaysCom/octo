import { describe, expect, it } from "vitest";

import {
  buildOctoWebContentMatches,
  isOctoWebOriginAllowed,
  parseOctoWebAllowedOrigins,
} from "./environment-config.js";

describe("Octo web origin configuration", () => {
  it("uses no extra origins when the configuration is absent", () => {
    expect(parseOctoWebAllowedOrigins(undefined)).toEqual([]);
  });

  it("normalizes and deduplicates configured origins", () => {
    expect(parseOctoWebAllowedOrigins(
      " http://localhost:4173/ ,https://fe.example.com,http://localhost:4173 ",
    )).toEqual(["http://localhost:4173", "https://fe.example.com"]);
  });

  it("rejects URLs that are not origins", () => {
    expect(() => parseOctoWebAllowedOrigins("https://fe.example.com/login"))
      .toThrow("must contain origins only");
  });

  it("allows the server origin by default and only explicitly configured extra origins", () => {
    expect(isOctoWebOriginAllowed({
      serverUrl: "http://localhost:3040",
      pageOrigin: "http://localhost:3040",
    })).toBe(true);
    expect(isOctoWebOriginAllowed({
      serverUrl: "http://localhost:3040",
      pageOrigin: "http://localhost:4173",
    })).toBe(false);
    expect(isOctoWebOriginAllowed({
      serverUrl: "http://localhost:3040",
      pageOrigin: "http://localhost:4173",
      additionalAllowedOrigins: ["http://localhost:4173"],
    })).toBe(true);
    expect(isOctoWebOriginAllowed({
      serverUrl: "http://localhost:3040",
      pageOrigin: "http://localhost:4174",
      additionalAllowedOrigins: ["http://localhost:4173"],
    })).toBe(false);
  });

  it("builds content script matches for configured origins", () => {
    expect(buildOctoWebContentMatches([
      "http://localhost:3040",
      "http://localhost:4173",
      "https://fe.example.com",
    ])).toEqual(["http://localhost/*", "https://fe.example.com/*"]);
  });
});
