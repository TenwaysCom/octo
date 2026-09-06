/** Kimi Terminal/fs callback profiles. Action/effect identity is shared, but these
 * capability flags do not restrict Hermes native tools or terminal filesystem writes. */
export const ACP_CHAT_ACTION_KEY = "acp.chat";

export const ACP_KIMI_PERMISSION_PROFILES = {
  "acp.chat-readonly.v1": {
    version: "1",
    allowRead: false,
    allowWrite: false,
    allowTerminal: false,
    actionKeys: [
      ACP_CHAT_ACTION_KEY,
      "meegle-sprint-release-notes",
      "meegle-sprint-internal-summary",
      "meegle-sprint-confirm-gaps",
    ],
  },
  "support-qa.answer.v1": {
    version: "1",
    allowRead: true,
    allowWrite: true,
    allowTerminal: true,
    actionKeys: ["lark-ticket-support-qa-answer"],
  },
  "support-qa.document.v1": {
    version: "1",
    allowRead: true,
    allowWrite: true,
    allowTerminal: true,
    actionKeys: ["lark-ticket-support-qa-document-preview"],
  },
} as const;

export type AcpKimiPermissionProfileId = keyof typeof ACP_KIMI_PERMISSION_PROFILES;

export function getAcpKimiPermissionProfile(id: string | null | undefined) {
  return id && Object.prototype.hasOwnProperty.call(ACP_KIMI_PERMISSION_PROFILES, id)
    ? ACP_KIMI_PERMISSION_PROFILES[id as AcpKimiPermissionProfileId]
    : undefined;
}

export function isAcpKimiPermissionProfileId(
  value: string | null | undefined,
): value is AcpKimiPermissionProfileId {
  return Boolean(getAcpKimiPermissionProfile(value));
}
