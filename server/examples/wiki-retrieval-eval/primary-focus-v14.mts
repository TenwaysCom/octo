// Isolated v14 experiment. No Wiki anchors, generated keywords, source IDs or models.
export const focusPolicy = {
  version: 'v14-r1',
  generic: ['odoo', 'eu', 'uk', 'us', 'so', 'po', 'inv', 'je', 'ap', 'ar', 'vat', 'cmc', 'api', 'http',
    'customer', 'customers', 'contact', 'contacts', 'invoice', 'invoices', 'bill', 'vendor', 'order', 'orders',
    'sales', 'stock', 'warehouse', 'shopify', 'turbo', 'marketing', 'operations', 'team', 'partner',
    'what', 'why', 'how', 'can', 'could', 'should', 'the', 'an', 'other'],
  families: {
    reverse: ['反冲', '冲销', 'reverse', 'reversal'],
    copy: ['复制', 'duplicate', 'duplicated', 'copy', 'copied'],
    sync: ['同步', 'sync', 'synced', 'synchronize'],
    export: ['导出', 'export', 'exported', 'exporting'],
    import: ['导入', 'import', 'imported', 'importing'],
    return: ['退回', '退货', 'return', 'returned'],
    approve: ['审批', '审核', '复核', 'approve', 'approved', 'approval'],
    send: ['发送', '推送', 'send', 'sent', 'sending'],
    receive: ['接收', '收到', 'receive', 'received'],
    modify: ['修改', '调整', '替换', 'change', 'changed', 'adjust', 'adjustment'],
    reserve: ['占用', '预留', 'reserved', 'reserve'],
    reset: ['重置', '清除', '清空', 'reset', 'clear'],
    expand: ['展开', 'expanding', 'expand'],
    validate: ['校验', 'validate', 'validation'],
    cancel: ['取消', 'cancel', 'cancelled'],
    fail: ['失败', '报错', '无法', '失败', 'failed', 'fails', 'failure'],
    missing: ['缺失', '缺少', 'missing', 'blank'],
    mandatory: ['必填', 'mandatory', 'required'],
    difference: ['差异', '差额', '差价', '不一致', 'difference', 'different', 'mismatch'],
    balance: ['余额', 'balance'],
    value: ['价值', 'value', 'valuation'],
    quantity: ['数量', 'quantity'],
    format: ['格式', 'format'],
    structure: ['结构', 'structure'],
    permission: ['权限', 'permission', 'permissions'],
    button: ['按钮', 'button'],
    node: ['节点', 'node'],
    status: ['状态', 'status', 'state'],
  },
  actions: ['reverse', 'copy', 'sync', 'export', 'import', 'return', 'approve', 'send', 'receive',
    'modify', 'reserve', 'reset', 'expand', 'validate', 'cancel', 'fail', 'missing', 'mandatory'],
  fieldSuffix: '时间|字段|状态|值|信息|属性|列',
  windows: 'direct matching M/P block plus returned original ordinal neighbors only',
  minimumIndependentFamilies: 2,
} as const;

export interface FocusDecision {
  allow: boolean; reason: string; anchors: string[]; families: string[]; ordinals: string[];
}
const lower = (s: string) => s.normalize('NFKC').toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function contains(text: string, term: string) {
  const t = lower(text), q = lower(term);
  return /^[a-z0-9_. -]+$/.test(q)
    ? new RegExp(`(?<![a-z0-9_])${escape(q).replace(/ /g, '\\s+')}(?![a-z0-9_])`, 'i').test(t)
    : t.includes(q);
}
function body(s: string) {
  return s.replace(/^\s*-\s+\*\*\[[^\n]*?\*\*(?:\([^\n]*?\))?\s*[:：]\s*/, '')
    .replace(/^\s*(?:###|##|#)\s+[^\n]*$/gm, '')
    .replace(/^\s*-\s*(?:message_id|sender_role|has_artifact|reply_to):[^\n]*$/gm, '')
    .replace(/https?:\/\/\S+|om_[a-z0-9]+|@(?:[A-Za-z]+\s*){1,3}/g, '');
}
function anchors(question: string) {
  const q = question.replace(/\[[A-Z_]+\]|https?:\/\/\S+|@[\w.-]+/g, '');
  const generic = new Set<string>(focusPolicy.generic);
  const all = [
    ...q.matchAll(/\b[a-zA-Z_]\w*(?:\.\w+|_\w+)+\b/g),
    ...q.matchAll(/\b[A-Z]{2,8}\b/g),
    ...q.matchAll(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g),
    ...q.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g),
    ...q.matchAll(new RegExp(`\\b[A-Za-z][A-Za-z0-9_]+(?=${focusPolicy.fieldSuffix})`, 'g')),
    ...q.matchAll(/[`"“]([^`"”\n]{3,80})[`"”]/g),
  ].map(m => lower(m[1] ?? m[0])).filter(t => !generic.has(t) && !/^\d+$/.test(t));
  return [...new Set(all)];
}

export function checkAddedPrimary(question: string, content: string): FocusDecision {
  const reject = (reason: string): FocusDecision => ({ allow: false, reason, anchors: [], families: [], ordinals: [] });
  if (!question.trim() || !content.trim()) return reject('empty_input');
  const blocks = [...content.matchAll(/(?:^|\n\n)([MP])(\d+)\n([\s\S]*?)(?=\n\n[MP]\d+\n|$)/g)]
    .map(m => ({ type: m[1], n: Number(m[2]), ordinal: m[1] + m[2], text: body(m[3]) }));
  if (!blocks.length || new Set(blocks.map(b => b.ordinal)).size !== blocks.length) return reject('invalid_ordinals');
  const cause = question.match(/Caused by\s*:?\s*([A-Za-z]\w*(?:Error|Exception))\b/i)?.[1];
  const fieldNames = [...question.matchAll(new RegExp(`\\b[A-Za-z][A-Za-z0-9_]+(?=${focusPolicy.fieldSuffix})`, 'g'))]
    .map(m => lower(m[0]));
  const mandatory = cause ? [lower(cause)] : fieldNames;
  const direct = anchors(question);
  const families = Object.entries(focusPolicy.families)
    .map(([key, words]) => ({ key, words: words.filter(w => contains(question, w)) }))
    .filter(f => f.words.length);
  for (const b of blocks) {
    // A keyword in an isolated late qualification does not bridge an ordinal gap.
    if (!direct.some(a => contains(b.text, a)) && !families.some(f => f.words.some(w => contains(b.text, w)))) continue;
    const window = blocks.filter(x => x.type === b.type && Math.abs(x.n - b.n) <= 1);
    const text = window.map(x => x.text).join('\n');
    if (mandatory.length && !mandatory.some(t => contains(text, t))) continue;
    const hits = direct.filter(a => contains(text, a));
    const f = families.filter(x => x.words.some(w => contains(text, w))).map(x => x.key);
    if (hits.length) return { allow: true, reason: 'direct_specific_anchor', anchors: hits,
      families: f, ordinals: window.map(x => x.ordinal) };
    if (f.length >= focusPolicy.minimumIndependentFamilies && f.some(k => (focusPolicy.actions as readonly string[]).includes(k))) {
      return { allow: true, reason: 'independent_direct_clues', anchors: [], families: f, ordinals: window.map(x => x.ordinal) };
    }
  }
  return reject(mandatory.length ? 'specific_detail_missing' : 'no_direct_focus');
}
