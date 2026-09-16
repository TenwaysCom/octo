import type { PopupLogEntry } from "../../popup/types.js";
import { UiCard } from "./UiCard.js";

export function LogPanel({
  entries,
  onClear,
  onExport,
}: {
  entries: PopupLogEntry[];
  onClear: () => void;
  onExport: () => void;
}) {
  return (
    <UiCard
      title="日志"
      actions={(
        <>
          <button className="log-panel__action" type="button" onClick={onExport}>
            导出日志
          </button>
          <span className="log-panel__action-divider">|</span>
          <button className="log-panel__action" type="button" onClick={onClear}>
            清除
          </button>
        </>
      )}
    >
      <div className="log-panel">
        {entries.length === 0 ? (
          <div className="log-panel__empty">暂无日志</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="log-panel__entry"
              data-level={entry.level}
            >
              <span className="log-panel__time">[{entry.timestamp}]</span>
              <span className="log-panel__message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </UiCard>
  );
}
