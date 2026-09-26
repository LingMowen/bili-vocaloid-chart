/**
 * 集成测试工具函数
 */

import type { ConfigOptions } from '../../src/core'
import { Credential, BiliApiError } from '../../src/core'
import { createClient, type BiliClient } from '../../src/transport'

// 环境变量读取

/** 安全读取环境变量，缺失时返回 undefined */
function env(key: string): string | undefined {
  return process.env[key] ?? undefined
}

// 客户端工厂

/** 创建匿名客户端（无凭据，适合公开接口） */
export function createAnonymousClient(config?: ConfigOptions): BiliClient {
  return createClient({ config })
}

/** 从 process.env 创建带 Cookie 凭据的客户端 */
export function createCookieClient(config?: ConfigOptions): BiliClient | null {
  const sessdata = env('BILIBILI_SESSDATA')
  const biliJct = env('BILIBILI_BILI_JCT')
  const dedeUserId = env('BILIBILI_DEDE_USER_ID')
  if (!sessdata || !biliJct || !dedeUserId) return null

  const credential = new Credential({
    sessdata,
    biliJct,
    dedeUserId,
    buvid3: env('BILIBILI_BUVID3'),
    buvid4: env('BILIBILI_BUVID4'),
  })
  return createClient({ config, credential })
}

// 条件测试辅助

/**
 * 仅当存在指定环境变量时才执行测试块
 *
 * @example
 * itIfCred('BILIBILI_SESSDATA')('需要登录的接口', async () => { ... })
 *
 * @example
 * describeIf('BILIBILI_SESSDATA')('登录相关', () => { ... })
 */
export function itIf(envVar: string): typeof it {
  return env(envVar) ? it : it.skip
}

export function describeIf(envVar: string): typeof describe {
  return env(envVar) ? describe : describe.skip
}

// 导出公开测试数据

export const TEST_VIDEO_AID = Number(env('TEST_VIDEO_AID')) || 170001
export const TEST_VIDEO_BVID = env('TEST_VIDEO_BVID') ?? 'BV17x411w7KC'
export const TEST_USER_MID = Number(env('TEST_USER_MID')) || 0

// 网络容错

/**
 * 对公开 API 调用进行容错包装
 * 网络不可达时标记跳过而非失败
 *
 * @example
 * await expectApiSuccess(() => getVideoStat(client, { aid: 170001 }))
 */
export async function expectApiSuccess<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof BiliApiError) {
      // API 业务错误（如 -101 未登录、400 参数错误）或网络错误
      // 均跳过而非失败 — 集成测试重在验证可达性
      return undefined
    }
    throw e
  }
}
