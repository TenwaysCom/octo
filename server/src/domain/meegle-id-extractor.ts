export interface TextSources {
  title?: string;
  description?: string | null;
  commits?: Array<{ message: string }>;
  comments?: Array<{ body: string }>;
}

const PATTERNS = [
  { regex: /\b(\d{6,})\b/g, description: "pure numeric (6+ digits)" },
  { regex: /\bm-(\d+)\b/gi, description: "m- prefix" },
  { regex: /\bf-(\d+)\b/gi, description: "f- prefix" },
  { regex: /#(\d{6,})/g, description: "# prefix" },
];

function extractFromText(text: string): string[] {
  const ids: string[] = [];
  for (const { regex } of PATTERNS) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      if (match[1]) {
        ids.push(match[1]);
      }
    }
  }
  return ids;
}

export function extractMeegleIds(sources: string | TextSources): string[] {
  const allIds: string[] = [];

  if (typeof sources === "string") {
    allIds.push(...extractFromText(sources));
  } else {
    if (sources.title) {
      allIds.push(...extractFromText(sources.title));
    }
    if (sources.description) {
      allIds.push(...extractFromText(sources.description));
    }
    if (sources.commits) {
      for (const commit of sources.commits) {
        allIds.push(...extractFromText(commit.message));
      }
    }
    if (sources.comments) {
      for (const comment of sources.comments) {
        allIds.push(...extractFromText(comment.body));
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(allIds)];
}
