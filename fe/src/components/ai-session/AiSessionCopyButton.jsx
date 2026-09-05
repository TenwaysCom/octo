import { useEffect, useRef, useState } from "react";

const COPY_STATUS_LABELS = {
  idle: "复制回复",
  copying: "正在复制回复",
  copied: "回复已复制",
  failed: "复制失败，请重试",
};

export function AiSessionCopyButton({ text }) {
  const [status, setStatus] = useState("idle");
  const resetTimer = useRef(null);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  function resetStatusAfterDelay() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 1600);
  }

  async function copyReply() {
    if (!text || status === "copying") return;
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    resetStatusAfterDelay();
  }

  const label = COPY_STATUS_LABELS[status];
  return <button
    className={`ticket-ai-message__copy ticket-ai-message__copy--${status}`}
    type="button"
    aria-label={label}
    title={label}
    disabled={status === "copying"}
    onClick={() => void copyReply()}
  >
    {status === "copied"
      ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.5 3.5L16 5.5" /></svg>
      : <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5" /><path d="M13.5 6.5v-2A1.5 1.5 0 0 0 12 3H4.5A1.5 1.5 0 0 0 3 4.5V12a1.5 1.5 0 0 0 1.5 1.5h2" /></svg>}
    <span className="visually-hidden" aria-live="polite">{status === "idle" ? "" : label}</span>
  </button>;
}
