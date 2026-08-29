const ODOO_READONLY_ENVIRONMENTS = ["eu", "uk", "us"] as const;

export type OdooReadonlyEnvironment = (typeof ODOO_READONLY_ENVIRONMENTS)[number];

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const databaseUrlEnvironmentVariable: Record<OdooReadonlyEnvironment, string> = {
  eu: "ODOO_READONLY_DATABASE_URL_EU",
  uk: "ODOO_READONLY_DATABASE_URL_UK",
  us: "ODOO_READONLY_DATABASE_URL_US",
};

export function isOdooReadonlyEnvironment(value: string): value is OdooReadonlyEnvironment {
  return ODOO_READONLY_ENVIRONMENTS.includes(value as OdooReadonlyEnvironment);
}

export function getOdooReadonlyDatabaseUrl(
  environment: OdooReadonlyEnvironment,
  source: EnvironmentSource = process.env,
): string {
  const variableName = databaseUrlEnvironmentVariable[environment];
  const databaseUrl = source[variableName]?.trim();

  if (!databaseUrl) {
    throw new Error(`${variableName} is not configured`);
  }

  return databaseUrl;
}
