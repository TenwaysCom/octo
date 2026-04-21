import type { AnchorCandidate, ProbeDetailResult } from "../../types";

export type LarkFieldRow = {
  label: string;
  value: string;
};

export type LarkRecordContext = {
  title: string;
  fields: LarkFieldRow[];
};

const DETAIL_ROOT_SELECTOR = [
  "aside",
  "[role='dialog']",
  "[class*='drawer']",
  "[class*='panel']",
  "[class*='sidebar']",
].join(",");

// Wiki record pages use different selectors
const WIKI_RECORD_ROOT_SELECTOR = [
  "main",
  "article",
  "[class*='wiki']",
  "[class*='wiki-content']",
  "[class*='record-content']",
  "[class*='article']",
  "[class*='detail-body']",
  "[class*='page-body']",
  "[class*='doc-body']",
  "[class*='document-body']",
  "[class*='content-body']",
  "[role='main']",
  ".lark-record-page",
  "[data-testid='record-page']",
  "[data-testid='wiki-page']",
  "[data-testid='doc-page']",
].join(",");

const FIELD_CANDIDATE_SELECTOR = [
  ".field-row",
  "[data-field-row]",
  "[data-field-id]",
  "[class*='field-row']",
  "[class*='field-item']",
  "[class*='field']",
  "label",
  "[class*='label']",
  "input",
  "textarea",
  "select",
  "[class*='value']",
  "[data-value]",
].join(",");

function hasDocument(): boolean {
  return typeof document !== "undefined";
}

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function isElementVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return style.display !== "none" && style.visibility !== "hidden";
}

function describeElement(element: Element | null): string | null {
  if (!element) {
    return null;
  }

  const htmlElement = element as HTMLElement;
  const dataTestId = htmlElement.dataset.testid || htmlElement.dataset.testId;
  if (dataTestId) {
    return `data-testid=${dataTestId}`;
  }

  if (htmlElement.id) {
    return `#${htmlElement.id}`;
  }

  const className = typeof htmlElement.className === "string"
    ? htmlElement.className
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)[0]
    : "";
  if (className) {
    return className;
  }

  return htmlElement.tagName.toLowerCase();
}

function readElementText(element: Element | null): string | null {
  if (!element) {
    return null;
  }

  if (element instanceof HTMLInputElement) {
    return normalizeText(element.value);
  }

  if (element instanceof HTMLTextAreaElement) {
    return normalizeText(element.value);
  }

  if (element instanceof HTMLSelectElement) {
    const selectedLabel = element.selectedOptions[0]?.textContent;
    return normalizeText(selectedLabel ?? element.value);
  }

  const explicitValue = normalizeText(element.getAttribute("data-value"));
  if (explicitValue) {
    return explicitValue;
  }

  return normalizeText(element.textContent);
}

function findTitleNode(root: Element): Element | null {
  return root.querySelector("h1, h2, h3, [class*='title'], [data-testid*='title']");
}

function findHeaderNode(root: Element): Element | null {
  return root.querySelector("header, [class*='header'], [class*='toolbar']");
}

function findFieldRowCandidates(root: Element): Element[] {
  const candidates = new Set<Element>();

  for (const candidate of Array.from(root.querySelectorAll(FIELD_CANDIDATE_SELECTOR))) {
    const row = candidate.closest(
      ".field-row, [data-field-row], [data-field-id], [class*='field-row'], [class*='field-item'], [class*='field'], li, tr, [role='row']",
    ) ?? candidate;

    if (row !== root && row instanceof Element && isElementVisible(row)) {
      candidates.add(row);
    }
  }

  return Array.from(candidates);
}

