export const LARK_TICKET_AI_QUICK_ACTIONS = [
  { actionKey: "lark-ticket-support-qa-summarize", title: "问题总结", icon: "◌", oneShot: true },
  { actionKey: "lark-ticket-support-qa-answer", title: "回答问题", icon: "↗", oneShot: false },
  { actionKey: "lark-ticket-support-qa-document-preview", title: "生成文档", icon: "▤", oneShot: false },
];

export function isOneShotLarkTicketAiAction(actionKey) {
  return LARK_TICKET_AI_QUICK_ACTIONS.some((action) => action.actionKey === actionKey && action.oneShot);
}
