import { Skeleton } from "./ui/skeleton.js";

export function BulkCreateModalFallback() {
  return (
    <div className="bulk-modal-backdrop" data-test="lark-bulk-create-modal-loading">
      <div
        aria-labelledby="bulk-modal-loading-title"
        aria-modal="true"
        className="bulk-modal"
        role="dialog"
      >
        <div className="bulk-modal__header">
          <h3 id="bulk-modal-loading-title">加载批量创建面板</h3>
        </div>
        <div className="bulk-modal__body grid gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}
