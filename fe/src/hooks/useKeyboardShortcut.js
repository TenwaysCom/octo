import { useEffect, useRef } from "react";
import { shouldHandleKeyboardShortcut } from "../lib/keyboard-shortcuts.js";

export function useKeyboardShortcut({ key, handler, enabled = true, allowInEditableTarget = false }) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (shouldHandleKeyboardShortcut(event, key, { allowInEditableTarget })) {
        handlerRef.current(event);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allowInEditableTarget, enabled, key]);
}
