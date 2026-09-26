/**
 * 传输层 — HTTP 客户端
 *
 * 基于 axios，封装 Bilibili API 请求的：
 * - 请求拦截器（自动注入 Cookie / Header / 签名）
 * - 响应拦截器（统一 code !== 0 → BiliApiError）
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

import type { Config, ConfigOptions, Credential, WbiSigner } from '../core'
import { appsign, BiliApiError } from '../core'
import { Config as ConfigImpl } from '../core/config.js'
import type { AuthMode, BiliApiResponse } from '../types'

// 默认请求头

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 BiliDroid/1.12.0 (bbcallen@gmail.com)',
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

// BiliClient

export interface BiliClientOptions {
  /** SDK 配置 */
  config?: ConfigOptions
  /** 凭据 */
  credential?: Credential
  /** WBI 签名器（需要时传入已初始化的实例） */
  wbiSigner?: WbiSigner
}

export class BiliClient {
  readonly axios: AxiosInstance
  readonly config: Config
  credential?: Credential
  wbiSigner?: WbiSigner

  /** APP 签名使用的 appkey */
  appKey?: string
  /** APP 签名使用的 appsec */
  appSec?: string

  constructor(options: BiliClientOptions = {}) {
    this.config = new ConfigImpl(options.config)
    this.credential = options.credential
    this.wbiSigner = options.wbiSigner

    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: { ...DEFAULT_HEADERS },
    })

    // 响应拦截器：统一错误处理
    this.axios.interceptors.response.use(
      (response) => {
        const data = response.data as unknown
        // 非标准 JSON 响应（如二进制 protobuf / 纯文本），跳过 code 校验直接返回
        if (typeof data !== 'object' || data === null || !('code' in data)) {
          return response
        }
        const body = data as BiliApiResponse
        if (body.code !== 0) {
          throw new BiliApiError(body.code, body.message, body)
        }
        return response
      },
      (error: unknown) => {
        if (error instanceof BiliApiError) throw error
        // 网络错误包装
        const msg = error instanceof Error ? error.message : '未知网络错误'
        throw new BiliApiError(-1, msg, error)
      },
    )
  }

  /**
   * 设置 APP 签名所需的 appkey/appsec
   */
  setAppSign(appKey: string, appSec: string): void {
    this.appKey = appKey
    this.appSec = appSec
  }

  /**
   * 设置凭据
   */
  setCredential(credential: Credential): void {
    this.credential = credential
  }

  /**
   * 发起 GET 请求
   */
  async get<T = unknown>(
    url: string,
    params: Record<string, string> = {},
    auth: AuthMode = 'none',
    config?: AxiosRequestConfig,
  ): Promise<BiliApiResponse<T>> {
    const query = this._applyAuth(params, auth)
    const response = await this.axios.get<BiliApiResponse<T>>(url, {
      params: query,
      headers: this._buildHeaders(auth),
      ...config,
    })
    return response.data
  }

  /**
   * 发起二进制 GET 请求（返回原始字节，用于 protobuf 等非 JSON 响应）
   */
  async getBinary(
    url: string,
    params: Record<string, string> = {},
    auth: AuthMode = 'none',
    config?: AxiosRequestConfig,
  ): Promise<ArrayBuffer> {
    const query = this._applyAuth(params, auth)
    const response = await this.axios.get<ArrayBuffer>(url, {
      params: query,
      headers: this._buildHeaders(auth),
      responseType: 'arraybuffer',
      ...config,
    })
    return response.data
  }

  /**
   * 发起 POST 请求（application/x-www-form-urlencoded）
   */
  async post<T = unknown>(
    url: string,
    data: Record<string, string> = {},
    auth: AuthMode = 'none',
    config?: AxiosRequestConfig,
  ): Promise<BiliApiResponse<T>> {
    const body = this._applyAuth(data, auth)
    const response = await this.axios.post<BiliApiResponse<T>>(url, body, {
      headers: this._buildHeaders(auth),
      ...config,
    })
    return response.data
  }

  /** 注入鉴权参数 */
  private _applyAuth(params: Record<string, string>, auth: AuthMode): Record<string, string> {
    const result = { ...params }

    if (auth === 'app' && this.appKey && this.appSec) {
      appsign(result, this.appKey, this.appSec)
    }

    if (auth === 'wbi' && this.wbiSigner?.ready) {
      this.wbiSigner.sign(result)
    }

    if (this.credential?.accessToken) {
      result.access_key = this.credential.accessToken
    }

    return result
  }

  /** 构建请求头 */
  private _buildHeaders(auth: AuthMode): Record<string, string> {
    const headers: Record<string, string> = {}

    if (!this.credential) return headers

    const cookie = this.credential.toCookieString()
    if (cookie && (auth === 'cookie' || auth === 'wbi')) {
      headers.Cookie = cookie
    }

    const authHeaders = this.credential.toHeaders()
    Object.assign(headers, authHeaders)

    return headers
  }
}

/**
 * 创建 BiliClient 实例的便捷工厂函数
 */
export function createClient(options?: BiliClientOptions): BiliClient {
  return new BiliClient(options)
}
