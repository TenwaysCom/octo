import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createLarkTicketFieldEdits } from "../services/lark-ticket/lark-ticket-field-edits.js";

export function useLarkTicketFieldEdits(provided, apiBaseUrl, masterUserId) {
  const edits = useMemo(() => provided || createLarkTicketFieldEdits({ apiBaseUrl, masterUserId }), [provided, apiBaseUrl, masterUserId]);
  useSyncExternalStore(edits.subscribe, edits.getVersion, edits.getVersion);
  useEffect(() => provided ? undefined : edits.retain(), [edits, provided]);
  return edits;
}
