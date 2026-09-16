import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createAiSessionPanel, isAiSessionRunning } from "../lib/ai-session-panel.js";

export function useAiSessionPanel(scopeKey, options) {
  const latest = useRef(options);
  latest.current = options;
  const panel = useMemo(() => createAiSessionPanel({
    load: (...args) => latest.current.load(...args),
    stream: (...args) => latest.current.stream(...args),
    stop: (...args) => latest.current.stop(...args),
    onChange: () => latest.current.onChange?.(),
  }), [scopeKey]);
  useEffect(() => { panel.activate(); return () => panel.dispose(); }, [panel]);
  const drawer = useSyncExternalStore(panel.subscribe, panel.getSnapshot, panel.getSnapshot);
  return { drawer, panel, isStreaming: isAiSessionRunning(drawer), setDrawer: panel.update };
}
