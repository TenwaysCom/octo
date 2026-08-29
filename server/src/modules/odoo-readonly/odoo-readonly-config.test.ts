import {
  getOdooReadonlyDatabaseUrl,
  isOdooReadonlyEnvironment,
} from "./odoo-readonly-config.js";

describe("odoo readonly database configuration", () => {
  it("maps each supported environment to its own database URL", () => {
    const source = {
      ODOO_READONLY_DATABASE_URL_EU: "postgresql://eu",
      ODOO_READONLY_DATABASE_URL_UK: "postgresql://uk",
      ODOO_READONLY_DATABASE_URL_US: "postgresql://us",
    };

    expect(getOdooReadonlyDatabaseUrl("eu", source)).toBe("postgresql://eu");
    expect(getOdooReadonlyDatabaseUrl("uk", source)).toBe("postgresql://uk");
    expect(getOdooReadonlyDatabaseUrl("us", source)).toBe("postgresql://us");
  });

  it("rejects an unconfigured database without disclosing a URL", () => {
    expect(() => getOdooReadonlyDatabaseUrl("eu", {})).toThrow(
      "ODOO_READONLY_DATABASE_URL_EU is not configured",
    );
  });

  it("recognizes only the three configured Odoo environments", () => {
    expect(isOdooReadonlyEnvironment("eu")).toBe(true);
    expect(isOdooReadonlyEnvironment("uk")).toBe(true);
    expect(isOdooReadonlyEnvironment("us")).toBe(true);
    expect(isOdooReadonlyEnvironment("prod")).toBe(false);
  });
});
