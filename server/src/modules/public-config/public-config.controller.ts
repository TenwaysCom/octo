export interface PublicConfigResponse {
  ok: true;
  data: {
    MEEGLE_PLUGIN_ID: string;
    LARK_APP_ID: string;
    LARK_OAUTH_CALLBACK_URL: string;
    MEEGLE_BASE_URL: string;
    LARK_OAUTH_SCOPE: string;
    CLIENT_DEBUG_LOG_UPLOAD_ENABLED: boolean;
  };
}

export interface PublicConfigControllerDeps {
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  LARK_OAUTH_CALLBACK_URL: string;
  MEEGLE_BASE_URL: string;
  LARK_OAUTH_SCOPE: string;
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: boolean;
}

let publicConfigDeps: PublicConfigControllerDeps = {
  MEEGLE_PLUGIN_ID: "",
  LARK_APP_ID: "",
  LARK_OAUTH_CALLBACK_URL: "",
  MEEGLE_BASE_URL: "https://project.larksuite.com",
  LARK_OAUTH_SCOPE: "offline_access contact:user.base:readonly bitable:app base:record:retrieve im:message.send_as_user im:message.reactions:write_only im:chat:readonly im:message",
  CLIENT_DEBUG_LOG_UPLOAD_ENABLED: false,
};

export function configurePublicConfigController(
  deps: Partial<PublicConfigControllerDeps>,
): void {
  publicConfigDeps = {
    ...publicConfigDeps,
    ...deps,
  };
}

export async function getPublicConfigController(): Promise<PublicConfigResponse> {
  return {
    ok: true,
    data: {
      MEEGLE_PLUGIN_ID: publicConfigDeps.MEEGLE_PLUGIN_ID,
      LARK_APP_ID: publicConfigDeps.LARK_APP_ID,
      LARK_OAUTH_CALLBACK_URL: publicConfigDeps.LARK_OAUTH_CALLBACK_URL,
      MEEGLE_BASE_URL: publicConfigDeps.MEEGLE_BASE_URL,
      LARK_OAUTH_SCOPE: publicConfigDeps.LARK_OAUTH_SCOPE,
      CLIENT_DEBUG_LOG_UPLOAD_ENABLED: publicConfigDeps.CLIENT_DEBUG_LOG_UPLOAD_ENABLED,
    },
  };
}
