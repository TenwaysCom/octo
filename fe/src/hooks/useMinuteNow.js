import { useEffect, useState } from "react";

export function useMinuteNow(enabled = true) {
  const [nowTime, setNowTime] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    setNowTime(Date.now());
    const intervalId = globalThis.setInterval(() => setNowTime(Date.now()), 60 * 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [enabled]);

  return nowTime;
}
