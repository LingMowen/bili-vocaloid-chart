/**
 * Senior (硬核会员) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getSeniorCategory,
  getSeniorCaptcha,
  submitSeniorCaptcha,
  getSeniorQuestion,
  submitSeniorAnswer,
  getSeniorResult,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('senior', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getSeniorCategory', () => {
    it('GET app 鉴权', async () => {
      await getSeniorCategory(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/senior/v1/category', {}, 'app')
    })
  })

  describe('getSeniorCaptcha', () => {
    it('GET app 鉴权', async () => {
      await getSeniorCaptcha(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/senior/v1/captcha', {}, 'app')
    })
  })

  describe('submitSeniorCaptcha', () => {
    it('POST app 鉴权', async () => {
      await submitSeniorCaptcha(mockClient, { code: '1234', captchaToken: 'tok', ids: '1,2,3' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/senior/v1/captcha/submit',
        {
          bili_code: '1234',
          bili_token: 'tok',
          ids: '1,2,3',
          type: 'bilibili',
          gt_challenge: '',
          gt_seccode: '',
          gt_validate: '',
        },
        'app',
      )
    })
  })

  describe('getSeniorQuestion', () => {
    it('GET app 鉴权', async () => {
      await getSeniorQuestion(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/senior/v1/question', {}, 'app')
    })
  })

  describe('submitSeniorAnswer', () => {
    it('POST app 鉴权', async () => {
      await submitSeniorAnswer(mockClient, { id: 1, ansHash: 'hash', ansText: 'text' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/senior/v1/answer/submit',
        { id: '1', ans_hash: 'hash', ans_text: 'text' },
        'app',
      )
    })
  })

  describe('getSeniorResult', () => {
    it('GET app 鉴权', async () => {
      await getSeniorResult(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/senior/v1/answer/result', {}, 'app')
    })
  })
})
