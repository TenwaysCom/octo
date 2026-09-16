export interface ReplDisplayOptions {
  rawEvents: boolean;
  showThoughts: boolean;
}

export function parseReplDisplayOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
): ReplDisplayOptions {
  const options: ReplDisplayOptions = {
    showThoughts: readBooleanEnv(env.KIMI_ACP_REPL_SHOW_THOUGHTS),
    rawEvents: readBooleanEnv(env.KIMI_ACP_REPL_RAW),
  };

  for (const arg of args) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--show-thoughts") {
      options.showThoughts = true;
      continue;
    }

    if (arg === "--raw-events") {
      options.rawEvents = true;
      continue;
    }

    throw new Error(`Unknown REPL option: ${arg}`);
  }

  return options;
}

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
