export interface PublicConfigResponse {
  ok: true;
  data: {
    MEEGLE_PLUGIN_ID: string;
    LARK_APP_ID: string;
    MEEGLE_BASE_URL: string;
  };
}

export interface PublicConfigControllerDeps {
  MEEGLE_PLUGIN_ID: string;
  LARK_APP_ID: string;
  MEEGLE_BASE_URL: string;
}

let publicConfigDeps: PublicConfigControllerDeps = {
  MEEGLE_PLUGIN_ID: "",
  LARK_APP_ID: "",
  MEEGLE_BASE_URL: "https://project.larksuite.com",
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
      MEEGLE_BASE_URL: publicConfigDeps.MEEGLE_BASE_URL,
    },
  };
}
