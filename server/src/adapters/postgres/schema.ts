export interface DatabaseSchema {
  acp_kimi_session_owners: {
    session_id: string;
    operator_lark_id: string;
    title: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
  };
  users: {
    id: string;
    status: string;
    lark_tenant_key: string | null;
    lark_id: string | null;
    lark_email: string | null;
    lark_name: string | null;
    lark_avatar_url: string | null;
    meegle_base_url: string | null;
    role: string | null;
    meegle_user_key: string | null;
    github_id: string | null;
    created_at: string;
    updated_at: string;
  };
  user_tokens: {
    master_user_id: string;
    provider: string;
    provider_tenant_key: string;
    external_user_key: string;
    base_url: string;
    plugin_token: string | null;
    plugin_token_expires_at: string | null;
    user_token: string;
    user_token_expires_at: string | null;
    refresh_token: string | null;
    refresh_token_expires_at: string | null;
    credential_status: string;
    last_auth_at: string;
    last_refresh_at: string | null;
    updated_at: string;
  };
  oauth_sessions: {
    state: string;
    provider: string;
    master_user_id: string | null;
    base_url: string;
    status: string;
    auth_code: string | null;
    external_user_key: string | null;
    error_code: string | null;
    expires_at: string;
    created_at: string;
    updated_at: string;
  };
}
