import type { PopupFeatureAction } from "../../popup/types.js";
import { UiButton } from "./UiButton.js";
import { UiCard } from "./UiCard.js";

export function FeatureActionsCard({
  title,
  actions,
  onAction,
}: {
  title: string;
  actions: PopupFeatureAction[];
  onAction: (key: string) => void;
}) {
  return (
    <UiCard title={title}>
      <div className="feature-actions">
        {actions.map((action) => (
          <div key={action.key} className="feature-action">
            <UiButton
              variant={action.type === "primary" ? "primary" : "default"}
              block
              disabled={action.disabled}
              onClick={() => onAction(action.key)}
            >
              <span className="feature-action__button-content">
                {action.loading ? (
                  <span className="feature-action__spinner" aria-hidden="true" />
                ) : null}
                <span>{action.loading ? "执行中..." : action.label}</span>
              </span>
            </UiButton>
            {action.statusText ? (
              <div
                className={[
                  "feature-action__status",
                  action.statusTone ? `feature-action__status--${action.statusTone}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {action.statusText}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </UiCard>
  );
}
