import type { ReactNode } from "react";

import type { PopupNotebookPage } from "../../popup/types.js";

export function VerticalTabBar({
  value,
  authorized = false,
  larkAvatar,
  onChange,
}: {
  value: PopupNotebookPage;
  authorized?: boolean;
  larkAvatar?: string;
  onChange: (value: PopupNotebookPage) => void;
}) {
  return (
    <div className="vertical-tab-bar" data-test="vertical-tab-bar">
      <div className="vertical-tab-bar__top">
        <TabButton
          page="automation"
          activePage={value}
          disabled={isDisabled("automation", authorized)}
          label="自动化"
          testId="vertical-tab-automation"
          onChange={onChange}
          icon={(
            <svg className="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4" />
              <line x1="8" y1="15" x2="8" y2="15.01" />
              <line x1="16" y1="15" x2="16" y2="15.01" />
            </svg>
          )}
        />
        <TabButton
          page="chat"
          activePage={value}
          disabled={isDisabled("chat", authorized)}
          label="聊天"
          testId="vertical-tab-chat"
          onChange={onChange}
          icon={(
            <svg className="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          )}
        />
      </div>
      <div className="vertical-tab-bar__bottom">
        <TabButton
          page="settings"
          activePage={value}
          disabled={false}
          label="设置"
          testId="vertical-tab-settings"
          onChange={onChange}
          icon={(
            <svg className="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          )}
        />
        <TabButton
          page="profile"
          activePage={value}
          disabled={false}
          label="个人"
          testId="vertical-tab-profile"
          onChange={onChange}
          icon={
            larkAvatar ? (
              <img
                src={larkAvatar}
                className="vertical-tab-bar__avatar"
                alt=""
                aria-hidden="true"
              />
            ) : (
              <svg className="vertical-tab-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )
          }
        />
      </div>
    </div>
  );
}

function TabButton({
  page,
  activePage,
  disabled,
  label,
  testId,
  icon,
  onChange,
}: {
  page: PopupNotebookPage;
  activePage: PopupNotebookPage;
  disabled: boolean;
  label: string;
  testId: string;
  icon: ReactNode;
  onChange: (value: PopupNotebookPage) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "vertical-tab-bar__item",
        activePage === page ? "active" : "",
        disabled ? "disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-test={testId}
      disabled={disabled}
      onClick={() => onChange(page)}
    >
      {icon}
      <span className="vertical-tab-bar__label">{label}</span>
    </button>
  );
}

function isDisabled(value: PopupNotebookPage, authorized: boolean) {
  return !authorized && (value === "chat" || value === "automation");
}
