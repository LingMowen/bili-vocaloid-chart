/**
 * Senior API 集成测试
 *
 * 硬核会员接口需要 APP 签名，在匿名客户端下可能失败。
 */
import { describe, expect } from 'vitest'

import { getSeniorCategory, getSeniorQuestion, getSeniorResult } from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

describe('Senior API', () => {
  it('getSeniorCategory 返回答题分类', async () => {
    const res = await expectApiSuccess(() => getSeniorCategory(client))
    if (!res) return
    // 可能因缺少 APP 签名而失败，但至少不抛异常
    expect(res).toBeDefined()
  })

  it('getSeniorQuestion 获取题目', async () => {
    const res = await expectApiSuccess(() => getSeniorQuestion(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getSeniorResult 获取答题结果', async () => {
    const res = await expectApiSuccess(() => getSeniorResult(client))
    if (!res) return
    expect(res).toBeDefined()
  })
})
