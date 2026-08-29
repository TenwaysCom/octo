export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string>;
}

export function parseArgs(args: readonly string[], booleanFlags: readonly string[] = []): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const key = value.slice(2);
    if (!key) throw new Error("Invalid empty flag.");
    const flagValue = args[index + 1];
    if (!flagValue || flagValue.startsWith("--")) {
      if (booleanFlags.includes(key)) {
        flags.set(key, "true");
        continue;
      }
      throw new Error(`Flag --${key} requires a value.`);
    }
    flags.set(key, flagValue);
    index += 1;
  }

  return { positionals, flags };
}

export function requiredFlag(flags: ReadonlyMap<string, string>, key: string): string {
  const value = flags.get(key)?.trim();
  if (!value) throw new Error(`Missing required flag --${key}.`);
  return value;
}
