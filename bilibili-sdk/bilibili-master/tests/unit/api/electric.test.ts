/**
 * Electric (充电) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getElectricList, getBCoinBalance } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('electric', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getElectricList', () => {
    it('传递 mid', async () => {
      await getElectricList(mockClient, 123456)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/elec/show',
        { mid: '123456' },
        'cookie',
      )
    })
  })

  describe('getBCoinBalance', () => {
    it('无参数 cookie 鉴权', async () => {
      await getBCoinBalance(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/web-interface/coin/today/exp', {}, 'cookie')
    })
  })
})
