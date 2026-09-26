/**
 * Opus API 集成测试
 */
import { describe, expect } from 'vitest'

import { getOpusDetail } from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

describe('Opus API', () => {
  it('getOpusDetail 返回图文动态详情', async () => {
    const res = await expectApiSuccess(() => getOpusDetail(client, 'test'))
    if (!res) return
    expect(res).toBeDefined()
  })
})
