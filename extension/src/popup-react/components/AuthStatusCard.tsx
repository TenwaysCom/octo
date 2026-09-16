import type { PopupStatusChip } from "../../popup/types.js";
import { UiBadge } from "./UiBadge.js";
import { UiButton } from "./UiButton.js";
import { UiCard } from "./UiCard.js";

export function AuthStatusCard({
  title,
  meegleStatus,
  larkStatus,
  meegleButtonText,
  larkButtonText,
  meegleButtonDisabled = false,
  larkButtonDisabled = false,
  secondaryButtons = false,
  onAuthorizeMeegle,
  onAuthorizeLark,
}: {
  title: string;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  meegleButtonText: string;
  larkButtonText: string;
  meegleButtonDisabled?: boolean;
  larkButtonDisabled?: boolean;
  secondaryButtons?: boolean;
  onAuthorizeMeegle: () => void;
  onAuthorizeLark: () => void;
}) {
  const buttonVariant = secondaryButtons ? "default" : "primary";

  return (
    <UiCard title={title}>
      <div className="auth-card__rows">
        <div className="auth-card__row">
          <span className="auth-card__label">Meegle User</span>
          <div className="auth-card__value">
            <UiBadge tone={meegleStatus.tone}>{meegleStatus.text}</UiBadge>
            {!meegleButtonDisabled ? (
              <UiButton size="sm" variant={buttonVariant} onClick={onAuthorizeMeegle}>
                {meegleButtonText}
              </UiButton>
            ) : null}
          </div>
        </div>
        <div className="auth-card__row">
          <span className="auth-card__label">Lark User</span>
          <div className="auth-card__value">
            <UiBadge tone={larkStatus.tone}>{larkStatus.text}</UiBadge>
            <UiButton
              size="sm"
              variant={buttonVariant}
              disabled={larkButtonDisabled}
              onClick={onAuthorizeLark}
            >
              {larkButtonText}
            </UiButton>
          </div>
        </div>
      </div>
    </UiCard>
  );
}
