import type { PopupIdentityState } from "../../popup-shared/popup-controller.js";
import type { PopupLogEntry, PopupStatusChip } from "../../popup/types.js";
import { AuthStatusCard } from "../components/AuthStatusCard.js";
import { LogPanel } from "../components/LogPanel.js";
import { PopupPage } from "../components/PopupPage.js";

export function ProfilePage({
  identity,
  meegleStatus,
  larkStatus,
  topMeegleButtonText,
  topLarkButtonText,
  topMeegleButtonDisabled,
  topLarkButtonDisabled,
  logs,
  onAuthorizeMeegle,
  onAuthorizeLark,
  onClearLogs,
  onExportLogs,
}: {
  identity: PopupIdentityState;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  topMeegleButtonText: string;
  topLarkButtonText: string;
  topMeegleButtonDisabled: boolean;
  topLarkButtonDisabled: boolean;
  logs: PopupLogEntry[];
  onAuthorizeMeegle: () => void | Promise<void>;
  onAuthorizeLark: () => void | Promise<void>;
  onClearLogs: () => void;
  onExportLogs: () => void;
}) {
  return (
    <PopupPage
      title="个人"
      subtitle="当前用户身份信息及授权状态。"
    >
      <div data-test="profile-page" className="profile-page">
        <AuthStatusCard
          title="授权状态"
          meegleStatus={meegleStatus}
          larkStatus={larkStatus}
          meegleButtonText={topMeegleButtonText}
          larkButtonText={topLarkButtonText}
          meegleButtonDisabled={topMeegleButtonDisabled}
          larkButtonDisabled={topLarkButtonDisabled}
          onAuthorizeMeegle={onAuthorizeMeegle}
          onAuthorizeLark={onAuthorizeLark}
        />
        <div className="profile-page__divider" />
        {identity.larkAvatar ? (
          <div className="profile-page__avatar">
            <img src={identity.larkAvatar} alt="Lark Avatar" />
          </div>
        ) : null}
        <div className="profile-page__form">
          <ReadonlyField label="Master User ID" value={identity.masterUserId} />
          <ReadonlyField label="Lark User Name" value={identity.larkName} />
          <ReadonlyField label="Lark User ID" value={identity.larkId} />
          <ReadonlyField label="Lark Email" value={identity.larkEmail} />
          <ReadonlyField label="Meegle User Key" value={identity.meegleUserKey} />
        </div>
        <LogPanel entries={logs} onClear={onClearLogs} onExport={onExportLogs} />
      </div>
    </PopupPage>
  );
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <label className="profile-page__field">
      <span className="profile-page__label">{label}</span>
      <input className="profile-page__input" value={value || "-"} readOnly />
    </label>
  );
}