function isLikelyFieldRow(row: Element): boolean {
  const isExplicitFieldRow = row.matches(
    ".field-row, [data-field-row], [data-field-id], [class*='field-row'], [class*='field-item']",
  );
  if (isExplicitFieldRow) {
    return true;
  }

  const nestedExplicitRows = row.querySelectorAll(
    ".field-row, [data-field-row], [data-field-id], [class*='field-row'], [class*='field-item']",
  ).length;
  if (nestedExplicitRows >= 2) {
    return false;
  }

  return row.querySelector(
    "label, [class*='label'], [data-label], [aria-label], input, textarea, select, [class*='value'], [data-value]",
  ) !== null;
}

function findFieldRows(root: Element): Element[] {
  return findFieldRowCandidates(root).filter(isLikelyFieldRow);
}

function readDirectFieldChildren(row: Element): Element[] {
  return Array.from(row.children).filter(isElementVisible);
}

function readFieldLabel(row: Element): string | null {
  const explicitLabel = row.querySelector("label, [class*='label'], [data-label], [aria-label]");
  const label = readElementText(explicitLabel);
  if (label) {
    return label;
  }

  const directChildren = readDirectFieldChildren(row);
  if (directChildren.length >= 2) {
    return readElementText(directChildren[0]);
  }

  return null;
}

function readFieldValue(row: Element): { value: string; hasSource: boolean } | null {
  const control = row.querySelector("input, textarea, select");
  if (control) {
    return {
      value: readElementText(control) ?? "",
      hasSource: true,
    };
  }

  const explicitValue = row.querySelector("[class*='value'], [data-value]");
  if (explicitValue) {
    return {
      value: readElementText(explicitValue) ?? "",
      hasSource: true,
    };
  }

  const directChildren = readDirectFieldChildren(row);
  if (directChildren.length >= 2) {
    return {
      value: readElementText(directChildren[directChildren.length - 1]) ?? "",
      hasSource: true,
    };
  }

  return null;
}

function parseFieldRow(row: Element): LarkFieldRow | null {
  const label = readFieldLabel(row);
  const value = readFieldValue(row);

  if (!label || !value?.hasSource) {
    return null;
  }

  return { label, value: value.value };
}

function findAnchorNode(root: Element): Element | null {
  const headerNode = findHeaderNode(root);
  if (headerNode !== null) {
    return headerNode;
  }

  const titleNode = findTitleNode(root);
  if (titleNode?.parentElement) {
    return titleNode.parentElement;
  }

  return root.firstElementChild ?? root;
}

function scoreDetailCandidate(candidate: Element): number {
  let score = 0;

  if (candidate.matches(DETAIL_ROOT_SELECTOR)) {
    score += 1;
  }

  if (findTitleNode(candidate) !== null) {
    score += 2;
  }

  if (findHeaderNode(candidate) !== null) {
    score += 1;
  }

  if (findFieldRows(candidate).length >= 2) {
    score += 2;
  }

  return score;
}

function findDetailRoot(): Element | null {
  if (!hasDocument()) {
    return null;
  }

  const candidates = Array.from(document.querySelectorAll(DETAIL_ROOT_SELECTOR)).filter(
    isElementVisible,
  );

  let bestCandidate: Element | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreDetailCandidate(candidate);
    if (bestCandidate === null || score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  if (bestCandidate === null || bestScore < 3) {
    return null;
  }

  return bestCandidate;
}

export function probeLarkContext(detailRoot: Element): LarkRecordContext | null {
  if (!hasDocument()) {
    return null;
  }

  const title = normalizeText(findTitleNode(detailRoot)?.textContent);
  if (!title) {
    return null;
  }

  const fields = findFieldRows(detailRoot)
    .map(parseFieldRow)
    .filter((field): field is LarkFieldRow => field !== null);

  if (fields.length < 2) {
    return null;
  }

  return {
    title,
    fields,
  };
}

export function probeLarkAnchor(detailRoot: Element): AnchorCandidate | null {
  if (!hasDocument()) {
    return null;
  }

  if (probeLarkContext(detailRoot) === null) {
    return null;
  }

  const anchorNode = findAnchorNode(detailRoot);
  if (anchorNode === null) {
    return null;
  }

  return {
    element: anchorNode,
    label: describeElement(anchorNode) ?? "detail",
    confidence: anchorNode === detailRoot ? 0.6 : 0.9,
  };
}

export function probeLarkDetail(): ProbeDetailResult {
  if (!hasDocument()) {
    return {
      isOpen: false,
      detailRoot: null,
    };
  }

  const detailRoot = findDetailRoot();
  if (detailRoot === null) {
    return {
      isOpen: false,
      detailRoot: null,
    };
  }

  return {
    isOpen: true,
    detailRoot,
    reason: probeLarkContext(detailRoot) === null ? "loading" : undefined,
  };
}

// Probe for Wiki record pages (e.g., /record/{id} URLs)
function isWikiRecordPage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return /^\/record\/[a-zA-Z0-9]+/.test(window.location.pathname);
}

