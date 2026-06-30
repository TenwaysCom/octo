import { getConfig } from "../../background/config.js";
import { createExtensionLogger } from "../../logger.js";
import { fetchServerJson } from "../../server-request.js";
import type {
  AutomationActionListItem,
  AutomationActionPlacement,
  ExtensionPageConfig,
  ExtensionPageConfigResponse,
} from "../../types/automation-actions.js";

const pageConfigLogger = createExtensionLogger("content-script:page-config");

export function createFallbackPageConfig(
  platform: "lark" | "meegle" | "github" | "unsupported",
): ExtensionPageConfig {
  const pageType = (() => {
    if (platform === "github") {
      return "github_pr";
    }
    return platform === "unsupported" ? "unsupported" : platform;
  })();

  return {
    platform,
    pageType,
    matchedRuleId: `${platform}.fallback`,
    sidebar: {
      injectPageElements: platform !== "unsupported",
      sidebarButtonEnabled: platform !== "unsupported",
      keyboardShortcutEnabled: platform !== "unsupported",
    },
    automationActions: [],
  };
}

export function actionHasPlacement(
  action: Pick<AutomationActionListItem, "placements">,
  surface: AutomationActionPlacement["surface"],
  target?: string,
): boolean {
  if (!action.placements) {
    return surface === "popup";
  }

  return action.placements.some((placement) => {
    if (placement.surface !== surface) {
      return false;
    }

    if (target === undefined) {
      return true;
    }

    return "target" in placement && placement.target === target;
  });
}

export function pageConfigHasActionPlacement(
  pageConfig: Pick<ExtensionPageConfig, "automationActions">,
  surface: AutomationActionPlacement["surface"],
  target?: string,
): boolean {
  return pageConfig.automationActions.some((action) =>
    actionHasPlacement(action, surface, target)
  );
}

export async function fetchExtensionPageConfig(input: {
  url?: string;
  fallbackPlatform: "lark" | "meegle" | "github" | "unsupported";
}): Promise<ExtensionPageConfig> {
  if (!input.url) {
    return createFallbackPageConfig(input.fallbackPlatform);
  }

  try {
    const config = await getConfig();
    const url = new URL(`${config.SERVER_URL}/api/config/page`);
    url.searchParams.set("url", input.url);

    const { response, payload } = await fetchServerJson<ExtensionPageConfigResponse>({
      url: url.toString(),
      method: "GET",
    });

    if (response.ok && payload.ok && payload.data?.pageConfig) {
      return payload.data.pageConfig;
    }

    pageConfigLogger.warn("pageConfig.fetch.invalid_response", {
      status: response.status,
      ok: payload.ok,
      errorCode: payload.error?.errorCode,
    });
  } catch (error) {
    pageConfigLogger.warn("pageConfig.fetch.failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return createFallbackPageConfig(input.fallbackPlatform);
}
