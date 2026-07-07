import { apiClient } from '../client'

export interface KiroAuthUrlResponse {
  auth_url: string
  session_id: string
  state: string
}

export interface KiroIDCAuthUrlResponse extends KiroAuthUrlResponse {
  client_id?: string
  region?: string
  start_url?: string
}

export interface KiroTokenInfo {
  access_token?: string
  refresh_token?: string
  profile_arn?: string
  expires_at?: string
  auth_method?: string
  provider?: string
  client_id?: string
  client_secret?: string
  client_id_hash?: string
  email?: string
  start_url?: string
  region?: string
  [key: string]: unknown
}

export interface KiroSidecarStatus {
  configured: boolean
  healthy: boolean
  internal_base_url: string
  public_admin_url: string
  sparkapi_account_base_url: string
  api_key_configured: boolean
  models_count: number
  last_checked_at: string
  status_code: number
  message: string
}

export async function generateAuthUrl(payload: {
  proxy_id?: number
  provider?: string
}): Promise<KiroAuthUrlResponse> {
  const { data } = await apiClient.post<KiroAuthUrlResponse>('/admin/kiro/oauth/auth-url', payload)
  return data
}

export async function generateIDCAuthUrl(payload: {
  proxy_id?: number
  start_url?: string
  region?: string
}): Promise<KiroIDCAuthUrlResponse> {
  const { data } = await apiClient.post<KiroIDCAuthUrlResponse>('/admin/kiro/oauth/idc-auth-url', payload)
  return data
}

export async function exchangeCode(payload: {
  session_id: string
  state: string
  code: string
  callback_path?: string
  login_option?: string
  proxy_id?: number
}): Promise<KiroTokenInfo> {
  const { data } = await apiClient.post<KiroTokenInfo>('/admin/kiro/oauth/exchange-code', payload)
  return data
}

export async function refreshToken(payload: {
  refresh_token: string
  auth_method?: string
  provider?: string
  client_id?: string
  client_secret?: string
  start_url?: string
  region?: string
  profile_arn?: string
  proxy_id?: number
}): Promise<KiroTokenInfo> {
  const { data } = await apiClient.post<KiroTokenInfo>('/admin/kiro/oauth/refresh-token', payload)
  return data
}

export async function importToken(payload: {
  token_json: string
  device_registration_json?: string
}): Promise<KiroTokenInfo> {
  const { data } = await apiClient.post<KiroTokenInfo>('/admin/kiro/oauth/import-token', payload)
  return data
}

export async function getSidecarStatus(): Promise<KiroSidecarStatus> {
  const { data } = await apiClient.get<KiroSidecarStatus>('/admin/kiro/sidecar/status')
  return data
}

export default {
  generateAuthUrl,
  generateIDCAuthUrl,
  exchangeCode,
  refreshToken,
  importToken,
  getSidecarStatus
}
