/**
 * 核心模块 — 鉴权、配置、签名、错误
 */
export { Credential } from './credential.js'
export type { CredentialFields } from './credential.js'
export { Config, DEFAULT_CONFIG } from './config.js'
export type { ConfigOptions } from './config.js'
export { APP_KEY_MAP, appsign, genTicketParams, hmacSha256, md5, WbiSigner } from './sign.js'
export { BiliApiError } from './errors.js'
