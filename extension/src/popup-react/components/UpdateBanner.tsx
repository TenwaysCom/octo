import type { UpdateState } from "../../types/update.js";

interface UpdateBannerProps {
  update: UpdateState;
  onDownload: () => void;
  onIgnore: () => void;
}

export function UpdateBanner({ update, onDownload, onIgnore }: UpdateBannerProps) {
  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-title">
          🎉 新版本 {update.latestVersion} 可用
        </div>
        <div className="update-banner-version">
          当前版本: {update.currentVersion} → 新版本: {update.latestVersion}
        </div>
        {update.releaseNotes ? (
          <div className="update-banner-notes">{update.releaseNotes}</div>
        ) : null}
        <div className="update-banner-actions">
          <button
            type="button"
            className="update-banner-btn-primary"
            onClick={onDownload}
          >
            立即更新
          </button>
          <button
            type="button"
            className="update-banner-btn-secondary"
            onClick={onIgnore}
          >
            忽略此版本
          </button>
        </div>
      </div>
    </div>
  );
}
