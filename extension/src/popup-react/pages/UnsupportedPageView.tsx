import { UiCard } from "../components/UiCard.js";

export function UnsupportedPageView() {
  return (
    <UiCard>
      <div className="unsupported-view" data-test="unsupported-view">
        <div className="unsupported-icon">!</div>
        <div className="unsupported-copy">
          <p className="unsupported-title">当前页面不支持</p>
          <p className="unsupported-hint">请在 Lark 或 Meegle 页面使用</p>
        </div>
      </div>
    </UiCard>
  );
}
