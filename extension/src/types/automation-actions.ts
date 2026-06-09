export type AutomationActionExecutor =
  | {
      type: "action" | "frontend";
      actionKey: string;
    }
  | {
      type: "backend_api";
      operation: string;
      method?: "POST";
      route?: string;
    }
  | {
      type: "prompt";
    };

export interface AutomationActionListItem {
  key: string;
  title: string;
  description?: string;
  style?: "primary" | "default";
  executor: AutomationActionExecutor;
}

export interface ExtensionPageConfig {
  platform: "lark" | "meegle" | "github" | "unsupported";
  pageType:
    | "lark"
    | "lark_base_bulk_create_view"
    | "meegle"
    | "meegle_workitem_detail"
    | "meegle_production_bug_detail"
    | "github_pr"
    | "unsupported";
  matchedRuleId: string;
  sidebar: {
    injectPageElements: boolean;
    sidebarButtonEnabled: boolean;
    keyboardShortcutEnabled: boolean;
  };
  automationActions: AutomationActionListItem[];
}

export interface ExtensionPageConfigResponse {
  ok: boolean;
  data?: {
    pageConfig: ExtensionPageConfig;
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface AutomationActionsListResponse {
  ok: boolean;
  data?: {
    actions: AutomationActionListItem[];
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}

export interface AutomationActionExecuteResponse {
  ok: boolean;
  data?: {
    presentation: {
      type: "open_chat";
      draftMessage: string;
    };
  };
  error?: {
    errorCode: string;
    errorMessage: string;
  };
}
