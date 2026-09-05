const EDITABLE_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableShortcutTarget(target) {
  if (!target) {
    return false;
  }

  return target.isContentEditable === true || EDITABLE_TAG_NAMES.has(target.tagName);
}

export function shouldHandleKeyboardShortcut(event, key, { allowInEditableTarget = false } = {}) {
  return event.key === key
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && (allowInEditableTarget || !isEditableShortcutTarget(event.target));
}

export const KEYBOARD_SHORTCUTS = [
  {
    key: "/",
    description: "打开当前列表的筛选搜索并聚焦输入框",
    pages: ["Lark Ticket", "Meegle", "GitHub PR"],
  },
  {
    key: "?",
    description: "打开快捷键说明",
    pages: ["所有工作台页面"],
  },
  {
    key: "Esc",
    description: "关闭当前列表的筛选搜索",
    pages: ["Lark Ticket", "Meegle", "GitHub PR"],
  },
  {
    key: "Space",
    description: "预览当前悬停或聚焦的 GitHub PR",
    pages: ["GitHub PR"],
  },
  {
    key: "g",
    description: "为当前悬停或聚焦的 Meegle 工作项选择 GitHub PR",
    pages: ["Meegle"],
  },
];
