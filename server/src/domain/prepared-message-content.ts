type ContentObject = Record<string, unknown>;

export interface PreparedMessageContent {
  text: string;
  hasArtifact: boolean;
}

function object(value: unknown): value is ContentObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const ARTIFACT_LABELS: Record<string, string> = {
  img: "图片", image: "图片", file: "附件", audio: "音频", media: "视频", video: "视频",
};

function renderNode(value: unknown): PreparedMessageContent {
  if (!object(value)) return { text: "[不支持的内容]", hasArtifact: false };
  const tag = string(value.tag);
  if (tag === "text" || tag === "md") {
    return { text: typeof value.text === "string" ? value.text : "[不支持的内容]", hasArtifact: false };
  }
  if (tag === "at") {
    return { text: string(value.user_name) ? `@${value.user_name}` : "[未知提及]", hasArtifact: false };
  }
  if (tag === "a") {
    const label = string(value.text);
    const href = string(value.href);
    return { text: label && href && label !== href ? `${label} (${href})` : label || href, hasArtifact: false };
  }
  const artifact = ARTIFACT_LABELS[tag];
  if (artifact) {
    const name = tag === "file" ? string(value.file_name) : "";
    return { text: `[${artifact}${name ? `：${name}` : ""}]`, hasArtifact: true };
  }
  return { text: "[不支持的内容]", hasArtifact: false };
}

function rows(value: unknown): unknown[][] | undefined {
  return Array.isArray(value) && value.every(Array.isArray) ? value : undefined;
}

function renderRows(value: unknown[][]): PreparedMessageContent {
  let hasArtifact = false;
  const text = value.map((row) => row.map((node) => {
    const rendered = renderNode(node);
    hasArtifact ||= rendered.hasArtifact;
    return rendered.text;
  }).join("")).join("\n");
  return { text, hasArtifact };
}

/** Decode the wire content once; never merge alternative post representations. */
export function prepareMessageContent(content: string | undefined, messageType: string | undefined): PreparedMessageContent {
  const raw = content || "";
  const finish = (result: PreparedMessageContent): PreparedMessageContent => ({
    ...result,
    text: result.text.replace(/@_user_\d+\b/g, "[未知提及]")
      .replace(/\r\n?/g, "\n").replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, "\n\n").trim() || "[空消息]",
  });
  // The message type remains evidence of an attachment even without usable metadata.
  if (messageType && Object.hasOwn(ARTIFACT_LABELS, messageType)) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(raw);
    } catch {
      metadata = undefined;
    }
    return finish(renderNode({ ...(object(metadata) ? metadata : {}), tag: messageType }));
  }
  if (!raw.trim()) return finish({ text: "", hasArtifact: false });
  if (messageType && messageType !== "text" && messageType !== "post" && !ARTIFACT_LABELS[messageType]) {
    return finish({ text: "[不支持的内容]", hasArtifact: false });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    // A text message can be legacy plain text, including literal braces.
    const structured = (messageType !== undefined && messageType !== "text") || /^\s*\{\s*"text"\s*:/.test(raw);
    return finish({ text: structured ? "[消息内容解析失败]" : raw, hasArtifact: false });
  }
  if (!messageType || messageType === "text") {
    // Legacy plain text may itself be a JSON error or example. Only unwrap the wire envelope.
    if (object(decoded) && Object.keys(decoded).length === 1 && Object.hasOwn(decoded, "text")) {
      return finish({ text: typeof decoded.text === "string" ? decoded.text : "[消息内容解析失败]", hasArtifact: false });
    }
    return finish({ text: raw, hasArtifact: false });
  }
  if (messageType === "post") {
    if (!object(decoded)) return finish({ text: "[消息内容解析失败]", hasArtifact: false });
    const primary = rows(decoded.content);
    const fallback = rows(decoded.content_v2);
    const primaryResult = primary && renderRows(primary);
    const rendered = primaryResult?.text.trim() ? primaryResult : fallback ? renderRows(fallback) : primaryResult;
    if (!rendered) return finish({ text: "[消息内容解析失败]", hasArtifact: false });
    return finish({ text: [string(decoded.title), rendered.text].filter(Boolean).join("\n"), hasArtifact: rendered.hasArtifact });
  }
  return finish({ text: "[不支持的内容]", hasArtifact: false });
}
