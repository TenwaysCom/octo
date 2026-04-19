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
          <UiButton
            key={action.key}
            variant={action.type === "primary" ? "primary" : "default"}
            block
            disabled={action.disabled}
            onClick={() => onAction(action.key)}
          >
            {action.label}
          </UiButton>
        ))}
      </div>
    </UiCard>
  );
}
