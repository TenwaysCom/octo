export type SupportedPlatform = "meegle" | "lark" | "unsupported";

export interface ResolvePlatformUrlOptions {
  meegleAuthBaseUrl: string;
  larkAuthBaseUrl?: string;
}

export interface PlatformUrlResolution {
  platform: SupportedPlatform;
  authBaseUrl: string | null;
  pageOrigin: string | null;
}

export const DEFAULT_MEEGLE_AUTH_BASE_URL = "https://project.larksuite.com";
export const DEFAULT_LARK_AUTH_BASE_URL = "https://open.larksuite.com";

function getOrigin(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function isMeegleHost(hostname: string): boolean {
  return (
    hostname === "project.larksuite.com" ||
    hostname === "meegle.com" ||
    hostname.endsWith(".meegle.com")
  );
}

function isLarkHost(hostname: string): boolean {
  if (hostname === "project.larksuite.com") {
    return false;
  }
  return (
    hostname === "feishu.cn" ||
    hostname.endsWith(".feishu.cn") ||
    hostname === "larksuite.com" ||
    hostname.endsWith(".larksuite.com")
  );
}

export function resolvePlatformUrl(
  input: string | null | undefined,
  options: ResolvePlatformUrlOptions,
): PlatformUrlResolution {
  const pageOrigin = getOrigin(input);
  if (!pageOrigin) {
    return {
      platform: "unsupported",
      authBaseUrl: null,
      pageOrigin: null,
    };
  }

  const hostname = new URL(pageOrigin).hostname;
  if (isMeegleHost(hostname)) {
    return {
      platform: "meegle",
      authBaseUrl: options.meegleAuthBaseUrl,
      pageOrigin,
    };
  }

  if (isLarkHost(hostname)) {
    return {
      platform: "lark",
      authBaseUrl: options.larkAuthBaseUrl ?? DEFAULT_LARK_AUTH_BASE_URL,
      pageOrigin,
    };
  }

  return {
    platform: "unsupported",
    authBaseUrl: null,
    pageOrigin,
  };
}

export function normalizeMeegleAuthBaseUrl(
  _input?: string | null,
  meegleAuthBaseUrl = DEFAULT_MEEGLE_AUTH_BASE_URL,
): string {
  return meegleAuthBaseUrl;
}

export function normalizeLarkAuthBaseUrl(
  _input?: string | null,
  larkAuthBaseUrl = DEFAULT_LARK_AUTH_BASE_URL,
): string {
  return larkAuthBaseUrl;
}
