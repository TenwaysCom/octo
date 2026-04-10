import type { RenderedSessionUpdate } from "./session-update-output.js";

export interface ReplOutputStream {
  write(chunk: string): void;
}

export interface ReplOutputWriterOptions {
  mergeThoughts: boolean;
  stdout: ReplOutputStream;
  stderr: ReplOutputStream;
}

export interface ReplOutputWriter {
  flush(): void;
  write(rendered: RenderedSessionUpdate): void;
}

export function createReplOutputWriter(
  options: ReplOutputWriterOptions,
): ReplOutputWriter {
  let pendingThought = "";

  const flush = () => {
    if (pendingThought.length === 0) {
      return;
    }

    options.stderr.write(`[thought] ${pendingThought}\n`);
    pendingThought = "";
  };

  return {
    flush,
    write(rendered: RenderedSessionUpdate) {
      if (rendered.thoughtText !== undefined) {
        if (options.mergeThoughts) {
          pendingThought += rendered.thoughtText;
          return;
        }

        options.stderr.write(`[thought] ${rendered.thoughtText}\n`);
        return;
      }

      flush();

      if (rendered.stdoutText) {
        options.stdout.write(rendered.stdoutText);
      }

      if (rendered.stderrLine) {
        options.stderr.write(rendered.stderrLine);
      }
    },
  };
}
