const CODE_FENCE = "```";

export function stabilizeMarkdownStream(source: string): string {
  let stabilized = source.replace(/\r\n/g, "\n");

  if (countCodeFences(stabilized) % 2 === 1) {
    stabilized = stabilized.endsWith("\n")
      ? `${stabilized}${CODE_FENCE}`
      : `${stabilized}\n${CODE_FENCE}`;
  }

  if (countInlineBackticksOutsideCodeFences(stabilized) % 2 === 1) {
    stabilized += "`";
  }

  return stabilized;
}

export function renderMarkdownStream(source: string): string {
  const stabilized = stabilizeMarkdownStream(source);
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let html = "";
  let lastIndex = 0;

  for (const match of stabilized.matchAll(fencePattern)) {
    const start = match.index ?? 0;
    html += renderParagraphs(stabilized.slice(lastIndex, start));
    html += renderCodeBlock(match[1] ?? "", match[2] ?? "");
    lastIndex = start + match[0].length;
  }

  html += renderParagraphs(stabilized.slice(lastIndex));

  return html;
}

function countCodeFences(source: string): number {
  return source.match(/(^|\n)```/g)?.length ?? 0;
}

function countInlineBackticksOutsideCodeFences(source: string): number {
  const segments = source.split(CODE_FENCE);
  let count = 0;

  for (let index = 0; index < segments.length; index += 2) {
    const segment = segments[index] ?? "";
    for (let offset = 0; offset < segment.length; offset += 1) {
      if (segment[offset] !== "`" || segment[offset - 1] === "\\") {
        continue;
      }

      count += 1;
    }
  }

  return count;
}

function renderParagraphs(source: string): string {
  return source
    .split(/\n{2,}/)
    .filter((segment) => segment.trim().length > 0)
    .map((segment) => {
      const escaped = escapeHtml(segment).replace(/\n/g, "<br>");
      const withInlineCode = escaped.replace(
        /`([^`]+)`/g,
        '<code class="kimi-chat-markdown__inline-code">$1</code>',
      );

      return `<p class="kimi-chat-markdown__paragraph">${withInlineCode}</p>`;
    })
    .join("");
}

function renderCodeBlock(language: string, source: string): string {
  const normalizedLanguage = language.trim();
  const languageAttribute =
    normalizedLanguage.length > 0
      ? ` data-lang="${escapeHtml(normalizedLanguage)}"`
      : "";

  return [
    `<pre class="kimi-chat-markdown__code-block">`,
    `<code class="kimi-chat-markdown__code"${languageAttribute}>`,
    escapeHtml(source.replace(/\n$/, "")),
    "</code>",
    "</pre>",
  ].join("");
}

function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
