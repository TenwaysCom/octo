export type PopupLogLevel = "info" | "success" | "warn" | "error";

export interface PopupLogEntry {
  id: string;
  level: PopupLogLevel;
  message: string;
  timestamp: string;
}

export type PopupNotebookPage = "chat" | "automation" | "settings" | "profile";

export interface PopupStatusChip {
  tone: "success" | "processing" | "warning" | "error" | "default";
  text: string;
}

export interface PopupSettingsForm {
  SERVER_URL: string;
  MEEGLE_PLUGIN_ID: string;
  LARK_OAUTH_CALLBACK_URL: string;
  meegleUserKey: string;
  larkUserId: string;
}

export interface PopupFeatureAction {
  key: string;
  label: string;
  type?: "primary" | "default";
  disabled?: boolean;
}
