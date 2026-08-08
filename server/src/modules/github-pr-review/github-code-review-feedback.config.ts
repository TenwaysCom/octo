export const GITHUB_CODE_REVIEW_FEEDBACK_LARK_TARGET = {
  baseId: "PG0vb9fVpaguessj8Dul3UFOgbf",
  tableId: "tblm3vvfbB8qv9HF",
  fields: {
    template: { id: "fldvsURKWT", name: "模版", option: "code-review" },
    category: { id: "fldqU2uAEV", name: "分类" },
    files: { id: "fldEPHafyQ", name: "涉及文档" },
    description: { id: "fld6Wv6V4G", name: "描述" },
    source: { id: "fldiA7yaEV", name: "来源" },
  },
} as const;

export const GITHUB_CODE_REVIEW_FEEDBACK_CATEGORIES = [
  "文档缺失",
  "文档错误",
  "ai 幻觉",
  "不适用",
] as const;
