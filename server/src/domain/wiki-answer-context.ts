// Compact only the answer's copy; extraction and the stored snapshot retain the
// original text. Never clip the error cause or a business message mid-sentence.
export function compactWikiAnswerContext(text: string): string {
  const blocks = compactThreadMessageText(text).split(/\n(?=M\d+\n)/);
  const id = (block: string) => block.match(/^M\d+(?=\n)/)?.[0];
  const body = (block: string) => block.split("\n").filter((line) => !/^(?:M\d+|Time:.*|Sender role:.*|Sender:.*|Reply to:.*)$/.test(line)).join("\n")
    .replace(/\[未知提及\]/g, "").trim();
  const keep = new Set(blocks.filter((block) => !id(block)
    || !/^(?:thanks!?|thank you[!.]?|谢谢[！!。]?|辛苦了[！!。]?|收到[！!。]?|hello[!.]?|hi[!.]?)$/i.test(body(block))));
  // Preserve referenced messages transitively without renumbering.
  let added: boolean;
  do {
    added = false;
    for (const block of [...keep]) {
      const ref = block.match(/^Reply to: (M\d+)$/m)?.[1];
      const parent = ref ? blocks.find((item) => id(item) === ref) : undefined;
      if (parent && !keep.has(parent)) { keep.add(parent); added = true; }
    }
  } while (added);
  return blocks.filter((block) => keep.has(block)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Shadow shares only text compaction, retaining acknowledgements and greetings.
export function compactThreadMessageText(text: string): string {
  let stackFrames = 0;
  let omittedFrames = 0;
  const output: string[] = [];
  const flush = () => {
    if (omittedFrames) output.push(`[省略 ${omittedFrames} 条后续栈帧，完整堆栈见原始快照]`);
    omittedFrames = 0;
  };
  for (const line of text.split("\n")) {
    if (/^\s*at\s+/.test(line)) {
      stackFrames++;
      if (stackFrames > 3) { omittedFrames++; continue; }
      output.push(line.replace(/https?:\/\/[^\s)]+/g, (url) => url.split("/").at(-1) ?? "[asset]"));
      continue;
    }
    flush();
    stackFrames = 0;
    output.push(line.replace(/https?:\/\/[^\s]*\/(?:client\/chat|base|wiki)\?[^\s]*/g, "[来源链接省略]"));
  }
  flush();
  return output.join("\n");
}
