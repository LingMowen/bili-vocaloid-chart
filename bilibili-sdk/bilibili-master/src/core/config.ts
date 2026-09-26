/**
 * SDK 全局配置
 */
export interface ConfigOptions {
  /** API 基础 URL，默认 https://api.bilibili.com */
  baseURL?: string
  /** 请求超时（毫秒），默认 10000 */
  timeout?: number
  /** User-Agent，默认使用移动端 UA */
  userAgent?: string
  /** 客户端平台标识，默认 "web"，可选 "android"/"ios"/"tv" */
  platform?: 'web' | 'android' | 'ios' | 'tv'
  /** 是否在请求时自动注入通用参数（mobi_app, platform 等） */
  injectPlatformParams?: boolean
}

export const DEFAULT_CONFIG: Required<ConfigOptions> = {
  baseURL: 'https://api.bilibili.com',
  timeout: 10000,
  userAgent: 'Mozilla/5.0 BiliDroid/1.12.0 (bbcallen@gmail.com)',
  platform: 'web',
  injectPlatformParams: true,
}

export class Config {
  baseURL: string
  timeout: number
  userAgent: string
  platform: 'web' | 'android' | 'ios' | 'tv'
  injectPlatformParams: boolean

  constructor(options: ConfigOptions = {}) {
    this.baseURL = options.baseURL ?? DEFAULT_CONFIG.baseURL
    this.timeout = options.timeout ?? DEFAULT_CONFIG.timeout
    this.userAgent = options.userAgent ?? DEFAULT_CONFIG.userAgent
    this.platform = options.platform ?? DEFAULT_CONFIG.platform
    this.injectPlatformParams = options.injectPlatformParams ?? DEFAULT_CONFIG.injectPlatformParams
  }
}
