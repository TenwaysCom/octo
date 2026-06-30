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

export type AutomationActionPlacement =
  | { surface: "popup" }
  | { surface: "sidebar" }
  | { surface: "page_dom"; target: "lark_detail_header" };

export interface AutomationActionListItem {
  key: string;
  title: string;
  description?: string;
  style?: "primary" | "default";
  placements?: AutomationActionPlacement[];
  interaction?:
    | { type: "open_panel" }
    | { type: "preview_confirm" }
    | { type: "preview_form_confirm" }
    | { type: "direct_execute" }
    | { type: "direct_result" };
  executor: AutomationActionExecutor;
}

export interface ExtensionPageConfig {
  platform: "lark" | "meegle" | "github" | "unsupported";
  pageType:
    | "lark"
    | "lark_base_bulk_create_view"
    | "lark_base_create_meegle_item"
    | "lark_record_create_meegle_item"
    | "meegle"
    | "meegle_workitem_detail"
    | "meegle_production_bug_detail"
    | "github_pr"
    | "github_issue"
    | "unsupported";
  matchedRuleId: string;
  matchedRuleIds?: string[];
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
