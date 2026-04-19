import type { PopupControllerState } from "../../popup-shared/popup-controller.js";
import { FeatureActionsCard } from "../components/FeatureActionsCard.js";
import { UnsupportedPageView } from "./UnsupportedPageView.js";

type AutomationPageProps = Pick<
  PopupControllerState,
  "state" | "viewModel" | "larkActions" | "meegleActions"
> & {
  onFeature: (key: string) => void | Promise<void>;
};

export function AutomationPage({
  state,
  viewModel,
  larkActions,
  meegleActions,
  onFeature,
}: AutomationPageProps) {
  return (
    <div className="automation-page" data-test="automation-page">
      {viewModel.showUnsupported ? <UnsupportedPageView /> : null}
      {!viewModel.showUnsupported && state.pageType === "lark" ? (
        <FeatureActionsCard title="Lark 功能" actions={larkActions} onAction={onFeature} />
      ) : null}
      {!viewModel.showUnsupported && state.pageType === "meegle" ? (
        <FeatureActionsCard
          title="Meegle 功能"
          actions={meegleActions}
          onAction={onFeature}
        />
      ) : null}
    </div>
  );
}