function findWikiRecordRoot(): Element | null {
  if (!hasDocument()) {
    return null;
  }

  // Try specific Wiki record selectors first
  const candidates = Array.from(document.querySelectorAll(WIKI_RECORD_ROOT_SELECTOR)).filter(
    isElementVisible,
  );

  for (const candidate of candidates) {
    const hasTitle = findTitleNode(candidate) !== null || document.title.length > 0;
    const hasContent = candidate.textContent && candidate.textContent.length > 50;

    if (hasTitle && hasContent) {
      return candidate;
    }
  }

  // Fallback: look for main content area
  const mainContent = document.querySelector("main") || document.querySelector("[class*='content']");
  if (mainContent && isElementVisible(mainContent)) {
    return mainContent;
  }

  // Last resort: use document body if we have a page title
  if (document.title && document.body) {
    return document.body;
  }

  return null;
}

function resolveWikiPageTitle(detailRoot: Element): string | null {
  // Try to find a title node in the DOM
  const domTitle = normalizeText(findTitleNode(detailRoot)?.textContent);
  if (domTitle) {
    return domTitle;
  }

  // Fallback: use document title (minus site suffix like " - Lark")
  if (typeof document !== "undefined" && document.title) {
    const pageTitle = document.title.replace(/\s*[-–—|]\s*.+$/, "").trim();
    if (pageTitle) {
      return pageTitle;
    }
  }

  return null;
}

export function probeLarkWikiContext(detailRoot: Element): LarkRecordContext | null {
  if (!hasDocument()) {
    return null;
  }

  const title = resolveWikiPageTitle(detailRoot);
  if (!title) {
    return null;
  }

  // For wiki pages, try to find fields but don't require them
  const fields = findFieldRows(detailRoot)
    .map(parseFieldRow)
    .filter((field): field is LarkFieldRow => field !== null);

  // Wiki pages may have 0 or more fields - we only require a title
  return {
    title,
    fields,
  };
}

export function probeLarkWikiAnchor(detailRoot: Element): AnchorCandidate | null {
  if (!hasDocument()) {
    return null;
  }

  // For wiki pages, we only need a title, not fields
  if (probeLarkWikiContext(detailRoot) === null) {
    return null;
  }

  const anchorNode = findAnchorNode(detailRoot);
  if (anchorNode === null) {
    return null;
  }

  return {
    element: anchorNode,
    label: describeElement(anchorNode) ?? "wiki-detail",
    confidence: anchorNode === detailRoot ? 0.6 : 0.9,
  };
}

export function probeLarkWikiRecordContext(): ProbeDetailResult {
  if (!hasDocument() || !isWikiRecordPage()) {
    return {
      isOpen: false,
      detailRoot: null,
    };
  }

  const detailRoot = findWikiRecordRoot();
  if (detailRoot === null) {
    return {
      isOpen: false,
      detailRoot: null,
    };
  }

  // For Wiki pages, we consider them ready if we can extract a title
  const title = resolveWikiPageTitle(detailRoot);

  return {
    isOpen: true,
    detailRoot,
    reason: title === null ? "loading" : undefined,
  };
}
