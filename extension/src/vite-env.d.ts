/// <reference types="vite/client" />
/// <reference types="wxt/client" />

interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly WXT_PUBLIC_INJECTION_PROBE?: string;
  readonly WXT_PUBLIC_OCTO_WEB_ALLOWED_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
